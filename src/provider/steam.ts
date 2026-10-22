import { parseReviews, parseRecentReviews, mixReviews, type ReviewStats } from './reviews.js';
import { boundedResponseText, cancelResponse, retryAfterMilliseconds, RetryBudget, RetryDeadlineError } from '../http/safety.js';
import type { DiscoveryRequest } from '../ui/discovery.js';
import type {
  Game,
  GameProvider,
  ProviderDiagnostic,
  ProviderQuery,
  StoreId,
} from '../domain/types.js';
import { SteamProviderError, schemaDrift } from './errors.js';
import {
  normalizeTagName,
  parseAppDetails,
  parseAppPresentation,
  parsePresentationArtwork,
  parseSearchPage,
  parseStoreBrowseItems,
  parseTagCatalog,
  parseWishlistAppIds,
  type SteamTagCatalog,
} from './parsers.js';

const DEFAULT_STORE_BASE_URL = 'https://store.steampowered.com';
const DEFAULT_API_BASE_URL = 'https://api.steampowered.com';
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_TAG_SEARCHES = 20;
const DEFAULT_STORE_BROWSE_BATCH_SIZE = 50;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_TRACKED_APP_IDS = 500;
const DEFAULT_MAX_APPDETAILS_FALLBACK = 20;

export type SteamFetch = typeof globalThis.fetch;
export type SteamSleep = (milliseconds: number) => Promise<void>;

export interface SteamProviderOptions {
  country: string;
  language: string;
  currency: string;
  maxPages: number;
  requestDelayMs: number;
  timeoutMs: number;
  fetch?: SteamFetch;
  sleep?: SteamSleep;
  now?: () => Date;
  maxRetries?: number;
  maxTagSearches?: number;
  storeBrowseBatchSize?: number;
  maxResponseBytes?: number;
  maxTrackedAppIds?: number;
  maxAppDetailsFallback?: number;
  storeBaseUrl?: string;
  apiBaseUrl?: string;
}

export interface SteamProviderWarning {
  code:
    | 'EXPERIMENTAL_ENDPOINT'
    | 'UNKNOWN_TAG'
    | 'STORE_BROWSE_FALLBACK'
    | 'APP_UNAVAILABLE'
    | 'TRACKED_IDS_TRUNCATED'
    | 'MATURE_CLASSIFICATION_INCOMPLETE';
  message: string;
}

interface ResolvedOptions {
  country: string;
  language: string;
  currency: string;
  maxPages: number;
  requestDelayMs: number;
  timeoutMs: number;
  fetch: SteamFetch;
  sleep: SteamSleep;
  now: () => Date;
  maxRetries: number;
  maxTagSearches: number;
  storeBrowseBatchSize: number;
  maxResponseBytes: number;
  maxTrackedAppIds: number;
  maxAppDetailsFallback: number;
  storeBaseUrl: string;
  apiBaseUrl: string;
}

interface SearchOptions {
  onPage?: (hasMore: boolean) => void;
  discovery?: DiscoveryRequest;
  offset?: number;
  popular?: boolean;
  specials: boolean;
  tagId?: number;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '');
}

function dedupeGames(games: Game[]): Game[] {
  const seen = new Set<string>();
  return games.filter((game) => {
    if (seen.has(game.id)) return false;
    seen.add(game.id);
    return true;
  });
}

function mergeGame(original: Game, enriched: Game): Game {
  return {
    ...original,
    name: enriched.name,
    developers: enriched.developers.length > 0 ? enriched.developers : original.developers,
    publishers: enriched.publishers.length > 0 ? enriched.publishers : original.publishers,
    tags: [...new Set([...original.tags, ...enriched.tags])],
    genres: [...new Set([...original.genres, ...enriched.genres])],
    platforms: enriched.platforms.length > 0 ? enriched.platforms : original.platforms,
    earlyAccess: original.earlyAccess || enriched.earlyAccess,
    mature: original.mature || enriched.mature,
    price: enriched.price.current === null ? original.price : enriched.price,
    source: enriched.source,
    ...(enriched.imageUrl ?? original.imageUrl ? { imageUrl: enriched.imageUrl ?? original.imageUrl } : {}),
    ...(enriched.releaseDate ?? original.releaseDate ? { releaseDate: enriched.releaseDate ?? original.releaseDate } : {}),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parseRetryAfter(value: string | null, now: Date): number | undefined {
  return retryAfterMilliseconds(value, now);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function validAppIds(appIds: string[]): string[] {
  const unique = [...new Set(appIds)];
  const invalid = unique.find((appId) => !/^\d+$/u.test(appId) || appId === '0');
  if (invalid) {
    throw new SteamProviderError(
      'STEAM_INVALID_APP_ID',
      `Invalid Steam App ID: ${JSON.stringify(invalid)}. Expected a positive integer.`,
    );
  }
  return unique;
}

/**
 * Keyless, local-first Steam adapter.
 *
 * The Store search, StoreBrowse, wishlist and appdetails endpoints are first-party but do not
 * have a stable public consumer contract. Every boundary is therefore validated and failures use
 * explicit schema-drift errors instead of silently returning an empty list.
 */
export class SteamProvider implements GameProvider {
  readonly id: StoreId = 'steam';

  private readonly options: ResolvedOptions;
  private requestCount = 0;
  private tagCatalogPromise: Promise<SteamTagCatalog> | undefined;
  private warnings: SteamProviderWarning[] = [];

  constructor(options: SteamProviderOptions) {
    if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
      throw new RangeError('SteamProvider maxPages must be a positive integer.');
    }
    if (!Number.isFinite(options.requestDelayMs) || options.requestDelayMs < 0) {
      throw new RangeError('SteamProvider requestDelayMs must be zero or greater.');
    }
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new RangeError('SteamProvider timeoutMs must be greater than zero.');
    }
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const maxTagSearches = options.maxTagSearches ?? DEFAULT_MAX_TAG_SEARCHES;
    const storeBrowseBatchSize = options.storeBrowseBatchSize ?? DEFAULT_STORE_BROWSE_BATCH_SIZE;
    const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const maxTrackedAppIds = options.maxTrackedAppIds ?? DEFAULT_MAX_TRACKED_APP_IDS;
    const maxAppDetailsFallback = options.maxAppDetailsFallback ?? DEFAULT_MAX_APPDETAILS_FALLBACK;
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
      throw new RangeError('SteamProvider maxRetries must be an integer from 0 to 5.');
    }
    if (!Number.isInteger(maxTagSearches) || maxTagSearches < 0 || maxTagSearches > 100) {
      throw new RangeError('SteamProvider maxTagSearches must be an integer from 0 to 100.');
    }
    if (!Number.isInteger(storeBrowseBatchSize) || storeBrowseBatchSize < 1 || storeBrowseBatchSize > 100) {
      throw new RangeError('SteamProvider storeBrowseBatchSize must be an integer from 1 to 100.');
    }
    if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1_024 || maxResponseBytes > 20 * 1024 * 1024) {
      throw new RangeError('SteamProvider maxResponseBytes must be from 1024 to 20971520.');
    }
    if (!Number.isInteger(maxTrackedAppIds) || maxTrackedAppIds < 1 || maxTrackedAppIds > 1_000) {
      throw new RangeError('SteamProvider maxTrackedAppIds must be an integer from 1 to 1000.');
    }
    if (!Number.isInteger(maxAppDetailsFallback) || maxAppDetailsFallback < 0 || maxAppDetailsFallback > 100) {
      throw new RangeError('SteamProvider maxAppDetailsFallback must be an integer from 0 to 100.');
    }

    this.options = {
      country: options.country,
      language: options.language,
      currency: options.currency,
      maxPages: options.maxPages,
      requestDelayMs: options.requestDelayMs,
      timeoutMs: options.timeoutMs,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: options.sleep ?? defaultSleep,
      now: options.now ?? (() => new Date()),
      maxRetries,
      maxTagSearches,
      storeBrowseBatchSize,
      maxResponseBytes,
      maxTrackedAppIds,
      maxAppDetailsFallback,
      storeBaseUrl: trimTrailingSlash(options.storeBaseUrl ?? DEFAULT_STORE_BASE_URL),
      apiBaseUrl: trimTrailingSlash(options.apiBaseUrl ?? DEFAULT_API_BASE_URL),
    };
  }

  getWarnings(): SteamProviderWarning[] {
    return [...this.warnings];
  }

  async getPopular(query: ProviderQuery): Promise<Game[]> {
    this.beginOperation();
    const effective = this.effectiveQuery(query);
    const catalog = await this.getTagCatalog();
    return this.finish(await this.search(effective, catalog, { specials: false, popular: true }), effective);
  }

  async getRecommendationPage(query: ProviderQuery, offset: number) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 5000) throw new Error('Invalid recommendation offset');
    this.beginOperation();
    const effective = this.effectiveQuery({ ...query, maxPages: 1, limit: 50 });
    const catalog = await this.getTagCatalog();
    const raw = await this.search(effective, catalog, { specials: false, popular: true, offset });
    return { games: this.finish(raw, effective), hasMore: raw.length >= 50, nextOffset: offset + 50 };
  }

  async getDiscoveryPage(query: ProviderQuery, filters: DiscoveryRequest) {
    this.beginOperation();
    const effective = this.effectiveQuery({ ...query, maxPages: 1, limit: 50 });
    const catalog = await this.getTagCatalog();
    let tagId: number | undefined;
    if (filters.genre !== 'all') {
      [tagId] = await this.resolveTagIds([filters.genre], catalog);
      if (tagId === undefined) throw new Error('Steam 無法辨識這個遊戲類型，請重新選擇。');
    }
    let hasMore = false;
    const raw = await this.search(effective, catalog, { onPage: value => { hasMore = value; }, discovery: filters, offset: filters.offset, popular: filters.source === 'popular', specials: filters.source === 'deals', ...(tagId === undefined ? {} : { tagId }) });
    const games = this.finish(raw, effective).filter(game => {
      if (filters.earlyAccess === 'exclude' && game.earlyAccess) return false;
      if (filters.price === 'paid' && (game.price.isFree || !game.price.current || game.price.current.minor <= 0)) return false;
      return true;
    });
    return { games, nextOffset: filters.offset + 50, hasMore: hasMore && filters.offset < 1000 };
  }

  async getEventApps(appIds: string[], query: ProviderQuery): Promise<Game[]> {
    this.beginOperation();
    if (appIds.length > 50) throw new Error('Activity page too large');
    const effective = this.effectiveQuery(query);
    return this.fetchStoreBrowseBatch(validAppIds(appIds), effective, await this.getTagCatalog(), true);
  }

  async getNewReleases(query: ProviderQuery): Promise<Game[]> {
    this.beginOperation();
    const effectiveQuery = this.effectiveQuery(query);
    const searched = await this.searchConfigured(effectiveQuery, false);
    const explicitIds = this.boundedTrackedIds(effectiveQuery.includeAppIds);
    const explicit = await this.fetchApps(explicitIds, effectiveQuery);
    const candidates = await this.enrichForDeveloperInterests(searched, effectiveQuery);
    return this.finish([...explicit, ...candidates], effectiveQuery, explicit.length + effectiveQuery.limit);
  }

  async getDeals(query: ProviderQuery): Promise<Game[]> {
    this.beginOperation();
    const effectiveQuery = this.effectiveQuery(query);
    const specials = await this.enrichForDeveloperInterests(
      await this.searchConfigured(effectiveQuery, true),
      effectiveQuery,
    );
    const trackedIds = this.boundedTrackedIds(effectiveQuery.includeAppIds);
    const wishlistGames = await this.fetchApps(trackedIds, effectiveQuery);
    // Preserve both bounded sources so rules can filter them without one starving the other.
    return this.finish([...wishlistGames, ...specials], effectiveQuery, wishlistGames.length + effectiveQuery.limit);
  }

  async getApps(appIds: string[], query: ProviderQuery): Promise<Game[]> {
    this.beginOperation();
    const effectiveQuery = this.effectiveQuery(query);
    const ids = validAppIds(appIds);
    if (ids.length > this.options.maxTrackedAppIds) {
      throw new SteamProviderError('STEAM_QUERY_TOO_BROAD', `Requested ${ids.length} App IDs; maximum is ${this.options.maxTrackedAppIds}.`);
    }
    return this.finish(await this.fetchApps(ids, effectiveQuery), effectiveQuery, ids.length);
  }

  /** Fetches a public Steam wishlist's App IDs; privacy settings may make the list unavailable. */
  async getWishlistAppIds(steamId: string): Promise<string[]> {
    this.beginOperation();
    if (!/^\d{1,20}$/u.test(steamId) || steamId === '0') {
      throw new SteamProviderError(
        'STEAM_INVALID_STEAM_ID',
        'Invalid Steam ID. Expected a positive numeric SteamID64 value.',
      );
    }
    const url = new URL(`${this.options.apiBaseUrl}/IWishlistService/GetWishlist/v1/`);
    url.searchParams.set('input_json', JSON.stringify({ steamid: steamId }));
    const payload = await this.requestJson(url, 'wishlist');
    return parseWishlistAppIds(payload);
  }

  async diagnose(): Promise<ProviderDiagnostic> {
    this.beginOperation();
    const startedAt = this.options.now().getTime();
    try {
      const catalog = await this.getTagCatalog();
      const query = this.effectiveQuery({
        country: this.options.country,
        currency: this.options.currency,
        language: this.options.language,
        tags: [],
        genres: [],
        developers: [],
        includeAppIds: [],
        maxPages: 1,
        limit: 1,
        includeMature: true,
      });
      await this.search(query, catalog, { specials: false });
      return {
        ok: true,
        name: 'Steam Store (experimental)',
        message: `Steam's experimental keyless endpoints responded and ${catalog.byId.size} tags were parsed.`,
        latencyMs: Math.max(0, this.options.now().getTime() - startedAt),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        name: 'Steam Store (experimental)',
        message,
        latencyMs: Math.max(0, this.options.now().getTime() - startedAt),
      };
    }
  }

  private beginOperation(): void {
    this.warnings = [
      {
        code: 'EXPERIMENTAL_ENDPOINT',
        message:
          'Steam Store search, StoreBrowse, wishlist and appdetails are keyless first-party endpoints without a stable public consumer contract.',
      },
    ];
  }

  private effectiveQuery(query: ProviderQuery): ProviderQuery {
    return {
      ...query,
      country: query.country || this.options.country,
      currency: query.currency || this.options.currency,
      language: query.language || this.options.language,
      maxPages: Math.max(1, Math.min(query.maxPages, this.options.maxPages)),
    };
  }

  private finish(games: Game[], query: ProviderQuery, limit = query.limit): Game[] {
    const mismatch = games.find(
      (game) => game.price.current !== null && game.price.current.currency.toUpperCase() !== query.currency.toUpperCase(),
    );
    if (mismatch?.price.current) {
      throw new SteamProviderError(
        'STEAM_CURRENCY_MISMATCH',
        `Steam returned ${mismatch.price.current.currency} pricing for country ${query.country}, but config expects ${query.currency}. Fix locale.country/currency before price rules run.`,
      );
    }
    if (!query.includeMature) {
      this.warnings.push({
        code: 'MATURE_CLASSIFICATION_INCOMPLETE',
        message: 'Mature-content detection is limited to metadata Steam returned; regional or missing tags can make classification incomplete.',
      });
    }
    const visible = query.includeMature ? games : games.filter((game) => !game.mature);
    return dedupeGames(visible).slice(0, limit);
  }

  private boundedTrackedIds(appIds: string[]): string[] {
    const ids = validAppIds(appIds);
    if (ids.length > this.options.maxTrackedAppIds) {
      this.warnings.push({
        code: 'TRACKED_IDS_TRUNCATED',
        message: `Tracked App IDs were capped at ${this.options.maxTrackedAppIds} for this bounded run (${ids.length} requested).`,
      });
    }
    return ids.slice(0, this.options.maxTrackedAppIds);
  }

  private async enrichForDeveloperInterests(games: Game[], query: ProviderQuery): Promise<Game[]> {
    if (query.developers.length === 0 || games.length === 0) return games;
    const enrichments = await this.fetchApps(
      games.slice(0, query.limit).map((game) => game.id),
      query,
    );
    const byId = new Map(enrichments.map((game) => [game.id, game]));
    return games.map((game) => {
      const enriched = byId.get(game.id);
      return enriched ? mergeGame(game, enriched) : game;
    });
  }

  private async getTagCatalog(): Promise<SteamTagCatalog> {
    if (!this.tagCatalogPromise) {
      const url = new URL(`${this.options.storeBaseUrl}/tagdata/populartags/english`);
      this.tagCatalogPromise = this.requestJson(url, 'tag catalog').then(parseTagCatalog);
      this.tagCatalogPromise.catch(() => {
        this.tagCatalogPromise = undefined;
      });
    }
    return this.tagCatalogPromise;
  }

  private async resolveTagIds(
    names: string[],
    catalog: SteamTagCatalog,
  ): Promise<number[]> {
    const distinct = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    if (distinct.length > this.options.maxTagSearches) {
      throw new SteamProviderError(
        'STEAM_QUERY_TOO_BROAD',
        `Steam tag search requested ${distinct.length} tags; the configured safety limit is ${this.options.maxTagSearches}.`,
      );
    }
    const ids: number[] = [];
    for (const name of distinct) {
      const id = catalog.byNormalizedName.get(normalizeTagName(name));
      if (id === undefined) {
        this.warnings.push({
          code: 'UNKNOWN_TAG',
          message: `Steam's English popular-tag catalog does not contain ${JSON.stringify(name)}; its dedicated tag search was skipped.`,
        });
      } else {
        ids.push(id);
      }
    }
    return [...new Set(ids)];
  }

  private async searchConfigured(query: ProviderQuery, specials: boolean): Promise<Game[]> {
    const catalog = await this.getTagCatalog();
    const tagIds = await this.resolveTagIds([...query.tags, ...query.genres], catalog);
    const resultGroups: Game[][] = [];
    resultGroups.push(await this.search(query, catalog, { specials }));
    for (const tagId of tagIds) {
      resultGroups.push(await this.search(query, catalog, { specials, tagId }));
    }
    return dedupeGames(resultGroups.flat());
  }

  private async search(
    query: ProviderQuery,
    catalog: SteamTagCatalog,
    options: SearchOptions,
  ): Promise<Game[]> {
    const games: Game[] = [];
    const count = Math.max(1, Math.min(50, query.limit));
    for (let page = 0; page < query.maxPages; page += 1) {
      const start = (options.offset ?? 0) + page * count;
      const url = new URL(`${this.options.storeBaseUrl}/search/results/`);
      url.searchParams.set('query', '');
      url.searchParams.set('start', String(start));
      url.searchParams.set('count', String(count));
      url.searchParams.set('dynamic_data', '');
      if (options.popular) url.searchParams.set('filter', 'topsellers');
      else url.searchParams.set('sort_by', 'Released_DESC');
      url.searchParams.set('infinite', '1');
      url.searchParams.set('force_infinite', '1');
      url.searchParams.set('ignore_preferences', '1');
      url.searchParams.set('category1', '998');
      url.searchParams.set('cc', query.country.toUpperCase());
      url.searchParams.set('l', query.language);
      if (options.specials) url.searchParams.set('specials', '1');
      if (options.tagId !== undefined) url.searchParams.set('tags', String(options.tagId));
      if (options.discovery) {
        const filters = options.discovery;
        if (filters.platform !== 'all') url.searchParams.set('os', filters.platform);
        if (filters.price === 'free') url.searchParams.set('maxprice', 'free');
        if (filters.price === 'under300' && query.currency === 'TWD') url.searchParams.set('maxprice', '300');
        if (filters.players !== 'all') url.searchParams.set('category3', filters.players === 'single' ? '2' : '1');
        if (filters.earlyAccess === 'only') url.searchParams.set('genre', '70');
      }

      const payload = await this.requestJson(url, 'search');
      const parsed = parseSearchPage(payload, query, catalog, this.options.now().toISOString());
      options.onPage?.(parsed.totalCount === undefined ? parsed.games.length >= count : start + count < parsed.totalCount);
      games.push(...parsed.games);
      if (
        parsed.games.length === 0 ||
        parsed.games.length < count ||
        (parsed.totalCount !== undefined && start + count >= parsed.totalCount)
      ) {
        break;
      }
    }
    return games;
  }

  private async fetchApps(appIds: string[], query: ProviderQuery): Promise<Game[]> {
    const ids = validAppIds(appIds);
    if (ids.length === 0) return [];
    const catalog = await this.getTagCatalog();
    const found = new Map<string, Game>();
    const fallbackIds: string[] = [];

    for (const batch of chunk(ids, this.options.storeBrowseBatchSize)) {
      try {
        const items = await this.fetchStoreBrowseBatch(batch, query, catalog);
        for (const game of items) found.set(game.id, game);
        fallbackIds.push(...batch.filter((appId) => !found.has(appId)));
      } catch (error) {
        if (error instanceof SteamProviderError && error.status === 429) throw error;
        this.warnings.push({
          code: 'STORE_BROWSE_FALLBACK',
          message: `Steam StoreBrowse enrichment failed; falling back to appdetails for ${batch.length} App ID(s): ${error instanceof Error ? error.message : String(error)}`,
        });
        fallbackIds.push(...batch);
      }
    }

    const distinctFallbackIds = [...new Set(fallbackIds)];
    if (distinctFallbackIds.length > this.options.maxAppDetailsFallback) {
      throw new SteamProviderError(
        'STEAM_QUERY_TOO_BROAD',
        `StoreBrowse fallback would require ${distinctFallbackIds.length} appdetails requests; safety maximum is ${this.options.maxAppDetailsFallback}.`,
      );
    }
    for (const appId of distinctFallbackIds) {
      const game = await this.fetchAppDetails(appId, query);
      if (game) {
        found.set(appId, game);
      } else {
        this.warnings.push({
          code: 'APP_UNAVAILABLE',
          message: `Steam did not return public store details for App ${appId}.`,
        });
      }
    }
    return ids.map((appId) => found.get(appId)).filter((game): game is Game => game !== undefined);
  }

  private async fetchStoreBrowseBatch(
    appIds: string[],
    query: ProviderQuery,
    catalog: SteamTagCatalog,
    eventOnly = false,
  ): Promise<Game[]> {
    const url = new URL(`${this.options.apiBaseUrl}/IStoreBrowseService/GetItems/v1/`);
    url.searchParams.set(
      'input_json',
      JSON.stringify({
        ids: appIds.map((appid) => ({ appid: Number(appid) })),
        context: {
          language: query.language,
          country_code: query.country.toUpperCase(),
          steam_realm: 1,
        },
        data_request: {
          include_assets: true,
          include_release: true,
          include_platforms: true,
          include_all_purchase_options: true,
          include_tag_count: eventOnly ? 100 : 20,
          include_basic_info: true,
        },
      }),
    );
    const payload = await this.requestJson(url, 'StoreBrowse');
    const parsed = parseStoreBrowseItems(payload, query, catalog, this.options.now().toISOString());
    if (!eventOnly) return parsed;
    const rows = (payload as { response: { store_items: { id: number; appid?: number; type: number; item_type?: number; categories?: { supported_player_categoryids?: number[] } }[] } }).response.store_items;
    const games: Game[] = [];
    for (const game of parsed) {
      const item = rows.find(item => String(item.appid ?? item.id) === game.id);
      if (!item || (item.item_type !== undefined && item.item_type !== 0)) continue;
      if (item.type === 6) {
        const url = new URL('/api/appdetails', this.options.storeBaseUrl);
        url.search = new URLSearchParams({ appids: game.id, cc: query.country, l: query.language }).toString();
        const detail = await this.requestJson(url, 'appdetails') as Record<string, { data?: { type?: string } }>;
        if (!['game', 'demo'].includes(detail[game.id]?.data?.type ?? '')) continue;
      } else if (item.type !== 0 && item.type !== 1) continue;
      games.push({ ...game, playerCategories: item.categories?.supported_player_categoryids ?? [] });
    }
    return games;
  }

  private reviewUrl(appId: string, language: string, type = 'all', size = 1) {
    if (!/^\d{1,10}$/.test(appId)) throw new Error('Invalid Steam App ID');
    const url = new URL(`${this.options.storeBaseUrl}/appreviews/${appId}`);
    url.search = new URLSearchParams({ json: '1', filter: size > 1 ? 'all' : 'recent', day_range: '365', language, review_type: type, purchase_type: 'all', num_per_page: String(size), cursor: '*', filter_offtopic_activity: '1' }).toString();
    return url;
  }

  async getReviewStats(appId: string): Promise<ReviewStats> {
    const url = this.reviewUrl(appId, this.options.language);
    let localized = null, recent = null, from = null, to = null;
    try { localized = parseReviews(await this.requestJson(url, 'reviews')).summary; } catch { /* Partial results remain usable. */ }
    try {
      const histogram = new URL(`${this.options.storeBaseUrl}/appreviewhistogram/${appId}`);
      histogram.searchParams.set('l', this.options.language);
      const data = parseRecentReviews(await this.requestJson(histogram, 'review histogram'));
      recent = data.summary; from = data.from; to = data.to;
    } catch { /* Never substitute all-time totals for recent statistics. */ }
    if (!recent && !localized) throw new Error('Steam review statistics unavailable');
    return { recent, localized, language: this.options.language, from, to };
  }

  async getPlayerReviews(appId: string, allLanguages = false) {
    const language = allLanguages ? 'all' : this.options.language;
    const positive = parseReviews(await this.requestJson(this.reviewUrl(appId, language, 'positive', 6), 'positive reviews')).reviews;
    const negative = parseReviews(await this.requestJson(this.reviewUrl(appId, language, 'negative', 6), 'negative reviews')).reviews;
    return { language, reviews: mixReviews(positive, negative) };
  }

  async getPresentation(appId: string) {
    if (!/^\d{1,10}$/.test(appId)) throw new Error('Invalid Steam App ID');
    const url = new URL(`${this.options.storeBaseUrl}/api/appdetails`);
    url.searchParams.set('appids', appId);
    url.searchParams.set('cc', this.options.country.toUpperCase());
    url.searchParams.set('l', this.options.language);
    const presentation = parseAppPresentation(await this.requestJson(url, 'appdetails'), appId);
    const artworkUrl = new URL(`${this.options.apiBaseUrl}/IStoreBrowseService/GetItems/v1/`);
    artworkUrl.searchParams.set('input_json', JSON.stringify({
      ids: [{ appid: Number(appId) }],
      context: { language: this.options.language, country_code: this.options.country.toUpperCase(), steam_realm: 1 },
      data_request: { include_assets: true },
    }));
    try {
      const images = parsePresentationArtwork(await this.requestJson(artworkUrl, 'StoreBrowse'), appId);
      return { ...presentation, images: [...new Set([...images, ...presentation.images])] };
    } catch {
      // Optional artwork enrichment must not discard the successfully fetched synopsis.
      return presentation;
    }
  }

  private async fetchAppDetails(appId: string, query: ProviderQuery): Promise<Game | undefined> {
    const url = new URL(`${this.options.storeBaseUrl}/api/appdetails`);
    url.searchParams.set('appids', appId);
    url.searchParams.set('cc', query.country.toUpperCase());
    url.searchParams.set('l', query.language);
    const payload = await this.requestJson(url, 'appdetails');
    return parseAppDetails(payload, appId, query, this.options.now().toISOString());
  }

  private async paceRequest(budget: RetryBudget): Promise<void> {
    if (this.requestCount > 0 && this.options.requestDelayMs > 0) {
      await budget.wait(this.options.requestDelayMs, this.options.sleep, this.options.requestDelayMs);
    }
    this.requestCount += 1;
  }

  private async requestJson(url: URL, endpoint: string): Promise<unknown> {
    let lastError: unknown;
    const budget = new RetryBudget(this.options.timeoutMs, this.options.maxRetries);
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      try { await this.paceRequest(budget); }
      catch (error) {
        if (error instanceof RetryDeadlineError) throw new SteamProviderError('STEAM_TIMEOUT', error.message, { endpoint });
        throw error;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(this.options.timeoutMs, budget.remaining()));
      try {
        const response = await this.options.fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            accept: 'application/json, text/plain, */*',
            'user-agent': 'Playcision/0.1',
            'x-requested-with': 'XMLHttpRequest',
          },
        });
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), this.options.now());
        if (!response.ok) {
          cancelResponse(response);
          const error = new SteamProviderError(
            'STEAM_HTTP_ERROR',
            `Steam ${endpoint} returned HTTP ${response.status}${retryAfterMs === undefined ? '' : `; Retry-After ${retryAfterMs}ms`}.`,
            retryAfterMs === undefined
              ? { status: response.status, endpoint }
              : { status: response.status, endpoint, retryAfterMs },
          );
          if (isRetryableStatus(response.status) && attempt < this.options.maxRetries) {
            await budget.wait(retryAfterMs ?? 250 * 2 ** attempt, this.options.sleep);
            lastError = error;
            continue;
          }
          throw error;
        }

        const text = await boundedResponseText(response, this.options.maxResponseBytes, () => {
          controller.abort();
          return schemaDrift(endpoint, `response exceeds ${this.options.maxResponseBytes} bytes`);
        });
        try {
          return JSON.parse(text) as unknown;
        } catch (error) {
          throw schemaDrift(endpoint, 'response was not valid JSON', error);
        }
      } catch (error) {
        if (error instanceof RetryDeadlineError) throw new SteamProviderError('STEAM_TIMEOUT', error.message, { endpoint });
        if (error instanceof SteamProviderError) throw error;
        const timedOut = controller.signal.aborted;
        const wrapped = new SteamProviderError(
          timedOut ? 'STEAM_TIMEOUT' : 'STEAM_NETWORK_ERROR',
          timedOut
            ? `Steam ${endpoint} timed out after ${this.options.timeoutMs}ms.`
            : `Steam ${endpoint} request failed: ${error instanceof Error ? error.message : String(error)}`,
          { endpoint, cause: error },
        );
        if (attempt < this.options.maxRetries) {
          lastError = wrapped;
          await budget.wait(250 * 2 ** attempt, this.options.sleep);
          continue;
        }
        throw wrapped;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`Steam ${endpoint} request failed.`);
  }
}

export function createSteamProvider(options: SteamProviderOptions): SteamProvider {
  return new SteamProvider(options);
}
