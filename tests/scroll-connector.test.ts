import { describe, expect, it } from 'vitest';
import { scrollConnectorMask } from '../src/web/components/ui/scroll-connector.js';

describe('recommendation scroll connector', () => {
  it('keeps the intro and downstream segments hidden before scrolling to them', () => {
    for (const viewport of [390, 844, 1014]) {
      for (const top of [viewport * 1.95, viewport * 2.4, viewport * 2.6]) {
        expect(scrollConnectorMask(top, viewport * .45, viewport).visible).toBe(false);
      }
    }
  });

  it('draws downward with scrolling and retracts along the same path in reverse', () => {
    const at = (scroll: number) => scrollConnectorMask(1950 - scroll, 450, 1000);
    expect(at(1200).visible).toBe(false);
    expect(at(1300).tip).toBe(90);
    expect(at(1500).tip).toBe(290);
    expect(at(1800).tip).toBe(590);
    expect(at(1500).tip).toBe(290);
    expect(at(1200).visible).toBe(false);
  });

  it('shares one tip and fading tail across adjoining hero, heading and card segments', () => {
    const tops = [100, 550, 750];
    const masks = tops.map(top => scrollConnectorMask(top, 450, 1000));
    for (const [index, mask] of masks.entries()) {
      expect(tops[index]! + mask.tip).toBe(740);
      expect(tops[index]! + mask.tail).toBe(300);
      expect(tops[index]! + mask.body).toBe(420);
      expect(mask.tip - mask.tail).toBe(440);
    }
    expect(scrollConnectorMask(-500, 450, 1000).visible).toBe(false);
  });

  it('does not draw invalid or empty layouts', () => {
    for (const args of [[0, 0, 800], [0, 20, 0], [NaN, 20, 800], [0, Infinity, 800]]) {
      expect(scrollConnectorMask(...args as [number, number, number]).visible).toBe(false);
    }
  });
});
