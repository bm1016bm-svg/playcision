import { hasAdultContent } from './genre-groups.js';
import { compactLabels } from '../deck.js';
import type { Game, UiPayload } from '../types.js';
type PlatformFilter = 'all' | 'windows' | 'mac' | 'linux';
type PriceFilter = 'all' | 'under300' | 'free' | 'paid';
type PlayerFilter = 'all' | 'single' | 'multi';

export interface Filters {
  platform: PlatformFilter;
  price: PriceFilter;
  genre: string;
  players: PlayerFilter;
  adult: 'all' | 'only' | 'exclude';
  earlyAccess: 'all' | 'only' | 'exclude';
  ai: 'all' | 'exclude';
}

export const DEFAULT_FILTERS: Filters = {
  platform: 'all',
  price: 'all',
  genre: 'all',
  players: 'all',
  adult: 'all',
  earlyAccess: 'all',
  ai: 'all',
};


export function recommendationReason(game: Game, payload: UiPayload): string {
  const labels = compactLabels(game);
  const interest = labels.find((label) => payload.filters.tags.some((tag) => tag.toLocaleLowerCase() === label.toLocaleLowerCase()));
  if (interest) return `因為你關注 ${interest} 類型遊戲`;
  if (game.price.discountPercent >= payload.filters.minDiscountPercent && game.price.discountPercent > 0) return '符合你目前設定的折扣條件';
  if (payload.digest.roll?.game.id === game.id) return '由目前候選池依固定種子選出';
  if (payload.digest.deals.some((item) => item.id === game.id)) return '來自目前的折扣候選池';
  return '來自目前的新品候選池';
}

export function gameMatchesFilters(game: Game, filters: Filters): boolean {
  if (filters.earlyAccess === 'only' && !game.earlyAccess) return false;
  if (filters.earlyAccess === 'exclude' && game.earlyAccess) return false;
  if (filters.price === 'paid' && (game.price.isFree || !game.price.current || game.price.current.minor <= 0)) return false;
  if (filters.adult === 'only' && !hasAdultContent(game)) return false;
  if (filters.adult === 'exclude' && hasAdultContent(game)) return false;
  if (filters.platform !== 'all' && !game.platforms.some((platform) => platform.toLocaleLowerCase() === (filters.platform === 'mac' ? 'macos' : filters.platform))) return false;
  if (filters.price === 'free' && !game.price.isFree) return false;
  if (filters.price === 'under300') {
    const current = game.price.current;
    if (!game.price.isFree && (!current || current.currency !== 'TWD' || current.minor > 30_000)) return false;
  }
  if (filters.genre !== 'all' && ![...game.genres, ...game.tags].some((label) => label === filters.genre)) return false;
  if (filters.players !== 'all') {
    if (game.playerCategories) {
      return filters.players === 'single' ? game.playerCategories.includes(2) : game.playerCategories.some(id => [1, 9, 24, 27, 36, 37, 38, 39].includes(id));
    }
    const labels = [...game.genres, ...game.tags].join(' ').toLocaleLowerCase();
    if (filters.players === 'single' && !/(singleplayer|single-player|單人)/u.test(labels)) return false;
    if (filters.players === 'multi' && !/(multiplayer|multi-player|co-op|多人|合作)/u.test(labels)) return false;
  }
  return true;
}



/** Decide from pointer travel; vertical scrolling and short jitter never commit. */
export function swipeDecision(offset: { x: number; y: number }, velocityX: number): 'save' | 'skip' | null {
  if (Math.abs(offset.x) <= Math.abs(offset.y)) return null;
  if (Math.abs(offset.x) >= 92) return offset.x > 0 ? 'save' : 'skip';
  if (Math.abs(offset.x) >= 24 && Math.abs(velocityX) >= 680) return velocityX > 0 ? 'save' : 'skip';
  return null;
}

/** Session picker: stable for the same seed, saved IDs and reroll count. */
export function pickSavedGame(games: readonly Game[], seed: string, reroll: number): Game | undefined {
  const pool = [...new Map(games.map(game => [game.id, game])).values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (!pool.length) return undefined;
  let hash = 2166136261;
  const key = JSON.stringify([seed.normalize('NFC'), reroll, pool.map(game => game.id)]);
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15;
  return pool[(hash >>> 0) % pool.length];
}

export function toggleGenre(current: string, selected: string): string { return current === selected ? 'all' : selected; }
