import { roomView, type RoomState, type RoomView } from './engine.js';

export function nextRoomEvent(room: RoomState, now: number): number {
  return Math.min(room.expiresAt, ...[40_000, 60_000].flatMap(delta =>
    room.startedAt !== null && room.startedAt + delta > now ? [room.startedAt + delta] : []));
}

/** One timer per observed room; each member receives only their own private view. */
export class RoomPush {
  private rooms = new Map<string, { room: RoomState; listeners: Map<symbol, { token: string; send: (view: RoomView | null) => void }>; timer?: ReturnType<typeof setTimeout> }>();
  constructor(private now = Date.now) {}
  publish(key: string, room?: RoomState): void {
    const entry = this.rooms.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (!room || room.expiresAt <= this.now()) {
      this.rooms.delete(key);
      for (const listener of entry.listeners.values()) listener.send(null);
      return;
    }
    entry.room = structuredClone(room);
    for (const [id, listener] of entry.listeners) {
      try { listener.send(roomView(entry.room, listener.token, this.now())); }
      catch { entry.listeners.delete(id); listener.send(null); }
    }
    if (entry.listeners.size) entry.timer = setTimeout(() => this.publish(key, entry.room), Math.max(1, nextRoomEvent(entry.room, this.now()) - this.now()));
    else this.rooms.delete(key);
  }
  subscribe(key: string, room: RoomState, token: string, send: (view: RoomView | null) => void): () => void {
    roomView(room, token, this.now()); // Validate membership before retaining a listener.
    let entry = this.rooms.get(key);
    if (!entry) { entry = { room: structuredClone(room), listeners: new Map() }; this.rooms.set(key, entry); }
    if (entry.listeners.size >= 8 || [...entry.listeners.values()].filter(listener => listener.token === token).length >= 2) throw Error('連線數過多，請關閉重複分頁');
    const id = Symbol();
    entry.listeners.set(id, { token, send });
    this.publish(key, room);
    return () => {
      const current = this.rooms.get(key);
      if (!current) return;
      current.listeners.delete(id);
      if (!current.listeners.size) { if (current.timer) clearTimeout(current.timer); this.rooms.delete(key); }
    };
  }
  close(): void {
    for (const entry of this.rooms.values()) { if (entry.timer) clearTimeout(entry.timer); for (const listener of entry.listeners.values()) listener.send(null); }
    this.rooms.clear();
  }
}
