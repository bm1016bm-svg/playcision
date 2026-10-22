import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function resolveWorkspacePath(cwd: string, configuredPath: string): string {
  const projectRoot = path.resolve(cwd);
  const outputRoot = path.join(projectRoot, '.playcision', 'outputs');
  const target = path.resolve(projectRoot, configuredPath);
  const relative = path.relative(outputRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Output path must be a file inside .playcision/outputs: ${configuredPath}`);
  }
  return target;
}

export async function validateOutputPath(cwd: string, configuredPath: string): Promise<string> {
  const root = path.resolve(cwd);
  const target = resolveWorkspacePath(root, configuredPath);
  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      if (entry.isSymbolicLink()) {
        throw new Error(`Output path must not traverse a symbolic link: ${configuredPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }
  return target;
}

export async function writeOutputFile(cwd: string, configuredPath: string, content: string): Promise<string> {
  const target = await validateOutputPath(cwd, configuredPath);
  await mkdir(path.dirname(target), { recursive: true });
  await validateOutputPath(cwd, configuredPath);
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return target;
}
