import { expect, it } from 'vitest';
import { HIDDEN_KEY, LIBRARY_KEY, hideGame, readHidden, restoreHiddenGames } from '../src/web/consumer/browser-library.js';

function storage() {
  const rows = new Map<string, string>([[LIBRARY_KEY, 'saved favorites']]);
  return { rows, getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
}
it('restores permanent and temporary exclusions, preserving favorites and other exclusions', () => {
  const s = storage(); hideGame(s, '10', false, 100); hideGame(s, '20', true, 100); hideGame(s, '30', false, 100);
  expect(restoreHiddenGames(s, ['10'], 100)).toEqual({ '20': 604800100, '30': null });
  expect(readHidden(s, 100)).toEqual({ '20': 604800100, '30': null });
  expect(restoreHiddenGames(s, ['20', '30'], 100)).toEqual({});
  expect(s.rows.get(LIBRARY_KEY)).toBe('saved favorites');
});
it('preserves the original when storage fails or existing exclusions are corrupt', () => {
  const s = storage(); hideGame(s, '10', false);
  const original = s.rows.get(HIDDEN_KEY);
  expect(() => restoreHiddenGames({ getItem: s.getItem, setItem: () => { throw Error('quota'); } }, ['10'])).toThrow('quota');
  expect(s.rows.get(HIDDEN_KEY)).toBe(original);
  s.rows.set(HIDDEN_KEY, 'broken'); expect(() => restoreHiddenGames(s, ['10'])).toThrow();
  expect(s.rows.get(HIDDEN_KEY)).toBe('broken');
});
it('discards expired skips during restore, validates IDs before writing, and rereads concurrent changes', () => {
  const s = storage(); hideGame(s, '10', true, 0); hideGame(s, '20', false, 0);
  expect(() => restoreHiddenGames(s, ['../20'], 1)).toThrow('遊戲代號');
  hideGame(s, '30', false, 1);
  expect(restoreHiddenGames(s, ['20'], 604800001)).toEqual({ '30': null });
});
