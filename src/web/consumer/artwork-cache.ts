export interface ArtworkRequest { id: string; language: string; fallback: string }
interface ReadyArtwork { src: string | null; resource?: unknown }
interface PendingArtwork { promise: Promise<ReadyArtwork>; start: () => void }
export function artworkKey(input: ArtworkRequest) { return JSON.stringify([input.language, input.id, input.fallback]); }

/** Decoded LRU and a separate, deduplicated request queue. Foreground requests take priority. */
export function createArtworkCache(
  presentation: (id: string, language: string) => Promise<{ images: string[] }>,
  decode: (url: string) => Promise<unknown>,
  limit = 64,
  concurrency = 4,
) {
  const ready = new Map<string, ReadyArtwork>();
  const pending = new Map<string, PendingArtwork>();
  const queue: string[] = [];
  let running = 0;
  const pump = () => {
    while (running < concurrency && queue.length) {
      const key = queue.shift()!;
      const job = pending.get(key);
      if (job) { running++; job.start(); }
    }
  };
  return {
    peek(input: ArtworkRequest) { return ready.get(artworkKey(input)); },
    load(input: ArtworkRequest, foreground = false): Promise<ReadyArtwork> {
      const key = artworkKey(input);
      const cached = ready.get(key);
      if (cached) { ready.delete(key); ready.set(key, cached); return Promise.resolve(cached); }
      const existing = pending.get(key);
      if (existing) {
        const position = queue.indexOf(key);
        if (foreground && position >= 0) { queue.splice(position, 1); queue.unshift(key); }
        return existing.promise;
      }
      let finish!: (result: ReadyArtwork) => void;
      const promise = new Promise<ReadyArtwork>(resolve => { finish = resolve; });
      const start = () => {
        void (async () => {
          const data = await presentation(input.id, input.language).catch(() => ({ images: [] }));
          const urls = [...new Set([...data.images, input.fallback].filter(Boolean))];
          for (const src of urls) {
            try { return { src, resource: await decode(src) }; }
            catch { /* Try the next real Steam asset after a failure. */ }
          }
          return { src: null };
        })().catch(() => ({ src: null })).then(result => {
          if (result.src) {
            ready.set(key, result);
            if (ready.size > limit) ready.delete(ready.keys().next().value!);
          }
          pending.delete(key); running--; finish(result); pump();
        });
      };
      pending.set(key, { promise, start });
      if (foreground) queue.unshift(key); else queue.push(key);
      pump();
      return promise;
    },
  };
}

/** Stop obsolete look-ahead work between loads; background concurrency is bounded. */
export async function preloadWindow<T>(items: readonly T[], load: (item: T) => Promise<unknown>, cancelled: () => boolean, concurrency = 2) {
  let index = 0;
  const worker = async () => {
    while (!cancelled() && index < items.length) {
      const item = items[index++]!;
      await load(item).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, concurrency)) }, worker));
}

/** Initial loading screen warms only the three nearest games. */
export function preloadInitialArtwork<T>(items: readonly T[], load: (item: T) => Promise<unknown>, cancelled: () => boolean) {
  return preloadWindow(items.slice(0, 3), load, cancelled, 3);
}
