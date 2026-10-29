import { describe, expect, it, vi } from 'vitest';
import { createAiStatusCache } from '../src/web/consumer/ai-filter.js';
import { createAiViewObservations } from '../src/web/consumer/ai-view.js';

describe('mounted AI candidate observations', () => {
  it('finishes 501 candidates without a 500-entry shared LRU making checked cards unchecked again', async () => {
    const ids = Array.from({ length: 501 }, (_, index) => String(index + 1));
    const fetcher = vi.fn<typeof fetch>(async url => {
      const batch = new URL(String(url), 'http://local').searchParams.get('ids')!.split(',');
      return Response.json({ results: batch.map(id => ({ id, status: id === '1' ? 'disclosed' : id === '2' ? 'unknown' : 'not-observed' })) });
    });
    const cache = createAiStatusCache(fetcher, () => 0);
    const view = createAiViewObservations(cache, () => 0);
    view.sync(ids);
    for (let pass = 0; pass < 170 && view.batch().length; pass++) {
      view.record(await cache.check(view.batch(), new AbortController().signal));
      view.sync(ids);
    }
    expect(fetcher).toHaveBeenCalledTimes(Math.ceil(ids.length / 3));
    expect(view.unchecked()).toEqual([]);
    expect(view.batch()).toEqual([]);
    expect(ids.filter(id => cache.peek(id) !== undefined)).toHaveLength(500);
    expect(cache.peek('1')).toBeUndefined();
    expect(view.peek('1')).toBe('disclosed');
    expect(view.peek('2')).toBe('unknown');
    expect(view.peek('501')).toBe('not-observed');
  });

  it('retries expired unknowns without starving new cards or misclassifying them as non-AI', async () => {
    let now = 0;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ results: [{ id: '1', status: 'unknown' }] }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: '2', status: 'not-observed' }] }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: '1', status: 'disclosed' }] }));
    const cache = createAiStatusCache(fetcher, () => now);
    const view = createAiViewObservations(cache, () => now);
    view.sync(['1']); view.record(await cache.check(view.batch(), new AbortController().signal));
    now = 60001;
    view.sync(['1', '2']);
    expect(cache.peek('1')).toBeUndefined();
    expect(view.peek('1')).toBe('unknown');
    expect(view.unchecked()).toEqual(['2']);
    expect(view.batch()).toEqual(['2']);
    view.record(await cache.check(view.batch(), new AbortController().signal));
    view.sync(['1', '2']);
    expect(view.unchecked()).toEqual([]);
    expect(view.batch()).toEqual(['1']);
    view.record(await cache.check(view.batch(), new AbortController().signal));
    expect(view.peek('1')).toBe('disclosed');
    expect(view.batch()).toEqual([]);
  });

  it('keeps previously disclosed cards excluded while refreshing an expired observation', async () => {
    let now = 0;
    const cache = createAiStatusCache(async () => Response.json({ results: [{ id: '1', status: 'disclosed' }] }), () => now);
    const view = createAiViewObservations(cache, () => now);
    view.sync(['1']); view.record(await cache.check(['1'], new AbortController().signal));
    now = 300001; view.sync(['1']);
    expect(view.peek('1')).toBe('disclosed');
    expect(view.unchecked()).toEqual([]);
    expect(view.batch()).toEqual(['1']);
  });

  it('drops removed candidate observations and ignores results arriving for an old filter', async () => {
    const cache = createAiStatusCache(async () => Response.json({ results: [{ id: '1', status: 'not-observed' }] }), () => 0);
    const view = createAiViewObservations(cache, () => 0);
    view.sync(['1']); view.record(await cache.check(['1'], new AbortController().signal));
    view.sync(['2']);
    view.record([{ id: '1', status: 'disclosed', expires: 300000 }]);
    expect(view.peek('1')).toBeUndefined();
    expect(view.unchecked()).toEqual(['2']);
    view.sync([]);
    expect(view.unchecked()).toEqual([]);
    expect(view.peek('2')).toBeUndefined();
  });

  it('reuses recent shared observations for a new view without sharing its working set', async () => {
    const cache = createAiStatusCache(async () => Response.json({ results: [{ id: '1', status: 'not-observed' }] }), () => 0);
    await cache.check(['1'], new AbortController().signal);
    const first = createAiViewObservations(cache, () => 0);
    const second = createAiViewObservations(cache, () => 0);
    first.sync(['1']); second.sync(['1', '2']); first.sync([]);
    expect(first.peek('1')).toBeUndefined();
    expect(second.peek('1')).toBe('not-observed');
    expect(second.batch()).toEqual(['2']);
  });
});
