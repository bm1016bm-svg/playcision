import { describe, expect, it } from 'vitest';
import { parseReviews, parseRecentReviews, mixReviews } from '../src/provider/reviews.js';
import { SteamProvider } from '../src/provider/steam.js';
const review = (id = '1', positive = true) => ({ recommendationid: id, author: { steamid: '76561198000000001', personaname: '玩家 <script>', playtime_forever: 120 }, review: '真實文字\n第二行', voted_up: positive, timestamp_created: 1700000000, language: 'tchinese' });
const page = { success: 1, query_summary: { total_positive: 8, total_negative: 2, total_reviews: 10 }, reviews: [review()] };
describe('Steam reviews boundary', () => {
  it('preserves localized text, names, verdict and verified counts', () => {
    const result = parseReviews(page);
    expect(result.summary).toEqual({ positive: 8, negative: 2, total: 10, percent: 80 });
    expect(result.reviews[0]).toMatchObject({ name: '玩家 <script>', text: '真實文字\n第二行', hours: 2, positive: true });
  });
  it('handles empty reviews and missing optional name without inventing a person', () => {
    expect(parseReviews({ success: 1, query_summary: { num_reviews: 1 }, reviews: [review()] }).summary).toBeNull();
    expect(parseReviews({ success: 1, reviews: [] })).toEqual({ summary: null, reviews: [] });
    expect(parseReviews({ success: 1, reviews: [{ ...review(), author: { steamid: '76561198000000001' } }] }).reviews[0]?.name).toBe('76561198000000001');
  });
  it('rejects schema drift, inconsistent totals and invalid identifiers', () => {
    for (const payload of [{}, { success: 0, reviews: [] }, { ...page, query_summary: { total_positive: 8, total_negative: 2, total_reviews: 999 } }, { success: 1, reviews: [{ ...review(), author: { steamid: '<bad>' } }] }]) expect(() => parseReviews(payload)).toThrow();
  });
  it('calculates recent statistics only from contiguous daily buckets', () => {
    const result = parseRecentReviews({ success: 1, results: { recent: [{ date: 86400, recommendations_up: 3, recommendations_down: 1 }, { date: 172800, recommendations_up: 1, recommendations_down: 1 }] } });
    expect(result).toEqual({ summary: { positive: 4, negative: 2, total: 6, percent: 67 }, from: 86400, to: 259200 });
    expect(() => parseRecentReviews({ success: 1, results: { recent: [] } })).toThrow();
    expect(() => parseRecentReviews({ success: 1, results: { recent: [{ date: 1, recommendations_up: 1, recommendations_down: 0 }, { date: 5, recommendations_up: 1, recommendations_down: 0 }] } })).toThrow();
  });
  it('mixes actual verdicts, deduplicates and handles one-sided lists', () => {
    const positive = parseReviews({ success: 1, reviews: [review('1'), review('3')] }).reviews;
    const negative = parseReviews({ success: 1, reviews: [review('2', false)] }).reviews;
    expect(mixReviews(positive, negative).map(r => r.id)).toEqual(['1', '2', '3']);
    expect(mixReviews(positive, positive)).toHaveLength(2);
    expect(mixReviews([], negative)).toEqual(negative);
  });
  it('separates language summaries from recent buckets and requests both verdicts', async () => {
    const urls: URL[] = [];
    const provider = new SteamProvider({ country: 'TW', currency: 'TWD', language: 'tchinese', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 0,
      fetch: (async (input: URL | RequestInfo) => {
        const url = new URL(input.toString()); urls.push(url);
        return new Response(JSON.stringify(url.pathname.includes('histogram') ? { success: 1, results: { recent: [{ date: 86400, recommendations_up: 2, recommendations_down: 3 }] } } : page));
      }) as typeof fetch });
    expect((await provider.getReviewStats('10')).recent?.percent).toBe(40);
    await provider.getPlayerReviews('10');
    expect(urls.filter(u => u.pathname.includes('appreviews')).map(u => [u.searchParams.get('language'), u.searchParams.get('review_type'), u.searchParams.get('purchase_type')])).toEqual([['tchinese', 'all', 'all'], ['tchinese', 'positive', 'all'], ['tchinese', 'negative', 'all']]);
    await expect(provider.getReviewStats('../bad')).rejects.toThrow();
  });
  it('retains language statistics on histogram failure without inventing recent results', async () => {
    const provider = new SteamProvider({ country: 'TW', currency: 'TWD', language: 'tchinese', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 0,
      fetch: (async (input: URL | RequestInfo) => new Response(JSON.stringify(input.toString().includes('histogram') ? {} : page))) as typeof fetch });
    expect(await provider.getReviewStats('10')).toMatchObject({ recent: null, localized: { total: 10 }, from: null, to: null });
  });
});
