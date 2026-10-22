import { randomBytes } from 'node:crypto';
import { getProjectPaths, loadConfig } from '../config/load.js';
import type { PlaycisionConfig } from '../config/schema.js';
import { buildRecommendation, filterDeals, filterDiscover, type RollRecommendation } from '../core/index.js';
import type { Digest, Game, GameProvider, ProviderQuery } from '../domain/types.js';
import { deliverDigestOutputs, type DeliverDigestOptions, type DeliveryResult } from './output.js';
import { scanInstalledSteamGames } from '../platform/steam-local.js';
import { SteamProvider } from '../provider/steam.js';
import { SLACK_MAX_GAMES_PER_SECTION } from '../render/slack.js';
import {
  createInitialState,
  loadState,
  markNotified,
  pruneStateHistory,
  recordObservedPrices,
  saveState,
  withStateLock,
  withLastRunAt,
  type PlaycisionState,
} from '../state/index.js';

export const STEAM_EXPERIMENTAL_WARNING =
  'Steam Store discovery uses first-party but undocumented public endpoints; coverage and response shape are not guaranteed.';
export const OBSERVED_LOW_WARNING =
  'Local observed low means the lowest price seen by this state file, not Steam-wide historical pricing.';

export interface ServiceDependencies {
  provider?: GameProvider;
  now?: Date;
  fetch?: typeof globalThis.fetch;
}

function uniqueGames(games: readonly Game[]): Game[] {
  return [...new Map(games.map((game) => [`${game.store}:${game.id}`, game])).values()];
}

function providerWarnings(provider: GameProvider): string[] {
  return provider.getWarnings?.().map(({ message }) => message) ?? [];
}

export function createSteamProvider(config: PlaycisionConfig, fetcher?: typeof globalThis.fetch): GameProvider {
  const steam = config.providers.steam;
  if (!steam.enabled) throw new Error('No game provider is enabled. Set providers.steam.enabled: true.');
  return new SteamProvider({
    country: config.locale.country,
    language: config.locale.language,
    currency: config.locale.currency,
    maxPages: steam.maxPages,
    requestDelayMs: steam.requestDelayMs,
    timeoutMs: steam.timeoutMs,
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}

function makeQuery(config: PlaycisionConfig, limit: number, includeAppIds: string[] = []): ProviderQuery {
  return {
    country: config.locale.country,
    currency: config.locale.currency,
    language: config.locale.language,
    tags: config.interests.tags,
    genres: config.interests.genres,
    developers: config.interests.developers,
    includeAppIds: [...new Set([...config.interests.includeAppIds, ...includeAppIds])],
    maxPages: config.providers.steam.maxPages,
    limit,
    includeMature: config.discover.includeMature,
  };
}

async function configuredState(cwd: string, config: PlaycisionConfig): Promise<PlaycisionState> {
  if (!config.state.enabled) return createInitialState();
  return loadState(getProjectPaths(cwd).state);
}

async function withRunStateLock<T>(
  cwd: string,
  config: PlaycisionConfig,
  operation: () => Promise<T>,
): Promise<T> {
  return config.state.enabled
    ? withStateLock(getProjectPaths(cwd).state, operation)
    : operation();
}

async function persistRun(
  cwd: string,
  config: PlaycisionConfig,
  state: PlaycisionState,
  games: Game[],
  now: Date,
): Promise<PlaycisionState> {
  const updated = pruneStateHistory(
    withLastRunAt(recordObservedPrices(state, games, now), now),
    now,
    config.state.retentionDays,
  );
  if (config.state.enabled) await saveState(getProjectPaths(cwd).state, updated);
  return updated;
}

function stateWithoutNotifications(state: PlaycisionState): PlaycisionState {
  return { ...state, notified: {} };
}

export async function discoverGames(cwd: string, dependencies: ServiceDependencies = {}): Promise<Game[]> {
  const now = dependencies.now ?? new Date();
  const config = await loadConfig(cwd);
  return withRunStateLock(cwd, config, async () => {
    const state = await configuredState(cwd, config);
    const provider = dependencies.provider ?? createSteamProvider(config, dependencies.fetch);
    const raw = await provider.getNewReleases(makeQuery(config, config.discover.limit * 3));
    const games = filterDiscover(raw, { config, state, now });
    await persistRun(cwd, config, state, raw, now);
    return games;
  });
}

async function resolveWishlistAppIds(provider: GameProvider, config: PlaycisionConfig): Promise<string[]> {
  const configured = config.deals.wishlistAppIds;
  const steamId = config.deals.wishlistSteamId;
  if (!steamId) return configured;
  if (!provider.getWishlistAppIds) {
    throw new Error('The enabled provider cannot synchronize a Steam wishlist; use deals.wishlistAppIds instead.');
  }
  return [...new Set([...configured, ...(await provider.getWishlistAppIds(steamId))])];
}

function configWithWishlist(config: PlaycisionConfig, wishlistAppIds: string[]): PlaycisionConfig {
  return { ...config, deals: { ...config.deals, wishlistAppIds } };
}

async function fetchDealCandidates(
  provider: GameProvider,
  config: PlaycisionConfig,
): Promise<{ games: Game[]; config: PlaycisionConfig }> {
  const wishlist = await resolveWishlistAppIds(provider, config);
  const query = makeQuery(config, config.deals.limit * 3, wishlist);
  return {
    games: uniqueGames(await provider.getDeals(query)),
    config: configWithWishlist(config, wishlist),
  };
}

export async function dealGames(cwd: string, dependencies: ServiceDependencies = {}): Promise<Game[]> {
  const now = dependencies.now ?? new Date();
  const config = await loadConfig(cwd);
  return withRunStateLock(cwd, config, async () => {
    const state = await configuredState(cwd, config);
    const provider = dependencies.provider ?? createSteamProvider(config, dependencies.fetch);
    const result = await fetchDealCandidates(provider, config);
    const games = filterDeals(result.games, { config: result.config, state: stateWithoutNotifications(state), now });
    await persistRun(cwd, config, state, result.games, now);
    return games;
  });
}

export interface RollOptions extends ServiceDependencies {
  seed?: string;
  reroll?: number;
  installed?: boolean;
}

export async function rollGame(cwd: string, options: RollOptions = {}): Promise<RollRecommendation | undefined> {
  const now = options.now ?? new Date();
  const config = await loadConfig(cwd);
  return withRunStateLock(cwd, config, async () => {
    const state = await configuredState(cwd, config);
    const provider = options.provider ?? createSteamProvider(config, options.fetch);
    const wishlist = await resolveWishlistAppIds(provider, config);
    const query = makeQuery(config, config.roll.limit, wishlist);
    const installedIds = options.installed
      ? (await scanInstalledSteamGames()).slice(0, config.roll.limit).map((game) => game.appId)
      : [];
    const explicitIds = [...new Set([...query.includeAppIds, ...wishlist, ...installedIds])];
    const rollQuery = { ...query, includeAppIds: explicitIds };
    const releases = await provider.getNewReleases(query);
    const deals = await provider.getDeals(rollQuery);
    const raw = uniqueGames([...releases, ...deals]);
    const recommendation = buildRecommendation(raw, {
      config,
      state,
      now,
      seed: options.seed ?? randomBytes(12).toString('base64url'),
      reroll: options.reroll ?? 0,
    });
    await persistRun(cwd, config, state, raw, now);
    return recommendation;
  });
}

export interface DigestOptions extends ServiceDependencies, DeliverDigestOptions {
  includeRoll?: boolean;
}

export interface DigestRun {
  digest: Digest;
  delivery: DeliveryResult;
}

export async function buildAndDeliverDigest(cwd: string, options: DigestOptions = {}): Promise<DigestRun> {
  const now = options.now ?? new Date();
  const config = await loadConfig(cwd);
  return withRunStateLock(cwd, config, async () => {
  const state = await configuredState(cwd, config);
  const provider = options.provider ?? createSteamProvider(config, options.fetch);
  const discoverRaw = await provider.getNewReleases(makeQuery(config, config.discover.limit * 3));
  const liveWarnings = providerWarnings(provider);
  const dealResult = await fetchDealCandidates(provider, config);
  liveWarnings.push(...providerWarnings(provider));
  const dealRaw = dealResult.games;
  const all = uniqueGames([...discoverRaw, ...dealRaw]);
  const discover = filterDiscover(discoverRaw, { config, state, now });
  const deals = filterDeals(dealRaw, { config: dealResult.config, state, now });
  const recommendation = options.includeRoll === false
    ? undefined
    : buildRecommendation(all, {
        config,
        state,
        now,
        seed: now.toISOString().slice(0, 10),
        reroll: 0,
      });
  const digest: Digest = {
    generatedAt: now.toISOString(),
    discover,
    deals,
    ...(recommendation ? { roll: recommendation } : {}),
    warnings: [
      STEAM_EXPERIMENTAL_WARNING,
      ...new Set(liveWarnings),
      ...(config.deals.localObservedLowOnly ? [OBSERVED_LOW_WARNING] : []),
    ],
  };
  let delivery: DeliveryResult;
  try {
    delivery = await deliverDigestOutputs(cwd, config, digest, {
      ...(options.notify === undefined ? {} : { notify: options.notify }),
      ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  } catch (error) {
    if (!options.dryRun && config.state.enabled) {
      await saveState(
        getProjectPaths(cwd).state,
        pruneStateHistory(
          withLastRunAt(recordObservedPrices(state, all, now), now),
          now,
          config.state.retentionDays,
        ),
      );
    }
    throw error;
  }

  if (!options.dryRun) {
    let updated = pruneStateHistory(
      withLastRunAt(recordObservedPrices(state, all, now), now),
      now,
      config.state.retentionDays,
    );
    if (delivery.slack === 'sent') {
      updated = markNotified(updated, deals.slice(0, SLACK_MAX_GAMES_PER_SECTION), now);
    }
    if (config.state.enabled) await saveState(getProjectPaths(cwd).state, updated);
  }
  return { digest, delivery };
  });
}
