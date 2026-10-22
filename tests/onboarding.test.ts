import { expect, it } from 'vitest';
import { readGuides, rememberGuide } from '../src/web/consumer/onboarding.js';
it('remembers each page independently across reloads', () => {
  let value: string | null = null;
  const storage = { getItem: () => value, setItem: (_: string, next: string) => { value = next; } };
  expect(readGuides(storage)).toEqual([]);
  rememberGuide(storage, 'discover'); rememberGuide(storage, 'saved'); rememberGuide(storage, 'discover');
  expect(readGuides(storage)).toEqual(['discover', 'saved']);
  expect(readGuides(storage)).not.toContain('library');
});
it('ignores malformed progress and tolerates blocked storage', () => {
  expect(readGuides({ getItem: () => '{invalid' })).toEqual([]);
  expect(readGuides({ getItem: () => '["discover","unknown",null]' })).toEqual(['discover']);
  expect(() => rememberGuide({ getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } }, 'discover')).not.toThrow();
});
