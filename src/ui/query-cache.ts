export class QueryBusyError extends Error {
  constructor() { super('遊戲載入中，請稍後再試。'); }
}

/** Pending work is never evicted by the completed-result LRU. */
export function createQueryCache<T>(options: {
  concurrency: number; waiting: number; waitMs: number;
  entries: number; bytes: number; ttlMs: number;
}) {
  const ready = new Map<string, { value: T; expires: number; bytes: number }>();
  const pending = new Map<string, Promise<T>>();
  const queue: { run: () => void; timer: ReturnType<typeof setTimeout> }[] = [];
  let active = 0;
  let bytes = 0;
  const remove = (key: string) => {
    const entry = ready.get(key);
    if (entry) { bytes -= entry.bytes; ready.delete(key); }
  };
  const pump = () => {
    while (active < options.concurrency && queue.length) {
      const next = queue.shift()!;
      clearTimeout(next.timer);
      next.run();
    }
  };
  return {
    load(key: string, loader: () => Promise<T>): Promise<T> {
      const cached = ready.get(key);
      if (cached && cached.expires > Date.now()) {
        ready.delete(key); ready.set(key, cached);
        return Promise.resolve(cached.value);
      }
      remove(key);
      const existing = pending.get(key);
      if (existing) return existing;
      if (active >= options.concurrency && queue.length >= options.waiting) return Promise.reject(new QueryBusyError());
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      pending.set(key, promise);
      const release = () => { pending.delete(key); active--; pump(); };
      const run = () => {
        active++;
        void Promise.resolve().then(loader).then(value => {
          const size = Buffer.byteLength(JSON.stringify(value));
          for (const [oldKey, entry] of ready) if (entry.expires <= Date.now()) remove(oldKey);
          if (size <= options.bytes) {
            ready.set(key, { value, bytes: size, expires: Date.now() + options.ttlMs });
            bytes += size;
            while (ready.size > options.entries || bytes > options.bytes) remove(ready.keys().next().value!);
          }
          release(); resolve(value);
        }).catch(error => { release(); reject(error); });
      };
      if (active < options.concurrency) run();
      else {
        const job = { run, timer: setTimeout(() => {
          const index = queue.indexOf(job);
          if (index < 0) return;
          queue.splice(index, 1); pending.delete(key); reject(new QueryBusyError());
        }, options.waitMs) };
        queue.push(job);
      }
      return promise;
    },
  };
}
