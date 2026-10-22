/** Never mark authenticated or local-state-filtered responses as shared cacheable. */
export function pageCachePolicy(beta: boolean, stateEnabled: boolean): string {
  return beta || stateEnabled ? 'no-store' : 'public, max-age=30, s-maxage=300';
}
