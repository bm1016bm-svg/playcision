import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInitialState, playcisionStateSchema, type PlaycisionState } from './schema.js';

export class StateFileError extends Error {
  readonly filePath: string;

  constructor(filePath: string, message: string, cause?: unknown) {
    super(`${message}: ${filePath}`, cause === undefined ? undefined : { cause });
    this.name = 'StateFileError';
    this.filePath = filePath;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareText(left, right)),
  );
}

function canonicalizeState(state: PlaycisionState): PlaycisionState {
  return {
    ...state,
    prices: sortRecord(state.prices),
    notified: sortRecord(state.notified),
    skipped: sortRecord(state.skipped),
    excluded: [...new Set(state.excluded)].sort(compareText),
  };
}

function parseState(value: unknown, filePath: string): PlaycisionState {
  const parsed = playcisionStateSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new StateFileError(filePath, `Invalid Playcision state (${details})`);
  }
  return canonicalizeState(parsed.data);
}

function decodeState(source: string, filePath: string): PlaycisionState {
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    throw new StateFileError(filePath, 'Corrupt Playcision state (invalid JSON)', error);
  }
  return parseState(value, filePath);
}

async function assertStatePathIsNotLinked(filePath: string): Promise<void> {
  for (const candidate of [path.dirname(filePath), filePath]) {
    try {
      const entry = await lstat(candidate);
      if (entry.isSymbolicLink()) {
        throw new StateFileError(filePath, 'State path must not traverse a symbolic link');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
}

export interface LoadStateOptions {
  errorIfMissing?: boolean;
}

export async function loadState(
  filePath: string,
  options: LoadStateOptions = {},
): Promise<PlaycisionState> {
  await assertStatePathIsNotLinked(filePath);
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && options.errorIfMissing !== true) {
      return createInitialState();
    }
    throw new StateFileError(filePath, 'Unable to read Playcision state', error);
  }
  return decodeState(source, filePath);
}

export function serializeState(state: PlaycisionState): string {
  const parsed = parseState(state, '<memory>');
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

async function assertExistingStateIsSafeToReplace(filePath: string): Promise<void> {
  let source: string;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw new StateFileError(filePath, 'Unable to verify existing Playcision state', error);
  }

  try {
    decodeState(source, filePath);
  } catch (error) {
    throw new StateFileError(
      filePath,
      'Refusing to overwrite an invalid Playcision state file',
      error,
    );
  }
}

export async function saveState(filePath: string, state: PlaycisionState): Promise<void> {
  await assertStatePathIsNotLinked(filePath);
  const serialized = serializeState(state);
  await assertExistingStateIsSafeToReplace(filePath);

  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    const handle = await open(temporaryPath, 'wx', 0o600);
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new StateFileError(filePath, 'Unable to atomically write Playcision state', error);
  }
}

export interface StateLockOptions {
  waitTimeoutMs?: number;
  pollMs?: number;
  staleMs?: number;
}

export async function withStateLock<T>(
  filePath: string,
  operation: () => Promise<T>,
  options: StateLockOptions = {},
): Promise<T> {
  const waitTimeoutMs = options.waitTimeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 100;
  const staleMs = options.staleMs ?? 60 * 60 * 1_000;
  if (!Number.isFinite(waitTimeoutMs) || waitTimeoutMs < 0 || waitTimeoutMs > 300_000) {
    throw new RangeError('State lock waitTimeoutMs must be from 0 to 300000.');
  }
  if (!Number.isFinite(pollMs) || pollMs < 1 || pollMs > 10_000) {
    throw new RangeError('State lock pollMs must be from 1 to 10000.');
  }
  if (!Number.isFinite(staleMs) || staleMs < 60_000 || staleMs > 86_400_000) {
    throw new RangeError('State lock staleMs must be from 60000 to 86400000.');
  }
  const lockPath = `${filePath}.lock`;
  await assertStatePathIsNotLinked(filePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  const started = Date.now();
  let handle: Awaited<ReturnType<typeof open>> | undefined;

  while (!handle) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      let age: number;
      try {
        age = Date.now() - (await stat(lockPath)).mtimeMs;
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw statError;
      }
      if (age > staleMs) {
        await rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() - started >= waitTimeoutMs) {
        throw new StateFileError(filePath, 'Timed out waiting for another Playcision process to release state.json.lock');
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await rm(lockPath, { force: true }).catch(() => undefined);
  }
}
