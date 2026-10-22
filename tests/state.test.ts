import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Game } from '../src/domain/types.js';
import {
  StateFileError,
  createInitialState,
  loadState,
  markNotified,
  recordObservedPrices,
  saveState,
  withLastRunAt,
  withStateLock,
  pruneStateHistory,
} from '../src/state/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryStatePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'playcision-state-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'nested', 'state.json');
}

function game(id: string, minor: number, currency = 'TWD', discountPercent = 20): Game {
  return {
    id,
    store: 'steam',
    name: `Game ${id}`,
    url: `https://store.steampowered.com/app/${id}`,
    developers: ['Studio'],
    publishers: ['Publisher'],
    tags: ['Roguelike'],
    genres: ['Indie'],
    platforms: ['windows'],
    earlyAccess: false,
    mature: false,
    price: {
      current: { minor, currency },
      original: { minor: minor * 2, currency },
      discountPercent,
      isFree: false,
    },
    source: { fetchedAt: '2026-08-10T00:00:00.000Z', provider: 'test' },
  };
}

describe('state persistence', () => {
  it('returns a minimal versioned state when the file does not exist', async () => {
    const filePath = await temporaryStatePath();

    await expect(loadState(filePath)).resolves.toEqual({
      version: 1,
      lastRunAt: null,
      prices: {},
      notified: {},
      skipped: {},
      excluded: [],
    });
  });

  it('atomically saves and reloads canonical state without leaving a temporary file', async () => {
    const filePath = await temporaryStatePath();
    const state = withLastRunAt(createInitialState(), '2026-08-10T09:00:00+08:00');

    await saveState(filePath, state);

    await expect(loadState(filePath)).resolves.toEqual({
      ...state,
      lastRunAt: '2026-08-10T01:00:00.000Z',
    });
    const siblings = await readdir(path.dirname(filePath));
    expect(siblings).toEqual(['state.json']);
  });

  it('reports corrupt JSON and refuses to overwrite it', async () => {
    const filePath = await temporaryStatePath();
    await saveState(filePath, createInitialState());
    const corruptSource = '{"version": 1, definitely not JSON';
    await writeFile(filePath, corruptSource, 'utf8');

    await expect(loadState(filePath)).rejects.toBeInstanceOf(StateFileError);
    await expect(saveState(filePath, createInitialState())).rejects.toThrow(
      'Refusing to overwrite an invalid Playcision state file',
    );
    await expect(readFile(filePath, 'utf8')).resolves.toBe(corruptSource);
  });

  it('rejects unsupported state versions rather than silently resetting them', async () => {
    const filePath = await temporaryStatePath();
    await saveState(filePath, createInitialState());
    await writeFile(
      filePath,
      JSON.stringify({
        version: 2,
        lastRunAt: null,
        prices: {},
        notified: {},
        skipped: {},
        excluded: [],
      }),
      'utf8',
    );

    await expect(loadState(filePath)).rejects.toThrow('version');
  });
});

describe('state updates', () => {
  it('tracks the current and lowest locally observed price without mutating prior state', () => {
    const initial = createInitialState();
    const first = recordObservedPrices(initial, [game('10', 10_000)], '2026-08-08T00:00:00Z');
    const higher = recordObservedPrices(first, [game('10', 12_000)], '2026-08-09T00:00:00Z');
    const lower = recordObservedPrices(higher, [game('10', 9_000)], '2026-08-10T00:00:00Z');

    expect(initial.prices).toEqual({});
    expect(first.prices['10']?.lowestObserved?.minor).toBe(10_000);
    expect(higher.prices['10']).toMatchObject({
      current: { minor: 12_000, currency: 'TWD' },
      lowestObserved: { minor: 10_000, currency: 'TWD' },
    });
    expect(lower.prices['10']?.lowestObserved).toEqual({ minor: 9_000, currency: 'TWD' });
  });

  it('resets the observed-low baseline when currency changes and records notification price', () => {
    const twd = recordObservedPrices(
      createInitialState(),
      [game('10', 10_000)],
      '2026-08-09T00:00:00Z',
    );
    const usdGame = game('10', 500, 'usd', 50);
    const usd = recordObservedPrices(twd, [usdGame], '2026-08-10T00:00:00Z');
    const notified = markNotified(usd, [usdGame], '2026-08-10T09:00:00+08:00');

    expect(usd.prices['10']?.lowestObserved).toEqual({ minor: 500, currency: 'USD' });
    expect(notified.notified['10']).toEqual({
      at: '2026-08-10T01:00:00.000Z',
      price: { minor: 500, currency: 'USD' },
      discountPercent: 50,
    });
  });

  it('prunes expired observations and skips while keeping permanent exclusions', () => {
    const old = recordObservedPrices(createInitialState(), [game('1', 1_000)], '2026-01-01T00:00:00Z');
    const recent = recordObservedPrices(old, [game('2', 2_000)], '2026-08-10T00:00:00Z');
    const state = {
      ...recent,
      skipped: { '3': { until: '2026-08-10T00:00:00.000Z' } },
      excluded: ['4'],
    };
    const pruned = pruneStateHistory(state, '2026-08-11T00:00:00Z', 90);
    expect(Object.keys(pruned.prices)).toEqual(['2']);
    expect(pruned.skipped).toEqual({});
    expect(pruned.excluded).toEqual(['4']);
  });

  it('serializes concurrent state operations with a lock file', async () => {
    const filePath = await temporaryStatePath();
    await withStateLock(filePath, async () => {
      await expect(withStateLock(filePath, async () => undefined, {
        waitTimeoutMs: 5,
        pollMs: 1,
      })).rejects.toThrow('Timed out waiting');
    });
    await expect(withStateLock(filePath, async () => 'released')).resolves.toBe('released');
  });
});
