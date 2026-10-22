import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { configSchema, type PlaycisionConfig } from './schema.js';

export const PLAYCISION_DIR = '.playcision';

export function getProjectPaths(cwd = process.cwd()) {
  const root = path.resolve(cwd, PLAYCISION_DIR);
  return {
    root,
    config: path.join(root, 'config.yaml'),
    state: path.join(root, 'state.json'),
    secretsExample: path.join(root, 'secrets.example'),
    outputs: path.join(root, 'outputs'),
    templates: path.join(root, 'templates'),
    agents: path.join(root, 'AGENTS.md'),
  };
}

export async function assertSafePlaycisionPath(
  target: string,
  options: { allowMissing?: boolean; label?: string } = {},
): Promise<void> {
  try {
    const entry = await lstat(target);
    if (entry.isSymbolicLink()) {
      throw new Error(`${options.label ?? 'Playcision path'} must not be a symbolic link: ${target}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && options.allowMissing) return;
    throw error;
  }
}

export async function loadConfig(cwd = process.cwd()): Promise<PlaycisionConfig> {
  const paths = getProjectPaths(cwd);
  await assertSafePlaycisionPath(paths.root, { label: '.playcision directory' });
  await assertSafePlaycisionPath(paths.config, { label: 'config.yaml' });
  let source: string;
  try {
    source = await readFile(paths.config, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Playcision is not initialized in ${cwd}. Run: playcision init`);
    }
    throw error;
  }

  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (error) {
    throw new Error(`Invalid YAML in ${paths.config}: ${(error as Error).message}`);
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid Playcision config:\n${details}`);
  }
  return parsed.data;
}

export function serializeConfig(config: PlaycisionConfig): string {
  return YAML.stringify(config, { indent: 2, lineWidth: 100 });
}
