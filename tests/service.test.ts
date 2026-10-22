import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAndDeliverDigest, dealGames, discoverGames, rollGame } from '../src/application/service.js';
import { getProjectPaths, serializeConfig } from '../src/config/load.js';
import { defaultConfig } from '../src/config/schema.js';
import type { Game, GameProvider, ProviderDiagnostic, ProviderQuery } from '../src/domain/types.js';
import { initializeProject } from '../src/init/project.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function game(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    store: 'steam',
    name: `Game ${id}`,
    url: `https://store.steampowered.com/app/${id}/`,
    releaseDate: '2026-08-09',
    developers: [],
    publishers: [],
    tags: ['Roguelike'],
    genres: [],
    platforms: ['windows'],
    earlyAccess: false,
    mature: false,
    price: {
      current: { minor: 20000, currency: 'TWD' },
      original: { minor: 40000, currency: 'TWD' },
      discountPercent: 50,
      isFree: false,
    },
    source: { fetchedAt: '2026-08-10T01:00:00.000Z', provider: 'fixture' },
    ...overrides,
  };
}

class FixtureProvider implements GameProvider {
  readonly id = 'steam' as const;
  releases: Game[];
  deals: Game[];

  constructor(releases: Game[], deals = releases) {
    this.releases = releases;
    this.deals = deals;
  }

  getNewReleases = vi.fn(async (_query: ProviderQuery) => this.releases);
  getDeals = vi.fn(async (_query: ProviderQuery) => this.deals);
  getApps = vi.fn(async (ids: string[], _query: ProviderQuery) =>
    [...this.releases, ...this.deals].filter((item) => ids.includes(item.id)),
  );
  async diagnose(): Promise<ProviderDiagnostic> {
    return { ok: true, name: 'fixture', message: 'ok' };
  }
}

async function project() {
  const cwd = await mkdtemp(path.join(tmpdir(), 'playcision-service-'));
  temporaryDirectories.push(cwd);
  const config = structuredClone(defaultConfig);
  config.interests.tags = ['Roguelike'];
  await initializeProject(cwd, config);
  return { cwd, config };
}

describe('application service', () => {
  it('filters live Discover results and persists only minimal state', async () => {
    const { cwd } = await project();
    const provider = new FixtureProvider([
      game('1'),
      game('2', { releaseDate: '2025-01-01' }),
      game('3', { mature: true }),
    ]);
    const games = await discoverGames(cwd, { provider, now: new Date('2026-08-10T01:00:00.000Z') });
    expect(games.map((item) => item.id)).toEqual(['1', '3']);
    const state = JSON.parse(await readFile(getProjectPaths(cwd).state, 'utf8')) as Record<string, unknown>;
    expect(state).toHaveProperty('prices.1');
    expect(JSON.stringify(state)).not.toContain('Game 1');
  });

  it('treats local observed low as a baseline first, then a lower observation', async () => {
    const { cwd, config } = await project();
    config.deals.localObservedLowOnly = true;
    config.deals.minDiscountPercent = 0;
    await writeFile(getProjectPaths(cwd).config, serializeConfig(config), 'utf8');
    const provider = new FixtureProvider([], [game('1')]);
    expect(await dealGames(cwd, { provider, now: new Date('2026-08-10T01:00:00.000Z') })).toEqual([]);
    provider.deals = [game('1', { price: { ...game('1').price, current: { minor: 15000, currency: 'TWD' } } })];
    await expect(dealGames(cwd, { provider, now: new Date('2026-08-11T01:00:00.000Z') })).resolves.toHaveLength(1);
  });

  it('replays the same Roll for the same seed and live pool', async () => {
    const { cwd } = await project();
    const provider = new FixtureProvider([game('1'), game('2'), game('3')]);
    const first = await rollGame(cwd, { provider, seed: 'friday-night', now: new Date('2026-08-10T01:00:00.000Z') });
    const second = await rollGame(cwd, { provider, seed: 'friday-night', now: new Date('2026-08-10T01:00:00.000Z') });
    expect(second?.game.id).toBe(first?.game.id);
    expect(first?.seed).toBe('friday-night');
  });

  it('makes digest dry-run free of file and state mutations', async () => {
    const { cwd } = await project();
    const before = await readFile(getProjectPaths(cwd).state, 'utf8');
    const provider = new FixtureProvider([game('1')]);
    const result = await buildAndDeliverDigest(cwd, {
      provider,
      now: new Date('2026-08-10T01:00:00.000Z'),
      dryRun: true,
    });
    expect(result.delivery.files).toEqual([]);
    expect(await readFile(getProjectPaths(cwd).state, 'utf8')).toBe(before);
  });

  it('marks only deals actually included in the Slack message', async () => {
    const { cwd, config } = await project();
    config.deals.maxPrice = null;
    config.deals.minDiscountPercent = 0;
    config.outputs.markdown.enabled = false;
    config.outputs.slack.enabled = true;
    await writeFile(getProjectPaths(cwd).config, serializeConfig(config), 'utf8');
    const provider = new FixtureProvider([], Array.from({ length: 12 }, (_, index) => game(String(index + 1))));
    const previous = process.env.SLACK_WEBHOOK_URL;
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/test/value/token';
    try {
      await buildAndDeliverDigest(cwd, {
        provider,
        now: new Date('2026-08-10T01:00:00.000Z'),
        notify: true,
        fetch: vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch,
      });
    } finally {
      if (previous === undefined) delete process.env.SLACK_WEBHOOK_URL;
      else process.env.SLACK_WEBHOOK_URL = previous;
    }
    const state = JSON.parse(await readFile(getProjectPaths(cwd).state, 'utf8')) as { notified: Record<string, unknown> };
    expect(Object.keys(state.notified)).toHaveLength(10);
  });
});
