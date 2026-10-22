import { load } from 'cheerio';
import { z } from 'zod';
import { boundedResponseText, cancelResponse, retryAfterMilliseconds } from '../http/safety.js';
import { createQueryCache } from '../ui/query-cache.js';
import { parseEventRefs, parseSteamEvent } from './events.js';

const STORE = 'https://store.steampowered.com';
const capsule = z.object({ type: z.string(), id: z.number().int().positive() });
export const eventCatalogSchema = z.object({
  tagged_items: z.array(z.object({ capsule })).max(10000).optional(),
  sale_sections: z.array(z.object({ section_type: z.string(), unique_id: z.number().int().optional(), capsules: z.array(capsule).max(10000).optional() })).max(200).optional(),
});

/** Runtime membership snapshots. No full catalogue or client-supplied URLs. */
export function createEventCandidates(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = createQueryCache<string[]>({ concurrency: 2, waiting: 16, waitMs: 30_000, entries: 32, bytes: 4_000_000, ttlMs: 300_000 });
  const index = createQueryCache<ReturnType<typeof parseEventRefs>>({ concurrency: 1, waiting: 16, waitMs: 15_000, entries: 8, bytes: 128_000, ttlMs: 300_000 });
  let cooldown = 0;
  async function read(url: URL, json = true) {
    if (now() < cooldown) throw new Error('Steam 活動暫時限流，請稍後重試。');
    const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
    if (response.status === 429) cooldown = now() + Math.max(60_000, retryAfterMilliseconds(response.headers.get('retry-after'), new Date(now())) ?? 60_000);
    if (!response.ok || !response.headers.get('content-type')?.includes(json ? 'application/json' : 'text/html')) {
      cancelResponse(response); throw new Error('Steam 活動名單載入失敗，請重試。');
    }
    return boundedResponseText(response, 2_000_000, () => new Error('Steam 活動回應超過上限'));
  }
  return async (country: string, id: string) => {
    if (!/^[a-z]{2}$/i.test(country) || !/^\d{1,20}$/.test(id)) throw new Error('Invalid activity');
    country = country.toUpperCase();
    return cache.load(JSON.stringify([country, id]), async () => {
      const refs = await index.load(country, async () => parseEventRefs(JSON.parse(await read(new URL(`/saleaction/ajaxgetlivesaleevents?cc=${country}&l=english&count=100`, STORE)))));
      const ref = refs.find(ref => ref.gid === id);
      if (!ref) throw new Error('活動已結束或無法取得，請重新選擇。');
      const clan = String(BigInt(ref.clan_steamid) - 103582791429521408n);
      const html = await read(new URL(`/news/group/${clan}/view/${id}?l=tchinese`, STORE), false);
      const metadata = parseSteamEvent(html, ref);
      if (metadata.end && metadata.end * 1000 <= now()) throw new Error('活動已結束，請重新選擇。');
      const row = z.object({ jsondata: z.string(), announcement_body: z.object({ gid: z.string().regex(/^\d+$/) }).optional() }).parse(JSON.parse(load(html)('#application_config').attr('data-partnereventstore')!).find((row: { gid: string }) => row.gid === id));
      const data = eventCatalogSchema.parse(JSON.parse(row.jsondata));
      const capsules = [...(data.tagged_items ?? []).map(item => item.capsule), ...(data.sale_sections ?? []).flatMap(section => section.capsules ?? [])];
      const ids = new Set(capsules.filter(item => item.type === 'game').map(item => String(item.id)));
      const packs = [...new Map(capsules.filter(item => item.type === 'sub' || item.type === 'bundle').map(item => [item.type + item.id, item])).values()];
      if (packs.length > 200) throw new Error('活動套組數量超過查詢上限');
      for (let offset = 0; offset < packs.length; offset += 50) {
        const url = new URL('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/');
        url.searchParams.set('input_json', JSON.stringify({ ids: packs.slice(offset, offset + 50).map(item => item.type === 'sub' ? { packageid: item.id } : { bundleid: item.id }), context: { language: 'english', country_code: country, steam_realm: 1 }, data_request: { include_included_items: true } }));
        const result = z.object({ response: z.object({ store_items: z.array(z.object({ included_appids: z.array(z.number().int().positive()).optional() })) }) }).parse(JSON.parse(await read(url)));
        result.response.store_items.forEach(item => item.included_appids?.forEach(id => ids.add(String(id))));
      }
      // Tagged capsules are the event's explicit membership. Dynamic-only events need their item browser.
      if (!ids.size) {
        for (const section of (data.sale_sections ?? []).filter(section => section.section_type === 'sale_item_browser')) {
          if (!row.announcement_body || section.unique_id === undefined) throw new Error('Steam 活動查詢欄位已變更');
          const url = new URL('/saleaction/ajaxgetsaledynamicappquery', STORE);
          url.search = new URLSearchParams({ cc: country, l: 'english', clanAccountID: clan, clanAnnouncementGID: row.announcement_body.gid, sectionuniqueid: String(section.unique_id), flavor: 'popular', start: '0', count: '10000', return_capsules: 'true', origin: STORE }).toString();
          const result = z.object({ store_item_keys: z.array(z.string()), match_count: z.number().int().nonnegative() }).parse(JSON.parse(await read(url)));
          if (result.match_count > result.store_item_keys.length) throw new Error('活動名單未完整回傳，請稍後重試。');
          result.store_item_keys.forEach(key => { const match = /^app_(\d+)$/.exec(key); if (match) ids.add(match[1]!); });
        }
      }
      if (ids.size > 10000) throw new Error('活動遊戲數量超過查詢上限');
      if (!data.sale_sections && !data.tagged_items) throw new Error('Steam 活動名單格式已變更');
      return [...ids].sort((a, b) => Number(a) - Number(b));
    });
  };
}
