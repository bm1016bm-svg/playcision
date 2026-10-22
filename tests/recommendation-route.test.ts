import { describe, expect, it } from 'vitest';
import { createRecommendationRoute, routeWindow, sampleRoute, ROUTE_STEP_X, ROUTE_STEP_Y } from '../src/web/components/ui/recommendation-route.js';

describe('recommendation route', () => {
  it('turns through all four directions without overlapping game positions', () => {
    const route = createRecommendationRoute(1000);
    expect(new Set(route.map(p => `${p.x},${p.y}`)).size).toBe(1000);
    const directions = new Set<string>();
    route.slice(1).forEach((p, index) => {
      const previous = route[index]!;
      const dx = (p.x - previous.x) / ROUTE_STEP_X, dy = (p.y - previous.y) / ROUTE_STEP_Y;
      expect(Math.abs(dx) + Math.abs(dy)).toBe(1);
      directions.add(`${dx},${dy}`);
    });
    expect(directions).toEqual(new Set(['1,0','0,1','-1,0','0,-1']));
  });
  it('keeps the mounted window bounded and includes the active item even at the ends', () => {
    for (const index of [0, 1, 12, 499, 999]) {
      const range = routeWindow(1000, index);
      expect(range.end - range.start).toBeLessThanOrEqual(9);
      expect(range.start).toBeLessThanOrEqual(index);
      expect(range.end).toBeGreaterThan(index);
    }
  });
  it('samples continuously at corners and clamps both ends', () => {
    const route = createRecommendationRoute(10);
    expect(sampleRoute(route, -1)).toEqual({ index: 0, ...route[0] });
    expect(sampleRoute(route, 50)).toEqual({ index: 9, ...route[9] });
    for (let i = 1; i < 9; i++) {
      const before = sampleRoute(route, i - .00001), at = sampleRoute(route, i);
      expect(before.x).toBeCloseTo(at.x, 4); expect(before.y).toBeCloseTo(at.y, 4);
    }
    expect(createRecommendationRoute(0)).toEqual([]);
  });
});

