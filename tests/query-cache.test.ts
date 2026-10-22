import { afterEach, expect, it, vi } from 'vitest';
import { createQueryCache, QueryBusyError } from '../src/ui/query-cache.js';
const defaults = { concurrency: 2, waiting: 32, waitMs: 15000, entries: 48, bytes: 1024, ttlMs: 300000 };
afterEach(() => vi.useRealTimers());
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

it('limits active queries to two, queues 32 and deduplicates even when full', async () => {
  const cache = createQueryCache<string>(defaults);
  const releases: (() => void)[] = [];
  const loader = vi.fn(() => new Promise<string>(resolve => releases.push(() => resolve('ok'))));
  const work = Array.from({ length: 34 }, (_, i) => cache.load(String(i), loader));
  expect(cache.load('33', loader)).toBe(work[33]);
  await expect(cache.load('overflow', loader)).rejects.toBeInstanceOf(QueryBusyError);
  await flush(); expect(loader).toHaveBeenCalledTimes(2);
  while (releases.length) { releases.splice(0).forEach(release => release()); await flush(); }
  await expect(Promise.all(work)).resolves.toHaveLength(34);
});

it('expires queued work without releasing an occupied slot and permits retry', async () => {
  vi.useFakeTimers();
  const cache = createQueryCache<string>({ ...defaults, concurrency: 1 });
  let finish!: (value: string) => void;
  const first = cache.load('first', () => new Promise(resolve => { finish = resolve; }));
  const loader = vi.fn(async () => 'next');
  const queued = cache.load('queued', loader);
  const rejected = expect(queued).rejects.toBeInstanceOf(QueryBusyError);
  await vi.advanceTimersByTimeAsync(15000); await rejected;
  expect(loader).not.toHaveBeenCalled();
  const retry = cache.load('queued', loader);
  finish('done'); await first;
  await expect(retry).resolves.toBe('next');
});

it('keeps pending deduplication independent of LRU eviction and promotes cache hits', async () => {
  const cache = createQueryCache<string>({ ...defaults, entries: 2 });
  let finish!: (value: string) => void;
  const pending = cache.load('pending', () => new Promise(resolve => { finish = resolve; }));
  const loader = vi.fn(async () => 'ok');
  await cache.load('a', loader); await cache.load('b', loader);
  await cache.load('a', loader); await cache.load('c', loader);
  expect(cache.load('pending', loader)).toBe(pending);
  await cache.load('a', loader); expect(loader).toHaveBeenCalledTimes(3);
  await cache.load('b', loader); expect(loader).toHaveBeenCalledTimes(4);
  finish('done'); await pending;
});

it('starts TTL at completion, retries failures, and never retains oversized entries', async () => {
  vi.useFakeTimers();
  const cache = createQueryCache<string>({ ...defaults, ttlMs: 100, bytes: 10 });
  let finish!: (value: string) => void;
  const slow = cache.load('slow', () => new Promise(resolve => { finish = resolve; }));
  await flush(); await vi.advanceTimersByTimeAsync(200); finish('ok'); await slow; await flush();
  const loader = vi.fn(async () => 'ok');
  await cache.load('slow', loader); expect(loader).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(101); await cache.load('slow', loader);
  expect(loader).toHaveBeenCalledTimes(1);
  await expect(cache.load('fail', async () => { throw Error('failed'); })).rejects.toThrow('failed');
  await flush(); await expect(cache.load('fail', loader)).resolves.toBe('ok');
  const large = vi.fn(async () => 'x'.repeat(20));
  await cache.load('large', large); await flush(); await cache.load('large', large);
  expect(large).toHaveBeenCalledTimes(2);
});

it('enforces the total serialized byte budget', async () => {
  const cache = createQueryCache<string>({ ...defaults, bytes: 10 });
  const loader = vi.fn(async () => '1234');
  await cache.load('a', loader); await flush(); await cache.load('b', loader); await flush();
  await cache.load('a', loader); expect(loader).toHaveBeenCalledTimes(3);
});
