/** Browser memory only. Each subscriber can cancel without canceling another view. */
export function createDiscoveryCache<T>(fetchPage: (url: string, signal: AbortSignal) => Promise<T>, now = Date.now) {
  const ready = new Map<string, { value: T; expires: number }>();
  type Pending = { controller: AbortController; promise: Promise<T>; users: number };
  const pending = new Map<string, Pending>();
  return async (url: string, language: string, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted();
    const key = JSON.stringify([language, url]);
    const cached = ready.get(key);
    if (cached && cached.expires > now()) {
      ready.delete(key); ready.set(key, cached);
      return cached.value;
    }
    ready.delete(key);
    let job = pending.get(key);
    if (!job) {
      if (pending.size >= 20) throw new Error('遊戲載入中，請稍後再試。');
      const controller = new AbortController();
      const created: Pending = { controller, users: 0, promise: Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return fetchPage(url, controller.signal);
      }).then(value => {
        controller.signal.throwIfAborted();
        for (const [oldKey, entry] of ready) if (entry.expires <= now()) ready.delete(oldKey);
        ready.set(key, { value, expires: now() + 60_000 });
        while (ready.size > 20) ready.delete(ready.keys().next().value!);
        return value;
      }).finally(() => { if (pending.get(key) === created) pending.delete(key); }) };
      job = created; pending.set(key, created);
    }
    const subscribed = job;
    subscribed.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const settle = (complete: () => void) => {
        if (finished) return;
        finished = true; signal.removeEventListener('abort', abort);
        subscribed.users--;
        if (!subscribed.users && pending.get(key) === subscribed) {
          pending.delete(key); subscribed.controller.abort();
        }
        complete();
      };
      const abort = () => settle(() => reject(signal.reason));
      signal.addEventListener('abort', abort, { once: true });
      subscribed.promise.then(value => settle(() => resolve(value)), error => settle(() => reject(error)));
      if (signal.aborted) abort();
    });
  };
}
