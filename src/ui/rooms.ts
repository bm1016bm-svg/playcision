import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { changeRoom, newRoom, roomView, roomTokenSchema, type RoomState } from '../rooms/engine.js';
import { RoomStore } from './room-store.js';
import { sameOrigin, WindowLimit } from './beta.js';
import { RoomPush } from '../rooms/push.js';

export const roomPush = new RoomPush();
export const roomPushKey = (id: string, cwd?: string) => JSON.stringify([cwd ?? 'memory', id]);
export async function roomSnapshot(id: string, token: string, cwd?: string): Promise<RoomState> {
  const store = stores.get(cwd ?? 'memory') ?? new RoomStore(cwd);
  stores.set(cwd ?? 'memory', store);
  return store.run(rooms => {
    const room = rooms.get(id);
    if (!room) throw Error('房間不存在或已到期');
    roomView(room, token, Date.now());
    return structuredClone(room);
  });
}

// Local preview uses memory; beta uses a single-process durable store.
const stores = new Map<string, RoomStore>();
const creates = new WindowLimit(12);
const actions = new WindowLimit(90);
export async function pruneRooms(): Promise<void> { for (const store of stores.values()) await store.run(() => {}); }
export async function handleRooms(req: IncomingMessage, res: ServerResponse, cwd?: string): Promise<boolean> {
  const path = new URL(req.url ?? '/', 'http://local').pathname;
  if (!path.startsWith('/api/rooms')) return false;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (status: number, data: unknown) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  try {
    const now = Date.now();
    if (!['GET', 'POST'].includes(req.method ?? '')) { send(405, { error: '不支援的操作' }); return true; }
    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      if (!sameOrigin(req)) throw new Error('請從本網站操作');
      let text = '';
      for await (const chunk of req) { text += String(chunk); if (Buffer.byteLength(text) > 4096) throw new Error('資料過大'); }
      body = JSON.parse(text) as Record<string, unknown>;
    }
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!roomTokenSchema.safeParse(token).success) throw new Error('請重新加入房間');
    if (req.method === 'POST' && (!actions.allow(token) || (path === '/api/rooms' && !creates.allow('all')))) { res.setHeader('Retry-After', '60'); send(429, { error: '操作太頻繁，請稍後再試' }); return true; }
    const key = cwd ?? 'memory';
    let store = stores.get(key);
    if (!store) { store = new RoomStore(cwd); stores.set(key, store); }
    let updated: RoomState | undefined;
    let updatedId = '';
    const result = await store.run(rooms => {
    let room: RoomState | undefined;
    if (path === '/api/rooms' && req.method === 'POST') {
      if (rooms.size >= 100) throw new Error('房間暫滿，請稍後再試');
      room = newRoom(randomUUID(), String(body.name ?? ''), token, now); rooms.set(room.id, room);
    } else {
      room = rooms.get(path.slice('/api/rooms/'.length));
      if (!room) return { status: 404, value: { error: '房間不存在或已到期' } };
      if (req.method === 'POST') changeRoom(room, body, token, now);
      if (body.type === 'leave') { if (!room.players.length) rooms.delete(room.id); updatedId = room.id; updated = room.players.length ? structuredClone(room) : undefined; return { status: 200, value: { left: true } }; }
    }
    if (req.method === 'POST') { updatedId = room.id; updated = structuredClone(room); }
    return { status: 200, value: roomView(room, token, now) };
    }, now);
    if (updatedId) roomPush.publish(roomPushKey(updatedId, cwd), updated);
    send(result.status, result.value);
  } catch (error) {
    const systemFailure = error instanceof Error && ('code' in error || error.message.includes('room store'));
    send(systemFailure ? 503 : 400, { error: systemFailure ? '房間暫時無法儲存，請稍後再試。' : error instanceof Error && error.name !== 'ZodError' ? error.message : '輸入格式不正確' });
  }
  return true;
}
