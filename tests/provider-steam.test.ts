import { readFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import type { ProviderQuery } from '../src/domain/types.js';
import { SteamProvider, SteamProviderError, type SteamProviderOptions } from '../src/provider/index.js';

const FIXTURE_ROOT = new URL('./fixtures/steam/', import.meta.url);
const FIXED_NOW = new Date('2026-08-10T01:00:00.000Z');

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(name, FIXTURE_ROOT), 'utf8')) as unknown;
}

interface FakeRoute {
  match: (url: URL) => boolean;
  body?: unknown;
  status?: number;
  headers?: Record<string, string>;
}

function fakeSteamFetch(initialRoutes: FakeRoute[]) {
  const routes = [...initialRoutes];
  const calls: URL[] = [];
  const implementation = async (input: URL | RequestInfo): Promise<Response> => {
    const raw = input instanceof Request ? input.url : input.toString();
    const url = new URL(raw);
    calls.push(url);
    const index = routes.findIndex((route) => route.match(url));
    if (index < 0) throw new Error(`Unexpected Steam request: ${url.toString()}`);
    const [route] = routes.splice(index, 1);
    if (!route) throw new Error('Fake route disappeared.');
    return new Response(JSON.stringify(route.body ?? {}), {
      status: route.status ?? 200,
      headers: { 'content-type': 'application/json', ...route.headers },
    });
  };
  return { fetch: vi.fn(implementation) as unknown as typeof fetch, calls, routes };
}

function pathname(path: string, body: unknown, extras: Omit<FakeRoute, 'match' | 'body'> = {}): FakeRoute {
  return { match: (url) => url.pathname === path, body, ...extras };
}

function searchRoute(
  body: unknown,
  predicate: (url: URL) => boolean = () => true,
  extras: Omit<FakeRoute, 'match' | 'body'> = {},
): FakeRoute {
  return {
    match: (url) => url.pathname === '/search/results/' && predicate(url),
    body,
    ...extras,
  };
}

function query(overrides: Partial<ProviderQuery> = {}): ProviderQuery {
  return {
    country: 'TW',
    currency: 'TWD',
    language: 'tchinese',
    tags: [],
    genres: [],
    developers: [],
    includeAppIds: [],
    maxPages: 2,
    limit: 10,
    includeMature: true,
    ...overrides,
  };
}

function provider(
  fetch: typeof globalThis.fetch,
  overrides: Partial<SteamProviderOptions> = {},
) {
  const sleep = vi.fn(async (_milliseconds: number) => undefined);
  return {
    instance: new SteamProvider({
      country: 'TW',
      currency: 'TWD',
      language: 'tchinese',
      maxPages: 2,
      requestDelayMs: 5,
      timeoutMs: 5_000,
      maxRetries: 1,
      fetch,
      sleep,
      now: () => FIXED_NOW,
      ...overrides,
    }),
    sleep,
  };
}

describe('SteamProvider', () => {
  test('discovers global newest and configured tags, dedupes, and preserves integer minor prices', async () => {
    const [tags, globalPage, tagPage] = await Promise.all([
      fixture('tags.json'),
      fixture('search-new-global.json'),
      fixture('search-new-tag.json'),
    ]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(globalPage, (url) => !url.searchParams.has('tags')),
      searchRoute(tagPage, (url) => url.searchParams.get('tags') === '1716'),
    ]);
    const { instance, sleep } = provider(fake.fetch);

    const games = await instance.getNewReleases(
      query({ tags: ['roguelike'], includeMature: false }),
    );

    expect(games.map((game) => game.id)).toEqual(['101', '102']);
    const diceNight = games.find((game) => game.id === '101');
    const earlyAccess = games.find((game) => game.id === '102');
    expect(diceNight?.tags).toEqual(['Roguelike', 'Action']);
    expect(diceNight?.releaseDate).toBe('2026-08-10');
    expect(diceNight?.price.current).toEqual({
      minor: 29900,
      currency: 'TWD',
      formatted: 'NT$ 299.00',
    });
    expect(earlyAccess).toMatchObject({ earlyAccess: true, price: { isFree: true } });
    expect(earlyAccess?.releaseDate).toBe('2026-08-09');
    expect(earlyAccess?.platforms).toEqual(['windows', 'linux']);

    const searchCalls = fake.calls.filter((url) => url.pathname === '/search/results/');
    expect(searchCalls).toHaveLength(2);
    for (const call of searchCalls) {
      expect(call.searchParams.get('cc')).toBe('TW');
      expect(call.searchParams.get('l')).toBe('tchinese');
      expect(call.searchParams.get('ignore_preferences')).toBe('1');
      expect(call.searchParams.get('category1')).toBe('998');
      expect(call.searchParams.get('sort_by')).toBe('Released_DESC');
    }
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(fake.routes).toHaveLength(0);
  });

  test('combines specials with batch-enriched wishlist IDs and keeps wishlist entries first', async () => {
    const [tags, deals, storeBrowse] = await Promise.all([
      fixture('tags.json'),
      fixture('search-deals.json'),
      fixture('store-browse.json'),
    ]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(deals, (url) => url.searchParams.get('specials') === '1'),
      pathname('/IStoreBrowseService/GetItems/v1/', storeBrowse),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });

    const games = await instance.getDeals(query({ includeAppIds: ['201', '301'] }));

    expect(games.map((game) => game.id)).toEqual(['201', '301', '202']);
    expect(games[0]).toMatchObject({
      name: 'Wishlist RPG — enriched',
      developers: ['Local Dev'],
      price: {
        current: { minor: 5000, currency: 'TWD' },
        original: { minor: 10000, currency: 'TWD' },
        discountPercent: 50,
      },
      source: { provider: 'steam-store-browse-experimental' },
    });

    const searchCall = fake.calls.find((url) => url.pathname === '/search/results/');
    expect(searchCall?.searchParams.get('specials')).toBe('1');
    const browseCall = fake.calls.find(
      (url) => url.pathname === '/IStoreBrowseService/GetItems/v1/',
    );
    const input = JSON.parse(browseCall?.searchParams.get('input_json') ?? '{}') as {
      ids?: Array<{ appid: number }>;
      context?: { country_code?: string; language?: string };
    };
    expect(input.ids).toEqual([{ appid: 201 }, { appid: 301 }]);
    expect(input.context).toMatchObject({ country_code: 'TW', language: 'tchinese' });
  });

  test('falls back to appdetails for explicit IDs missing from StoreBrowse', async () => {
    const [tags, emptyBrowse, appDetails] = await Promise.all([
      fixture('tags.json'),
      fixture('store-browse-empty.json'),
      fixture('appdetails.json'),
    ]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      pathname('/IStoreBrowseService/GetItems/v1/', emptyBrowse),
      pathname('/api/appdetails', appDetails),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });

    const games = await instance.getApps(['999'], query());

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      id: '999',
      name: 'Fallback Game',
      mature: true,
      releaseDate: '2025-01-01',
      developers: ['Fallback Dev'],
      genres: ['RPG'],
      price: {
        current: { minor: 21000, currency: 'TWD' },
        original: { minor: 30000, currency: 'TWD' },
        discountPercent: 30,
      },
      source: { provider: 'steam-appdetails-experimental-fallback' },
    });
    const fallbackCall = fake.calls.find((url) => url.pathname === '/api/appdetails');
    expect(fallbackCall?.searchParams.get('appids')).toBe('999');
    expect(fallbackCall?.searchParams.get('cc')).toBe('TW');
    expect(fallbackCall?.searchParams.get('l')).toBe('tchinese');
  });

  test('honors Retry-After on HTTP 429 before a bounded retry', async () => {
    const [tags, empty] = await Promise.all([fixture('tags.json'), fixture('search-empty.json')]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute({}, () => true, {
        status: 429,
        headers: { 'retry-after': '2' },
      }),
      searchRoute(empty),
    ]);
    const { instance, sleep } = provider(fake.fetch, { requestDelayMs: 0, maxRetries: 1 });

    await expect(instance.getNewReleases(query())).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fake.calls.filter((url) => url.pathname === '/search/results/')).toHaveLength(2);
  });

  test('exposes non-retryable HTTP errors without leaking the full URL', async () => {
    const tags = await fixture('tags.json');
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute({}, () => true, { status: 403 }),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0, maxRetries: 2 });

    await expect(instance.getNewReleases(query())).rejects.toMatchObject({
      code: 'STEAM_HTTP_ERROR',
      status: 403,
      endpoint: 'search',
    } satisfies Partial<SteamProviderError>);
    expect(fake.calls.filter((url) => url.pathname === '/search/results/')).toHaveLength(1);
  });

  test('reports search schema drift instead of treating it as no results', async () => {
    const [tags, malformed] = await Promise.all([
      fixture('tags.json'),
      fixture('search-malformed.json'),
    ]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(malformed),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });

    await expect(instance.getNewReleases(query())).rejects.toMatchObject({
      code: 'STEAM_SCHEMA_DRIFT',
      endpoint: 'search',
    } satisfies Partial<SteamProviderError>);
  });

  test('fetches and deduplicates public wishlist App IDs without a key', async () => {
    const wishlist = await fixture('wishlist.json');
    const fake = fakeSteamFetch([pathname('/IWishlistService/GetWishlist/v1/', wishlist)]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });

    await expect(instance.getWishlistAppIds('76561198000000000')).resolves.toEqual(['201', '301']);
    const call = fake.calls[0];
    expect(JSON.parse(call?.searchParams.get('input_json') ?? '{}')).toEqual({
      steamid: '76561198000000000',
    });
  });

  test('diagnose validates both tag catalog and search contracts', async () => {
    const [tags, empty] = await Promise.all([fixture('tags.json'), fixture('search-empty.json')]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(empty),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });

    await expect(instance.diagnose()).resolves.toEqual({
      ok: true,
      name: 'Steam Store (experimental)',
      message: "Steam's experimental keyless endpoints responded and 6 tags were parsed.",
      latencyMs: 0,
    });
  });

  test('fails before price rules when the Store currency contradicts config', async () => {
    const [tags, globalPage] = await Promise.all([
      fixture('tags.json'),
      fixture('search-new-global.json'),
    ]);
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(globalPage),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });
    await expect(instance.getNewReleases(query({ currency: 'USD' }))).rejects.toMatchObject({
      code: 'STEAM_CURRENCY_MISMATCH',
    } satisfies Partial<SteamProviderError>);
  });

  test('rejects unsafe advanced provider bounds', () => {
    expect(() => provider(vi.fn() as unknown as typeof fetch, { storeBrowseBatchSize: 0 })).toThrow(
      'storeBrowseBatchSize',
    );
    expect(() => provider(vi.fn() as unknown as typeof fetch, { maxRetries: Number.POSITIVE_INFINITY })).toThrow(
      'maxRetries',
    );
  });

  test('enriches release candidates when developer interests need metadata', async () => {
    const [tags, globalPage] = await Promise.all([
      fixture('tags.json'),
      fixture('search-new-global.json'),
    ]);
    const browse = {
      response: {
        store_items: [
          {
            appid: 101,
            name: 'Dice Night',
            is_free: true,
            tagids: [1716],
            basic_info: { developers: [{ name: 'Target Studio' }], publishers: [] },
            platforms: { windows: true },
            release: { steam_release_date: 1786320000 },
          },
          {
            appid: 102,
            name: 'Early Bits',
            is_free: true,
            tagids: [493],
            basic_info: { developers: [{ name: 'Other Studio' }], publishers: [] },
            platforms: { windows: true },
            release: { steam_release_date: 1786233600 },
          },
        ],
      },
    };
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', tags),
      searchRoute(globalPage),
      pathname('/IStoreBrowseService/GetItems/v1/', browse),
    ]);
    const { instance } = provider(fake.fetch, { requestDelayMs: 0 });
    const games = await instance.getNewReleases(query({ developers: ['Target Studio'] }));
    expect(games.find((game) => game.id === '101')?.developers).toEqual(['Target Studio']);
  });
});

describe('Steam popular games', () => {
  test('uses the real top-sellers source without newest ordering or interest injection', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute(await fixture('search-new-global.json'), url => url.searchParams.get('filter') === 'topsellers'),
    ]);
    const { instance } = provider(fake.fetch);
    const games = await instance.getPopular(query({ maxPages: 1, includeMature: false, includeAppIds: ['999'], tags: ['Roguelike'] }));
    expect(games.map(game => game.id)).toEqual(['101', '102']);
    const search = fake.calls.find(url => url.pathname === '/search/results/')!;
    expect(search.searchParams.has('sort_by')).toBe(false);
    expect(search.searchParams.has('tags')).toBe(false);
    expect(search.searchParams.get('category1')).toBe('998');
    expect(search.searchParams.get('cc')).toBe('TW');
    expect(fake.routes).toHaveLength(0);
  });
  test('reports an unavailable chart instead of returning a fabricated popular list', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute({}, () => true, { status: 503 }),
    ]);
    const { instance } = provider(fake.fetch, { maxRetries: 0 });
    await expect(instance.getPopular(query())).rejects.toThrow();
  });
});

describe('recommendation pagination', () => {
  test('requests the next offset once and marks a short final page exhausted', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute(await fixture('search-new-global.json'), url => url.searchParams.get('start') === '50' && url.searchParams.get('filter') === 'topsellers'),
    ]);
    const result = await provider(fake.fetch).instance.getRecommendationPage(query(), 50);
    expect(result.games.length).toBeGreaterThan(0);
    expect(result.hasMore).toBe(false);
    expect(result.nextOffset).toBe(100);
    expect(fake.calls.filter(url => url.pathname === '/search/results/')).toHaveLength(1);
  });
  test('rejects invalid offsets before making requests', async () => {
    const fake = fakeSteamFetch([]);
    await expect(provider(fake.fetch).instance.getRecommendationPage(query(), -50)).rejects.toThrow('Invalid');
    expect(fake.calls).toHaveLength(0);
  });
  test('does not treat provider errors as an exhausted list', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute(await fixture('search-malformed.json')),
    ]);
    await expect(provider(fake.fetch).instance.getRecommendationPage(query(), 50)).rejects.toThrow();
  });
});

describe('filtered discovery searches', () => {
  test('searches Steam with the selected tag, platform, price and player count instead of the global chart', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute(await fixture('search-new-global.json'), url => url.searchParams.get('tags') === '19' && url.searchParams.get('os') === 'windows' && url.searchParams.get('category3') === '2' && url.searchParams.get('maxprice') === '300'),
    ]);
    const result = await provider(fake.fetch).instance.getDiscoveryPage(query(), { source: 'popular', genre: 'Action', platform: 'windows', price: 'under300', players: 'single', earlyAccess: 'exclude', offset: 0 });
    expect(result.games.map(game => game.id)).toEqual(['101']);
    expect(result.hasMore).toBe(false);
    expect(fake.routes).toHaveLength(0);
  });
  test('keeps source and offset in filtered pagination', async () => {
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute(await fixture('search-new-global.json'), url => url.searchParams.get('start') === '50' && url.searchParams.get('specials') === '1' && url.searchParams.get('sort_by') === 'Released_DESC'),
    ]);
    await provider(fake.fetch).instance.getDiscoveryPage(query(), { source: 'deals', genre: 'all', platform: 'all', price: 'all', players: 'all', earlyAccess: 'all', offset: 50 });
    expect(fake.routes).toHaveLength(0);
  });
  test('continues ordinary discovery beyond the old one-thousand-result limit', async () => {
    const page = await fixture('search-new-global.json') as Record<string, unknown>;
    const fake = fakeSteamFetch([
      pathname('/tagdata/populartags/english', await fixture('tags.json')),
      searchRoute({ ...page, total_count: 20_000 }, url => url.searchParams.get('start') === '1500'),
    ]);
    const result = await provider(fake.fetch).instance.getDiscoveryPage(query(), { source: 'popular', genre: 'all', platform: 'all', price: 'all', players: 'all', earlyAccess: 'all', offset: 1500 });
    expect(result.hasMore).toBe(true);
    expect(result.nextOffset).toBe(1550);
    expect(fake.routes).toHaveLength(0);
  });
  test('does not silently substitute the global chart for an unknown genre', async () => {
    const fake = fakeSteamFetch([pathname('/tagdata/populartags/english', await fixture('tags.json'))]);
    await expect(provider(fake.fetch).instance.getDiscoveryPage(query(), { source: 'popular', genre: 'Unknown tag', platform: 'all', price: 'all', players: 'all', earlyAccess: 'all', offset: 0 })).rejects.toThrow('無法辨識');
    expect(fake.calls.filter(url => url.pathname === '/search/results/')).toHaveLength(0);
  });
});

test('uses Steam total count for pagination when some search rows are not game entries', async () => {
  const page = await fixture('search-new-global.json') as Record<string, unknown>;
  const fake = fakeSteamFetch([
    pathname('/tagdata/populartags/english', await fixture('tags.json')),
    searchRoute({ ...page, total_count: 150 }),
  ]);
  const result = await provider(fake.fetch).instance.getDiscoveryPage(query(), { source: 'popular', genre: 'all', platform: 'all', price: 'all', players: 'all', earlyAccess: 'all', offset: 0 });
  expect(result.games).toHaveLength(2);
  expect(result.hasMore).toBe(true);
});


test('activity pages keep games and demos, verify unknown types, and exclude DLC and soundtracks', async () => {
  const items = [0, 1, 4, 11, 6].map((type, index) => ({ item_type: 0, id: 900 + index, appid: 900 + index, success: 1, visible: true, name: `Item ${index}`, type, tagids: [19], categories: { supported_player_categoryids: [2] }, platforms: { windows: true } }));
  const http = fakeSteamFetch([
    pathname('/tagdata/populartags/english', await fixture('tags.json')),
    pathname('/IStoreBrowseService/GetItems/v1/', { response: { store_items: items } }),
    pathname('/api/appdetails', { '904': { success: true, data: { type: 'game' } } }),
  ]);
  const result = await provider(http.fetch).instance.getEventApps(items.map(item => String(item.id)), query());
  expect(result.map(game => game.id)).toEqual(['900', '901', '904']);
  expect(result.every(game => game.playerCategories?.includes(2))).toBe(true);
  expect(result.every(game => game.price.current === null && !game.price.isFree)).toBe(true);
  expect(http.routes).toHaveLength(0);
});
