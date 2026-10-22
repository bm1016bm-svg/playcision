import type { PlaycisionConfig } from '../config/schema.js';
import type { Game } from '../domain/types.js';
import type { PlaycisionState } from '../state/schema.js';
import type { TimestampInput } from '../state/update.js';
import {
  compareText,
  gameMatchesInterests,
  isGloballyAllowed,
  parseTimestamp,
  priceCapMinor,
  sameCurrency,
  stableUniqueGames,
} from './shared.js';

export interface FilterOptions {
  config: PlaycisionConfig;
  state?: PlaycisionState;
  now: TimestampInput;
}

const DAY_MS = 86_400_000;

function releaseTimestamp(game: Game): number | null {
  if (game.releaseDate === undefined) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(game.releaseDate)
    ? `${game.releaseDate}T00:00:00.000Z`
    : game.releaseDate;
  const timestamp = Date.parse(dateOnly);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function filterDiscover(games: readonly Game[], options: FilterOptions): Game[] {
  const { config, now } = options;
  const nowTimestamp = parseTimestamp(now);
  const earliest = nowTimestamp - config.discover.days * DAY_MS;

  return stableUniqueGames(games)
    .filter((game) => {
      const releasedAt = releaseTimestamp(game);
      return (
        releasedAt !== null &&
        releasedAt <= nowTimestamp &&
        releasedAt >= earliest &&
        isGloballyAllowed(game, config) &&
        (config.discover.includeEarlyAccess || !game.earlyAccess) &&
        (config.discover.includeMature || !game.mature) &&
        gameMatchesInterests(game, config)
      );
    })
    .sort((left, right) => {
      const byRelease = (releaseTimestamp(right) ?? 0) - (releaseTimestamp(left) ?? 0);
      return byRelease || compareText(left.name, right.name) || compareText(left.id, right.id);
    })
    .slice(0, config.discover.limit);
}

function isAtLocalObservedLow(game: Game, state: PlaycisionState | undefined): boolean {
  const current = game.price.current;
  const lowest = state?.prices[game.id]?.lowestObserved;
  return (
    current !== null &&
    lowest !== undefined &&
    lowest !== null &&
    sameCurrency(current.currency, lowest.currency) &&
    current.minor <= lowest.minor
  );
}

function isNewNotification(
  game: Game,
  config: PlaycisionConfig,
  state: PlaycisionState | undefined,
): boolean {
  const previous = state?.notified[game.id];
  if (previous === undefined) return true;
  if (!config.deals.notifyPriceChanges) return false;

  const current = game.price.current;
  if (current === null || previous.price === null) {
    return current !== null || previous.price !== null || game.price.discountPercent !== previous.discountPercent;
  }
  return (
    current.minor !== previous.price.minor ||
    !sameCurrency(current.currency, previous.price.currency) ||
    game.price.discountPercent !== previous.discountPercent
  );
}

export function filterDeals(games: readonly Game[], options: FilterOptions): Game[] {
  const { config, state, now } = options;
  const maximum = priceCapMinor(config.deals.maxPrice);
  const wishlist = new Set(config.deals.wishlistAppIds);

  return stableUniqueGames(games)
    .filter((game) => {
      const current = game.price.current;
      if (current === null) return false;
      if (!sameCurrency(current.currency, config.locale.currency)) return false;
      if (!isGloballyAllowed(game, config)) return false;
      if (!gameMatchesInterests(game, config) && !wishlist.has(game.id)) return false;
      const priceRuleEnabled = maximum !== null;
      const discountRuleEnabled = config.deals.minDiscountPercent > 0;
      const matchesPrice = priceRuleEnabled && current.minor <= maximum;
      const matchesDiscount =
        discountRuleEnabled && game.price.discountPercent >= config.deals.minDiscountPercent;
      if ((priceRuleEnabled || discountRuleEnabled) && !matchesPrice && !matchesDiscount) return false;
      if (config.deals.localObservedLowOnly && !isAtLocalObservedLow(game, state)) return false;
      return isNewNotification(game, config, state);
    })
    .sort((left, right) => {
      const byDiscount = right.price.discountPercent - left.price.discountPercent;
      const byPrice = (left.price.current?.minor ?? Number.MAX_SAFE_INTEGER) -
        (right.price.current?.minor ?? Number.MAX_SAFE_INTEGER);
      return byDiscount || byPrice || compareText(left.name, right.name) || compareText(left.id, right.id);
    })
    .slice(0, config.deals.limit);
}
