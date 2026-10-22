import { useEffect, useState } from 'react';
import { createAiStatusCache } from './ai-filter.js';
const cache = createAiStatusCache();

/** Progressive checks: unchecked cards wait; unknown results stay usable. */
export function useAiFilter<T extends { id: string }>(games: T[], enabled: boolean, active = true) {
  const [revision, update] = useState(0);
  const unchecked = enabled ? games.filter(game => cache.peek(game.id) === undefined) : [];
  const key = JSON.stringify(unchecked.slice(0, 3).map(game => game.id));
  useEffect(() => {
    if (!enabled || !active) return;
    const ids = JSON.parse(key) as string[];
    if (!ids.length) return;
    const controller = new AbortController();
    // A request timeout resolves to unknown instead of leaving cards waiting indefinitely.
    void cache.check(ids, controller.signal).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) update(value => value + 1);
    });
    return () => controller.abort();
  }, [key, enabled, active, revision]);
  const visible = enabled ? games.filter(game => {
    const state = cache.peek(game.id);
    return state === 'not-observed' || state === 'unknown';
  }) : games;
  return { games: visible, pending: unchecked.length > 0, unknown: enabled && visible.some(game => cache.peek(game.id) === 'unknown') };
}
