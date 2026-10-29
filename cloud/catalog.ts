import { SteamProvider } from '../src/provider/steam.js';
import { createSteamEventsService } from '../src/provider/events.js';
import { createEventCandidates } from '../src/provider/event-candidates.js';
import { aiDisclosureRequest, createAiDisclosureService } from '../src/provider/ai-disclosure.js';
import { discoveryRequest } from '../src/ui/discovery.js';
import { steamPresentationLanguage } from '../src/ui/language.js';
import { createQueryCache } from '../src/ui/query-cache.js';
import type { Game, ProviderQuery } from '../src/domain/types.js';
import type { UiPayload } from '../src/web/types.js';
import { HttpError } from './common.js';
import { retryAfterMilliseconds } from '../src/http/safety.js';

const locale = { country: 'TW', currency: 'TWD', language: 'tchinese' };
const query: ProviderQuery = { ...locale, tags: [], genres: [], developers: [], includeAppIds: [], maxPages: 1, limit: 50, includeMature: true };
const paths = new Set(['/api/digest', '/api/discovery', '/api/recommendations', '/api/steam-events', '/api/ai-disclosures', '/api/presentation', '/api/review-stats', '/api/reviews']);
export const isCatalogPath = (path: string) => paths.has(path);

/** One instance in the singleton DO: cache, queue and Steam budget are shared by all visitors. */
export function createCloudCatalog(fetcher: typeof fetch, spendUpstream: () => Promise<void>) {
  const cache = createQueryCache<unknown>({ concurrency: 2, waiting: 32, waitMs: 15_000, entries: 48, bytes: 16 * 1024 * 1024, ttlMs: 300_000 });
  // Aggregate loaders must have their own slots: a digest awaits three page jobs.
  const digestCache = createQueryCache<unknown>({ concurrency: 1, waiting: 8, waitMs: 15_000, entries: 1, bytes: 2 * 1024 * 1024, ttlMs: 300_000 });
  const artworkCache = createQueryCache<unknown>({ concurrency: 2, waiting: 16, waitMs: 15_000, entries: 128, bytes: 4 * 1024 * 1024, ttlMs: 300_000 });
  const reviewCache = createQueryCache<unknown>({ concurrency: 1, waiting: 16, waitMs: 15_000, entries: 64, bytes: 1024 * 1024, ttlMs: 300_000 });
  const aiCache = createQueryCache<unknown>({ concurrency: 2, waiting: 24, waitMs: 10_000, entries: 128, bytes: 128_000, ttlMs: 300_000 });
  let cooldownUntil = 0;
  const coolingDown = () => Date.now() < cooldownUntil ? new Response(null, {
    status: 429, headers: { 'Retry-After': String(Math.ceil((cooldownUntil - Date.now()) / 1000)) },
  }) : undefined;
  // Independent, bounded network lanes keep optional artwork and AI work from
  // holding a game search behind a slow upstream connection.
  const lane = (): typeof fetch => {
    let tail: Promise<unknown> = Promise.resolve(); let pending = 0; let lastStart = 0;
    return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.protocol !== 'https:' || !['store.steampowered.com', 'api.steampowered.com'].includes(url.hostname) || url.port || url.username || url.password) throw new HttpError(400, '資料來源無效');
    init?.signal?.throwIfAborted();
    const cooling = coolingDown(); if (cooling) return cooling;
    if (pending >= 32) throw new HttpError(503, '遊戲載入中，請稍後再試');
    pending++;
    const job = tail.then(async () => {
      const wait = Math.max(0, 350 - (Date.now() - lastStart));
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      init?.signal?.throwIfAborted();
      const cooling = coolingDown(); if (cooling) return cooling;
      await spendUpstream(); lastStart = Date.now();
      // No caller cookies or redirects to an arbitrary host can leave this boundary.
      const response = await fetcher(input, { ...init, redirect: 'manual' });
      if (response.status === 429) {
        const delay = retryAfterMilliseconds(response.headers.get('retry-after'));
        cooldownUntil = Math.max(cooldownUntil, Date.now() + Math.max(60_000, Number.isFinite(delay) ? delay! : 60_000));
      }
      return response;
    }).finally(() => { pending--; });
      tail = job.catch(() => {}); return job;
    };
  };
  const transport = lane(), artworkTransport = lane(), aiTransport = lane();
  const providers = new Map<string, SteamProvider>();
  const provider = (language = locale.language, metadata = false) => {
    const key = `${metadata ? 'metadata' : 'catalog'}:${language}`;
    let value = providers.get(key);
    if (!value) {
      value = new SteamProvider({ ...locale, language, maxPages: 1, requestDelayMs: 350, timeoutMs: 8000, maxRetries: 1, fetch: metadata ? artworkTransport : transport });
      providers.set(key, value);
    }
    return value;
  };
  const events = createSteamEventsService(transport);
  const members = createEventCandidates(transport);
  const ai = createAiDisclosureService(aiTransport);
  const page = (source: 'popular' | 'discover' | 'deals') => {
    const filters = { source, genre: 'all' as const, platform: 'all' as const, price: 'all' as const, players: 'all' as const, earlyAccess: 'all' as const, offset: 0 };
    // Use the same normalized key as /api/discovery, including the initial page.
    return cache.load('/api/discovery' + JSON.stringify(filters), () => provider().getDiscoveryPage(query, filters)) as Promise<{ games: Game[] }>;
  };
  return async (url: URL): Promise<unknown> => {
    if (!isCatalogPath(url.pathname)) throw new HttpError(404, '找不到這個功能');
    // Repeated and unknown query parameters are rejected before cache or upstream work.
    const allowed: Record<string, string[]> = {
      '/api/digest': [], '/api/discovery': ['source', 'genre', 'platform', 'price', 'players', 'earlyAccess', 'offset'],
      '/api/recommendations': ['offset'], '/api/steam-events': ['offset'], '/api/ai-disclosures': ['ids'],
      '/api/presentation': ['appId', 'language'], '/api/review-stats': ['appId', 'language', 'scope'], '/api/reviews': ['appId', 'language', 'scope'],
    };
    for (const key of url.searchParams.keys()) if (!allowed[url.pathname]!.includes(key) || url.searchParams.getAll(key).length !== 1) throw new HttpError(400, '查詢條件無效');
    let loader: () => Promise<unknown>;
    let key = url.pathname;
    if (url.pathname === '/api/digest') {
      loader = async () => {
        const [popular, discover, deals] = await Promise.all([page('popular'), page('discover'), page('deals')]);
        return { popular: popular.games, blockedAppIds: [], digest: { generatedAt: new Date().toISOString(), discover: discover.games, deals: deals.games, warnings: [] }, locale,
          filters: { discoverDays: 14, dealMaxPrice: null, minDiscountPercent: 0, rollMode: 'uniform', tags: [] } } satisfies UiPayload;
      };
    } else if (url.pathname === '/api/discovery') {
      const result = discoveryRequest.safeParse(Object.fromEntries(url.searchParams));
      if (!result.success) throw new HttpError(400, '篩選條件無效，請重新選擇');
      const filters = result.data;
      key += JSON.stringify(filters.source.startsWith('event:') ? { source: filters.source, offset: filters.offset } : filters);
      loader = async () => {
        if (!filters.source.startsWith('event:')) return provider().getDiscoveryPage(query, filters);
        const ids = await members(locale.country, filters.source.slice(6));
        const selected = ids.slice(filters.offset, filters.offset + 50);
        return { games: selected.length ? await provider().getEventApps(selected, query) : [], nextOffset: filters.offset + 50, hasMore: filters.offset + 50 < ids.length };
      };
    } else if (url.pathname === '/api/recommendations' || url.pathname === '/api/steam-events') {
      const event = url.pathname === '/api/steam-events';
      const raw = url.searchParams.get('offset') ?? (event ? '0' : '50');
      const offset = Number(raw);
      if (!/^\d{1,4}$/.test(raw) || !Number.isInteger(offset) || offset < (event ? 0 : 50) || offset > (event ? 96 : 5000) || offset % (event ? 6 : 50)) throw new HttpError(400, '頁數無效');
      key += offset;
      loader = event ? () => events(locale.country, offset) : async () => {
        const result = await provider().getRecommendationPage(query, offset);
        return { ...result, hasMore: result.hasMore && result.nextOffset <= 5000 };
      };
    } else if (url.pathname === '/api/ai-disclosures') {
      const result = aiDisclosureRequest.safeParse(Object.fromEntries(url.searchParams));
      if (!result.success) throw new HttpError(400, '遊戲代號無效');
      const ids = [...new Set(result.data.ids.split(','))].sort(); key += ids.join(',');
      loader = async () => ({ results: await Promise.all(ids.map(async id => ({ id, status: await ai(id, locale.country) }))) });
    } else {
      const id = url.searchParams.get('appId') ?? '';
      if (!/^\d{1,10}$/.test(id)) throw new HttpError(400, '遊戲代號無效');
      const language = steamPresentationLanguage(url.searchParams.get('language'), locale.language);
      const scope = url.searchParams.get('scope');
      if (scope !== null && !['all', 'localized'].includes(scope)) throw new HttpError(400, '評論範圍無效');
      key += JSON.stringify([id, language, scope]);
      loader = () => url.pathname === '/api/presentation' ? provider(language, true).getPresentation(id)
        : url.pathname === '/api/review-stats' ? provider(language, true).getReviewStats(id) : provider(language, true).getPlayerReviews(id, scope === 'all');
    }
    const selectedCache = url.pathname === '/api/digest' ? digestCache : url.pathname === '/api/presentation' ? artworkCache : url.pathname === '/api/reviews' || url.pathname === '/api/review-stats' ? reviewCache : url.pathname === '/api/ai-disclosures' ? aiCache : cache;
    return selectedCache.load(key, loader);
  };
}
