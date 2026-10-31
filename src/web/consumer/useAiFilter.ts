import { useEffect, useRef, useState } from 'react';
import { createAiStatusCache } from './ai-filter.js';
import { createAiViewObservations } from './ai-view.js';
const cache = createAiStatusCache();

/** Progressive checks: unchecked cards wait; unknown results stay usable. */
export function useAiFilter<T extends { id: string }>(games: T[], enabled: boolean, active = true) {
  const [revision, update] = useState(0);
  const observations = useRef<ReturnType<typeof createAiViewObservations> | null>(null);
  observations.current ??= createAiViewObservations(cache);
  const view = observations.current;
  view.sync(enabled ? games.map(game => game.id) : []);
  const unchecked = enabled ? view.unchecked() : [];
  const key = JSON.stringify(enabled ? view.batch() : []);
  useEffect(() => {
    if (!enabled || !active) return;
    const ids = JSON.parse(key) as string[];
    if (!ids.length) return;
    const controller = new AbortController();
    // A request timeout resolves to unknown instead of leaving cards waiting indefinitely.
    void cache.check(ids, controller.signal).then(rows => {
      if (!controller.signal.aborted) view.record(rows);
    }).catch(() => {}).finally(() => {
      if (!controller.signal.aborted) update(value => value + 1);
    });
    return () => controller.abort();
  }, [key, enabled, active, revision]);
  const visible = enabled ? games.filter(game => {
    const state = view.peek(game.id);
    return state === 'not-observed' || state === 'unknown';
  }) : games;
  return { games: visible, pending: unchecked.length > 0, unchecked: unchecked.length, unknown: enabled && visible.some(game => view.peek(game.id) === 'unknown') };
}
