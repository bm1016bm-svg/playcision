import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { filterDeals, filterDiscover } from '../src/core/index.js';
import type { Game } from '../src/domain/types.js';
import { createInitialState, type PlaycisionState } from '../src/state/index.js';

function game(
  id: string,
  options: {
    name?: string;
    releaseDate?: string;
    tags?: string[];
    mature?: boolean;
    earlyAccess?: boolean;
    minor?: number;
    currency?: string;
    discountPercent?: number;
  } = {},
): Game {
  const minor = options.minor ?? 20_000;
  const currency = options.currency ?? 'TWD';
  return {
    id,
    store: 'steam',
    name: options.name ?? `Game ${id}`,
    url: `https://store.steampowered.com/app/${id}`,
    ...(options.releaseDate === undefined ? {} : { releaseDate: options.releaseDate }),
    developers: ['Studio'],
    publishers: ['Publisher'],
    tags: options.tags ?? ['Roguelike'],
    genres: ['Indie'],
    platforms: ['windows'],
    earlyAccess: options.earlyAccess ?? false,
    mature: options.mature ?? false,
    price: {
      current: { minor, currency },
      original: { minor: 40_000, currency },
      discountPercent: options.discountPercent ?? 50,
      isFree: false,
    },
    source: { fetchedAt: '2026-08-10T00:00:00.000Z', provider: 'test' },
  };
}

describe('filterDiscover', () => {
  it('applies date, interest, mature, early-access, exclusion, and limit rules deterministically', () => {
    const config = configSchema.parse({
      interests: { tags: ['roguelike'], excludeAppIds: ['6'] },
      discover: {
        days: 7,
        limit: 2,
        includeMature: false,
        includeEarlyAccess: false,
      },
    });
    const games = [
      game('1', { releaseDate: '2026-08-09', name: 'Beta' }),
      game('2', { releaseDate: '2026-08-10', name: 'Alpha' }),
      game('3', { releaseDate: '2026-08-09', tags: ['Puzzle'] }),
      game('4', { releaseDate: '2026-07-01' }),
      game('5', { releaseDate: '2026-08-10', mature: true }),
      game('6', { releaseDate: '2026-08-10' }),
      game('7', { releaseDate: '2026-08-10', earlyAccess: true }),
    ];
    const before = structuredClone(games);

    const result = filterDiscover([...games].reverse(), {
      config,
      now: '2026-08-10T12:00:00Z',
    });

    expect(result.map(({ id }) => id)).toEqual(['2', '1']);
    expect(games).toEqual(before);
  });

  it('deduplicates provider results before applying its result limit', () => {
    const config = configSchema.parse({ discover: { days: 7, limit: 2 } });
    const duplicate = game('1', { releaseDate: '2026-08-10' });
    const result = filterDiscover([duplicate, duplicate, game('2', { releaseDate: '2026-08-09' })], {
      config,
      now: '2026-08-10T12:00:00Z',
    });

    expect(result.map(({ id }) => id)).toEqual(['1', '2']);
  });

  it('keeps Roll-only state skips and exclusions out of Discover filtering', () => {
    const config = configSchema.parse({ discover: { days: 7, limit: 10 } });
    const state: PlaycisionState = {
      ...createInitialState(),
      skipped: { '1': { until: '2026-08-11T00:00:00Z' } },
      excluded: ['2'],
    };

    const result = filterDiscover(
      [game('1', { releaseDate: '2026-08-10' }), game('2', { releaseDate: '2026-08-10' })],
      { config, state, now: '2026-08-10T00:00:00Z' },
    );

    expect(result.map(({ id }) => id)).toEqual(['1', '2']);
  });

  it('treats Steam tags as a genre fallback', () => {
    const config = configSchema.parse({ interests: { genres: ['Roguelike'] } });
    const result = filterDiscover([game('1', { releaseDate: '2026-08-10', tags: ['Roguelike'] })], {
      config,
      now: '2026-08-10T12:00:00Z',
    });
    expect(result.map(({ id }) => id)).toEqual(['1']);
  });
});

describe('filterDeals', () => {
  it('compares major-unit config to minor-unit prices, honors wishlist, and suppresses duplicates', () => {
    const config = configSchema.parse({
      interests: { tags: ['roguelike'] },
      deals: {
        limit: 20,
        maxPrice: 300,
        minDiscountPercent: 20,
        wishlistAppIds: ['5'],
        notifyPriceChanges: true,
      },
    });
    const state: PlaycisionState = {
      ...createInitialState(),
      notified: {
        '4': {
          at: '2026-08-09T00:00:00Z',
          price: { minor: 25_000, currency: 'TWD' },
          discountPercent: 30,
        },
      },
    };
    const games = [
      game('1', { minor: 30_000, discountPercent: 20 }),
      game('2', { minor: 30_001, discountPercent: 80 }),
      game('3', { minor: 20_000, discountPercent: 19 }),
      game('4', { minor: 25_000, discountPercent: 30 }),
      game('5', { minor: 20_000, discountPercent: 40, tags: ['Puzzle'] }),
      game('6', { minor: 100, currency: 'USD', discountPercent: 90 }),
    ];

    expect(filterDeals(games, { config, state, now: '2026-08-10T00:00:00Z' }).map(({ id }) => id))
      .toEqual(['2', '5', '1', '3']);

    const changed = games.map((candidate) =>
      candidate.id === '4' ? game('4', { minor: 24_000, discountPercent: 30 }) : candidate,
    );
    expect(filterDeals(changed, { config, state, now: '2026-08-10T00:00:00Z' }).map(({ id }) => id))
      .toEqual(['2', '5', '4', '1', '3']);
  });

  it('can require a local observed low and rejects prices above that low', () => {
    const config = configSchema.parse({
      deals: {
        maxPrice: null,
        minDiscountPercent: 0,
        localObservedLowOnly: true,
      },
    });
    const state: PlaycisionState = {
      ...createInitialState(),
      prices: {
        '1': {
          current: { minor: 12_000, currency: 'TWD' },
          lowestObserved: { minor: 10_000, currency: 'TWD' },
          discountPercent: 20,
          observedAt: '2026-08-09T00:00:00Z',
        },
        '2': {
          current: { minor: 10_000, currency: 'TWD' },
          lowestObserved: { minor: 10_000, currency: 'TWD' },
          discountPercent: 20,
          observedAt: '2026-08-09T00:00:00Z',
        },
      },
    };

    const result = filterDeals(
      [
        game('1', { minor: 11_000 }),
        game('2', { minor: 10_000 }),
        game('3', { minor: 9_000 }),
      ],
      { config, state, now: '2026-08-10T00:00:00Z' },
    );

    expect(result.map(({ id }) => id)).toEqual(['2']);
  });

  it('selects the freshest duplicate deterministically', () => {
    const config = configSchema.parse({
      deals: { maxPrice: null, minDiscountPercent: 0, limit: 10 },
    });
    const older = game('1', { minor: 20_000 });
    const newer: Game = {
      ...game('1', { minor: 10_000 }),
      source: { ...older.source, fetchedAt: '2026-08-10T01:00:00.000Z' },
    };

    const forward = filterDeals([older, newer], { config, now: '2026-08-10T02:00:00Z' });
    const reversed = filterDeals([newer, older], { config, now: '2026-08-10T02:00:00Z' });

    expect(forward[0]?.price.current?.minor).toBe(10_000);
    expect(reversed).toEqual(forward);
  });
});
