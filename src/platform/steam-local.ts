import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface InstalledSteamGame {
  appId: string;
  name: string;
  library: string;
}

function defaultSteamRoots(platform = process.platform, home = os.homedir()): string[] {
  if (platform === 'win32') {
    return [
      process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)']!, 'Steam') : '',
      process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Steam') : '',
    ].filter(Boolean);
  }
  if (platform === 'darwin') return [path.join(home, 'Library', 'Application Support', 'Steam')];
  return [path.join(home, '.steam', 'steam'), path.join(home, '.local', 'share', 'Steam')];
}

export function parseSteamLibraryFolders(source: string): string[] {
  const libraries: string[] = [];
  for (const match of source.matchAll(/"path"\s+"((?:\\.|[^"\\])*)"/g)) {
    const value = match[1]?.replaceAll('\\\\', '\\').trim();
    if (value) libraries.push(value);
  }
  return libraries;
}

export function parseSteamManifest(source: string): { appId: string; name: string } | null {
  const appId = source.match(/"appid"\s+"(\d+)"/)?.[1];
  const name = source.match(/"name"\s+"([^"]+)"/)?.[1];
  return appId && name ? { appId, name } : null;
}

async function readLibraries(root: string): Promise<string[]> {
  const libraries = [root];
  try {
    const source = await readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    libraries.push(...parseSteamLibraryFolders(source));
  } catch {
    // A missing root is normal on machines without Steam.
  }
  return [...new Set(libraries.map((library) => path.resolve(library)))];
}

export async function scanInstalledSteamGames(roots = defaultSteamRoots()): Promise<InstalledSteamGame[]> {
  const libraries = (await Promise.all(roots.map(readLibraries))).flat();
  const games: InstalledSteamGame[] = [];
  for (const library of [...new Set(libraries)]) {
    const steamApps = path.join(library, 'steamapps');
    let entries: string[];
    try {
      entries = await readdir(steamApps);
    } catch {
      continue;
    }
    for (const entry of entries.filter((value) => /^appmanifest_\d+\.acf$/i.test(value))) {
      try {
        const parsed = parseSteamManifest(await readFile(path.join(steamApps, entry), 'utf8'));
        if (parsed) games.push({ ...parsed, library });
      } catch {
        // Ignore a manifest that disappeared during the scan.
      }
    }
  }
  return [...new Map(games.map((game) => [game.appId, game])).values()].sort((a, b) => a.name.localeCompare(b.name));
}
