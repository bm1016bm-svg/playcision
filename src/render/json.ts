import type { Digest, Game, Recommendation } from '../domain/types.js';

export function renderJson(value: Digest | Game[] | Recommendation): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
