import { expect, it } from 'vitest';
import { discoveryRequest } from '../src/ui/discovery.js';

const request = { source: 'popular', genre: 'RPG', platform: 'windows', price: 'free', players: 'multi', earlyAccess: 'all', offset: '0' };
it('validates bounded discovery pages and rejects unsupported parameters', () => {
  expect(discoveryRequest.parse(request).offset).toBe(0);
  for (const offset of ['-50', '1', '1050', 'NaN']) expect(discoveryRequest.safeParse({ ...request, offset }).success).toBe(false);
  expect(discoveryRequest.safeParse({ ...request, platform: 'unknown' }).success).toBe(false);
  expect(discoveryRequest.safeParse({ ...request, arbitrary: true }).success).toBe(false);
});
