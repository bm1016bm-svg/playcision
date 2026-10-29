import { schemaDrift } from './errors.js';
export interface ReviewSummary { positive: number; negative: number; total: number; percent: number | null }
export interface ReviewStats { recent: ReviewSummary | null; localized: ReviewSummary | null; language: string; from: number | null; to: number | null }
export interface PlayerReview { id: string; steamId: string; name: string; text: string; positive: boolean; created: number; language: string; hours: number; free: boolean }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
function count(value: unknown): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw schemaDrift('reviews', 'Invalid review count'); return value; }
export function summary(positive: number, negative: number): ReviewSummary {
  const total = positive + negative;
  return { positive, negative, total, percent: total ? Math.round(positive / total * 100) : null };
}
export function parseReviews(payload: unknown): { summary: ReviewSummary | null; reviews: PlayerReview[] } {
  const root = record(payload);
  if (root.success !== 1 || !Array.isArray(root.reviews)) throw schemaDrift('reviews', 'Missing successful review list');
  const rawSummary = record(root.query_summary);
  const q = ['total_positive', 'total_negative', 'total_reviews'].some(key => key in rawSummary) ? rawSummary : null;
  const stats = q ? summary(count(q.total_positive), count(q.total_negative)) : null;
  if (q && stats?.total !== count(q.total_reviews)) throw schemaDrift('reviews', 'Inconsistent review totals');
  const reviews = root.reviews.map(item => {
    const r = record(item), a = record(r.author);
    if (typeof r.recommendationid !== 'string' || !/^\d+$/.test(r.recommendationid) || typeof a.steamid !== 'string' || !/^\d{17}$/.test(a.steamid) || typeof r.review !== 'string' || typeof r.voted_up !== 'boolean' || typeof r.language !== 'string') throw schemaDrift('reviews', 'Invalid review');
    return { id: r.recommendationid, steamId: a.steamid, name: typeof a.personaname === 'string' ? a.personaname : a.steamid, text: r.review, positive: r.voted_up, created: count(r.timestamp_created), language: r.language, hours: Math.round(count(a.playtime_forever ?? 0) / 6) / 10, free: r.received_for_free === true };
  });
  return { summary: stats, reviews };
}
/** IUserReviewsService returns a Web API envelope; HTTP status is checked by the transport. */
export function parseAppReviews(payload: unknown): { summary: ReviewSummary | null; reviews: PlayerReview[] } {
  const root = record(record(payload).response);
  const page = record(root.query_summary);
  // Steam omits the repeated reviews field on a successful empty page. An
  // explicit zero page count distinguishes that case from a malformed response.
  const reviews = root.reviews === undefined && page.num_reviews === 0 ? [] : root.reviews;
  if ('success' in root || !Array.isArray(reviews) || reviews.length > 100) throw schemaDrift('reviews', 'Missing GetAppReviews response');
  if ('num_reviews' in page && count(page.num_reviews) !== reviews.length) throw schemaDrift('reviews', 'Inconsistent review page count');
  return parseReviews({ ...root, reviews, success: 1 });
}
export function parseRecentReviews(payload: unknown): { summary: ReviewSummary; from: number; to: number } {
  const root = record(payload), result = record(root.results);
  if (root.success !== 1 || !Array.isArray(result.recent) || result.recent.length === 0 || result.recent.length > 31) throw schemaDrift('review histogram', 'Missing daily recent review buckets');
  let positive = 0, negative = 0;
  const dates: number[] = [];
  for (const item of result.recent) {
    const r = record(item); dates.push(count(r.date));
    positive += count(r.recommendations_up); negative += count(r.recommendations_down);
  }
  dates.sort((a, b) => a - b);
  if (dates.some((date, i) => i > 0 && date - dates[i - 1]! !== 86400)) throw schemaDrift('review histogram', 'Non-contiguous daily buckets');
  return { summary: summary(positive, negative), from: dates[0]!, to: dates.at(-1)! + 86400 };
}
export function mixReviews(positive: PlayerReview[], negative: PlayerReview[]): PlayerReview[] {
  const result: PlayerReview[] = [], seen = new Set<string>();
  for (let i = 0; i < Math.max(positive.length, negative.length); i++) {
    for (const review of [positive[i], negative[i]]) if (review && !seen.has(review.id)) { seen.add(review.id); result.push(review); }
  }
  return result;
}
