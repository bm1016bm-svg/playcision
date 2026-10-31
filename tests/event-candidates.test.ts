import { expect, it, vi } from 'vitest';
import { createEventCandidates, eventCatalogSchema } from '../src/provider/event-candidates.js';
import { discoveryRequest } from '../src/ui/discovery.js';
import { DEFAULT_FILTERS, gameMatchesFilters } from '../src/web/consumer/rules.js';
import type { Game } from '../src/web/types.js';

const ref = { gid: '123', clan_steamid: '103582791475677803' };
function transport(data: unknown, extra: unknown = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname.includes('ajaxgetlivesaleevents')) return Response.json({ success: 1, recent_events: [ref] });
    if (url.pathname.includes('/news/')) {
      const row = { gid: '123', event_name: '測試活動', rtime32_start_time: 1, rtime32_end_time: 1000, jsondata: JSON.stringify(data), announcement_body: { gid: '124' } };
      return new Response(`<div id="application_config" data-partnereventstore='${JSON.stringify([row])}'></div>`, { headers: { 'content-type': 'text/html' } });
    }
    return Response.json(extra);
  });
}
it('collects beyond the initial page, expands packages, deduplicates and caches membership', async () => {
  const fetcher = transport({ tagged_items: Array.from({ length: 75 }, (_, n) => ({ capsule: { type: 'game', id: n + 1 } })), sale_sections: [{ section_type: 'items', capsules: [{ type: 'game', id: 1 }, { type: 'sub', id: 90 }] }] }, { response: { store_items: [{ included_appids: [75, 76] }] } });
  const service = createEventCandidates(fetcher, () => 100);
  const ids = await service('TW', '123');
  expect(ids).toHaveLength(76); expect(ids.slice(50)).toContain('76');
  expect(await service('TW', '123')).toEqual(ids); expect(fetcher).toHaveBeenCalledTimes(3);
  await expect(service('TW', '../evil')).rejects.toThrow();
  await expect(service('TW', '456')).rejects.toThrow();
});
it('supports dynamic-only activity membership and fails instead of claiming truncated lists are complete', async () => {
  const data = { sale_sections: [{ section_type: 'sale_item_browser', unique_id: 5 }] };
  expect(await createEventCandidates(transport(data, { store_item_keys: ['app_8', 'app_9'], match_count: 2 }), () => 100)('TW', '123')).toEqual(['8', '9']);
  await expect(createEventCandidates(transport(data, { store_item_keys: ['app_8'], match_count: 20 }), () => 100)('TW', '123')).rejects.toThrow('未完整');
  expect(() => eventCatalogSchema.parse({ tagged_items: [{ capsule: { id: '../x', type: 'game' } }] })).toThrow();
  await expect(createEventCandidates(transport({}), () => 100)('TW', '123')).rejects.toThrow('格式');
});
it('uses intersecting activity filters, authoritative player categories, macOS and unknown prices', () => {
  const game: Game = { id: '1', store: 'steam', name: 'Test', url: '', developers: [], publishers: [], tags: ['Action'], genres: [], platforms: ['macos'], playerCategories: [1, 9], earlyAccess: true, mature: false, price: { current: { minor: 20000, currency: 'TWD' }, original: null, discountPercent: 0, isFree: false } };
  const filter = { ...DEFAULT_FILTERS, genre: 'Action', platform: 'mac' as const, players: 'multi' as const, price: 'under300' as const, earlyAccess: 'only' as const };
  expect(gameMatchesFilters(game, filter)).toBe(true);
  expect(gameMatchesFilters(game, { ...filter, players: 'single' })).toBe(false);
  expect(gameMatchesFilters({ ...game, price: { ...game.price, current: null } }, { ...filter, price: 'free' })).toBe(false);
  expect(gameMatchesFilters(game, { ...filter, genre: 'RPG' })).toBe(false);
  const query = { source: 'event:123', genre: 'all', platform: 'all', players: 'all', price: 'all', earlyAccess: 'all', offset: 1500 };
  expect(discoveryRequest.safeParse(query).success).toBe(true);
  expect(discoveryRequest.safeParse({ ...query, source: 'popular' }).success).toBe(true);
});
