/** Browser memory only: no catalogue sync, and no cached failures or aborted loads. */
export function createDiscoveryCache<T>(fetchPage: (url: string, signal: AbortSignal) => Promise<T>, now = Date.now) {
  const ready = new Map<string, { value: T; expires: number }>();
  return async (url: string, language: string, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted();
    const key = JSON.stringify([language, url]);
    const cached = ready.get(key);
    if (cached && cached.expires > now()) {
      ready.delete(key); ready.set(key, cached);
      return cached.value;
    }
    ready.delete(key);
    const value = await fetchPage(url, signal);
    signal.throwIfAborted();
    for (const [oldKey, entry] of ready) if (entry.expires <= now()) ready.delete(oldKey);
    ready.set(key, { value, expires: now() + 60_000 });
    while (ready.size > 20) ready.delete(ready.keys().next().value!);
    return value;
  };
}
