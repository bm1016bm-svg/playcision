/** Replace obsolete look-ahead work without starting extra workers. In-flight work may finish. */
export function createLatestPreloader<T>(load: (item: T) => Promise<unknown>, concurrency = 2) {
  let queue: T[] = [];
  let running = 0;
  let disposed = false;
  const pump = () => {
    while (!disposed && running < concurrency && queue.length) {
      const item = queue.shift()!;
      running++;
      void Promise.resolve().then(() => load(item)).catch(() => {}).finally(() => { running--; pump(); });
    }
  };
  return {
    replace(items: readonly T[]) { if (!disposed) { queue = [...items]; pump(); } },
    dispose() { disposed = true; queue = []; },
  };
}
