import { describe, expect, it } from 'vitest';
import { parseReviews, parseAppReviews, parseRecentReviews, mixReviews } from '../src/provider/reviews.js';
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
        const { success: _, ...response } = page;
        return new Response(JSON.stringify(url.pathname.includes('histogram') ? { success: 1, results: { recent: [{ date: 86400, recommendations_up: 2, recommendations_down: 3 }] } } : { response }));
      }) as typeof fetch });
    expect((await provider.getReviewStats('10')).recent?.percent).toBe(40);
    await provider.getPlayerReviews('10');
    const requests = urls.filter(u => u.pathname.includes('GetAppReviews')).map(u => JSON.parse(u.searchParams.get('input_json')!));
    expect(requests.map(r => [r.languages, r.review_type, r.purchase_type])).toEqual([[['tchinese'], 0, 1], [['tchinese'], 1, 1], [['tchinese'], 2, 1]]);
    expect(requests.every(r => r.appid === 10 && r.filter_offtopic_activity === true)).toBe(true);
    await expect(provider.getReviewStats('../bad')).rejects.toThrow();
  });
  it('retains language statistics on histogram failure without inventing recent results', async () => {
    const provider = new SteamProvider({ country: 'TW', currency: 'TWD', language: 'tchinese', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 0,
      fetch: (async (input: URL | RequestInfo) => { const { success: _, ...response } = page; return new Response(JSON.stringify(input.toString().includes('histogram') ? {} : { response })); }) as typeof fetch });
    expect(await provider.getReviewStats('10')).toMatchObject({ recent: null, localized: { total: 10 }, from: null, to: null });
  });
});
it('validates the new service envelope, filtered pages without score totals, and rejects old or inconsistent payloads', () => {
  const { success: _, ...response } = page;
  expect(parseAppReviews({ response })).toEqual(parseReviews(page));
  expect(parseAppReviews({ response: { reviews: [review('2', false)], query_summary: { num_reviews: 1 } } }).summary).toBeNull();
  for (const value of [page, {}, { response: { success: 0, reviews: [] } }, { response: { reviews: Array(101).fill(review()) } }, { response: { ...response, query_summary: { total_positive: 8, total_negative: 2, total_reviews: 11 } } }]) expect(() => parseAppReviews(value)).toThrow();
});

it('accepts an explicitly empty service page when Steam omits the reviews field', () => {
  expect(parseAppReviews({ response: { query_summary: { num_reviews: 0 }, cursor: '', total_matching: 0 } })).toEqual({ summary: null, reviews: [] });
  expect(parseAppReviews({ response: { query_summary: { num_reviews: 0, total_positive: 0, total_negative: 0, total_reviews: 0 } } })).toEqual({ summary: { positive: 0, negative: 0, total: 0, percent: null }, reviews: [] });
  for (const value of [
    { response: {} },
    { response: { query_summary: {} } },
    { response: { query_summary: { num_reviews: 1 } } },
    { response: { query_summary: { num_reviews: '0' } } },
    { response: { query_summary: { num_reviews: 0 }, reviews: null } },
    { response: { query_summary: { num_reviews: 0 }, reviews: [review()] } },
  ]) expect(() => parseAppReviews(value)).toThrow();
});

it('keeps actual negative reviews when the localized positive page is empty', async () => {
  const requested: { languages: string[]; review_type: number }[] = [];
  const provider = new SteamProvider({ country: 'TW', currency: 'TWD', language: 'tchinese', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 0,
    fetch: (async (input: URL | RequestInfo) => {
      const query = JSON.parse(new URL(input.toString()).searchParams.get('input_json')!) as { languages: string[]; review_type: number };
      requested.push(query);
      return new Response(JSON.stringify({ response: query.review_type === 1
        ? { query_summary: { num_reviews: 0 }, total_matching: 0 }
        : { query_summary: { num_reviews: 1 }, reviews: [review('2', false)], total_matching: 1 } }));
    }) as typeof fetch });
  const result = await provider.getPlayerReviews('4115450');
  expect(result.language).toBe('tchinese');
  expect(result.reviews.map(item => [item.id, item.positive, item.language])).toEqual([['2', false, 'tchinese']]);
  expect(requested.map(item => [item.languages, item.review_type])).toEqual([[['tchinese'], 1], [['tchinese'], 2]]);
});

it('returns an honest empty list in the requested scope without fetching a different language', async () => {
  const languages: string[][] = [];
  const provider = new SteamProvider({ country: 'TW', currency: 'TWD', language: 'tchinese', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 0,
    fetch: (async (input: URL | RequestInfo) => {
      languages.push(JSON.parse(new URL(input.toString()).searchParams.get('input_json')!).languages);
      return new Response(JSON.stringify({ response: { query_summary: { num_reviews: 0 }, total_matching: 0 } }));
    }) as typeof fetch });
  expect(await provider.getPlayerReviews('10')).toEqual({ language: 'tchinese', reviews: [] });
  expect(await provider.getPlayerReviews('10', true)).toEqual({ language: 'all', reviews: [] });
  expect(languages).toEqual([['tchinese'], ['tchinese'], ['all'], ['all']]);
});
