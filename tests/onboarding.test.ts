import { expect, it } from 'vitest';
import { availableGuideSteps, GUIDE_STEPS, readGuides, rememberGuide } from '../src/web/consumer/onboarding.js';
import { layoutGuide } from '../src/web/consumer/guide-layout.js';
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

it('omits unavailable collection controls rather than pointing at the collection title', () => {
  expect(availableGuideSteps('saved', () => false)).toEqual([]);
  const steps = availableGuideSteps('saved', selector => selector.includes('saved-games'));
  expect(steps).toHaveLength(1);
  expect(steps[0]!.text).not.toContain('手氣');
});

it('starts recommendation teaching at the intro and has no AI exclusion step', () => {
  expect(GUIDE_STEPS.recommended).toHaveLength(2);
  expect(GUIDE_STEPS.recommended[0]!.target).toContain('recommendation-scroll');
  expect(GUIDE_STEPS.recommended.every(step => !/AI|filter/i.test(step.text + step.target))).toBe(true);
});

it.each([[320, 568], [390, 844], [844, 390], [1440, 900]])('keeps tutorial copy above controls and arrows at real targets in %i × %i', (w, h) => {
  const footer = h - 78;
  for (const target of [
    { x: 22, y: 35, w: 48, h: 48 },
    { x: w - 70, y: 50, w: 48, h: 48 },
    { x: w / 2 - 75, y: h / 2 - 25, w: 150, h: 50 },
    { x: w / 2 - 60, y: h - 155, w: 120, h: 46 },
  ]) {
    const layout = layoutGuide(target, { w, h }, { w: Math.min(300, w - 48), h: 116 }, footer);
    expect(layout.target).toEqual(target);
    expect(layout.note.x).toBeGreaterThanOrEqual(16);
    expect(layout.note.x + layout.note.w).toBeLessThanOrEqual(w - 16);
    expect(layout.note.y).toBeGreaterThanOrEqual(16);
    expect(layout.note.y + layout.note.h).toBeLessThanOrEqual(footer - 16);
    const dx = Math.max(target.x - layout.end.x, 0, layout.end.x - target.x - target.w);
    const dy = Math.max(target.y - layout.end.y, 0, layout.end.y - target.y - target.h);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0);
    expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(8);
    expect(layout.path).not.toMatch(/NaN|Infinity/);
  }
});

it('keeps filter teaching clear of top controls while pointing at the bottom Apply button', () => {
  const controls = { x: 24, y: 24, w: 342, h: 46 };
  const target = { x: 130, y: 750, w: 230, h: 52 };
  const layout = layoutGuide(target, { w: 390, h: 844 }, { w: 300, h: 130 }, controls);
  expect(layout.note.y).toBeGreaterThanOrEqual(controls.y + controls.h + 20);
  expect(layout.note.y + layout.note.h).toBeLessThan(target.y);
  expect(layout.target).toEqual(target);
});
