import { afterEach, expect, it, vi } from 'vitest';
import { PlayRoomObject } from '../cloud/worker.js';
import { changeRoom, newRoom, type RoomState } from '../src/rooms/engine.js';
const host = 'aaaaaaaa-0000-4000-8000-000000000000';
const friend = 'bbbbbbbb-0000-4000-8000-000000000000';
function socket() {
  let attachment: { token?: string } | null = null;
  return { send: vi.fn(), close: vi.fn(), serializeAttachment: (value: unknown) => { attachment = value as { token?: string }; }, deserializeAttachment: () => attachment };
}
afterEach(() => vi.useRealTimers());
it('restores member attachments, schedules phase boundaries and deletes expired data', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const room = newRoom('room', 'Host', host, 0);
  changeRoom(room, { type: 'join', name: 'Friend' }, friend, 0);
  for (const token of [host, friend]) changeRoom(room, { type: 'ready', ready: true }, token, 0);
  changeRoom(room, { type: 'start' }, host, 0);
  changeRoom(room, { type: 'propose', id: '10', name: 'Game' }, host, 1);
  const a = socket(); const b = socket(); const sockets = [a, b];
  let alarm: number | null = null;
  const deleted = vi.fn(async () => {});
  const ctx = { storage: { get: async <T>() => room as unknown as T, put: vi.fn(async () => {}), getAlarm: async () => alarm,
    setAlarm: vi.fn(async (time: number) => { alarm = time; }), deleteAll: deleted },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(), acceptWebSocket: vi.fn(), getWebSockets: () => sockets };
  const object = new PlayRoomObject(ctx);
  await object.webSocketMessage(a, JSON.stringify({ token: host }));
  await object.webSocketMessage(b, JSON.stringify({ token: friend }));
  expect(a.deserializeAttachment()?.token).toBe(host);
  expect(a.send.mock.calls[0]?.[0]).not.toContain(host);
  vi.setSystemTime(40000); changeRoom(room, { type: 'vote', id: '10', selected: true }, host, 40000);
  // A new object instance models a wake after hibernation: attachments remain available.
  const woken = new PlayRoomObject(ctx);
  await woken.alarm();
  expect(alarm).toBe(60000);
  expect(JSON.parse(b.send.mock.calls.at(-1)![0]).cards[0].votes).toEqual([]);
  vi.setSystemTime(60000); await woken.alarm();
  expect(JSON.parse(b.send.mock.calls.at(-1)![0]).winners).toEqual(['10']);
  expect(b.close).toHaveBeenCalledWith(1000, '本輪已結束'); expect(alarm).toBe(600000);
  vi.setSystemTime(600000); await woken.alarm(); expect(deleted).toHaveBeenCalledTimes(1);
  expect(ctx.storage.put).not.toHaveBeenCalled(); // Pushes never rewrite the snapshot.
});
it('closes a nonmember before sending any private room state', async () => {
  const room: RoomState = newRoom('room', 'Host', host, Date.now()); const outsider = socket();
  const object = new PlayRoomObject({
    storage: { get: async <T>() => room as unknown as T, put: async () => {}, getAlarm: async () => null, setAlarm: async () => {}, deleteAll: async () => {} },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>) => fn(), acceptWebSocket: () => {}, getWebSockets: () => [outsider],
  });
  await object.webSocketMessage(outsider, JSON.stringify({ token: friend }));
  expect(outsider.send).not.toHaveBeenCalled(); expect(outsider.close).toHaveBeenCalledWith(1008, expect.any(String));
});
