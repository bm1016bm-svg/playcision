import { expect, it } from 'vitest';
import { discoveryRequest, MAX_DISCOVERY_OFFSET } from '../src/ui/discovery.js';

const request = { source: 'popular', genre: 'RPG', platform: 'windows', price: 'free', players: 'multi', earlyAccess: 'all', offset: '0' };
it('validates bounded discovery pages and rejects unsupported parameters', () => {
  expect(discoveryRequest.parse(request).offset).toBe(0);
  for (const offset of ['-50', '1', String(MAX_DISCOVERY_OFFSET + 50), 'NaN']) expect(discoveryRequest.safeParse({ ...request, offset }).success).toBe(false);
  expect(discoveryRequest.safeParse({ ...request, platform: 'unknown' }).success).toBe(false);
  expect(discoveryRequest.safeParse({ ...request, arbitrary: true }).success).toBe(false);
});
it('continues ordinary sources beyond the former 1,000-result cutoff without widening event bounds', () => {
  for (const offset of ['1050', '5000', String(MAX_DISCOVERY_OFFSET)]) expect(discoveryRequest.parse({ ...request, offset }).offset).toBe(Number(offset));
  expect(discoveryRequest.safeParse({ ...request, source: 'event:123', offset: '10050' }).success).toBe(false);
});
