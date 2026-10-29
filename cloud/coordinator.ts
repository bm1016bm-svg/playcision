import { createCloudCatalog } from './catalog.js';
import { type CloudEnv, type CloudState, HttpError, UUID, reply } from './common.js';
import { newRoom } from '../src/rooms/engine.js';
import { SteamProviderError } from '../src/provider/errors.js';

type Kind = 'api' | 'write' | 'create' | 'socket' | 'upstream';
interface Ledger { day: number; minute: number; daily: Record<Kind, number>; recent: Record<Kind, number>; rooms: Record<string, number> }
const zero = (): Record<Kind, number> => ({ api: 0, write: 0, create: 0, socket: 0, upstream: 0 });
// Application safeguards, NOT claims about visitor capacity or Cloudflare's account quota.
export const CLOUD_LIMITS = {
  daily: { api: 10000, write: 3000, create: 300, socket: 2000, upstream: 3000 },
  minute: { api: 2400, write: 600, create: 12, socket: 120, upstream: 120 },
  rooms: 100,
} as const;

/** A fixed namespace ID prevents per-isolate rate-limit resets and unbounded room allocation. */
export class AppCoordinator {
  private catalog: ReturnType<typeof createCloudCatalog>;
  private allowances = new Map<'api' | 'upstream', { day: number; minute: number; size: number; remaining: number }>();
  constructor(private ctx: CloudState, private env: CloudEnv, fetcher: typeof fetch = fetch) {
    this.catalog = createCloudCatalog(fetcher, async () => { await this.reserve(['upstream']); });
  }
  private async ledger(now: number): Promise<Ledger> {
    const value = await this.ctx.storage.get<Ledger>('ledger') ?? { day: -1, minute: -1, daily: zero(), recent: zero(), rooms: {} };
    const day = Math.floor(now / 86400_000), minute = Math.floor(now / 60_000);
    if (value.day !== day) { value.day = day; value.daily = zero(); }
    if (value.minute !== minute) { value.minute = minute; value.recent = zero(); }
    for (const [id, expires] of Object.entries(value.rooms)) if (expires <= now) delete value.rooms[id];
    return value;
  }
  private async reserve(kinds: Kind[], create?: string, requireRoom?: string): Promise<void> {
    if (!create && !requireRoom && kinds.length === 1 && (kinds[0] === 'api' || kinds[0] === 'upstream')) {
      return this.reserveRead(kinds[0]);
    }
    const denial = await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), value = await this.ledger(now);
      // Expected denials must not escape blockConcurrencyWhile: workerd resets
      // a Durable Object when this callback throws, disrupting unrelated users.
      if (requireRoom && !value.rooms[requireRoom]) return new HttpError(404, '房間不存在或已到期');
      if (create && Object.keys(value.rooms).length >= CLOUD_LIMITS.rooms) return new HttpError(429, '房間暫滿，請稍後再試');
      for (const kind of kinds) if (value.daily[kind] >= CLOUD_LIMITS.daily[kind] || value.recent[kind] >= CLOUD_LIMITS.minute[kind]) return new HttpError(429, '目前操作已達保護上限，請稍後再試');
      for (const kind of kinds) { value.daily[kind]++; value.recent[kind]++; }
      if (create) value.rooms[create] = now + 600_000;
      await this.ctx.storage.put('ledger', value);
      await this.schedule(value, now);
    });
    if (denial) throw denial;
  }
  private async reserveRead(kind: 'api' | 'upstream'): Promise<void> {
    const denial = await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now(), day = Math.floor(now / 86400_000), minute = Math.floor(now / 60_000);
      const previous = this.allowances.get(kind);
      const allowance = previous?.day === day && previous.minute === minute ? previous : undefined;
      if (allowance && allowance.remaining > 0) { allowance.remaining--; return; }
      const value = await this.ledger(now);
      // Reserve durably BEFORE use. A restart discards unused tokens; it never
      // refunds them or resets the shared cap. Sparse traffic starts at one.
      const size = Math.min(allowance ? allowance.size * 2 : 1, kind === 'api' ? 16 : 8,
        CLOUD_LIMITS.daily[kind] - value.daily[kind], CLOUD_LIMITS.minute[kind] - value.recent[kind]);
      if (size < 1) return new HttpError(429, '目前操作已達保護上限，請稍後再試');
      value.daily[kind] += size; value.recent[kind] += size;
      await this.ctx.storage.put('ledger', value); await this.schedule(value, now);
      this.allowances.set(kind, { day, minute, size, remaining: size - 1 });
    });
    if (denial) throw denial;
  }
  private async schedule(value: Ledger, now: number): Promise<void> {
    const next = Math.min((value.day + 1) * 86400_000, ...Object.values(value.rooms));
    if (await this.ctx.storage.getAlarm() !== next) await this.ctx.storage.setAlarm(Math.max(now + 1, next));
  }
  async alarm(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const value = await this.ledger(Date.now());
      if (!Object.keys(value.rooms).length && Object.values(value.daily).every(n => n === 0)) { await this.ctx.storage.deleteAll(); return; }
      await this.ctx.storage.put('ledger', value); await this.schedule(value, Date.now());
    });
  }
  private async forget(id: string): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const value = await this.ledger(Date.now()); delete value.rooms[id];
      await this.ctx.storage.put('ledger', value); await this.schedule(value, Date.now());
    });
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const room = /^\/api\/rooms(?:\/([a-f\d-]{36})(\/live)?)?$/i.exec(url.pathname);
      if (room) {
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
        const socket = !!room[2];
        if (!socket && !UUID.test(token)) throw new HttpError(401, '請重新加入房間');
        const creating = !room[1] && request.method === 'POST';
        if (!room[1] && !creating) throw new HttpError(405, '不支援的操作');
        // Bodies were capped and fully received by the Worker before any shared lock.
        const body = request.method === 'POST' ? await request.text() : '';
        const id = creating ? crypto.randomUUID() : room[1]!;
        if (creating) {
          const value: unknown = JSON.parse(body);
          if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as { name?: unknown }).name !== 'string') throw new HttpError(400, '暱稱無效');
          newRoom(id, (value as { name: string }).name, token, Date.now());
        }
        await this.reserve(['api', ...(request.method === 'POST' ? ['write' as const] : []), ...(creating ? ['create' as const] : []), ...(socket ? ['socket' as const] : [])], creating ? id : undefined, creating ? undefined : id);
        const internal = new URL(creating ? '/create' : socket ? '/live' : '/room', this.env.APP_ORIGIN);
        if (creating) internal.searchParams.set('id', id);
        const headers = new Headers(request.headers);
        const forwarded = new Request(internal, { method: request.method, headers, ...(request.method === 'POST' ? { body } : {}) });
        try {
          const result = await this.env.ROOMS.get(this.env.ROOMS.idFromName(id)).fetch(forwarded);
          if ((creating && !result.ok) || result.headers.get('X-Playcision-Room-Empty') === '1') await this.forget(id);
          return result;
        } catch (error) { if (creating) await this.forget(id); throw error; }
      }
      await this.reserve(['api']);
      return reply(200, await this.catalog(url));
    } catch (error) {
      return reply(error instanceof HttpError ? error.status : error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError') ? 400 : 503,
        { error: error instanceof HttpError ? error.message : '資料暫時無法取得，請稍後重試',
          ...(error instanceof SteamProviderError ? { code: error.code, upstreamStatus: error.status } : {}) });
    }
  }
}
