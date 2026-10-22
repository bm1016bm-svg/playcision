import { describe, expect, it } from 'vitest';
import { addToFolder, parseHistory, saveHistory, HISTORY_KEY } from '../src/web/consumer/history-library.js';
import type { Game } from '../src/web/types.js';

const game: Game = { id: '570', store: 'steam', name: 'Example', url: 'https://store.steampowered.com/app/570/', developers: [], publishers: [], tags: [], genres: [], platforms: [], earlyAccess: false, mature: false, price: { current: null, original: null, isFree: true, discountPercent: 0 } };
describe('history collection persistence', () => {
  it('preserves the source and other folders when adding and deduplicates repeated drops', () => {
    const folders = [{ id: 'one', name: '週末', games: [] }, { id: 'two', name: '朋友', games: [game] }];
    const first = addToFolder(folders, 'one', game);
    const second = addToFolder(first, 'one', { ...game, name: 'Updated' });
    expect(folders[0]!.games).toEqual([]);
    expect(second[0]!.games.map(g => g.name)).toEqual(['Updated']);
    expect(second[1]).toEqual(folders[1]);
    expect(() => addToFolder(folders, 'missing', game)).toThrow();
  });
  it('roundtrips folders and sanitizes store URLs', () => {
    const storage = new Map<string, string>();
    saveHistory({ setItem: (key, value) => { storage.set(key, value); } }, [{ id: 'one', name: '  週末  ', games: [{ ...game, url: 'javascript:alert(1)' }] }]);
    expect(parseHistory(storage.get(HISTORY_KEY)!)).toEqual([{ id: 'one', name: '週末', games: [game] }]);
  });
  it('rejects corrupt, oversized and duplicate data without writing', () => {
    let wrote = false;
    expect(() => saveHistory({ setItem: () => { wrote = true; } }, [{ id: 'one', name: ' ', games: [] }])).toThrow();
    expect(wrote).toBe(false);
    expect(() => parseHistory('{broken')).toThrow();
    expect(() => parseHistory(' '.repeat(4_000_001))).toThrow();
    expect(() => parseHistory(JSON.stringify([{ id: 'one', name: 'a', games: [] }, { id: 'one', name: 'b', games: [] }]))).toThrow();
    expect(() => parseHistory(JSON.stringify([{ id: 'one', name: 'a', games: [{ ...game, id: '../secret' }] }]))).toThrow();
  });
  it('surfaces quota failures instead of reporting a save', () => {
    expect(() => saveHistory({ setItem: () => { throw new Error('quota'); } }, [{ id: 'one', name: '週末', games: [game] }])).toThrow('quota');
    expect(parseHistory(null)).toEqual([]);
  });
});
