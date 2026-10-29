export type AiStatus = 'disclosed' | 'not-observed' | 'unknown';
export type AiObservation = Readonly<{ status: AiStatus; expires: number }>;
export type AiObservationRow = AiObservation & { id: string };
export const AI_FILTER_KEY = 'playcision.exclude-disclosed-ai.v1';
export function readAiPreference(): 'all' | 'exclude' {
  try { return localStorage.getItem(AI_FILTER_KEY) === '1' ? 'exclude' : 'all'; } catch { return 'all'; }
}
/** Only three IDs per request; successful observations expire and are never a persistent catalogue. */
export function createAiStatusCache(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, AiObservation>();
  const observation = (id: string): AiObservation | undefined => {
    const entry = cache.get(id);
    if (entry && entry.expires > now()) return entry;
    cache.delete(id); return undefined;
  };
  return {
    observation,
    peek: (id: string): AiStatus | undefined => observation(id)?.status,
    async check(ids: string[], signal: AbortSignal): Promise<AiObservationRow[]> {
      if (!ids.length || ids.length > 3) throw new Error('Invalid AI check batch');
      let rows: { id: string; status: AiStatus }[];
      try {
        const response = await fetcher(`/api/ai-disclosures?ids=${ids.join(',')}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
        if (!response.ok) throw new Error('AI check failed');
        const data = await response.json() as { results?: { id: string; status: AiStatus }[] };
        if (!Array.isArray(data.results)) throw new Error('Invalid AI response');
        rows = data.results;
      } catch (error) {
        if (signal.aborted) throw error;
        rows = [];
      }
      signal.throwIfAborted();
      const observed: AiObservationRow[] = [];
      for (const id of ids) {
        const value = rows.find(row => row?.id === id)?.status;
        const status = value === 'disclosed' || value === 'not-observed' ? value : 'unknown';
        const entry: AiObservation = { status, expires: now() + (status === 'unknown' ? 60_000 : 300_000) };
        cache.delete(id); cache.set(id, entry); observed.push({ id, ...entry });
      }
      while (cache.size > 500) cache.delete(cache.keys().next().value!);
      return observed;
    },
  };
}
