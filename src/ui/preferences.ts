import type { PlaycisionState } from '../state/schema.js';

/** Project only active decision IDs into the UI; never expose price history or notification state. */
export function blockedUiAppIds(state: PlaycisionState, now: Date): string[] {
  return [...new Set([
    ...state.excluded,
    ...Object.entries(state.skipped)
      .filter(([, skip]) => Date.parse(skip.until) > now.getTime())
      .map(([id]) => id),
  ])].sort();
}
