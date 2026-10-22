import { expect, it, vi } from 'vitest';
import { createLatestPreloader } from '../src/web/components/ui/latest-preloader.js';

it('replaces stale lookahead without exceeding two concurrent workers', async () => {
  const started: number[] = [];
  const finish = new Map<number, () => void>();
  const loader = createLatestPreloader<number>(item => {
    started.push(item);
    return new Promise<void>(resolve => finish.set(item, resolve));
  });
  loader.replace([1,2,3,4]);
  await vi.waitFor(() => expect(started).toEqual([1,2]));
  loader.replace([8,9,10]);
  expect(started).toEqual([1,2]);
  finish.get(1)!();
  await vi.waitFor(() => expect(started).toEqual([1,2,8]));
  finish.get(2)!();
  await vi.waitFor(() => expect(started).toEqual([1,2,8,9]));
  loader.dispose();
  finish.get(8)!(); finish.get(9)!();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(started).toEqual([1,2,8,9]);
});
