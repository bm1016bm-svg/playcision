import type { PlaycisionConfig } from '../config/schema.js';
import type { Game, Recommendation } from '../domain/types.js';
import type { PlaycisionState } from '../state/schema.js';
import type { TimestampInput } from '../state/update.js';
import {
  compareText,
  gameMatchesInterests,
  gameMatchesTerms,
  hasConfiguredInterests,
  isAvailable,
  priceCapMinor,
  sameCurrency,
  stableUniqueGames,
} from './shared.js';

export interface CandidatePoolOptions {
  config: PlaycisionConfig;
  state?: PlaycisionState;
  now: TimestampInput;
}

export interface RecommendationOptions extends CandidatePoolOptions {
  seed: string;
  reroll?: number;
}

export interface RollRecommendation extends Recommendation {
  mode: 'uniform' | 'weighted';
  reroll: number;
}

function isWithinRollPrice(game: Game, config: PlaycisionConfig): boolean {
  const maximum = priceCapMinor(config.roll.maxPrice);
  if (maximum === null || game.price.isFree) return true;
  const current = game.price.current;
  return (
    current !== null &&
    sameCurrency(current.currency, config.locale.currency) &&
    current.minor <= maximum
  );
}

export function buildCandidatePool(
  games: readonly Game[],
  options: CandidatePoolOptions,
): Game[] {
  const { config, state, now } = options;
  return stableUniqueGames(games)
    .filter(
      (game) =>
        isAvailable(game, config, state, now) &&
        isWithinRollPrice(game, config) &&
        gameMatchesTerms(game, config.roll.tags) &&
        gameMatchesInterests(game, config),
    )
    .slice(0, config.roll.limit);
}

export function calculateRecommendationWeight(
  game: Game,
  config: PlaycisionConfig,
  state?: PlaycisionState,
): number {
  if (config.roll.mode === 'uniform') return 1;

  let weight = 1;
  if (game.price.discountPercent > 0) weight *= config.roll.weights.discounted;
  const preferenceMatch =
    (hasConfiguredInterests(config) && gameMatchesInterests(game, config)) ||
    (config.roll.tags.length > 0 && gameMatchesTerms(game, config.roll.tags));
  if (preferenceMatch) weight *= config.roll.weights.interestMatch;
  if (state?.notified[game.id] === undefined) weight *= config.roll.weights.neverNotified;

  if (!Number.isFinite(weight) || weight <= 0) {
    throw new RangeError(`Invalid recommendation weight for game ${game.id}`);
  }
  return weight;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function deterministicUnit(seed: string, game: Game): number {
  const value = hash32(`${seed}\u0000${game.store}:${game.id}`);
  return (value + 1) / 4_294_967_297;
}

function recommendationReason(
  game: Game,
  config: PlaycisionConfig,
  state: PlaycisionState | undefined,
): string[] {
  const reason: string[] = [];
  const matchedTerms = config.roll.tags.filter((term) =>
    gameMatchesTerms(game, [term]),
  );
  if (matchedTerms.length > 0) reason.push(`Matches roll tags: ${matchedTerms.join(', ')}`);
  if (hasConfiguredInterests(config) && gameMatchesInterests(game, config)) {
    reason.push('Matches your configured interests');
  }
  if (game.price.discountPercent > 0) {
    reason.push(`Currently ${game.price.discountPercent}% off`);
  }
  if (game.price.isFree) {
    reason.push('Free to play');
  } else if (config.roll.maxPrice !== null && game.price.current !== null) {
    reason.push(`Within your ${config.locale.currency} price cap`);
  }
  if (state?.notified[game.id] === undefined) reason.push('Not previously notified');
  if (reason.length === 0) reason.push('Matches the current roll filters');
  return reason;
}

export function buildRecommendation(
  games: readonly Game[],
  options: RecommendationOptions,
): RollRecommendation | undefined {
  const { config, state } = options;
  const seed = options.seed.normalize('NFC');
  if (seed.length === 0) throw new RangeError('Roll seed cannot be empty');
  const reroll = options.reroll ?? 0;
  if (!Number.isSafeInteger(reroll) || reroll < 0) {
    throw new RangeError(`Reroll counter must be a non-negative safe integer: ${reroll}`);
  }

  const pool = buildCandidatePool(games, options);
  if (pool.length === 0) return undefined;

  const ranked = pool
    .map((game, selectedIndex) => {
      const weight = calculateRecommendationWeight(game, config, state);
      const unit = deterministicUnit(seed, game);
      const score = config.roll.mode === 'weighted' ? -Math.log(unit) / weight : unit;
      return { game, selectedIndex, score, weight };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        compareText(`${left.game.store}:${left.game.id}`, `${right.game.store}:${right.game.id}`),
    );
  const selected = ranked[reroll % ranked.length];
  if (selected === undefined) return undefined;

  return {
    game: selected.game,
    reason: recommendationReason(selected.game, config, state),
    seed,
    candidateCount: pool.length,
    selectedIndex: selected.selectedIndex,
    weight: selected.weight,
    mode: config.roll.mode,
    reroll,
  };
}

export const rollGame = buildRecommendation;
