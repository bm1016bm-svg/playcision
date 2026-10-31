import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDiscoveryFeed, DiscoveryLoadError, type DiscoveryPage } from '../src/web/consumer/discovery-feed.js';

const games = (start: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: String(start + i) }));
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('continues past fifty cards, deduplicates pages and uses the returned cursor', async () => {
  const seen = new Set<string>();
  const load = vi.fn(async (offset: number) => ({ games: games(offset, offset === 50 ? 49 : 50), nextOffset: offset + 50, hasMore: true }));
  const feed = createDiscoveryFeed({ load, seen: id => seen.has(id) });
  feed.resume(); await flush();
  expect(feed.getSnapshot().games).toHaveLength(50);
  for (const game of feed.getSnapshot().games) seen.add(game.id);
  feed.allowPrefetch(); feed.prefetch(); await flush();
  expect(feed.getSnapshot().games).toHaveLength(49);
  expect(feed.getSnapshot().hasMore).toBe(true);
  feed.prefetch(); await flush();
  expect(load.mock.calls.map(call => call[0])).toEqual([0, 50, 100]);
  expect(feed.getSnapshot().nextOffset).toBe(150);
  expect(new Set(feed.getSnapshot().games.map(game => game.id)).size).toBe(99);
  feed.pause();
});

it('retries the same failed page automatically, retaining cards and hasMore', async () => {
  let failures = 0;
  const load = vi.fn(async (offset: number) => {
    if (offset === 50 && failures++ < 2) throw new Error('temporary upstream failure');
    return { games: games(offset, 50), nextOffset: offset + 50, hasMore: true };
  });
  const feed = createDiscoveryFeed({ load });
  feed.resume(); await flush(); feed.prefetch(); await flush();
  expect(feed.getSnapshot()).toMatchObject({ nextOffset: 50, hasMore: true, loading: true, error: '' });
  expect(feed.getSnapshot().games).toHaveLength(50);
  await vi.advanceTimersByTimeAsync(5000);
  expect(load.mock.calls.map(call => call[0])).toEqual([0, 50, 50, 50]);
  expect(feed.getSnapshot()).toMatchObject({ nextOffset: 100, hasMore: true, loading: false, error: '' });
  feed.pause();
});

it('stops repeated failures after two retries, without claiming the source is exhausted', async () => {
  const load = vi.fn(async (): Promise<DiscoveryPage<{id: string}>> => { throw new Error('offline'); });
  const feed = createDiscoveryFeed({ load });
  feed.resume(); await vi.advanceTimersByTimeAsync(6000);
  expect(load).toHaveBeenCalledTimes(3);
  expect(feed.getSnapshot()).toMatchObject({ nextOffset: 0, hasMore: true, loading: false });
  expect(feed.getSnapshot().error).toBeTruthy();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(load).toHaveBeenCalledTimes(3);
  feed.pause();
});

it('respects a server cooldown and cancels the delayed retry when leaving discovery', async () => {
  const load = vi.fn(async (): Promise<DiscoveryPage<{id: string}>> => { throw new DiscoveryLoadError('rate limited', 60_000); });
  const feed = createDiscoveryFeed({ load });
  feed.resume(); await flush();
  await vi.advanceTimersByTimeAsync(59_999);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(2);
  feed.pause(); await vi.advanceTimersByTimeAsync(120_000);
  expect(load).toHaveBeenCalledTimes(2);
});

it('cancels obsolete requests on tab changes and ignores their late results', async () => {
  const resolvers: ((page: DiscoveryPage<{id: string}>) => void)[] = [];
  const signals: AbortSignal[] = [];
  const feed = createDiscoveryFeed({ load: (_offset, signal) => {
    signals.push(signal);
    return new Promise<DiscoveryPage<{id: string}>>(resolve => resolvers.push(resolve));
  } });
  feed.resume(); feed.pause(); feed.resume();
  expect(signals[0]?.aborted).toBe(true);
  resolvers[1]!({ games: [{id: 'new'}], nextOffset: 50, hasMore: true }); await flush();
  resolvers[0]!({ games: [{id: 'obsolete'}], nextOffset: 50, hasMore: true }); await flush();
  expect(feed.getSnapshot().games).toEqual([{id: 'new'}]);
  feed.pause();
});

it('bounds idle scanning of empty filter pages and allows an explicit continuation', async () => {
  const load = vi.fn(async (offset: number) => ({ games: [], nextOffset: offset + 50, hasMore: true }));
  const feed = createDiscoveryFeed({ load });
  feed.resume(); await flush();
  for (let i = 0; i < 10; i++) { feed.prefetch(); await flush(); }
  expect(load).toHaveBeenCalledTimes(4);
  expect(feed.getSnapshot()).toMatchObject({ hasMore: true, loading: false });
  await feed.retry();
  expect(load).toHaveBeenCalledTimes(5);
  feed.pause();
});

it('continues sparse pages when a synchronous view subscriber asks for the next batch', async () => {
  const load = vi.fn(async (offset: number) => ({ games: offset === 100 ? [{ id: 'found' }] : [], nextOffset: offset + 50, hasMore: offset < 100 }));
  const feed = createDiscoveryFeed({ load });
  const unsubscribe = feed.subscribe(() => {
    const state = feed.getSnapshot();
    if (!state.loading && !state.error && !state.games.length && state.hasMore) feed.prefetch();
  });
  feed.resume(); await flush();
  expect(load.mock.calls.map(call => call[0])).toEqual([0, 50, 100]);
  expect(feed.getSnapshot().games).toEqual([{ id: 'found' }]);
  unsubscribe(); feed.pause();
});

it('can recover from a settled error when the player returns to discovery', async () => {
  let offline = true;
  const feed = createDiscoveryFeed({ load: async () => {
    if (offline) throw new Error('offline');
    return { games: [{ id: 'recovered' }], nextOffset: 50, hasMore: true };
  } });
  feed.resume(); await vi.advanceTimersByTimeAsync(6000);
  expect(feed.getSnapshot().error).toBeTruthy();
  feed.pause(); offline = false; feed.resume(); await flush();
  expect(feed.getSnapshot()).toMatchObject({ error: '', loading: false, games: [{ id: 'recovered' }] });
  feed.pause();
});

it('restores an evicted previous card and keeps the game buffer bounded', async () => {
  const feed = createDiscoveryFeed({ load: async offset => ({ games: games(offset, 50), nextOffset: offset + 50, hasMore: true }) });
  feed.resume(); await flush();
  for (let i = 0; i < 5; i++) await feed.retry();
  expect(feed.getSnapshot().games).toHaveLength(150);
  expect(feed.getSnapshot().games.some(game => game.id === '0')).toBe(false);
  feed.restore({id: '0'});
  expect(feed.getSnapshot().games[0]?.id).toBe('0');
  expect(feed.getSnapshot().games).toHaveLength(150);
  feed.pause();
});

it('stops only when the upstream confirms the final page', async () => {
  const load = vi.fn(async () => ({ games: [], nextOffset: 50, hasMore: false }));
  const feed = createDiscoveryFeed({ load });
  feed.resume(); await flush(); feed.prefetch(); await feed.retry();
  expect(load).toHaveBeenCalledTimes(1);
  expect(feed.getSnapshot()).toMatchObject({ hasMore: false, loading: false, error: '' });
  feed.pause();
});

it('rejects a non-advancing cursor and never runs duplicate concurrent page requests', async () => {
  const load = vi.fn(async () => ({ games: [], nextOffset: 0, hasMore: true }));
  const feed = createDiscoveryFeed({ load });
  feed.resume(); feed.prefetch(); feed.prefetch();
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(6000);
  expect(load).toHaveBeenCalledTimes(3);
  expect(feed.getSnapshot().error).toBeTruthy();
  feed.pause();
});
