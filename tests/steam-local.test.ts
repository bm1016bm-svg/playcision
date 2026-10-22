import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSteamLibraryFolders, parseSteamManifest, scanInstalledSteamGames } from '../src/platform/steam-local.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Steam local scanner', () => {
  it('parses library paths and manifests without executing VDF content', () => {
    expect(parseSteamLibraryFolders('"path"  "D:\\\\Games\\\\Steam"')).toEqual(['D:\\Games\\Steam']);
    expect(parseSteamManifest('"AppState" { "appid" "413150" "name" "Stardew Valley" }')).toEqual({
      appId: '413150',
      name: 'Stardew Valley',
    });
  });

  it('finds installed games from an explicit local root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'playcision-steam-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, 'steamapps'), { recursive: true });
    await writeFile(
      path.join(root, 'steamapps', 'appmanifest_413150.acf'),
      '"AppState" { "appid" "413150" "name" "Stardew Valley" }',
    );
    const games = await scanInstalledSteamGames([root]);
    expect(games).toMatchObject([{ appId: '413150', name: 'Stardew Valley' }]);
  });
});
