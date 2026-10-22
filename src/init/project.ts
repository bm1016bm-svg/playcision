import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSafePlaycisionPath, getProjectPaths, serializeConfig } from '../config/load.js';
import type { PlaycisionConfig } from '../config/schema.js';
import { digestTemplate, githubWorkflow, localAgentsGuide, localScheduleGuide, secretsExample } from './templates.js';

export interface InitializeOptions {
  force?: boolean | undefined;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function assertGeneratedPath(cwd: string, target: string): Promise<void> {
  const root = path.resolve(cwd);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('Generated path must remain inside the selected project.');
  }
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    await assertSafePlaycisionPath(current, { allowMissing: true, label: 'Generated path' });
  }
}

async function safeWrite(cwd: string, file: string, content: string, force: boolean): Promise<void> {
  await assertGeneratedPath(cwd, file);
  if (!force && (await exists(file))) {
    throw new Error(`Refusing to overwrite ${file}. Re-run init with --force only after reviewing it.`);
  }
  await mkdir(path.dirname(file), { recursive: true });
  await assertGeneratedPath(cwd, file);
  await writeFile(file, content, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
}

export async function initializeProject(
  cwd: string,
  config: PlaycisionConfig,
  options: InitializeOptions = {},
): Promise<string[]> {
  const force = options.force ?? false;
  const paths = getProjectPaths(cwd);
  const created: string[] = [];
  await assertSafePlaycisionPath(paths.root, { allowMissing: true, label: '.playcision directory' });

  const files: Array<[string, string]> = [
    [paths.config, serializeConfig(config)],
    [paths.state, `${JSON.stringify({ version: 1, lastRunAt: null, prices: {}, notified: {}, skipped: {}, excluded: [] }, null, 2)}\n`],
    [paths.secretsExample, secretsExample],
    [paths.agents, localAgentsGuide],
    [path.join(paths.root, '.gitignore'), 'state.json\nstate.json.lock\noutputs/\nsecrets\n.env\n'],
    [path.join(paths.templates, 'digest.md'), digestTemplate],
  ];

  if (config.schedule.type === 'github') {
    files.push([path.join(cwd, '.github', 'workflows', 'playcision-digest.yml'), githubWorkflow(config)]);
  } else if (config.schedule.type === 'local') {
    files.push([path.join(paths.root, 'schedule.example'), localScheduleGuide(config)]);
  }

  // Validate every destination before creating any files, including ancestor junctions.
  for (const target of [paths.outputs, paths.templates, ...files.map(([file]) => file)]) {
    await assertGeneratedPath(cwd, target);
  }

  if (!force) {
    const conflicts = (
      await Promise.all(files.map(async ([file]) => ({ file, exists: await exists(file) })))
    ).filter((entry) => entry.exists);
    if (conflicts.length > 0) {
      throw new Error(
        `Refusing to overwrite existing Playcision file(s): ${conflicts.map(({ file }) => file).join(', ')}. Re-run init with --force only after reviewing them.`,
      );
    }
  }

  await mkdir(paths.outputs, { recursive: true });
  await mkdir(paths.templates, { recursive: true });
  for (const [file, content] of files) {
    if (force && file === paths.state && (await exists(file))) continue;
    await safeWrite(cwd, file, content, force);
    created.push(file);
  }
  return created;
}
