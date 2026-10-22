import type { PlaycisionState } from '../state/schema.js';
import { normalizeTimestamp, type TimestampInput } from '../state/update.js';

function assertGameId(gameId: string): string {
  const normalized = gameId.trim();
  if (normalized.length === 0) throw new RangeError('Game ID cannot be empty');
  return normalized;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isGameExcluded(state: PlaycisionState | undefined, gameId: string): boolean {
  return state?.excluded.includes(gameId) ?? false;
}

export function isGameSkipped(
  state: PlaycisionState | undefined,
  gameId: string,
  at: TimestampInput,
): boolean {
  const skip = state?.skipped[gameId];
  if (skip === undefined) return false;
  return Date.parse(skip.until) > Date.parse(normalizeTimestamp(at));
}

export function skipGame(
  state: PlaycisionState,
  gameId: string,
  until: TimestampInput,
): PlaycisionState {
  const id = assertGameId(gameId);
  return {
    ...state,
    skipped: {
      ...state.skipped,
      [id]: { until: normalizeTimestamp(until, 'skip expiry') },
    },
  };
}

export function unskipGame(state: PlaycisionState, gameId: string): PlaycisionState {
  const id = assertGameId(gameId);
  const { [id]: _removed, ...skipped } = state.skipped;
  return { ...state, skipped };
}

export function excludeGame(state: PlaycisionState, gameId: string): PlaycisionState {
  const id = assertGameId(gameId);
  const withoutSkip = unskipGame(state, id);
  return {
    ...withoutSkip,
    excluded: [...new Set([...withoutSkip.excluded, id])].sort(compareText),
  };
}

export function includeGame(state: PlaycisionState, gameId: string): PlaycisionState {
  const id = assertGameId(gameId);
  return { ...state, excluded: state.excluded.filter((candidate) => candidate !== id) };
}

export function pruneExpiredSkips(
  state: PlaycisionState,
  at: TimestampInput,
): PlaycisionState {
  const timestamp = Date.parse(normalizeTimestamp(at));
  const skipped = Object.fromEntries(
    Object.entries(state.skipped).filter(([, skip]) => Date.parse(skip.until) > timestamp),
  );
  return { ...state, skipped };
}
