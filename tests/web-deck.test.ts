import { blockedUiAppIds } from '../src/ui/preferences.js';
import { createInitialState } from '../src/state/schema.js';
import { describe, expect, it } from 'vitest';
import { savedPriceSummary, formatTotalPrice, buildRollPool, formatGamePrice, safeStoreUrl, uniqueGames } from '../src/web/deck.js';
import { DEFAULT_FILTERS, gameMatchesFilters, pickSavedGame, recommendationReason, swipeDecision } from '../src/web/consumer/rules.js';
import type { Game, UiPayload } from '../src/web/types.js';

function game(id: string, overrides: Partial<Game> = {}): Game {
  return {
    id,
    store: 'steam',
    name: `Game ${id}`,
    url: `https://store.steampowered.com/app/${id}/`,
    developers: [],
    publishers: [],
    tags: [],
    genres: [],
    platforms: ['windows'],
    earlyAccess: false,
    mature: false,
    price: {
      current: { minor: 29900, currency: 'TWD' },
      original: { minor: 39900, currency: 'TWD' },
      discountPercent: 25,
      isFree: false,
    },
    ...overrides,
  };
}

function payload(rolled?: Game): UiPayload {
  return {
    digest: {
      generatedAt: '2026-08-24T09:00:00.000Z',
      discover: [game('10'), game('20')],
      deals: [game('20'), game('30')],
      ...(rolled ? { roll: { game: rolled, reason: [], seed: 'test', candidateCount: 3, selectedIndex: 0, weight: 1 } } : {}),
      warnings: [],
    },
    locale: { country: 'TW', currency: 'TWD', language: 'tchinese' },
    filters: { discoverDays: 7, dealMaxPrice: 300, minDiscountPercent: 20, rollMode: 'weighted', tags: [] },
  };
}

describe('web deck helpers', () => {
  it('deduplicates store IDs while preserving the first occurrence', () => {
    expect(uniqueGames([game('10'), game('10', { name: 'duplicate' }), game('20')]).map((item) => item.name))
      .toEqual(['Game 10', 'Game 20']);
  });

  it('places the seeded recommendation first without duplicating it', () => {
    expect(buildRollPool(payload(game('20'))).map((item) => item.id)).toEqual(['20', '10', '30']);
  });

  it('falls back to a canonical Steam URL for untrusted links', () => {
    expect(safeStoreUrl(game('42', { url: 'javascript:alert(1)' })))
      .toBe('https://store.steampowered.com/app/42/');
  });

  it('formats normalized hundredths and free games', () => {
    expect(formatGamePrice(game('10'), 'tchinese')).toContain('299');
    expect(formatGamePrice(game('11', { price: { current: null, original: null, discountPercent: 0, isFree: true } }), 'tchinese'))
      .toBe('免費遊玩');
  });
});

describe('consumer decisions and filters', () => {
  it('commits left and right distance swipes, but lets vertical gestures scroll', () => {
    expect(swipeDecision({ x: 100, y: 10 }, 0)).toBe('save');
    expect(swipeDecision({ x: -100, y: 10 }, 0)).toBe('skip');
    expect(swipeDecision({ x: 110, y: 150 }, 900)).toBeNull();
    expect(swipeDecision({ x: 60, y: 10 }, 100)).toBeNull();
  });

  it('requires intentional travel for velocity swipes and uses velocity direction below distance threshold', () => {
    expect(swipeDecision({ x: 5, y: 0 }, 1000)).toBeNull();
    expect(swipeDecision({ x: 35, y: 0 }, -800)).toBe('skip');
    expect(swipeDecision({ x: -35, y: 0 }, 800)).toBe('save');
    expect(swipeDecision({ x: -100, y: 0 }, 800)).toBe('skip');
  });

  it('does not interpret another currency or missing prices as NT$300', () => {
    const filters = { ...DEFAULT_FILTERS, price: 'under300' as const };
    expect(gameMatchesFilters(game('1'), filters)).toBe(true);
    expect(gameMatchesFilters(game('1', { price: { current: { minor: 30100, currency: 'TWD' }, original: null, discountPercent: 0, isFree: false } }), filters)).toBe(false);
    expect(gameMatchesFilters(game('1', { price: { current: { minor: 1000, currency: 'USD' }, original: null, discountPercent: 0, isFree: false } }), filters)).toBe(false);
    expect(gameMatchesFilters(game('1', { price: { current: null, original: null, discountPercent: 0, isFree: false } }), filters)).toBe(false);
    expect(gameMatchesFilters(game('1', { price: { current: null, original: null, discountPercent: 0, isFree: true } }), filters)).toBe(true);
  });

  it('requires observed platform and player labels rather than assuming support', () => {
    expect(gameMatchesFilters(game('1'), { ...DEFAULT_FILTERS, platform: 'mac' })).toBe(false);
    expect(gameMatchesFilters(game('1'), { ...DEFAULT_FILTERS, players: 'multi' })).toBe(false);
    expect(gameMatchesFilters(game('1', { tags: ['Online Co-op'] }), { ...DEFAULT_FILTERS, players: 'multi' })).toBe(true);
    expect(gameMatchesFilters(game('1', { tags: ['Single-player'] }), { ...DEFAULT_FILTERS, players: 'single' })).toBe(true);
    expect(gameMatchesFilters(game('1', { genres: ['RPG'] }), { ...DEFAULT_FILTERS, genre: 'RPG' })).toBe(true);
  });

  it('only claims seeded selection for the actual rolled game', () => {
    const plainPrice = { current: null, original: null, discountPercent: 0, isFree: false };
    const chosen = game('20', { price: plainPrice });
    expect(recommendationReason(chosen, payload(chosen))).toContain('固定種子');
    expect(recommendationReason(game('10', { price: plainPrice }), payload(chosen))).not.toContain('固定種子');
  });
});

describe('persistent consumer preferences', () => {
  it('keeps active skips and exclusions hidden after reload, but restores expired skips', () => {
    const state = createInitialState();
    state.excluded = ['10'];
    state.skipped = {
      '10': { until: '2026-09-25T00:00:00Z' },
      '20': { until: '2026-09-25T00:00:00Z' },
      '30': { until: '2026-09-18T00:00:00Z' },
    };
    expect(blockedUiAppIds(state, new Date('2026-09-18T00:00:00Z'))).toEqual(['10', '20']);
    expect(blockedUiAppIds(state, new Date('2026-09-25T00:00:00Z'))).toEqual(['10']);
    expect(blockedUiAppIds(createInitialState(), new Date('2026-09-18T00:00:00Z'))).toEqual([]);
  });
});

 describe('saved-game picker', () => {
  it('handles empty and single-game collections', () => {
    expect(pickSavedGame([], 'test', 0)).toBeUndefined();
    expect(pickSavedGame([game('7')], 'test', 12)?.id).toBe('7');
  });
  it('is reproducible regardless of collection order and only selects saved games', () => {
    const games = [game('3'), game('1'), game('2')];
    for (let count = 0; count < 12; count++) {
      const result = pickSavedGame(games, 'seed', count);
      expect(result).toEqual(pickSavedGame([...games].reverse(), 'seed', count));
      expect(games).toContain(result);
    }
    expect(new Set(Array.from({ length: 12 }, (_, i) => pickSavedGame(games, 'seed', i)?.id)).size).toBeGreaterThan(1);
  });
 });

describe('saved price totals', () => {
  it('adds integer hundredths, deduplicates games and separates currencies', () => {
    const usd = game('3', { price: { current: { minor: 1999, currency: 'USD' }, original: null, isFree: false, discountPercent: 0 } });
    expect(savedPriceSummary([game('1'), game('2'), game('1'), usd])).toEqual({
      totals: [{ currency: 'TWD', minor: 59800 }, { currency: 'USD', minor: 1999 }], unknown: 0,
    });
    expect(formatTotalPrice(1999, 'USD', 'tchinese')).toContain('19.99');
  });
  it('does not count free games as unknown or invent missing prices', () => {
    const free = game('1', { price: { current: null, original: null, isFree: true, discountPercent: 0 } });
    const missing = game('2', { price: { current: null, original: null, isFree: false, discountPercent: 0 } });
    expect(savedPriceSummary([free, missing])).toEqual({ totals: [], unknown: 1 });
    expect(savedPriceSummary([free])).toEqual({ totals: [], unknown: 0 });
  });
});
