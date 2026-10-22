import { mkdtemp, mkdir, readFile, rm, writeFile, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/schema.js';
import { initializeProject } from '../src/init/project.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('initializeProject', () => {
  it('creates the documented local layout without a secret', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-init-'));
    temporaryDirectories.push(cwd);
    const created = await initializeProject(cwd, defaultConfig);

    expect(created).toHaveLength(6);
    const config = YAML.parse(await readFile(path.join(cwd, '.playcision', 'config.yaml'), 'utf8')) as object;
    expect(config).toMatchObject({ version: 1, locale: { country: 'TW' } });
    const secretExample = await readFile(path.join(cwd, '.playcision', 'secrets.example'), 'utf8');
    expect(secretExample).not.toContain('/T000');
    expect(await readFile(path.join(cwd, '.playcision', 'AGENTS.md'), 'utf8')).toContain('Never write secrets');
  });

  it('refuses to overwrite existing configuration by default', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-init-'));
    temporaryDirectories.push(cwd);
    await initializeProject(cwd, defaultConfig);
    await expect(initializeProject(cwd, defaultConfig)).rejects.toThrow('Refusing to overwrite');
  });

  it('generates a timezone-aware GitHub workflow only when requested', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-init-'));
    temporaryDirectories.push(cwd);
    const config = structuredClone(defaultConfig);
    config.schedule.type = 'github';
    config.outputs.slack.enabled = true;
    await initializeProject(cwd, config);
    const workflow = await readFile(path.join(cwd, '.github', 'workflows', 'playcision-digest.yml'), 'utf8');
    expect(workflow).toContain('timezone: "Asia/Taipei"');
    expect(workflow).toContain('secrets.SLACK_WEBHOOK_URL');
    expect(workflow).not.toContain('hooks.slack.com/services/');
  });

  it('preserves existing state during forced regeneration', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-init-'));
    temporaryDirectories.push(cwd);
    await initializeProject(cwd, defaultConfig);
    const statePath = path.join(cwd, '.playcision', 'state.json');
    const custom = '{"version":1,"lastRunAt":null,"prices":{},"notified":{},"skipped":{},"excluded":["42"]}\n';
    await writeFile(statePath, custom, 'utf8');
    await initializeProject(cwd, defaultConfig, { force: true });
    expect(await readFile(statePath, 'utf8')).toBe(custom);
  });
});

describe('initialization link boundaries', () => {
  it.each([
    ['.playcision/templates', 'digest.md'],
    ['.playcision/outputs', 'sentinel.txt'],
    ['.github', 'workflows/playcision-digest.yml'],
    ['.github/workflows', 'playcision-digest.yml'],
  ])('rejects linked directory %s before writing any generated file', async (linked, destination) => {
    const base = await mkdtemp(path.join(tmpdir(), 'playcision-init-links-'));
    temporaryDirectories.push(base);
    const cwd = path.join(base, 'project'), outside = path.join(base, 'outside');
    await mkdir(path.dirname(path.join(cwd, linked)), { recursive: true });
    await mkdir(path.dirname(path.join(outside, destination)), { recursive: true });
    await writeFile(path.join(outside, destination), 'untouched');
    await symlink(outside, path.join(cwd, linked), process.platform === 'win32' ? 'junction' : 'dir');
    const config = structuredClone(defaultConfig); config.schedule.type = 'github';
    for (const force of [true, false]) {
      await expect(initializeProject(cwd, config, { force })).rejects.toThrow('symbolic link');
      expect(await readFile(path.join(outside, destination), 'utf8')).toBe('untouched');
      await expect(access(path.join(cwd, '.playcision/config.yaml'))).rejects.toThrow();
    }
  });
});

