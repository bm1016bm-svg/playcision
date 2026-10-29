import { describe, expect, it } from 'vitest';
import { tunnelFrame } from '../src/web/components/ui/tunnel-path.js';

describe('discovery tunnel travel', () => {
  it.each([[320, 568], [390, 844], [844, 390], [1440, 900]])('surrounds the headline then gathers covers at %i × %i', (width, height) => {
    const quadrants = new Set<string>();
    for (let index = 0; index < 9; index++) {
      for (const progress of [0, .25, .5, .75, 1]) {
        const frame = tunnelFrame(index, progress, width, height);
        expect(Object.values(frame).every(Number.isFinite)).toBe(true);
        const screenX = frame.x * frame.scale / width;
        const screenY = frame.y * frame.scale / height;
        expect(Math.max(Math.abs(screenX), Math.abs(screenY))).toBeGreaterThan(.12);
        quadrants.add(`${Math.sign(screenX)},${Math.sign(screenY)}`);
      }
    }
    for (const quadrant of ['-1,-1', '1,-1', '-1,1', '1,1']) expect(quadrants.has(quadrant)).toBe(true);
    for (let index = 0; index < 9; index++) {
      const before = tunnelFrame(index, .45, width, height, .08);
      const after = tunnelFrame(index, .45, width, height, .65);
      expect(Math.hypot(after.x, after.y)).toBeLessThan(Math.hypot(before.x, before.y) * .7);
      expect(after.z).toBe(before.z);
    }
  });

  it('moves continuously toward the viewer without crossing the camera plane', () => {
    let previous = tunnelFrame(0, 0, 1440, 900);
    for (let step = 1; step <= 100; step++) {
      const frame = tunnelFrame(0, step / 100, 1440, 900);
      expect(frame.z).toBeGreaterThan(previous.z);
      expect(frame.scale).toBeGreaterThan(previous.scale);
      expect(frame.scale - previous.scale).toBeLessThan(.1);
      expect(frame.scale).toBeLessThan(3);
      previous = frame;
    }
    expect(tunnelFrame(0, -1, 1440, 900)).toEqual(tunnelFrame(0, 0, 1440, 900));
    expect(tunnelFrame(0, 2, 1440, 900)).toEqual(tunnelFrame(0, 1, 1440, 900));
  });

  it('sends near covers past the edges instead of dissolving over the centre', () => {
    for (let index = 0; index < 9; index++) {
      const middle = tunnelFrame(index, .6, 1280, 800, .65);
      const near = tunnelFrame(index, .95, 1280, 800, .65);
      const projectedRadius = (frame: typeof near) => Math.hypot(frame.x * frame.scale / 1280, frame.y * frame.scale / 800);
      expect(projectedRadius(near)).toBeGreaterThan(projectedRadius(middle) * 4);
      expect(projectedRadius(near)).toBeGreaterThan(.7);
    }
  });
});
