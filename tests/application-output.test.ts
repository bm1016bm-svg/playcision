import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deliverDigestOutputs } from '../src/application/output.js';
import { defaultConfig } from '../src/config/schema.js';
import type { Digest } from '../src/domain/types.js';

const temporaryDirectories: string[] = [];
const emptyDigest: Digest = {
  generatedAt: '2026-08-10T09:00:00.000Z',
  discover: [],
  deals: [],
  warnings: [],
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('digest delivery', () => {
  it('writes configured Markdown atomically inside the project', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-output-'));
    temporaryDirectories.push(cwd);
    const result = await deliverDigestOutputs(cwd, defaultConfig, emptyDigest);
    expect(result.files).toHaveLength(1);
    expect(await readFile(result.files[0]!, 'utf8')).toContain('Playcision');
  });

  it('does not mutate files or send during dry run', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-output-'));
    temporaryDirectories.push(cwd);
    const config = structuredClone(defaultConfig);
    config.outputs.slack.enabled = true;
    const result = await deliverDigestOutputs(cwd, config, emptyDigest, { notify: true, dryRun: true });
    expect(result).toEqual({ files: [], slack: 'dry-run' });
  });

  it('rejects colliding Markdown and JSON targets before writing', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-output-'));
    temporaryDirectories.push(cwd);
    const config = structuredClone(defaultConfig);
    config.outputs.json.enabled = true;
    config.outputs.json.path = config.outputs.markdown.path;
    await expect(deliverDigestOutputs(cwd, config, emptyDigest)).rejects.toThrow('different files');
  });

  it('rejects an output symlink that points outside the project', async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-output-'));
    const outside = await mkdtemp(path.join(tmpdir(), 'playcision-outside-'));
    temporaryDirectories.push(cwd, outside);
    const outputRoot = path.join(cwd, '.playcision', 'outputs');
    await mkdir(outputRoot, { recursive: true });
    try {
      await symlink(outside, path.join(outputRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    const config = structuredClone(defaultConfig);
    config.outputs.markdown.path = '.playcision/outputs/linked/digest.md';
    await expect(deliverDigestOutputs(cwd, config, emptyDigest)).rejects.toThrow('symbolic link');
  });
});
