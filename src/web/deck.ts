import type { Game, UiPayload } from './types.js';

export function uniqueGames(games: readonly Game[]): Game[] {
  const seen = new Set<string>();
  return games.filter((game) => {
    const key = `${game.store}:${game.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildRollPool(payload: UiPayload): Game[] {
  const all = uniqueGames([...payload.digest.discover, ...payload.digest.deals]);
  const rolled = payload.digest.roll?.game;
  return rolled ? uniqueGames([rolled, ...all]) : all;
}

export function safeStoreUrl(game: Game): string {
  try {
    const url = new URL(game.url);
    if (url.protocol === 'https:' && url.hostname === 'store.steampowered.com') return url.href;
  } catch {
    // Fall through to the canonical store URL.
  }
  return `https://store.steampowered.com/app/${game.id}/`;
}

function languageTag(language: string): string {
  if (language === 'tchinese') return 'zh-TW';
  if (language === 'schinese') return 'zh-CN';
  return language.replace('_', '-');
}

export function formatGamePrice(game: Game, language: string): string {
  if (game.price.isFree) return '免費遊玩';
  const price = game.price.current;
  if (!price) return '價格未提供';
  if (price.formatted) return price.formatted;
  try {
    return new Intl.NumberFormat(languageTag(language), {
      style: 'currency',
      currency: price.currency,
      maximumFractionDigits: 0,
    }).format(price.minor / 100);
  } catch {
    return `${price.currency} ${(price.minor / 100).toFixed(0)}`;
  }
}

export function compactLabels(game: Game): string[] {
  return [...new Set([...game.tags, ...game.genres])].slice(0, 4);
}

// Provider money is normalized to hundredths, including zero-decimal currencies.
export function savedPriceSummary(games: readonly Game[]) {
  const amounts = new Map<string, number>();
  let unknown = 0;
  for (const game of uniqueGames(games)) {
    if (game.price.isFree) continue;
    const price = game.price.current;
    if (!price || !Number.isSafeInteger(price.minor) || price.minor < 0) { unknown++; continue; }
    amounts.set(price.currency, (amounts.get(price.currency) ?? 0) + price.minor);
  }
  return { totals: [...amounts].map(([currency, minor]) => ({ currency, minor })), unknown };
}

export function formatTotalPrice(minor: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(languageTag(language), { style: 'currency', currency,
      minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(minor / 100);
  } catch { return `${currency} ${(minor / 100).toFixed(2)}`; }
}
