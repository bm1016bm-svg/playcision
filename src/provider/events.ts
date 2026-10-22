import { load } from 'cheerio';
import { z } from 'zod';
import { boundedResponseText, cancelResponse, retryAfterMilliseconds } from '../http/safety.js';
import { createQueryCache } from '../ui/query-cache.js';

const STORE = 'https://store.steampowered.com';
const refSchema = z.object({ gid: z.string().regex(/^\d{1,20}$/), clan_steamid: z.string().regex(/^\d{1,20}$/) });
type EventRef = z.infer<typeof refSchema>;
export interface SteamEvent { id: string; name: string; image: string | null; start: number; end: number; }
export function parseEventRefs(value: unknown): EventRef[] {
  const data = z.object({ success: z.literal(1), recent_events: z.array(refSchema).max(1000) }).parse(value);
  return [...new Map(data.recent_events.map(ref => [ref.gid, ref])).values()].slice(0, 100);
}
function clanId(ref: EventRef): string {
  refSchema.parse(ref);
  const id = BigInt(ref.clan_steamid) - 103582791429521408n;
  if (id <= 0n || id > 4294967295n) throw new Error('Invalid event group');
  return String(id);
}
export function parseSteamEvent(html: string, ref: EventRef): SteamEvent {
  const clan = clanId(ref);
  const rows: unknown = JSON.parse(load(html)('#application_config').attr('data-partnereventstore') ?? 'null');
  if (!Array.isArray(rows)) throw new Error('Steam event schema changed');
  const row = z.object({ gid: z.literal(ref.gid), event_name: z.string().min(1).max(500), rtime32_start_time: z.number().int().nonnegative(), rtime32_end_time: z.number().int().nonnegative(), jsondata: z.string() }).parse(rows.find(row => row?.gid === ref.gid));
  const data = z.object({ localized_capsule_image: z.array(z.string().nullable()).optional(), localized_title_image: z.array(z.string().nullable()).optional() }).parse(JSON.parse(row.jsondata));
  const images = data.localized_capsule_image ?? data.localized_title_image ?? [];
  const image = [images[7], images[0], ...images].find(value => value && /^[a-f\d]{40}\.(png|jpe?g|webp)$/i.test(value));
  return { id: row.gid, name: row.event_name, start: row.rtime32_start_time, end: row.rtime32_end_time, image: image ? `https://clan.fastly.steamstatic.com/images/${clan}/${image}` : null };
}

/** Observed Steam Store contract, not a complete catalogue or a game candidate source. */
export function createSteamEventsService(fetcher: typeof fetch = fetch, now = Date.now) {
  const index = createQueryCache<EventRef[]>({ concurrency: 1, waiting: 8, waitMs: 10_000, entries: 8, bytes: 128_000, ttlMs: 300_000 });
  const details = createQueryCache<SteamEvent>({ concurrency: 2, waiting: 16, waitMs: 30_000, entries: 100, bytes: 256_000, ttlMs: 600_000 });
  let cooldown = 0;
  async function read(url: URL, json: boolean) {
    if (now() < cooldown) throw new Error('Steam events temporarily rate limited');
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) cooldown = now() + Math.max(60_000, retryAfterMilliseconds(response.headers.get('retry-after'), new Date(now())) ?? 60_000);
    if (!response.ok || response.status !== 200 || !response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html')) {
      cancelResponse(response); throw new Error('Steam events unavailable');
    }
    return boundedResponseText(response, json ? 256_000 : 2_000_000, () => new Error('Steam event response too large'));
  }
  return async (country: string, offset: number) => {
    if (!/^[a-z]{2}$/i.test(country) || !Number.isInteger(offset) || offset < 0 || offset > 96 || offset % 6) throw new Error('Invalid event page');
    const refs = await index.load(country.toUpperCase(), async () => {
      const url = new URL('/saleaction/ajaxgetlivesaleevents', STORE);
      url.search = new URLSearchParams({ cc: country.toUpperCase(), l: 'tchinese', count: '100', origin: STORE }).toString();
      return parseEventRefs(JSON.parse(await read(url, true)));
    });
    const rows = await Promise.allSettled(refs.slice(offset, offset + 6).map(ref => details.load(ref.gid, async () => {
      const url = new URL(`/news/group/${clanId(ref)}/view/${ref.gid}?l=tchinese`, STORE);
      return parseSteamEvent(await read(url, false), ref);
    })));
    const failed = rows.filter(row => row.status === 'rejected').length;
    if (rows.length && failed === rows.length) throw new Error('Steam event details unavailable');
    return { events: rows.flatMap(row => row.status === 'fulfilled' && (!row.value.end || row.value.end * 1000 > now()) ? [row.value] : []), partial: failed > 0, nextOffset: offset + 6, hasMore: offset + 6 < refs.length, fetchedAt: new Date(now()).toISOString() };
  };
}
