import { load } from 'cheerio/slim';
import { z } from 'zod';
import { boundedResponseText, cancelResponse, retryAfterMilliseconds } from '../http/safety.js';
import { createQueryCache } from '../ui/query-cache.js';

export type AiDisclosureStatus = 'disclosed' | 'not-observed' | 'unknown';
export const aiDisclosureRequest = z.object({
  ids: z.string().regex(/^[1-9]\d{0,9}(?:,[1-9]\d{0,9}){0,2}$/),
}).strict();
const aiHeadings = new Set(['AI Generated Content Disclosure', 'AI 生成內容聲明', 'AI生成コンテンツの開示']);
const matureHeadings = new Set(['Mature Content Description', '成人內容說明', '大人向けコンテンツの説明']);

/** Store HTML is experimental. Absence is an observation, never proof of no AI use. */
export function parseAiDisclosure(html: string): AiDisclosureStatus {
  const $ = load(html);
  if ($('#agecheck_form').length || !$('.apphub_AppName').text().trim()
    || !$('#game_area_description').length || !/<\/html>\s*$/i.test(html)) return 'unknown';
  // Steam repeats this ID for AI and mature disclosures on the same page.
  const sections = $('[id="game_area_content_descriptors"]');
  let unrecognized = false;
  for (const section of sections.toArray()) {
    const heading = $(section).find('h2').text().replace(/\s+/g, ' ').trim();
    if (aiHeadings.has(heading)) {
      if ($(section).find('i').text().trim()) return 'disclosed';
      unrecognized = true;
    } else if (!matureHeadings.has(heading)) unrecognized = true;
  }
  // Detect a known heading moved outside the expected container as schema drift.
  if ($('h2').toArray().some(h => aiHeadings.has($(h).text().trim()))) return 'unknown';
  return unrecognized ? 'unknown' : 'not-observed';
}

export function createAiDisclosureService(fetcher: typeof fetch = fetch, now = Date.now, sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {
  const cache = createQueryCache<AiDisclosureStatus>({ concurrency: 2, waiting: 24, waitMs: 10_000, entries: 500, bytes: 128_000, ttlMs: 300_000 });
  let cooldownUntil = 0;
  return async (appId: string, country: string): Promise<AiDisclosureStatus> => {
    if (!/^[1-9]\d{0,9}$/.test(appId) || !/^[a-z]{2}$/i.test(country)) return 'unknown';
    try {
      return await cache.load(`${country.toUpperCase()}:${appId}`, async () => {
        if (now() < cooldownUntil) return 'unknown';
        try {
          const url = new URL(`https://store.steampowered.com/app/${appId}/`);
          // A fixed language keeps cache shared across UI languages; never forward user cookies.
          url.searchParams.set('l', 'english'); url.searchParams.set('cc', country.toLowerCase());
          const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(8_000) });
          if (response.status === 429) {
            const delay = retryAfterMilliseconds(response.headers.get('retry-after'), new Date(now()));
            cooldownUntil = now() + Math.max(60_000, Number.isFinite(delay) ? delay! : 60_000);
          }
          if (response.status !== 200 || (response.url && response.url !== url.href)
            || !response.headers.get('content-type')?.includes('text/html')) {
            cancelResponse(response); return 'unknown';
          }
          return parseAiDisclosure(await boundedResponseText(response, 1024 * 1024, () => new Error('Steam page too large')));
        } catch { return 'unknown'; }
        finally { await sleep(400); }
      });
    } catch { return 'unknown'; } // Bounded queue overload must never become a negative classification.
  };
}
