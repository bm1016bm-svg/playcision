import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { aiDisclosureRequest, parseAiDisclosure, createAiDisclosureService } from '../src/provider/ai-disclosure.js';
import { createAiStatusCache } from '../src/web/consumer/ai-filter.js';

const page = (body = '') => `<html><div class="apphub_AppName">Test</div><div id="game_area_description">AI robot game</div>${body}</html>`;
const section = (heading: string, text = 'Developer statement') => `<div id="game_area_content_descriptors"><h2>${heading}</h2><p><i>${text}</i></p></div>`;
describe('Steam AI disclosure boundary', () => {
  it('recognizes localized disclosures and duplicate IDs without confusing mature content', () => {
    for (const title of ['AI Generated Content Disclosure', 'AI 生成內容聲明', 'AI生成コンテンツの開示']) {
      expect(parseAiDisclosure(page(section('Mature Content Description') + section(title)))).toBe('disclosed');
    }
    expect(parseAiDisclosure(page(section('Mature Content Description', 'Fighting an AI enemy')))).toBe('not-observed');
    expect(parseAiDisclosure(page())).toBe('not-observed');
  });
  it('keeps missing, gated, truncated and changed structures unknown', () => {
    for (const html of ['', '<html>error</html>', page().replace('</html>', ''), page('<form id="agecheck_form"></form>'), page(section('New heading')), page(section('AI Generated Content Disclosure', '')), page('<h2>AI Generated Content Disclosure</h2>')]) {
      expect(parseAiDisclosure(html)).toBe('unknown');
    }
  });
  it('matches minimized live Steam fixtures in three languages', () => {
    const fixtures = JSON.parse(readFileSync(new URL('./fixtures/ai-disclosures.json', import.meta.url), 'utf8')) as { headings: string[]; result: string }[];
    for (const fixture of fixtures) expect(parseAiDisclosure(page(fixture.headings.map(h => section(h)).join('')))).toBe(fixture.result);
  });
  it('restricts requests to at most three numeric IDs and no arbitrary URLs', () => {
    expect(aiDisclosureRequest.safeParse({ ids: '1808500,620,570' }).success).toBe(true);
    for (const ids of ['1,2,3,4', '0', 'https://localhost/', '../1', '1&cc=xx', '']) expect(aiDisclosureRequest.safeParse({ ids }).success).toBe(false);
    expect(aiDisclosureRequest.safeParse({ ids: '620', url: 'http://localhost' }).success).toBe(false);
  });
});

describe('bounded shared disclosure lookups', () => {
  const sleep = async () => {};
  it('deduplicates concurrent games and shares results across callers', async () => {
    const fetcher = vi.fn(async () => new Response(page(section('AI Generated Content Disclosure')), { headers: { 'content-type': 'text/html' } }));
    const service = createAiDisclosureService(fetcher, Date.now, sleep);
    expect(await Promise.all([service('620', 'tw'), service('620', 'TW'), service('620', 'tw')])).toEqual(['disclosed', 'disclosed', 'disclosed']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://store.steampowered.com');
    expect(url.searchParams.get('l')).toBe('english');
    expect(options.redirect).toBe('manual');
    expect(options.headers).toBeUndefined();
  });
  it('returns unknown for redirects, non-HTML, oversized pages and network errors', async () => {
    for (const response of [new Response('', { status: 302 }), new Response('{}', { headers: { 'content-type': 'application/json' } }), new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'content-type': 'text/html' } })]) {
      expect(await createAiDisclosureService(async () => response, Date.now, sleep)('620', 'tw')).toBe('unknown');
    }
    expect(await createAiDisclosureService(async () => { throw new Error('timeout'); }, Date.now, sleep)('620', 'tw')).toBe('unknown');
  });
  it('respects upstream rate limiting without retries or more game requests during cooldown', async () => {
    let clock = 0;
    const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }));
    const service = createAiDisclosureService(fetcher, () => clock, sleep);
    expect(await service('1', 'tw')).toBe('unknown');
    clock = 90_000;
    expect(await service('2', 'tw')).toBe('unknown');
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock = 121_000;
    await service('3', 'tw');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not fetch invalid IDs or country codes', async () => {
    const fetcher = vi.fn(); const service = createAiDisclosureService(fetcher, Date.now, sleep);
    await service('../admin', 'tw'); await service('620', 'tw&x=1');
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('browser AI observations', () => {
  it('does not treat failed or malformed responses as no AI; expires observations', async () => {
    let now = 0;
    const cache = createAiStatusCache(async () => new Response(JSON.stringify({ results: [{ id: '1', status: 'disclosed' }, { id: '2', status: 'not-observed' }, { id: '3', status: 'fake' }] })), () => now);
    await cache.check(['1', '2', '3'], new AbortController().signal);
    expect([cache.peek('1'), cache.peek('2'), cache.peek('3')]).toEqual(['disclosed', 'not-observed', 'unknown']);
    now = 61_000; expect(cache.peek('3')).toBeUndefined(); expect(cache.peek('1')).toBe('disclosed');
    now = 301_000; expect(cache.peek('1')).toBeUndefined();
    const failed = createAiStatusCache(async () => { throw new Error('offline'); });
    await failed.check(['1'], new AbortController().signal); expect(failed.peek('1')).toBe('unknown');
  });
  it('discarded requests cannot populate the cache after the user changes filters', async () => {
    const controller = new AbortController(); controller.abort();
    const cache = createAiStatusCache(async () => new Response('{"results":[]}'));
    await expect(cache.check(['1'], controller.signal)).rejects.toThrow();
    expect(cache.peek('1')).toBeUndefined();
  });
});
