import { describe, expect, it } from 'vitest';
import { circuitPath } from '../src/web/components/ui/circuit-path.js';

describe('shared recommendation circuit path', () => {
  it.each([{ x: 0, y: 1000 }, { x: 0, y: -1000 }, { x: 1000, y: 0 }, { x: -1000, y: 0 }])('keeps both anchors and a small jog toward %j', to => {
    const path = circuitPath({ x: 0, y: 0 }, to);
    expect(path.startsWith('M 0 0 L ')).toBe(true);
    expect(path.endsWith(`L ${to.x} ${to.y}`)).toBe(true);
    expect(path).not.toMatch(/NaN|Infinity/);
    // The outgoing and returning offsets cancel, retaining the shared centre
    // axis at adjoining segments regardless of travel direction.
    const offsets = [...path.matchAll(/l (-?\d+) (-?\d+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    expect(offsets).toHaveLength(2);
    expect(offsets[0]![0]! + offsets[1]![0]!).toBe(0);
    expect(offsets[0]![1]! + offsets[1]![1]!).toBe(0);
    expect(Math.hypot(...offsets[0]!)).toBe(9);
  });
});
