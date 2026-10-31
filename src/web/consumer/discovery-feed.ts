export interface DiscoveryPage<T> { games: T[]; nextOffset: number; hasMore: boolean }
export interface DiscoverySnapshot<T> {
  games: T[]; nextOffset: number; hasMore: boolean; loading: boolean; error: string; pages: number;
}

export class DiscoveryLoadError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) { super(message); }
}

/** A single cancellable page request; failures retain both the buffer and its cursor. */
export function createDiscoveryFeed<T extends { id: string }>(options: {
  load: (offset: number, signal: AbortSignal) => Promise<DiscoveryPage<T>>;
  seen?: (id: string) => boolean;
  retryDelays?: readonly number[];
}) {
  let state: DiscoverySnapshot<T> = { games: [], nextOffset: 0, hasMore: true, loading: false, error: '', pages: 0 };
  const listeners = new Set<() => void>();
  let active = false;
  let request: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let automaticPages = 0;
  const delays = options.retryDelays ?? [1000, 4000];
  const update = (next: Partial<DiscoverySnapshot<T>>) => {
    state = { ...state, ...next };
    listeners.forEach(listener => listener());
  };
  const clearRetry = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const load = async (): Promise<void> => {
    if (!active || request || !state.hasMore) return;
    clearRetry();
    const controller = new AbortController();
    request = controller;
    const offset = state.nextOffset;
    update({ loading: true, error: '' });
    try {
      const page = await options.load(offset, controller.signal);
      if (controller.signal.aborted || request !== controller) return;
      if (!Array.isArray(page.games) || !Number.isInteger(page.nextOffset) || typeof page.hasMore !== 'boolean'
        || (page.hasMore && page.nextOffset <= offset)) throw new Error('Invalid discovery cursor');
      const games = new Map<string, T>();
      for (const game of [...state.games, ...page.games]) if (!options.seen?.(game.id)) games.set(game.id, game);
      failures = 0;
      // Subscribers can synchronously request another sparse page when this is published.
      request = undefined;
      update({ games: [...games.values()].slice(-150), nextOffset: page.nextOffset, hasMore: page.hasMore, loading: false, error: '', pages: state.pages + 1 });
    } catch (error) {
      if (controller.signal.aborted || request !== controller) return;
      let delay = delays[failures++];
      if (delay !== undefined && error instanceof DiscoveryLoadError && error.retryAfterMs !== undefined) {
        delay = Number.isFinite(error.retryAfterMs) && error.retryAfterMs <= 900_000
          ? Math.max(delay, error.retryAfterMs) : undefined;
      }
      // A temporary failure must never be reported as an exhausted Steam catalogue.
      request = undefined;
      if (delay !== undefined) timer = setTimeout(() => { timer = undefined; void load(); }, delay);
      update({ loading: delay !== undefined, error: delay === undefined ? '連線暫時不穩，請重試載入。' : '' });
    } finally {
      if (request === controller) request = undefined;
    }
  };
  const prefetch = () => {
    // Sparse filters may consume empty pages. Do not scan the entire catalogue while idle.
    if (!active || request || state.loading || timer !== undefined || state.error || !state.hasMore || automaticPages >= 4) return;
    automaticPages++;
    void load();
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    resume: () => { active = true; if (!state.pages || state.error) { failures = 0; automaticPages = 0; if (state.error) void load(); else prefetch(); } },
    pause: () => { active = false; clearRetry(); request?.abort(); request = undefined; update({ loading: false }); },
    prefetch,
    allowPrefetch: () => { automaticPages = 0; },
    retry: () => { failures = 0; automaticPages = 0; return load(); },
    restore: (game: T) => update({ games: [game, ...state.games.filter(item => item.id !== game.id)].slice(0, 150) }),
  };
}
