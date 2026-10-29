import type { AiObservation, AiObservationRow, AiStatus } from './ai-filter.js';

/** A mounted view owns its observations; shared LRU eviction must not uncheck cards. */
export function createAiViewObservations(shared: { observation(id: string): AiObservation | undefined }, now = Date.now) {
  const seen = new Map<string, AiObservation>();
  let current = new Set<string>();
  return {
    sync(ids: readonly string[]) {
      current = new Set(ids);
      for (const id of seen.keys()) if (!current.has(id)) seen.delete(id);
      for (const id of current) {
        const entry = shared.observation(id);
        if (entry) seen.set(id, entry);
      }
    },
    record(rows: readonly AiObservationRow[]) {
      for (const { id, status, expires } of rows) if (current.has(id)) seen.set(id, { status, expires });
    },
    peek(id: string): AiStatus | undefined { return seen.get(id)?.status; },
    unchecked(): string[] { return [...current].filter(id => !seen.has(id)); },
    batch(): string[] {
      // New candidates must not starve behind repeated retries of old unknowns.
      const fresh = [...current].filter(id => !seen.has(id));
      return (fresh.length ? fresh : [...current].filter(id => seen.get(id)!.expires <= now())).slice(0, 3);
    },
  };
}
