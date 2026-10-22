import { describe, expect, it, vi } from 'vitest';
import { createArtworkCache, preloadWindow, preloadInitialArtwork } from '../src/web/consumer/artwork-cache.js';
const input = { id: '10', language: 'tchinese', fallback: 'thumbnail' };

it('initial loading warms exactly three games and respects cancellation', async () => {
  const load = vi.fn(async (id: number) => id);
  await preloadInitialArtwork([1, 2, 3, 4, 5, 6, 7, 8], load, () => false);
  expect(load.mock.calls.map(([id]) => id)).toEqual([1, 2, 3]);
  load.mockClear();
  await preloadInitialArtwork([1, 2, 3], load, () => true);
  expect(load).not.toHaveBeenCalled();
});

describe('decoded artwork cache', () => {
  it('never exposes a thumbnail while presentation or decoding is pending', async () => {
    let finish!: (value: unknown) => void;
    const decode = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const cache = createArtworkCache(async () => ({ images: ['high-resolution'] }), decode);
    const pending = cache.load(input);
    expect(cache.peek(input)).toBeUndefined();
    await vi.waitFor(() => expect(decode).toHaveBeenCalledWith('high-resolution'));
    expect(cache.peek(input)).toBeUndefined();
    finish({ decoded: true });
    await pending;
    expect(cache.peek(input)?.src).toBe('high-resolution');
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it('reuses preloaded results synchronously and deduplicates concurrent mounts', async () => {
    const presentation = vi.fn(async () => ({ images: ['hd'] }));
    const decode = vi.fn(async () => ({}));
    const cache = createArtworkCache(presentation, decode);
    const first = cache.load(input);
    expect(cache.load(input)).toBe(first);
    await first;
    expect(cache.peek(input)?.src).toBe('hd');
    await cache.load(input);
    expect(presentation).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledTimes(1);
  });
  it('tries real backup assets in order only when preferred assets fail', async () => {
    const decode = vi.fn(async (url: string) => { if (url !== 'thumbnail') throw Error('failed'); return {}; });
    const cache = createArtworkCache(async () => ({ images: ['hd', 'header', 'hd'] }), decode);
    expect((await cache.load(input)).src).toBe('thumbnail');
    expect(decode.mock.calls.map(call => call[0])).toEqual(['hd', 'header', 'thumbnail']);
  });
  it('allows retry after total failure and isolates language and game keys', async () => {
    const decode = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({});
    const cache = createArtworkCache(async () => ({ images: [] }), decode);
    expect((await cache.load(input)).src).toBeNull();
    expect(cache.peek(input)).toBeUndefined();
    expect((await cache.load(input)).src).toBe('thumbnail');
    expect(cache.peek({ ...input, id: '20' })).toBeUndefined();
    expect(cache.peek({ ...input, language: 'english' })).toBeUndefined();
  });
  it('evicts least recently used entries at the configured bound', async () => {
    const cache = createArtworkCache(async () => ({ images: ['hd'] }), async () => ({}), 2);
    await cache.load(input);
    await cache.load({ ...input, id: '20' });
    await cache.load(input);
    await cache.load({ ...input, id: '30' });
    expect(cache.peek(input)?.src).toBe('hd');
    expect(cache.peek({ ...input, id: '20' })).toBeUndefined();
  });
});

it('bounds background preloading to two jobs and stops an obsolete window', async () => {
  const finish: (() => void)[] = [];
  const loaded: number[] = [];
  let cancelled = false;
  const work = preloadWindow([1, 2, 3, 4, 5, 6], item => {
    loaded.push(item);
    return new Promise<void>(resolve => finish.push(resolve));
  }, () => cancelled);
  expect(loaded).toEqual([1, 2]);
  finish[0]!();
  await vi.waitFor(() => expect(loaded).toEqual([1, 2, 3]));
  cancelled = true;
  finish[1]!();
  finish[2]!();
  await work;
  expect(loaded).toEqual([1, 2, 3]);
});

it('limits active image requests and keeps in-flight deduplication beyond the LRU limit', async () => {
  const finish = new Map<string, () => void>();
  const started: string[] = [];
  const cache = createArtworkCache(async id => {
    started.push(id);
    await new Promise<void>(resolve => finish.set(id, resolve));
    return { images: ['hd'] };
  }, async () => ({}), 1, 2);
  const jobs = ['a','b','c','d'].map(id => cache.load({ ...input, id }));
  expect(started).toEqual(['a','b']);
  expect(cache.load({ ...input, id: 'a' })).toBe(jobs[0]);
  expect(cache.load({ ...input, id: 'd' }, true)).toBe(jobs[3]);
  finish.get('a')!();
  await vi.waitFor(() => expect(started).toEqual(['a','b','d']));
  finish.get('b')!();
  await vi.waitFor(() => expect(started).toEqual(['a','b','d','c']));
  finish.get('c')!(); finish.get('d')!();
  await Promise.all(jobs);
});

it('keeps a full look-ahead window beyond the twentieth game, then evicts at the bound', async () => {
  const decode = vi.fn(async () => ({}));
  const cache = createArtworkCache(async id => ({ images: [`hd-${id}`] }), decode);
  for (let id = 0; id < 64; id++) await cache.load({ ...input, id: String(id) });
  await cache.load({ ...input, id: '20' });
  expect(decode).toHaveBeenCalledTimes(64);
  await cache.load({ ...input, id: '64' });
  expect(cache.peek({ ...input, id: '0' })).toBeUndefined();
  expect(cache.peek({ ...input, id: '20' })?.src).toBe('hd-20');
});
