import { describe, expect, it } from 'vitest';
import { groupGenres, hasAdultContent } from '../src/web/consumer/genre-groups.js';
import { DEFAULT_FILTERS, toggleGenre, gameMatchesFilters } from '../src/web/consumer/rules.js';
import type { Game } from '../src/web/types.js';
describe('genre submenus and adult filtering', () => {
  it('keeps every original filter key exactly once, including unknown tags', () => {
    const input = ['FPS', 'RPG', 'Puzzle', 'Unknown new tag', 'FPS'];
    const result = groupGenres(input);
    expect(result.flatMap(group => group.genres).sort()).toEqual([...new Set(input)].sort());
    expect(result.find(group => group.id === 'action')?.genres).toContain('FPS');
    expect(result.find(group => group.id === 'other')?.genres).toContain('Unknown new tag');
    expect(groupGenres([])).toEqual([]);
  });
  it('recognizes explicit labels without classifying violence as sexual content', () => {
    for (const tag of ['Hentai', 'Sexual Content', 'Nudity', '成人內容', '裸露']) expect(hasAdultContent({ tags: [tag], genres: [] })).toBe(true);
    expect(hasAdultContent({ tags: ['Gore', 'Horror', 'Mature'], genres: [] })).toBe(false);
    expect(hasAdultContent({ tags: [], genres: [] })).toBe(false);
  });
  it('supports all, only and exclude, combined with existing filters', () => {
    const game = { tags: ['Sexual Content'], genres: ['RPG'], platforms: ['windows'], mature: true, price: { isFree: true } } as Game;
    expect(gameMatchesFilters(game, DEFAULT_FILTERS)).toBe(true);
    expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, adult: 'only' })).toBe(true);
    expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, adult: 'exclude' })).toBe(false);
    expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, adult: 'only', platform: 'mac' })).toBe(false);
    expect(gameMatchesFilters({ ...game, tags: ['Gore'] }, { ...DEFAULT_FILTERS, adult: 'only' })).toBe(false);
  });
});

it('toggles a selected genre off and switches to a new genre', () => {
  expect(toggleGenre('RPG', 'RPG')).toBe('all');
  expect(toggleGenre('all', 'RPG')).toBe('RPG');
  expect(toggleGenre('RPG', 'FPS')).toBe('FPS');
});
it('filters paid and early access using actual fields, not missing prices', () => {
  const game = { tags: [], genres: [], platforms: [], earlyAccess: true, price: { isFree: false, current: { minor: 100, currency: 'TWD' } } } as unknown as Game;
  expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, earlyAccess: 'only', price: 'paid' })).toBe(true);
  expect(gameMatchesFilters(game, { ...DEFAULT_FILTERS, earlyAccess: 'exclude' })).toBe(false);
  expect(gameMatchesFilters({ ...game, earlyAccess: false }, { ...DEFAULT_FILTERS, earlyAccess: 'only' })).toBe(false);
  expect(gameMatchesFilters({ ...game, price: { ...game.price, current: null } }, { ...DEFAULT_FILTERS, price: 'paid' })).toBe(false);
  expect(gameMatchesFilters({ ...game, price: { ...game.price, isFree: true } }, { ...DEFAULT_FILTERS, price: 'paid' })).toBe(false);
});

it('orders common tags consistently and groups hybrid genres by their primary gameplay', () => {
  const tags = ['Ninja', 'FPS', 'Action', 'Action RPG', 'Combat Racing', 'Card Battler', 'Dating Sim'];
  expect(groupGenres(tags)).toEqual(groupGenres([...tags].reverse()));
  const groups = groupGenres(tags);
  expect(groups.find(group => group.id === 'action')?.genres).toEqual(['Action', 'FPS', 'Ninja']);
  expect(groups.find(group => group.id === 'rpg')?.genres).toContain('Action RPG');
  expect(groups.find(group => group.id === 'sports')?.genres).toContain('Combat Racing');
  expect(groups.find(group => group.id === 'casual')?.genres).toContain('Card Battler');
  expect(groups.find(group => group.id === 'story')?.genres).toContain('Dating Sim');
});
