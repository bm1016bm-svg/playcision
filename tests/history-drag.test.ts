import { expect, it } from 'vitest';
import { dragIntent } from '../src/web/consumer/history-drag.js';

it('starts a desktop drag on deliberate movement without canceling it before the hold timer', () => {
  expect(dragIntent('mouse', false, 3, 40)).toBe('wait');
  expect(dragIntent('mouse', false, 12, 40)).toBe('activate');
  expect(dragIntent('pen', false, 12, 40)).toBe('activate');
});
it('preserves touch scrolling and lets the drag handle start without waiting', () => {
  expect(dragIntent('touch', false, 14, 100)).toBe('cancel');
  expect(dragIntent('touch', false, 3, 240)).toBe('activate');
  expect(dragIntent('touch', true, 14, 100)).toBe('activate');
  expect(dragIntent('touch', false, 3, 100)).toBe('wait');
});
