import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/schema.js';
import { runDoctor } from '../src/doctor.js';
import { initializeProject } from '../src/init/project.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('doctor', () => {
  it('validates a fresh project without touching the network', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-doctor-'));
    temporaryDirectories.push(cwd);
    await initializeProject(cwd, defaultConfig);
    const report = await runDoctor(cwd, { offline: true });
    expect(report.ok).toBe(true);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ id: 'provider.steam', level: 'warn' }));
  });

  it('rejects a partial state file even when its version is 1', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-doctor-'));
    temporaryDirectories.push(cwd);
    await initializeProject(cwd, defaultConfig);
    await writeFile(path.join(cwd, '.playcision', 'state.json'), '{"version":1}\n', 'utf8');
    const report = await runDoctor(cwd, { offline: true });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({ id: 'state.schema', level: 'fail' }));
  });
});
