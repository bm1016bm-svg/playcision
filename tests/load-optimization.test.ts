import { afterEach, expect, it, vi } from 'vitest';
import { RoomPush, nextRoomEvent } from '../src/rooms/push.js';
import { newRoom, changeRoom } from '../src/rooms/engine.js';
import { createDiscoveryCache } from '../src/web/consumer/discovery-cache.js';
import { pageCachePolicy } from '../src/ui/page-policy.js';

const host = 'aaaaaaaa-0000-4000-8000-000000000000';
const friend = 'bbbbbbbb-0000-4000-8000-000000000000';
afterEach(() => vi.useRealTimers());

it('pushes only changes and phase boundaries, with private votes per member', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const push = new RoomPush(); const room = newRoom('room', 'Host', host, 0);
  changeRoom(room, { type: 'join', name: 'Friend' }, friend, 0);
  for (const token of [host, friend]) changeRoom(room, { type: 'ready', ready: true }, token, 0);
  changeRoom(room, { type: 'start' }, host, 0);
  changeRoom(room, { type: 'propose', id: '1', name: 'Game' }, host, 0);
  const a = vi.fn(); const b = vi.fn();
  const stopA = push.subscribe('room', room, host, a);
  const stopB = push.subscribe('room', room, friend, b);
  a.mockClear(); b.mockClear();
  await vi.advanceTimersByTimeAsync(39000); expect(a).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000); expect(a.mock.calls.at(-1)?.[0].phase).toBe('voting');
  changeRoom(room, { type: 'vote', id: '1', selected: true }, host, Date.now());
  push.publish('room', room);
  expect(a.mock.calls.at(-1)?.[0].cards[0].votes).toEqual(['p1']);
  expect(b.mock.calls.at(-1)?.[0].cards[0].votes).toEqual([]);
  await vi.advanceTimersByTimeAsync(20000);
  expect(b.mock.calls.at(-1)?.[0].winners).toEqual(['1']);
  stopA(); stopB(); expect(vi.getTimerCount()).toBe(0);
});

it('rejects nonmembers, bounds duplicate listeners and clears expiry timers', async () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const push = new RoomPush(); const room = newRoom('room', 'Host', host, 0); const send = vi.fn();
  expect(() => push.subscribe('room', room, friend, send)).toThrow('請重新加入房間');
  push.subscribe('room', room, host, send); push.subscribe('room', room, host, send);
  expect(() => push.subscribe('room', room, host, send)).toThrow('連線數過多');
  expect(nextRoomEvent(room, 0)).toBe(600000);
  await vi.advanceTimersByTimeAsync(600000);
  expect(send.mock.calls.at(-1)?.[0]).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it('does not serve shared cache headers for beta sessions or local personal state', () => {
  expect(pageCachePolicy(true, false)).toBe('no-store');
  expect(pageCachePolicy(false, true)).toBe('no-store');
  expect(pageCachePolicy(false, false)).toContain('s-maxage=300');
});

it('reuses recent filters, separates language, and expires with bounded eviction', async () => {
  let now = 0; const fetchPage = vi.fn(async (url: string) => url);
  const load = createDiscoveryCache(fetchPage, () => now); const signal = new AbortController().signal;
  await load('a', 'zh-TW', signal); await load('a', 'zh-TW', signal);
  expect(fetchPage).toHaveBeenCalledTimes(1);
  await load('a', 'en', signal); expect(fetchPage).toHaveBeenCalledTimes(2);
  now = 60001; await load('a', 'zh-TW', signal); expect(fetchPage).toHaveBeenCalledTimes(3);
  for (let i = 0; i < 20; i++) await load(String(i), 'zh-TW', signal);
  await load('a', 'zh-TW', signal); expect(fetchPage).toHaveBeenCalledTimes(24);
});

it('never caches failures or canceled results', async () => {
  const controller = new AbortController();
  const fetchPage = vi.fn(async () => { controller.abort(); return 'old'; });
  const load = createDiscoveryCache(fetchPage);
  await expect(load('a', 'zh-TW', controller.signal)).rejects.toThrow();
  await load('a', 'zh-TW', new AbortController().signal);
  expect(fetchPage).toHaveBeenCalledTimes(2);
  const fail = vi.fn(async () => { throw Error('offline'); });
  const bad = createDiscoveryCache(fail);
  await expect(bad('a', 'zh-TW', new AbortController().signal)).rejects.toThrow('offline');
  await expect(bad('a', 'zh-TW', new AbortController().signal)).rejects.toThrow('offline');
  expect(fail).toHaveBeenCalledTimes(2);
});

it('coalesces 128 concurrent subscribers without allowing one cancellation to cancel the others', async () => {
  let finish!: (value: string) => void;
  let transportSignal!: AbortSignal;
  const fetchPage = vi.fn((_url: string, signal: AbortSignal) => {
    transportSignal = signal;
    return new Promise<string>(resolve => { finish = resolve; });
  });
  const load = createDiscoveryCache(fetchPage);
  const controllers = Array.from({ length: 128 }, () => new AbortController());
  const requests = controllers.map(controller => load('same', 'zh-TW', controller.signal));
  const outcomes = Promise.allSettled(requests);
  await Promise.resolve();
  controllers[0]!.abort();
  expect(transportSignal.aborted).toBe(false);
  finish('games');
  const settled = await outcomes;
  expect(settled.filter(result => result.status === 'fulfilled')).toHaveLength(127);
  expect(settled[0]!.status).toBe('rejected');
  expect(fetchPage).toHaveBeenCalledTimes(1);
  await expect(load('same', 'zh-TW', new AbortController().signal)).resolves.toBe('games');
  expect(fetchPage).toHaveBeenCalledTimes(1);
});

it('cancels unused transport and prevents a late aborted load from replacing a newer result', async () => {
  const first = new AbortController();
  let finish!: (value: string) => void;
  let transportSignal!: AbortSignal;
  const fetchPage = vi.fn((_url: string, signal: AbortSignal) => {
    transportSignal = signal;
    return new Promise<string>(resolve => { finish = resolve; });
  }).mockImplementationOnce((_url, signal) => {
    transportSignal = signal;
    return new Promise<string>(resolve => { finish = resolve; });
  }).mockResolvedValueOnce('new');
  const load = createDiscoveryCache(fetchPage);
  const abandoned = load('same', 'zh-TW', first.signal);
  const rejected = expect(abandoned).rejects.toThrow();
  await Promise.resolve(); first.abort(); await rejected;
  expect(transportSignal.aborted).toBe(true);
  await expect(load('same', 'zh-TW', new AbortController().signal)).resolves.toBe('new');
  finish('old');
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await expect(load('same', 'zh-TW', new AbortController().signal)).resolves.toBe('new');
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

it('bounds distinct in-flight browser queries and releases all canceled slots', async () => {
  const finishers: (() => void)[] = [];
  const load = createDiscoveryCache(async () => new Promise<string>(resolve => finishers.push(() => resolve('ok'))));
  const controllers = Array.from({ length: 20 }, () => new AbortController());
  const work = controllers.map((controller, index) => load(String(index), 'en', controller.signal));
  const settled = Promise.allSettled(work);
  await expect(load('overflow', 'en', new AbortController().signal)).rejects.toThrow('遊戲載入中');
  controllers.forEach(controller => controller.abort());
  await settled;
  finishers.forEach(finish => finish());
  const retried = load('overflow', 'en', new AbortController().signal);
  await Promise.resolve(); finishers.at(-1)!();
  await expect(retried).resolves.toBe('ok');
});
