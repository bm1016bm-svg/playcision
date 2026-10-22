import type { PlaycisionConfig } from '../config/schema.js';
import type { Game } from '../domain/types.js';
import type { PlaycisionState } from '../state/schema.js';
import { normalizeTimestamp, type TimestampInput } from '../state/update.js';
import { isGameExcluded, isGameSkipped } from './availability.js';

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function intersects(values: readonly string[], expected: ReadonlySet<string>): boolean {
  return values.some((value) => expected.has(normalizeTerm(value)));
}

export function hasConfiguredInterests(config: PlaycisionConfig): boolean {
  const interests = config.interests;
  return (
    interests.tags.length > 0 ||
    interests.genres.length > 0 ||
    interests.developers.length > 0 ||
    interests.includeAppIds.length > 0
  );
}

export function gameMatchesInterests(game: Game, config: PlaycisionConfig): boolean {
  if (!hasConfiguredInterests(config)) return true;

  const tags = new Set(config.interests.tags.map(normalizeTerm));
  const genres = new Set(config.interests.genres.map(normalizeTerm));
  const developers = new Set(config.interests.developers.map(normalizeTerm));
  return (
    config.interests.includeAppIds.includes(game.id) ||
    intersects(game.tags, tags) ||
    intersects(game.genres, tags) ||
    intersects(game.genres, genres) ||
    intersects(game.tags, genres) ||
    intersects(game.developers, developers)
  );
}

export function gameMatchesTerms(game: Game, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const expected = new Set(terms.map(normalizeTerm));
  return intersects(game.tags, expected) || intersects(game.genres, expected);
}

export function parseTimestamp(value: TimestampInput): number {
  return Date.parse(normalizeTimestamp(value));
}

export function isAvailable(
  game: Game,
  config: PlaycisionConfig,
  state: PlaycisionState | undefined,
  now: TimestampInput,
): boolean {
  return (
    !config.interests.excludeAppIds.includes(game.id) &&
    !isGameExcluded(state, game.id) &&
    !isGameSkipped(state, game.id, now)
  );
}

export function isGloballyAllowed(game: Game, config: PlaycisionConfig): boolean {
  return !config.interests.excludeAppIds.includes(game.id);
}

function gameFingerprint(game: Game): string {
  return [
    game.name,
    game.url,
    game.imageUrl ?? '',
    game.releaseDate ?? '',
    game.developers.join('\u0000'),
    game.publishers.join('\u0000'),
    game.tags.join('\u0000'),
    game.genres.join('\u0000'),
    game.platforms.join('\u0000'),
    String(game.earlyAccess),
    String(game.mature),
    game.price.current?.currency ?? '',
    String(game.price.current?.minor ?? ''),
    game.price.original?.currency ?? '',
    String(game.price.original?.minor ?? ''),
    String(game.price.discountPercent),
    String(game.price.isFree),
    game.source.provider,
  ].join('\u0001');
}

export function compareGameStable(left: Game, right: Game): number {
  return (
    compareText(left.store, right.store) ||
    compareText(left.id, right.id) ||
    // Prefer the freshest duplicate while keeping the final candidate order keyed by store and ID.
    compareText(right.source.fetchedAt, left.source.fetchedAt) ||
    compareText(gameFingerprint(left), gameFingerprint(right))
  );
}

export function stableUniqueGames(games: readonly Game[]): Game[] {
  const sorted = [...games].sort(compareGameStable);
  const seen = new Set<string>();
  return sorted.filter((game) => {
    const key = `${game.store}:${game.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function priceCapMinor(maxPrice: number | null): number | null {
  if (maxPrice === null) return null;
  return Math.round(maxPrice * 100);
}

export function sameCurrency(left: string, right: string): boolean {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}
