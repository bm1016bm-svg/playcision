import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import {
  buildCandidatePool,
  buildRecommendation,
  calculateRecommendationWeight,
  excludeGame,
  includeGame,
  isGameSkipped,
  pruneExpiredSkips,
  skipGame,
  unskipGame,
} from '../src/core/index.js';
import type { Game } from '../src/domain/types.js';
import { createInitialState, markNotified } from '../src/state/index.js';

function game(
  id: string,
  options: { tags?: string[]; minor?: number; discountPercent?: number } = {},
): Game {
  const minor = options.minor ?? 20_000;
  return {
    id,
    store: 'steam',
    name: `Game ${id}`,
    url: `https://store.steampowered.com/app/${id}`,
    releaseDate: '2026-08-10',
    developers: ['Studio'],
    publishers: ['Publisher'],
    tags: options.tags ?? ['Roguelike'],
    genres: ['Indie'],
    platforms: ['windows'],
    earlyAccess: false,
    mature: false,
    price: {
      current: { minor, currency: 'TWD' },
      original: { minor: 40_000, currency: 'TWD' },
      discountPercent: options.discountPercent ?? 50,
      isFree: false,
    },
    source: { fetchedAt: '2026-08-10T00:00:00.000Z', provider: 'test' },
  };
}

const now = '2026-08-10T00:00:00Z';

describe('candidate pool', () => {
  it('sorts before slicing, so provider input order cannot change the pool', () => {
    const config = configSchema.parse({ roll: { mode: 'uniform', limit: 2 } });
    const games = [game('3'), game('100'), game('20')];

    const forward = buildCandidatePool(games, { config, now });
    const reversed = buildCandidatePool([...games].reverse(), { config, now });

    expect(forward.map(({ id }) => id)).toEqual(['100', '20']);
    expect(reversed.map(({ id }) => id)).toEqual(['100', '20']);
  });

  it('removes temporary skips and permanent exclusions', () => {
    const config = configSchema.parse({ roll: { mode: 'uniform', limit: 10 } });
    const skipped = skipGame(createInitialState(), '20', '2026-08-11T00:00:00Z');
    const state = excludeGame(skipped, '3');

    expect(buildCandidatePool([game('3'), game('100'), game('20')], { config, state, now })
      .map(({ id }) => id)).toEqual(['100']);
  });
});

describe('deterministic roll', () => {
  it('replays the same uniform result for the same seed regardless of input order', () => {
    const config = configSchema.parse({ roll: { mode: 'uniform', limit: 10 } });
    const games = [game('3'), game('100'), game('20')];

    const first = buildRecommendation(games, { config, now, seed: 'friday-night' });
    const replay = buildRecommendation([...games].reverse(), {
      config,
      now,
      seed: 'friday-night',
    });

    expect(replay).toEqual(first);
  });

  it('normalizes canonically equivalent Unicode seeds to NFC', () => {
    const config = configSchema.parse({ roll: { mode: 'uniform', limit: 10 } });
    const games = [game('3'), game('100'), game('20')];

    const composed = buildRecommendation(games, { config, now, seed: 'caf\u00e9' });
    const decomposed = buildRecommendation(games, { config, now, seed: 'cafe\u0301' });

    expect(decomposed).toEqual(composed);
    expect(decomposed?.seed).toBe('caf\u00e9');
  });

  it('uses reroll as a reproducible no-repeat sequence and wraps after the pool is exhausted', () => {
    const config = configSchema.parse({ roll: { mode: 'uniform', limit: 10 } });
    const games = [game('3'), game('100'), game('20')];
    const ids = [0, 1, 2].map(
      (reroll) => buildRecommendation(games, { config, now, seed: 'friday', reroll })?.game.id,
    );

    expect(new Set(ids).size).toBe(3);
    expect(buildRecommendation(games, { config, now, seed: 'friday', reroll: 3 })?.game.id)
      .toBe(ids[0]);
  });

  it('calculates explicit weighted factors and remains deterministic', () => {
    const config = configSchema.parse({
      interests: { tags: ['roguelike'] },
      roll: {
        mode: 'weighted',
        limit: 10,
        weights: { discounted: 2, interestMatch: 3, neverNotified: 5 },
      },
    });
    const candidate = game('10', { discountPercent: 50 });
    const initial = createInitialState();
    const notified = markNotified(initial, [candidate], now);

    expect(calculateRecommendationWeight(candidate, config, initial)).toBe(30);
    expect(calculateRecommendationWeight(candidate, config, notified)).toBe(6);
    expect(buildRecommendation([candidate, game('20')], { config, state: initial, now, seed: 'x' }))
      .toEqual(buildRecommendation([game('20'), candidate], {
        config,
        state: initial,
        now,
        seed: 'x',
      }));
  });
});

describe('skip and exclusion helpers', () => {
  it('updates state immutably and can prune or reverse each decision', () => {
    const initial = createInitialState();
    const skipped = skipGame(initial, '10', '2026-08-11T00:00:00Z');

    expect(initial.skipped).toEqual({});
    expect(isGameSkipped(skipped, '10', now)).toBe(true);
    expect(isGameSkipped(skipped, '10', '2026-08-11T00:00:00Z')).toBe(false);
    expect(pruneExpiredSkips(skipped, '2026-08-11T00:00:00Z').skipped).toEqual({});
    expect(unskipGame(skipped, '10').skipped).toEqual({});

    const excluded = excludeGame(skipped, '10');
    expect(excluded.skipped).toEqual({});
    expect(excluded.excluded).toEqual(['10']);
    expect(includeGame(excluded, '10').excluded).toEqual([]);
  });
});
