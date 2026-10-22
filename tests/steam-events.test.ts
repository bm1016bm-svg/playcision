import { expect, it, vi } from 'vitest';
import { parseEventRefs, parseSteamEvent, createSteamEventsService } from '../src/provider/events.js';
const ref = { gid: '123', clan_steamid: '103582791475677803' };
const data = { gid: '123', event_name: '活動名稱', rtime32_start_time: 100, rtime32_end_time: 200, jsondata: JSON.stringify({ localized_capsule_image: ['a'.repeat(40) + '.jpg'] }) };
const html = (row = data) => `<div id="application_config" data-partnereventstore='${JSON.stringify([row])}'></div>`;
it('parses localized event metadata and constructs only Steam image URLs', () => {
  expect(parseEventRefs({ success: 1, recent_events: [ref, ref] })).toEqual([ref]);
  expect(parseSteamEvent(html(), ref)).toEqual({ id: '123', name: '活動名稱', start: 100, end: 200, image: `https://clan.fastly.steamstatic.com/images/46156395/${'a'.repeat(40)}.jpg` });
  expect(parseSteamEvent(html({ ...data, jsondata: '{}' }), ref).image).toBeNull();
  expect(parseSteamEvent(html({ ...data, jsondata: '{"localized_capsule_image":["https://evil.test/x"]}' }), ref).image).toBeNull();
});
it('rejects malformed, mismatched and changed Steam responses', () => {
  for (const value of [{}, { success: 1, recent_events: [{ ...ref, gid: '../x' }] }]) expect(() => parseEventRefs(value)).toThrow();
  for (const value of ['', '<html>blocked</html>', html({ ...data, gid: '456' }), html({ ...data, jsondata: '{invalid' })]) expect(() => parseSteamEvent(value, ref)).toThrow();
  expect(() => parseSteamEvent(html(), { ...ref, clan_steamid: '1' })).toThrow();
});
it('shares cached requests and excludes expired activities', async () => {
  const fetcher = vi.fn(async (url: URL | RequestInfo) => String(url).includes('ajaxget') ? new Response(JSON.stringify({ success: 1, recent_events: [ref] }), { headers: { 'content-type': 'application/json' } }) : new Response(html(), { headers: { 'content-type': 'text/html' } }));
  const service = createSteamEventsService(fetcher, () => 150_000);
  const [a, b] = await Promise.all([service('TW', 0), service('TW', 0)]);
  expect(a.events).toHaveLength(1); expect(b.events).toEqual(a.events); expect(fetcher).toHaveBeenCalledTimes(2);
  expect((await createSteamEventsService(fetcher, () => 201_000)('TW', 0)).events).toEqual([]);
});
it('bounds pages and honors upstream rate limits without retry storms', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '120' } }));
  const service = createSteamEventsService(fetcher, () => 0);
  await expect(service('TW', 1)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
  await expect(service('TW', 0)).rejects.toThrow();
  await expect(service('US', 0)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
});
