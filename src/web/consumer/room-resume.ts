import type { RoomView } from '../../rooms/engine.js';

export const ROOM_MEMBERSHIP_KEY = 'playcision.room-membership.v1';
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
type Membership = { id: string; expiresAt: number };

/** Only a room already joined in this browser tab can be resumed automatically. */
export function readRoomMembership(storage: Pick<Storage, 'getItem'>, id: string): Membership | undefined {
  try {
    const raw = storage.getItem(ROOM_MEMBERSHIP_KEY);
    if (!raw || raw.length > 300) return;
    const value = JSON.parse(raw) as Partial<Membership>;
    if (value.id === id && uuid.test(id) && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)) return value as Membership;
  } catch { /* Disabled or corrupt session storage must not block joining manually. */ }
}

export function rememberRoomMembership(storage: Pick<Storage, 'getItem' | 'setItem'>, room: Pick<RoomView, 'id' | 'expiresAt'>): void {
  if (!uuid.test(room.id) || !Number.isFinite(room.expiresAt)) return;
  try {
    if (readRoomMembership(storage, room.id)?.expiresAt === room.expiresAt) return;
    storage.setItem(ROOM_MEMBERSHIP_KEY, JSON.stringify({ id: room.id, expiresAt: room.expiresAt }));
  } catch { /* The live room remains usable without browser persistence. */ }
}

export function forgetRoomMembership(storage: Pick<Storage, 'getItem' | 'removeItem'>, id: string): void {
  try { if (readRoomMembership(storage, id)) storage.removeItem(ROOM_MEMBERSHIP_KEY); } catch { /* Optional state. */ }
}

export class RoomResumeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Check transport snapshots before the view dereferences players or cards. */
export function parseRoomSnapshot(value: unknown): RoomView {
  const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input);
  const finite = (input: unknown): input is number => typeof input === 'number' && Number.isFinite(input);
  const playerId = (input: unknown): input is string => typeof input === 'string' && /^p\d{1,8}$/.test(input);
  const gameId = (input: unknown): input is string => typeof input === 'string' && /^\d{1,10}$/.test(input);
  const ids = (input: unknown, valid: (id: unknown) => boolean, maximum: number): boolean => Array.isArray(input) && input.length <= maximum && input.every(valid);
  if (!record(value) || typeof value.id !== 'string' || !uuid.test(value.id) || !finite(value.expiresAt) || !finite(value.serverNow)
    || !(value.startedAt === null || finite(value.startedAt)) || !['waiting', 'proposing', 'voting', 'finished'].includes(String(value.phase))
    || !playerId(value.me) || !playerId(value.host) || !Array.isArray(value.players) || !value.players.length || value.players.length > 4
    || !value.players.every(player => record(player) && playerId(player.id) && typeof player.name === 'string' && player.name.length <= 24 && typeof player.ready === 'boolean')
    || !value.players.some(player => player.id === value.me) || !value.players.some(player => player.id === value.host)
    || !Array.isArray(value.cards) || value.cards.length > 8 || !value.cards.every(card => record(card) && gameId(card.id) && typeof card.name === 'string' && card.name.length <= 160 && ids(card.owners, playerId, 4) && ids(card.votes, playerId, 4))
    || !ids(value.winners, gameId, 8)) throw new RoomResumeError(502, '房間資料格式不正確，請重新連線。');
  return value as unknown as RoomView;
}

export async function resumeRoom({ id, token, storage, signal, api = '', fetcher = fetch }: {
  id: string; token: string; storage: SessionStorage; signal: AbortSignal; api?: string; fetcher?: typeof fetch;
}): Promise<RoomView | null> {
  signal.throwIfAborted();
  const membership = readRoomMembership(storage, id);
  if (!membership) return null; // An invitation is not permission to join or send a token.
  // The server owns expiry. A fast or slow device clock must not change seats.
  const pending = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  const response = await fetcher(`${api}/api/rooms/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: pending });
  const value: unknown = await response.json().catch(() => null);
  pending.throwIfAborted();
  if (!response.ok) {
    if ([400, 401, 403, 404, 410].includes(response.status)) forgetRoomMembership(storage, id);
    const message = value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : '房間暫時無法連線';
    throw new RoomResumeError(response.status, message);
  }
  const room = parseRoomSnapshot(value);
  if (room.id !== id) throw new RoomResumeError(502, '收到不同房間的資料，請重新連線。');
  if (room.expiresAt <= room.serverNow) {
    forgetRoomMembership(storage, id);
    throw new RoomResumeError(410, '房間已到期，請改開新房間。');
  }
  return room;
}
