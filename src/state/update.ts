import type { Game, Money } from '../domain/types.js';
import type { PlaycisionState, StoredMoney } from './schema.js';

export type TimestampInput = Date | string;

export function normalizeTimestamp(value: TimestampInput, label = 'timestamp'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError(`Invalid ${label}: ${String(value)}`);
  }
  return date.toISOString();
}

function normalizeMoney(money: Money | null): StoredMoney | null {
  if (money === null) return null;
  if (!Number.isSafeInteger(money.minor) || money.minor < 0) {
    throw new RangeError(`Invalid minor-unit price: ${money.minor}`);
  }
  const currency = money.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError(`Invalid currency code: ${money.currency}`);
  }
  return { minor: money.minor, currency };
}

function normalizeDiscount(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError(`Invalid discount percentage: ${value}`);
  }
  return value;
}

function copyMoney(money: StoredMoney | null): StoredMoney | null {
  return money === null ? null : { ...money };
}

export function withLastRunAt(state: PlaycisionState, at: TimestampInput): PlaycisionState {
  return { ...state, lastRunAt: normalizeTimestamp(at, 'last run timestamp') };
}

export function recordObservedPrices(
  state: PlaycisionState,
  games: readonly Game[],
  observedAt: TimestampInput,
): PlaycisionState {
  const timestamp = normalizeTimestamp(observedAt, 'price observation timestamp');
  const prices = { ...state.prices };

  for (const game of games) {
    const current = normalizeMoney(game.price.current);
    const previous = prices[game.id];
    let lowestObserved = copyMoney(previous?.lowestObserved ?? null);

    if (current !== null) {
      if (
        lowestObserved === null ||
        lowestObserved.currency !== current.currency ||
        current.minor < lowestObserved.minor
      ) {
        lowestObserved = { ...current };
      }
    }

    prices[game.id] = {
      current,
      lowestObserved,
      discountPercent: normalizeDiscount(game.price.discountPercent),
      observedAt: timestamp,
    };
  }

  return { ...state, prices };
}

export function markNotified(
  state: PlaycisionState,
  games: readonly Game[],
  notifiedAt: TimestampInput,
): PlaycisionState {
  const timestamp = normalizeTimestamp(notifiedAt, 'notification timestamp');
  const notified = { ...state.notified };

  for (const game of games) {
    notified[game.id] = {
      at: timestamp,
      price: normalizeMoney(game.price.current),
      discountPercent: normalizeDiscount(game.price.discountPercent),
    };
  }

  return { ...state, notified };
}

export function pruneStateHistory(
  state: PlaycisionState,
  at: TimestampInput,
  retentionDays: number,
): PlaycisionState {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new RangeError('State retentionDays must be a positive integer');
  }
  const now = Date.parse(normalizeTimestamp(at));
  const cutoff = now - retentionDays * 86_400_000;
  const prices = Object.fromEntries(
    Object.entries(state.prices).filter(([, value]) => Date.parse(value.observedAt) >= cutoff),
  );
  const notified = Object.fromEntries(
    Object.entries(state.notified).filter(([, value]) => Date.parse(value.at) >= cutoff),
  );
  const skipped = Object.fromEntries(
    Object.entries(state.skipped).filter(([, value]) => Date.parse(value.until) > now),
  );
  return { ...state, prices, notified, skipped };
}
