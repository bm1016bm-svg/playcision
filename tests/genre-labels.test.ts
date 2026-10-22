import { describe, expect, it } from 'vitest';
import { genreLabel } from '../src/web/consumer/genre-labels.js';
import { DEFAULT_FILTERS, gameMatchesFilters } from '../src/web/consumer/rules.js';
import type { Game } from '../src/web/types.js';

describe('Traditional Chinese genre labels', () => {
  it('translates labels without requiring a provider schema change', () => {
    expect(genreLabel('Simulation')).toBe('模擬');
    expect(genreLabel('AUTOMOBILE SIM')).toBe('汽車模擬');
    expect(genreLabel('未知類型')).toBe('未知類型');
    expect(genreLabel('New Steam Tag')).toBe('New Steam Tag');
  });
  it('retains original values for genre matching', () => {
    const game = { tags: ['Automobile Sim'], genres: ['Simulation'], platforms: [], price: { isFree: true } } as unknown as Game;
    expect(genreLabel(game.tags[0]!)).toBe('汽車模擬');
    expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, genre: 'Automobile Sim' })).toBe(true);
    expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, genre: 'Puzzle' })).toBe(false);
  });
});

it('removes mixed-language display names while preserving distinct genre meanings', () => {
  const tags = ['Action Roguelike', 'Traditional Roguelike', 'Roguelite', 'Roguelike', 'Roguelike Deckbuilder', '2D Fighter', '3D Fighter', '4X', 'Desktop Companion'];
  const names = tags.map(genreLabel);
  expect(names.every(name => !/[a-z]/i.test(name))).toBe(true);
  expect(new Set(names).size).toBe(tags.length);
});
