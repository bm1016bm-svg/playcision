import { createEventCandidates } from '../provider/event-candidates.js';
import { pageCachePolicy } from './page-policy.js';
import { createSteamEventsService } from '../provider/events.js';
import { aiDisclosureRequest, createAiDisclosureService } from '../provider/ai-disclosure.js';
import { createQueryCache, QueryBusyError } from './query-cache.js';
import { attachRoomSockets } from './room-socket.js';
import { handleRooms } from './rooms.js';
import { betaGate, sameOrigin } from './beta.js';
import { authorizeRequestHost } from './request-host.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { isAvailable } from '../core/shared.js';
import type { Game } from '../domain/types.js';
import { steamPresentationLanguage } from './language.js';
import { SteamProvider } from '../provider/steam.js';
import type { SteamPresentation } from '../provider/parsers.js';
import { buildAndDeliverDigest } from '../application/service.js';
import { updateRollState, type RollStateAction } from '../application/preferences.js';
import { getProjectPaths, loadConfig } from '../config/load.js';
import { loadState } from '../state/index.js';
import { blockedUiAppIds } from './preferences.js';
import { discoveryRequest } from './discovery.js';

export interface UiServerOptions {
  cwd: string;
  host: string;
  port: number;
  dev?: boolean;
  open?: boolean;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const webRoot = path.join(projectRoot, 'dist', 'web');
const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function setSecurityHeaders(response: ServerResponse, dev: boolean): void {
  const connect = dev ? "'self' ws: http:" : "'self'";
  const scripts = dev ? "'self' 'unsafe-inline'" : "'self'";
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; base-uri 'none'; connect-src ${connect}; frame-ancestors 'none'; img-src 'self' https: data:; object-src 'none'; script-src ${scripts}; style-src 'self' 'unsafe-inline'; font-src 'self'`,
  );
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function json(response: ServerResponse, status: number, value: unknown, cacheControl = 'no-store'): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', cacheControl);
  response.end(JSON.stringify(value));
}

function safeMessage(error: unknown): string {
  if (process.env.PLAYCISION_BETA === '1') return '服務暫時無法完成操作，原有資料仍保留，請稍後重試。';
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/giu, '[redacted-url]');
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 8_192) throw new Error('Request body exceeds 8 KB.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function assertSameOrigin(request: IncomingMessage): void {
  if (!sameOrigin(request)) throw new Error('Cross-origin UI mutations are not allowed.');
}

function isPreferenceBody(value: unknown): value is { action: RollStateAction; appId: string; days?: number } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    ['skip', 'unskip', 'exclude', 'include'].includes(String(record.action)) &&
    typeof record.appId === 'string' &&
    /^\d+$/.test(record.appId) &&
    (record.days === undefined || (typeof record.days === 'number' && Number.isInteger(record.days)))
  );
}

// Session-only, bounded presentation cache; never part of local game state or rolls.
let presentationProvider: { key: string; provider: SteamProvider } | undefined;
const presentationQueues: Promise<unknown>[] = [Promise.resolve(), Promise.resolve()];
let presentationLane = 0;
let reviewsQueue: Promise<unknown> = Promise.resolve();
let reviewsProvider: { key: string; provider: SteamProvider } | undefined;
const reviewsCache = new Map<string, { expires: number; value: Promise<unknown> }>();
const presentations = new Map<string, { expires: number; value: Promise<SteamPresentation> }>();
const recommendationPages = createQueryCache<{ games: Game[]; nextOffset: number; hasMore: boolean }>({
  concurrency: 2, waiting: 32, waitMs: 15_000, entries: 48, bytes: 16 * 1024 * 1024, ttlMs: 300_000,
});
let presentationPending = 0;
let reviewsPending = 0;
let digestCache: { expires: number; value: Promise<unknown> } | undefined;
const aiDisclosure = createAiDisclosureService();
const steamEvents = createSteamEventsService();
const eventCandidates = createEventCandidates();

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  cwd: string,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://playcision.local');
  if (!url.pathname.startsWith('/api/')) return false;
  if (await handleRooms(request, response, process.env.PLAYCISION_BETA === '1' ? cwd : undefined)) return true;

  try {
    if (request.method === 'GET' && url.pathname === '/api/steam-events') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if ([...url.searchParams.keys()].some(key => key !== 'offset') || !Number.isInteger(offset) || offset < 0 || offset > 96 || offset % 6) { json(response, 400, { error: 'Invalid event page' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      json(response, 200, await steamEvents(config.locale.country, offset)); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/ai-disclosures') {
      const parsed = aiDisclosureRequest.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) { json(response, 400, { error: 'Invalid Steam App IDs' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      const ids = [...new Set(parsed.data.ids.split(','))];
      const results = await Promise.all(ids.map(async id => ({ id, status: await aiDisclosure(id, config.locale.country) })));
      json(response, 200, { results }); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/discovery') {
      const parsed = discoveryRequest.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) { json(response, 400, { error: '篩選條件無效，請重新選擇。' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      const key = JSON.stringify([cwd, config.locale, config.discover.includeMature, parsed.data.source.startsWith('event:') ? { source: parsed.data.source, offset: parsed.data.offset } : parsed.data]);
      const result = await recommendationPages.load(key, async () => {
        const provider = new SteamProvider({ ...config.locale, ...config.providers.steam });
        if (parsed.data.source.startsWith('event:')) {
          const ids = await eventCandidates(config.locale.country, parsed.data.source.slice(6));
          const offset = parsed.data.offset;
          const page = ids.slice(offset, offset + 50);
          const games = page.length ? await provider.getEventApps(page, { ...config.locale, tags: [], genres: [], developers: [], includeAppIds: [], maxPages: 1, limit: 50, includeMature: true }) : [];
          return { games, nextOffset: offset + 50, hasMore: offset + 50 < ids.length };
        }
        return provider.getDiscoveryPage({ ...config.locale, tags: [], genres: [], developers: [], includeAppIds: [], maxPages: 1, limit: 50, includeMature: config.discover.includeMature }, parsed.data);
      });
      const state = config.state.enabled ? await loadState(getProjectPaths(cwd).state) : undefined;
      json(response, 200, { ...result, games: result.games.filter(game => isAvailable(game, config, state, new Date())) }, pageCachePolicy(process.env.PLAYCISION_BETA === '1', config.state.enabled)); return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/recommendations') {
      const offset = Number(url.searchParams.get('offset') ?? 50);
      if (!Number.isInteger(offset) || offset < 50 || offset > 5000 || offset % 50 !== 0) { json(response, 400, { error: 'Invalid offset' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      const key = JSON.stringify([cwd, config.locale, config.discover.includeMature, 'recommendations', offset]);
      const result = await recommendationPages.load(key, async () => {
        const provider = new SteamProvider({ ...config.locale, ...config.providers.steam });
        return provider.getRecommendationPage({ ...config.locale, tags: [], genres: [], developers: [], includeAppIds: [], maxPages: 1, limit: 50, includeMature: config.discover.includeMature }, offset);
      });
      const state = config.state.enabled ? await loadState(getProjectPaths(cwd).state) : undefined;
      json(response, 200, { ...result, games: result.games.filter(game => isAvailable(game, config, state, new Date())), hasMore: result.hasMore && result.nextOffset <= 5000 }, pageCachePolicy(process.env.PLAYCISION_BETA === '1', config.state.enabled)); return true;
    }
    if (request.method === 'GET' && ['/api/review-stats', '/api/reviews'].includes(url.pathname)) {
      const appId = url.searchParams.get('appId') ?? '';
      if (!/^\d{1,10}$/.test(appId)) { json(response, 400, { error: 'Invalid Steam App ID' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      const options = { ...config.locale, ...config.providers.steam, language: steamPresentationLanguage(url.searchParams.get('language'), config.locale.language) };
      const key = JSON.stringify(options);
      if (reviewsProvider?.key !== key) reviewsProvider = { key, provider: new SteamProvider(options) };
      const provider = reviewsProvider.provider;
      const all = url.searchParams.get('scope') === 'all';
      const cacheKey = `${key}:${url.pathname}:${appId}:${all}`;
      let cached = reviewsCache.get(cacheKey);
      if (!cached || cached.expires < Date.now()) {
        if (reviewsPending >= 16) { response.setHeader('Retry-After', '10'); json(response, 503, { error: '評論載入中，請稍後再試' }); return true; }
        reviewsPending++;
        const value = reviewsQueue.then<unknown>(() => url.pathname === '/api/review-stats' ? provider.getReviewStats(appId) : provider.getPlayerReviews(appId, all)).finally(() => { reviewsPending--; });
        reviewsQueue = value.catch(() => {});
        cached = { expires: Date.now() + 300_000, value };
        reviewsCache.set(cacheKey, cached);
        if (reviewsCache.size > 64) reviewsCache.delete(reviewsCache.keys().next().value!);
        void value.catch(() => { if (reviewsCache.get(cacheKey)?.value === value) reviewsCache.delete(cacheKey); });
      }
      json(response, 200, await cached.value);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/presentation') {
      const appId = url.searchParams.get('appId') ?? '';
      if (!/^\d{1,10}$/.test(appId)) { json(response, 400, { error: 'Invalid Steam App ID' }); return true; }
      const config = await loadConfig(cwd);
      if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
      const options = { ...config.locale, ...config.providers.steam, language: steamPresentationLanguage(url.searchParams.get('language'), config.locale.language) };
      const key = JSON.stringify(options);
      if (presentationProvider?.key !== key) presentationProvider = { key, provider: new SteamProvider(options) };
      const provider = presentationProvider.provider;
      const cacheKey = `${key}:${appId}`;
      let cached = presentations.get(cacheKey);
      if (!cached || cached.expires < Date.now()) {
        if (presentationPending >= 16) { response.setHeader('Retry-After', '10'); json(response, 503, { error: '封面載入中，請稍後再試' }); return true; }
        presentationPending++;
        const lane = presentationLane++ % presentationQueues.length;
        const value = presentationQueues[lane]!.then(() => provider.getPresentation(appId)).finally(() => { presentationPending--; });
        presentationQueues[lane] = value.catch(() => {});
        cached = { expires: Date.now() + 300_000, value };
        presentations.set(cacheKey, cached);
        if (presentations.size > 128) presentations.delete(presentations.keys().next().value!);
        void value.catch(() => presentations.delete(cacheKey));
      }
      json(response, 200, await cached.value);
      return true;
    }
    if (request.method === 'GET' && url.pathname === '/api/digest') {
      const beta = process.env.PLAYCISION_BETA === '1';
      const generate = async () => {
      const config = await loadConfig(cwd);
      const result = await buildAndDeliverDigest(cwd, { dryRun: true });
      const state = config.state.enabled ? await loadState(getProjectPaths(cwd).state) : undefined;
      let popular: Game[] = [];
      let popularError: string | undefined;
      try {
        if (!config.providers.steam.enabled) throw new Error('Steam provider is disabled');
        const provider = new SteamProvider({ ...config.locale, ...config.providers.steam });
        const games = await provider.getPopular({ ...config.locale, tags: [], genres: [], developers: [], includeAppIds: [], maxPages: 1, limit: 50, includeMature: config.discover.includeMature });
        popular = games.filter(game => isAvailable(game, config, state, new Date()));
      } catch (error) { popularError = safeMessage(error); }

      return {
        digest: result.digest,
        popular,
        ...(popularError ? { popularError } : {}),
        blockedAppIds: config.state.enabled
          ? blockedUiAppIds(await loadState(getProjectPaths(cwd).state), new Date())
          : [],
        locale: config.locale,
        filters: {
          discoverDays: config.discover.days,
          dealMaxPrice: config.deals.maxPrice,
          minDiscountPercent: config.deals.minDiscountPercent,
          rollMode: config.roll.mode,
          tags: [...new Set([...config.interests.tags, ...config.roll.tags])],
        },
      };
      };
      if (beta) {
        if (!digestCache || digestCache.expires < Date.now()) {
          const value = generate(); digestCache = { expires: Number.POSITIVE_INFINITY, value };
          void value.then(() => { if (digestCache?.value === value) digestCache.expires = Date.now() + 300_000; }, () => { if (digestCache?.value === value) digestCache = undefined; });
        }
        json(response, 200, await digestCache.value);
      } else json(response, 200, await generate());
      return true;
    }

    if (request.method === 'POST' && url.pathname === '/api/preferences') {
      if (process.env.PLAYCISION_BETA === '1') { json(response, 403, { error: '網頁偏好請儲存在自己的瀏覽器' }); return true; }
      assertSameOrigin(request);
      const body = await readJsonBody(request);
      if (!isPreferenceBody(body)) {
        json(response, 400, { error: 'Expected action, numeric appId, and optional integer days.' });
        return true;
      }
      const message = await updateRollState(cwd, body.action, body.appId, {
        ...(body.days === undefined ? {} : { days: body.days }),
      });
      json(response, 200, { message });
      return true;
    }

    json(response, 404, { error: 'Unknown Playcision UI endpoint.' });
    return true;
  } catch (error) {
    if (error instanceof QueryBusyError) {
      response.setHeader('Retry-After', '5');
      json(response, 503, { error: error.message }); return true;
    }
    json(response, 500, { error: safeMessage(error) });
    return true;
  }
}

async function serveStatic(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://playcision.local');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.statusCode = 400;
    response.end('Bad request');
    return;
  }
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let target = path.resolve(webRoot, requested);
  if (target !== webRoot && !target.startsWith(`${webRoot}${path.sep}`)) {
    response.statusCode = 403;
    response.end('Forbidden');
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
  } catch {
    target = path.join(webRoot, 'index.html');
  }
  response.statusCode = 200;
  response.setHeader('Content-Type', MIME[path.extname(target)] ?? 'application/octet-stream');
  response.setHeader('Cache-Control', path.basename(target) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable');
  createReadStream(target).pipe(response);
}

export async function startUiServer(options: UiServerOptions): Promise<void> {
  let requestHandler: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  const server = createServer((request, response) => {
    setSecurityHeaders(response, options.dev === true);
    if (!authorizeRequestHost(request, options.host, request.socket.localPort ?? options.port)) {
      json(response, 403, { error: 'Unrecognized request host.' }); return;
    }
    void (async () => { if (!await betaGate(request, response)) await requestHandler(request, response); })().catch((error: unknown) => {
      if (!response.headersSent) json(response, 500, { error: safeMessage(error) });
      else response.destroy();
    });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  const closeRoomSockets = attachRoomSockets(server, options.host, options.port, options.cwd, options.dev === true);

  let closeDevServer: (() => Promise<void>) | undefined;
  if (options.dev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      configFile: path.join(projectRoot, 'vite.config.ts'),
      appType: 'spa',
      server: { middlewareMode: true, hmr: { server } },
    });
    closeDevServer = () => vite.close();
    requestHandler = async (request, response) => {
      if (await handleApi(request, response, options.cwd)) return;
      await new Promise<void>((resolve, reject) => {
        vite.middlewares(request, response, (error?: unknown) => (error ? reject(error) : resolve()));
      });
    };
  } else {
    try {
      await stat(path.join(webRoot, 'index.html'));
    } catch {
      throw new Error('Playcision UI assets are missing. Run: npm run build');
    }
    requestHandler = async (request, response) => {
      if (await handleApi(request, response, options.cwd)) return;
      await serveStatic(request, response);
    };
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  const displayHost = options.host === '0.0.0.0' ? '127.0.0.1' : options.host;
  const url = `http://${displayHost}:${options.port}`;
  process.stdout.write(`Playcision UI ready at ${url}\n`);
  if (!['127.0.0.1', '::1', 'localhost'].includes(options.host)) {
    process.stdout.write('Warning: UI is listening beyond loopback; anyone on the reachable network may view local game preferences.\n');
  }
  if (options.open) await open(url);

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      closeRoomSockets();
      server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
  if (closeDevServer) await closeDevServer();
}
