import { afterEach, expect, it, vi } from 'vitest';
import worker, { AppCoordinator, PlayRoomObject } from '../cloud/worker.js';
import { CLOUD_LIMITS } from '../cloud/coordinator.js';
import { type CloudState, type CloudEnv, requestText } from '../cloud/common.js';
import { configured } from '../cloud/config.js';
import { createCloudCatalog } from '../cloud/catalog.js';
import { readFile } from 'node:fs/promises';

const origin = 'https://playcision.example';
const host = 'aaaaaaaa-0000-4000-8000-000000000000', friend = 'bbbbbbbb-0000-4000-8000-000000000000';
function state() {
  const rows = new Map<string, unknown>(); let alarm: number | null = null; let tail = Promise.resolve();
  const ctx: CloudState = {
    storage: { get: async <T>(key: string) => structuredClone(rows.get(key)) as T | undefined,
      put: async (key, value) => { rows.set(key, structuredClone(value)); }, deleteAll: async () => { rows.clear(); alarm = null; },
      getAlarm: async () => alarm, setAlarm: async time => { alarm = time; } },
    blockConcurrencyWhile: <T>(fn: () => Promise<T>) => { const result = tail.then(fn); tail = result.then(() => {}, () => {}); return result; },
    acceptWebSocket: () => {}, getWebSockets: () => [],
  };
  return { ctx, rows };
}
async function app() {
  const shared = state(); const rooms = new Map<string, ReturnType<typeof state>>();
  const fetcher = vi.fn<typeof fetch>(async () => { throw Error('unexpected Steam request'); });
  let coordinator: AppCoordinator;
  const env: CloudEnv = { APP_ORIGIN: origin,
    ASSETS: { fetch: vi.fn(async () => new Response('<!doctype html><html>App</html>', { headers: { 'Content-Type': 'text/html' } })) },
    COORDINATOR: { idFromName: vi.fn(name => name), get: vi.fn(() => ({ fetch: (request: Request) => coordinator.fetch(request) })) },
    ROOMS: { idFromName: vi.fn(name => name), get: vi.fn(id => {
      const name = String(id); let item = rooms.get(name); if (!item) { item = state(); rooms.set(name, item); }
      const object = new PlayRoomObject(item.ctx, env); return { fetch: (request: Request) => object.fetch(request) };
    }) },
  };
  coordinator = new AppCoordinator(shared.ctx, env, fetcher);
  const call = (path: string, token?: string, body?: unknown) => worker.fetch(new Request(origin + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
  return { env, shared, rooms, fetcher, call, restart: () => { coordinator = new AppCoordinator(shared.ctx, env, fetcher); } };
}
afterEach(() => vi.useRealTimers());
it('rejects missing room credentials, wrong host/origin and unsupported routes before allocating a room', async () => {
  const a = await app();
  for (const [url, headers, status] of [
    [origin + '/api/rooms', {}, 401],
    ['https://other.example/api/digest', {}, 403],
    [origin + '/api/rooms', { Origin: 'https://other.example' }, 403],
    [origin + '/api/nope', {}, 404],
  ] as const) expect((await worker.fetch(new Request(url, { headers }), a.env)).status).toBe(status);
  expect(a.env.COORDINATOR!.get).not.toHaveBeenCalled(); expect(a.env.ROOMS.get).not.toHaveBeenCalled();
  const index = await worker.fetch(new Request(origin + '/'), a.env);
  expect(index.status).toBe(200); expect(await index.text()).toContain('<html>App</html>');
  expect(index.headers.get('Set-Cookie')).toBeNull();
  expect((await a.call('/')).headers.get('Cache-Control')).toBe('no-store');
  expect((await a.call('/')).headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
});
it('opens the application and catalog without invitation secrets or session cookies', async () => {
  const a = await app();
  expect(configured(a.env)).toBe(true);
  expect(configured({ ...a.env, APP_ORIGIN: 'http://other.example' })).toBe(false);
  const index = await worker.fetch(new Request(origin + '/', { headers: { Cookie: 'pc_beta=expired-or-invalid' } }), a.env);
  expect(index.status).toBe(200); expect(await index.text()).not.toContain('邀請碼');
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400); // Reaches query validation, not a login screen.
  expect((await worker.fetch(new Request(origin + '/beta/login', { method: 'POST', headers: { Origin: origin }, body: '' }), a.env)).status).toBe(405);
  expect(a.env.ROOMS.get).not.toHaveBeenCalled();
});
it('preserves room links through direct navigation, without opening cross-site APIs', async () => {
  const a = await app(); const room = 'cccccccc-0000-4000-8000-000000000000';
  const metadata = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  const landing = await worker.fetch(new Request(origin + '/?room=' + room, { headers: metadata }), a.env);
  expect(landing.status).toBe(200); expect(await landing.text()).not.toContain('邀請碼');
  expect(vi.mocked(a.env.ASSETS!.fetch).mock.calls[0]![0].url).toBe(origin + '/?room=' + room);
  expect((await worker.fetch(new Request(origin + '/api/digest', { headers: metadata }), a.env)).status).toBe(403);
});
it('restores room state across instances, hides private votes and removes all data at ten minutes', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T05:00:00Z'));
  const a = await app(); const response = await a.call('/api/rooms', host, { name: 'Host' }); expect(response.status).toBe(200);
  const initial = await response.json() as { id: string; expiresAt: number };
  const path = '/api/rooms/' + initial.id;
  expect(initial.expiresAt - Date.now()).toBe(600000);
  expect((await a.call(path, friend)).status).toBe(400);
  await a.call(path, friend, { type: 'join', name: 'Friend' });
  for (const token of [host, friend]) await a.call(path, token, { type: 'ready', ready: true });
  await a.call(path, host, { type: 'start' }); await a.call(path, host, { type: 'propose', id: '10', name: 'Game' });
  vi.setSystemTime(Date.now() + 40000); await a.call(path, host, { type: 'vote', id: '10', selected: true }); a.restart();
  const privateView = await (await a.call(path, friend)).text(); expect(privateView).not.toContain(host); expect(privateView).not.toContain(friend);
  expect(JSON.parse(privateView).cards[0].votes).toEqual([]);
  const roomState = a.rooms.get(initial.id)!;
  vi.setSystemTime(initial.expiresAt); await new PlayRoomObject(roomState.ctx, a.env).alarm(); expect(roomState.rows.size).toBe(0);
  const allocations = vi.mocked(a.env.ROOMS.get).mock.calls.length;
  expect((await a.call(path, host)).status).toBe(404); expect(vi.mocked(a.env.ROOMS.get).mock.calls.length).toBe(allocations);
});
it('bounds room allocation across concurrent requests and object restarts, and denies unknown IDs', async () => {
  const a = await app();
  const responses = await Promise.all(Array.from({ length: 13 }, () => a.call('/api/rooms', host, { name: 'Host' })));
  expect(responses.filter(r => r.status === 200)).toHaveLength(CLOUD_LIMITS.minute.create);
  expect(responses.filter(r => r.status === 429)).toHaveLength(1); expect(a.rooms.size).toBe(12);
  a.restart(); expect((await a.call('/api/rooms', host, { name: 'Host' })).status).toBe(429);
  const count = a.rooms.size; expect((await a.call('/api/rooms/cccccccc-0000-4000-8000-000000000000', host)).status).toBe(404); expect(a.rooms.size).toBe(count);
});
it('enforces persisted active-room and daily caps before allocating another room or contacting Steam', async () => {
  const a = await app(); await a.call('/api/rooms', host, { name: 'Host' });
  const ledger = structuredClone(a.shared.rows.get('ledger')) as { daily: Record<string, number>; rooms: Record<string, number> };
  for (let i = 0; i < 100; i++) ledger.rooms[`reserved-${i}`] = Date.now() + 600000;
  a.shared.rows.set('ledger', ledger); a.restart(); const count = a.rooms.size;
  expect((await a.call('/api/rooms', host, { name: 'Host' })).status).toBe(429); expect(a.rooms.size).toBe(count);
  ledger.daily.api = CLOUD_LIMITS.daily.api; a.shared.rows.set('ledger', ledger); a.restart();
  expect((await a.call('/api/steam-events?offset=0')).status).toBe(429); expect(a.fetcher).not.toHaveBeenCalled();
});
it('caps streaming bodies and their deadline before a namespace allocation', async () => {
  const a = await app();
  expect((await a.call('/api/rooms', host, { name: 'a'.repeat(5000) })).status).toBe(413);
  expect(a.env.COORDINATOR!.get).not.toHaveBeenCalled();
  vi.useFakeTimers();
  const stalled = requestText(new Request(origin, { method: 'POST', body: new ReadableStream({ start() {} }), duplex: 'half' } as RequestInit), 100);
  const result = expect(stalled).rejects.toMatchObject({ status: 408 }); await vi.advanceTimersByTimeAsync(3001); await result;
});
it('rejects bad catalog queries without Steam requests, retains localized review compatibility and deduplicates cache hits', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ response: { query_summary: { total_positive: 2, total_negative: 1, total_reviews: 3 }, reviews: [] } }), { headers: { 'content-type': 'application/json' } }));
  const spend = vi.fn(async () => {}); const catalog = createCloudCatalog(fetcher, spend);
  for (const path of ['/api/discovery?source=popular&offset=0', '/api/ai-disclosures?ids=1,2,3,4', '/api/presentation?appId=10&appId=20', '/api/recommendations?offset=-50']) await expect(catalog(new URL(origin + path))).rejects.toMatchObject({ status: 400 });
  expect(fetcher).not.toHaveBeenCalled();
  const url = new URL(origin + '/api/reviews?appId=10&language=zh-TW&scope=localized');
  await Promise.all([catalog(url), catalog(url)]); await catalog(url);
  expect(fetcher).toHaveBeenCalledTimes(2); expect(spend).toHaveBeenCalledTimes(2);
  expect(JSON.parse(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('input_json')!).languages).toEqual(['tchinese']);
});
it('continues a game search while optional presentation work is stalled', async () => {
  const fixture = async (name: string) => readFile(new URL(`./fixtures/steam/${name}`, import.meta.url), 'utf8');
  const tags = await fixture('tags.json'), search = await fixture('search-empty.json');
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const catalog = createCloudCatalog(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('appdetails')) { started(); await hold; return Response.json({ 570: { success: false } }); }
    if (url.pathname.includes('/search/results')) return new Response(search);
    if (url.pathname.includes('/tagdata/populartags/')) return new Response(tags);
    return Response.json({ response: { store_items: [] } });
  }, async () => {});
  const artwork = catalog(new URL(origin + '/api/presentation?appId=570'));
  await entered;
  try {
    await expect(catalog(new URL(origin + '/api/discovery?source=popular&genre=all&platform=all&price=all&players=all&earlyAccess=all&offset=0'))).resolves.toMatchObject({ games: [] });
  } finally { release(); await artwork; }
});

it('shares initial discovery pages with the digest, without nesting aggregate and page queue slots', async () => {
  const tags = await readFile(new URL('./fixtures/steam/tags.json', import.meta.url), 'utf8');
  const empty = await readFile(new URL('./fixtures/steam/search-empty.json', import.meta.url), 'utf8');
  const fetcher = vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    if (url.pathname.includes('/tagdata/populartags/')) return new Response(tags);
    if (url.pathname.includes('/search/results')) return new Response(empty);
    throw Error('unexpected upstream');
  });
  const catalog = createCloudCatalog(fetcher, async () => {});
  const paths = ['popular', 'discover', 'deals'].map(source => new URL(origin + `/api/discovery?source=${source}&genre=all&platform=all&price=all&players=all&earlyAccess=all&offset=0`));
  const responses = await Promise.all([catalog(new URL(origin + '/api/digest')), ...paths.map(path => catalog(path))]);
  expect(responses[0]).toMatchObject({ popular: [], digest: { discover: [], deals: [] } });
  expect(fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname.includes('/search/results'))).toHaveLength(3);
  for (const path of paths) await catalog(path);
  expect(fetcher).toHaveBeenCalledTimes(4); // One tag catalogue and the three distinct sources.
});

it('stops other Steam lanes during a shared 429 cooldown, then permits recovery', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  const spend = vi.fn(async () => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } }));
  const catalog = createCloudCatalog(fetcher, spend);
  const ai = catalog(new URL(origin + '/api/ai-disclosures?ids=1'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(await ai).toEqual({ results: [{ id: '1', status: 'unknown' }] });
  const presentation = expect(catalog(new URL(origin + '/api/presentation?appId=570'))).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1000); await presentation;
  expect(fetcher).toHaveBeenCalledTimes(1); expect(spend).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120_000);
  const next = catalog(new URL(origin + '/api/ai-disclosures?ids=2'));
  await vi.advanceTimersByTimeAsync(1000); await next;
  expect(fetcher).toHaveBeenCalledTimes(2); expect(spend).toHaveBeenCalledTimes(2);
});

it('reduces durable ledger writes for a burst of cached catalog reads', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-28T12:00:00Z'));
  const a = await app();
  a.fetcher.mockImplementation(async () => new Response('<html><div class="apphub_AppName">Game</div><div id="game_area_description">Description</div></html>', { headers: { 'Content-Type': 'text/html' } }));
  expect((await a.call('/api/ai-disclosures?ids=570')).status).toBe(200);
  const writes = vi.spyOn(a.shared.ctx.storage, 'put');
  const responses = await Promise.all(Array.from({ length: 128 }, () => a.call('/api/ai-disclosures?ids=570')));
  expect(responses.every(response => response.status === 200)).toBe(true);
  expect(writes.mock.calls.length).toBeLessThan(16);
  expect(a.fetcher).toHaveBeenCalledTimes(1);
});

it('does not refund unused read reservations on restart or exceed a day/minute boundary', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T23:58:00Z'));
  const a = await app();
  await a.call('/api/discovery?source=bad');
  const value = structuredClone(a.shared.rows.get('ledger')) as { day: number; minute: number; daily: Record<string, number>; recent: Record<string, number> };
  value.daily.api = CLOUD_LIMITS.daily.api - 4; value.recent.api = CLOUD_LIMITS.minute.api - 4;
  a.shared.rows.set('ledger', value); a.restart();
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400); // Reserves two, consumes one.
  a.restart(); // One unused token is deliberately lost, never credited back.
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
  expect((await a.call('/api/discovery?source=bad')).status).toBe(429);
  vi.setSystemTime(new Date('2026-10-28T23:59:00Z'));
  expect((await a.call('/api/discovery?source=bad')).status).toBe(429); // Minute reset cannot reset the daily cap.
  vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
});

it('resets only the minute allowance and does not over-reserve sparse traffic', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  const a = await app();
  for (let i = 0; i < 5; i++) {
    expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
    vi.setSystemTime(Date.now() + 60_000);
  }
  const value = structuredClone(a.shared.rows.get('ledger')) as { daily: Record<string, number>; recent: Record<string, number>; minute: number };
  expect(value.daily.api).toBe(5);
  value.recent.api = CLOUD_LIMITS.minute.api - 2;
  value.minute = Math.floor(Date.now() / 60_000);
  a.shared.rows.set('ledger', value); a.restart();
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
  expect((await a.call('/api/discovery?source=bad')).status).toBe(429);
  vi.setSystemTime(Date.now() + 60_000);
  expect((await a.call('/api/discovery?source=bad')).status).toBe(400);
});

it('persists upstream reservations before fetching and cannot reset them by restarting', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-28T12:00:00Z'));
  const a = await app(); await a.call('/api/discovery?source=bad');
  const value = structuredClone(a.shared.rows.get('ledger')) as { daily: Record<string, number> };
  value.daily.upstream = CLOUD_LIMITS.daily.upstream - 3;
  a.shared.rows.set('ledger', value); a.restart();
  a.fetcher.mockImplementation(async () => new Response('<html><div class="apphub_AppName">Game</div><div id="game_area_description"></div></html>', { headers: { 'Content-Type': 'text/html' } }));
  const replies = await Promise.all([1, 2, 3].map(id => a.call(`/api/ai-disclosures?ids=${id}`)));
  expect(replies.every(response => response.status === 200)).toBe(true);
  expect(a.fetcher).toHaveBeenCalledTimes(3);
  a.restart();
  const denied = await (await a.call('/api/ai-disclosures?ids=4')).json() as { results: { status: string }[] };
  expect(denied.results[0]!.status).toBe('unknown');
  expect(a.fetcher).toHaveBeenCalledTimes(3);
});

it('privately caches successful hashed build assets, never HTML fallbacks or APIs', async () => {
  const a = await app();
  const asset = '/assets/index-Abcd1234.js';
  a.env.ASSETS!.fetch = vi.fn(async () => new Response('export {};', { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=0' } }));
  expect((await a.call(asset)).headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
  expect((await a.call('/assets/index.js')).headers.get('Cache-Control')).toBe('public, max-age=0');
  a.env.ASSETS!.fetch = vi.fn(async () => new Response('<html>Fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
  expect((await a.call(asset)).headers.get('Cache-Control')).toBe('no-store');
  a.env.ASSETS!.fetch = vi.fn(async () => new Response('missing', { status: 404, headers: { 'Content-Type': 'application/javascript' } }));
  expect((await a.call(asset)).headers.get('Cache-Control') ?? '').not.toContain('immutable');
  expect((await a.call('/api/discovery?source=bad')).headers.get('Cache-Control')).toBe('no-store');
});
