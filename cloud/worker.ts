import { changeRoom, newRoom, roomView, roomTokenSchema, type RoomState } from '../src/rooms/engine.js';
import { nextRoomEvent } from '../src/rooms/push.js';

interface Storage { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void>; getAlarm(): Promise<number | null>; setAlarm(time: number): Promise<void>; deleteAll(): Promise<void> }
interface CloudSocket { send(value: string): void; close(code: number, reason?: string): void; serializeAttachment(value: unknown): void; deserializeAttachment(): { token?: string } | null }
interface State { storage: Storage; blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>; acceptWebSocket(socket: CloudSocket): void; getWebSockets(): CloudSocket[] }
interface Env { ROOMS: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } }; APP_ORIGIN: string }
const reply = (status: number, value: unknown) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

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
      await this.ctx.blockConcurrencyWhile(async () => {
        const room = await this.ctx.storage.get<RoomState>('room');
        if (!room) throw Error('Expired');
        const view = roomView(room, token, Date.now());
        if (this.ctx.getWebSockets().filter(other => other !== socket && other.deserializeAttachment()?.token === token).length >= 2) throw Error('Too many connections');
        socket.serializeAttachment({ token });
        socket.send(JSON.stringify(view));
        if (view.phase === 'finished') socket.close(1000, '本輪已結束');
      });
    } catch { socket.close(1008, '無法加入即時同步，請重新加入房間'); }
    finally { const timer = this.authenticating.get(socket); if (timer) clearTimeout(timer); this.authenticating.delete(socket); }
  }
  webSocketClose(socket: CloudSocket) { const timer = this.authenticating.get(socket); if (timer) clearTimeout(timer); this.authenticating.delete(socket); }
  webSocketError(socket: CloudSocket) { this.webSocketClose(socket); socket.close(1011, '同步中斷'); }
  async fetch(request: Request): Promise<Response> {
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
          // Read incrementally: do not buffer an unbounded request before validation.
          const reader = request.body?.getReader(); let size = 0; let text = ''; const decoder = new TextDecoder();
          if (reader) while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 4096) { await reader.cancel(); return reply(413, { error: '資料過大' }); } text += decoder.decode(chunk.value, { stream: true }); }
          text += decoder.decode(); action = JSON.parse(text);
          if (url.pathname === '/create' && !room) {
            room = newRoom(url.searchParams.get('id')!, String(action.name ?? ''), token, now);
          } else {
            if (!room) return reply(404, { error: '房間不存在或已到期' });
            changeRoom(room, action, token, now);
          }
          await this.ctx.storage.put('room', room);
          await this.schedule(room); this.broadcast(room);
        }
        if (!room) return reply(404, { error: '房間不存在或已到期' });
        return reply(200, action.type === 'leave' ? { left: true } : roomView(room, token, now));
      } catch (error) { return reply(400, { error: error instanceof Error && error.name !== 'ZodError' ? error.message : '輸入格式不正確' }); }
    });
  }
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    // Undeployed alternate adapter: no public allocation before a verified
    // admission/quota service exists. Node beta remains the supported backend.
    return reply(503, { error: '雲端房間入口未開放，請使用網站內建房間服務。' });
  },
};
