import { z } from 'zod';
import type { Game } from '../types.js';

export const LIBRARY_KEY = 'playcision.library.v1';
export const HIDDEN_KEY = 'playcision.hidden.v1';
const money = z.object({ minor: z.number().finite(), currency: z.string().max(8), formatted: z.string().max(80).optional() });
const words = z.array(z.string().max(200)).max(100);
const game = z.object({
  id: z.string().regex(/^\d{1,10}$/), store: z.literal('steam'), name: z.string().max(500),
  url: z.string().max(1000), imageUrl: z.string().url().max(2000).optional(), releaseDate: z.string().max(100).optional(),
  developers: words, publishers: words, tags: words, genres: words, platforms: words,
  earlyAccess: z.boolean(), mature: z.boolean(),
  price: z.object({ current: money.nullable(), original: money.nullable(), discountPercent: z.number().finite(), isFree: z.boolean() }),
});
export function parseLibrary(raw: string | null): Game[] {
  if (!raw) return [];
  if (raw.length > 2_000_000) throw new Error('收藏資料過大');
  return z.array(game).max(500).parse(JSON.parse(raw)).map(g => ({ ...g, url: `https://store.steampowered.com/app/${g.id}/`, ...(g.imageUrl?.startsWith('https://') ? {} : { imageUrl: undefined }) })) as Game[];
}
export function readHidden(storage: Pick<Storage, 'getItem'>, now = Date.now()): Record<string, number | null> {
  const raw = storage.getItem(HIDDEN_KEY);
  if (!raw) return {};
  if (raw.length > 100_000) throw new Error('偏好資料過大');
  const value = z.record(z.string().regex(/^\d{1,10}$/), z.number().finite().nullable()).parse(JSON.parse(raw));
  return Object.fromEntries(Object.entries(value).filter(([, until]) => until === null || until > now));
}
export function hideGame(storage: Pick<Storage, 'getItem' | 'setItem'>, id: string, temporary: boolean, now = Date.now()): void {
  if (!/^\d{1,10}$/.test(id)) throw new Error('遊戲代號無效');
  const next = { ...readHidden(storage, now), [id]: temporary ? now + 7 * 86400_000 : null };
  if (Object.keys(next).length > 2000) throw new Error('排除清單已滿，請先恢復排除的遊戲');
  storage.setItem(HIDDEN_KEY, JSON.stringify(next));
}

/** Persist first so a failed browser write never falsely reports a restored game. */
export function restoreHiddenGames(storage: Pick<Storage, 'getItem' | 'setItem'>, ids: string[], now = Date.now()): Record<string, number | null> {
  if (ids.some(id => !/^\d{1,10}$/.test(id))) throw new Error('遊戲代號無效');
  const next = readHidden(storage, now);
  for (const id of ids) delete next[id];
  storage.setItem(HIDDEN_KEY, JSON.stringify(next));
  return next;
}
