import { changeRoom, newRoom, roomView, roomTokenSchema, type RoomState } from '../src/rooms/engine.js';
import { nextRoomEvent } from '../src/rooms/push.js';
import { type CloudState as State, type CloudSocket, type CloudEnv as Env, HttpError, UUID, reply, requestText } from './common.js';
import { configured } from './config.js';
import { isCatalogPath } from './catalog.js';
export { AppCoordinator } from './coordinator.js';


export class PlayRoomObject {
  private authenticating = new Map<CloudSocket, ReturnType<typeof setTimeout>>();
  constructor(private ctx: State, private env?: Env) {}
  private async schedule(room: RoomState) {
    const next = nextRoomEvent(room, Date.now());
    if (await this.ctx.storage.getAlarm() !== next) await this.ctx.storage.setAlarm(next);
  }
  private broadcast(room: RoomState) {
    for (const socket of this.ctx.getWebSockets()) {
      const token = socket.deserializeAttachment()?.token;
      if (!token) continue;
      try {
        const view = roomView(room, token, Date.now()); socket.send(JSON.stringify(view));
        if (view.phase === 'finished') socket.close(1000, '本輪已結束');
      } catch { socket.close(1008, '房間已到期或已離開'); }
    }
  }
  async alarm() {
    await this.ctx.blockConcurrencyWhile(async () => {
      const room = await this.ctx.storage.get<RoomState>('room');
      if (!room || room.expiresAt <= Date.now()) {
        for (const socket of this.ctx.getWebSockets()) socket.close(1008, '房間已到期');
        await this.ctx.storage.deleteAll(); return;
      }
      this.broadcast(room); await this.schedule(room);
    });
  }
  async webSocketMessage(socket: CloudSocket, message: string | ArrayBuffer) {
    try {
      if (socket.deserializeAttachment()?.token || typeof message !== 'string' || new TextEncoder().encode(message).length > 256) throw Error('Invalid handshake');
      const token = roomTokenSchema.parse((JSON.parse(message) as { token?: unknown }).token);
      const accepted = await this.ctx.blockConcurrencyWhile(async () => {
        try {
          const room = await this.ctx.storage.get<RoomState>('room');
          if (!room) return false;
          const view = roomView(room, token, Date.now());
          if (this.ctx.getWebSockets().filter(other => other !== socket && other.deserializeAttachment()?.token === token).length >= 2) return false;
          socket.serializeAttachment({ token });
          socket.send(JSON.stringify(view));
          if (view.phase === 'finished') socket.close(1000, '本輪已結束');
          return true;
        } catch { return false; } // Reject this socket without resetting the shared room.
      });
      if (!accepted) socket.close(1008, '無法加入即時同步，請重新加入房間');
    } catch { socket.close(1008, '無法加入即時同步，請重新加入房間'); }
    finally { const timer = this.authenticating.get(socket); if (timer) clearTimeout(timer); this.authenticating.delete(socket); }
  }
  webSocketClose(socket: CloudSocket) { const timer = this.authenticating.get(socket); if (timer) clearTimeout(timer); this.authenticating.delete(socket); }
  webSocketError(socket: CloudSocket) { this.webSocketClose(socket); socket.close(1011, '同步中斷'); }
  async fetch(request: Request): Promise<Response> {
    // Never hold the room's concurrency lock while waiting for client bytes.
    let text = '';
    try { if (request.method === 'POST') text = await requestText(request, 4096); }
    catch (error) { return reply(error instanceof HttpError ? error.status : 400, { error: '資料傳送失敗，請重試' }); }
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
          if (!this.env || request.headers.get('Origin') !== this.env.APP_ORIGIN) return reply(403, { error: '請從本網站操作' });
          const room = await this.ctx.storage.get<RoomState>('room');
          if (!room || room.expiresAt <= Date.now()) return reply(404, { error: '房間不存在或已到期' });
          if (this.ctx.getWebSockets().length >= 8) return reply(429, { error: '連線數過多' });
          const runtime = globalThis as unknown as { WebSocketPair: new () => { 0: CloudSocket; 1: CloudSocket } };
          const pair = new runtime.WebSocketPair();
          this.ctx.acceptWebSocket(pair[1]);
          this.authenticating.set(pair[1], setTimeout(() => { pair[1].close(1008, '驗證逾時'); this.authenticating.delete(pair[1]); }, 5000));
          // acceptWebSocket + attachments allow idle authenticated sockets to hibernate.
          return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
        }
        const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
        if (!roomTokenSchema.safeParse(token).success) return reply(401, { error: '請重新加入房間' });
        const url = new URL(request.url); const now = Date.now();
        let room = await this.ctx.storage.get<RoomState>('room');
        let action: Record<string, unknown> = {};
        if (request.method === 'POST') {
          if (!this.env || request.headers.get('Origin') !== this.env.APP_ORIGIN) return reply(403, { error: '請從本網站操作' });
          const minute = Math.floor(now / 60_000);
          const rate = await this.ctx.storage.get<{ minute: number; count: number }>('rate');
          if (rate?.minute === minute && rate.count >= 90) return reply(429, { error: '操作太頻繁，請稍後再試' });
          await this.ctx.storage.put('rate', { minute, count: rate?.minute === minute ? rate.count + 1 : 1 });
          action = JSON.parse(text);
          if (url.pathname === '/create' && !room) {
            const id = url.searchParams.get('id') ?? '';
            if (!UUID.test(id)) return reply(400, { error: '房間代號無效' });
            room = newRoom(id, String(action.name ?? ''), token, now);
          } else {
            if (!room) return reply(404, { error: '房間不存在或已到期' });
            changeRoom(room, action, token, now);
          }
          await this.ctx.storage.put('room', room);
          await this.schedule(room); this.broadcast(room);
          if (!room.players.length) {
            for (const socket of this.ctx.getWebSockets()) socket.close(1008, '房間已關閉');
            await this.ctx.storage.deleteAll();
            const response = reply(200, { left: true }); response.headers.set('X-Playcision-Room-Empty', '1'); return response;
          }
        }
        if (!room) return reply(404, { error: '房間不存在或已到期' });
        return reply(200, action.type === 'leave' ? { left: true } : roomView(room, token, now));
      } catch (error) { return reply(400, { error: error instanceof Error && error.name !== 'ZodError' ? error.message : '輸入格式不正確' }); }
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try { return secure(await route(request, env)); }
    catch (error) { return secure(reply(error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.message : '服務暫時無法使用，請稍後重試' })); }
  },
};

function secure(response: Response): Response {
  if (response.status === 101) return response;
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  headers.set('X-Content-Type-Options', 'nosniff'); headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', headers.get('Referrer-Policy') ?? 'no-referrer'); headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.delete('X-Playcision-Room-Empty');
  if (headers.get('Content-Type')?.includes('text/html')) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function route(request: Request, env: Env): Promise<Response> {
  if (!configured(env)) return reply(503, { error: '網站部署設定尚未完成' });
  const url = new URL(request.url);
  if (url.origin !== env.APP_ORIGIN || request.url.length > 2048) return reply(403, { error: '請從網站正式網址操作' });
  const documentNavigation = ['GET', 'HEAD'].includes(request.method) && !url.pathname.startsWith('/api/')
    && request.headers.get('Sec-Fetch-Mode') === 'navigate' && request.headers.get('Sec-Fetch-Dest') === 'document';
  if ((request.headers.get('Sec-Fetch-Site') === 'cross-site' && !documentNavigation) || (request.headers.has('Origin') && request.headers.get('Origin') !== env.APP_ORIGIN)) return reply(403, { error: '請從本網站操作' });
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return reply(405, { error: '不支援的操作' });
  const upgrading = request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  if (request.method === 'POST' || upgrading) {
    if (request.headers.get('Origin') !== env.APP_ORIGIN) return reply(403, { error: '請從本網站操作' });
  }
  if (url.pathname === '/healthz' && request.method === 'GET' && !upgrading) return reply(200, { ok: true });
  const coordinator = () => env.COORDINATOR!.get(env.COORDINATOR!.idFromName('global-v1'));
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/preferences') return reply(403, { error: '網頁偏好請儲存在自己的瀏覽器' });
    const room = /^\/api\/rooms(?:\/([a-f\d-]{36})(\/live)?)?$/i.exec(url.pathname);
    if (room) {
      if (url.search || (room[1] && !UUID.test(room[1]))) return reply(400, { error: '房間網址無效' });
      if (room[2] ? !upgrading || request.method !== 'GET' : upgrading || !['GET', 'POST'].includes(request.method)) return reply(405, { error: '不支援的操作' });
      if (!room[2] && !UUID.test(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '')) return reply(401, { error: '請重新加入房間' });
    } else if (!isCatalogPath(url.pathname)) return reply(404, { error: '找不到這個功能' });
    else if (request.method !== 'GET' || upgrading) return reply(405, { error: '不支援的操作' });
    const headers = new Headers(request.headers); headers.delete('Cookie');
    const body = request.method === 'POST' ? await requestText(request, 4096) : undefined;
    return coordinator().fetch(new Request(url, { method: request.method, headers, ...(body === undefined ? {} : { body }) }));
  }
  if (upgrading || !['GET', 'HEAD'].includes(request.method)) return reply(405, { error: '不支援的操作' });
  if (url.pathname.endsWith('.map')) return reply(404, { error: '找不到這個檔案' });
  const headers = new Headers(request.headers); headers.delete('Cookie');
  const asset = await env.ASSETS!.fetch(new Request(url, { method: request.method, headers }));
  // Only content-addressed build files are immutable. Keep the browser cache
  // private, and never cache an HTML SPA fallback under a missing asset URL.
  const immutable = /^\/assets\/[A-Za-z\d_-]+-[A-Za-z\d_-]{8}\.(?:js|css|woff2?)$/.test(url.pathname);
  if (asset.status !== 200 || !immutable || !/^(?:application\/(?:javascript|x-javascript)|text\/(?:javascript|css)|font\/)/i.test(asset.headers.get('Content-Type') ?? '')) return asset;
  const cached = new Headers(asset.headers); cached.set('Cache-Control', 'private, max-age=31536000, immutable');
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers: cached });
}
