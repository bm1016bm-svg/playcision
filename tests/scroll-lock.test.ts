import { expect, it } from 'vitest';
import { acquireScrollLock } from '../src/web/consumer/scroll-lock.js';

it.each([false, true])('restores scrolling after overlapping sheet/tutorial exits, reverse=%s', reverse => {
  const body = { style: { overflow: '' } };
  const sheet = acquireScrollLock(body);
  const tutorial = acquireScrollLock(body);
  const [first, last] = reverse ? [tutorial, sheet] : [sheet, tutorial];
  expect(first()).toBe(false);
  expect(body.style.overflow).toBe('hidden');
  expect(first()).toBe(false);
  expect(last()).toBe(true);
  expect(body.style.overflow).toBe('');
});

it('preserves original overflow across repeated tutorial visits', () => {
  const body = { style: { overflow: 'auto' } };
  for (let visit = 0; visit < 3; visit++) {
    const release = acquireScrollLock(body);
    expect(body.style.overflow).toBe('hidden');
    release();
    expect(body.style.overflow).toBe('auto');
  }
});
