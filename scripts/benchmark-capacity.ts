// Real catalog/coordinator code, synthetic Steam and counted storage calls.
// No requests to Steam or production Cloudflare, and no personal data.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { AppCoordinator } from '../cloud/coordinator.js';
import type { CloudEnv, CloudState } from '../cloud/common.js';

const origin = 'https://capacity-test.invalid';
const counts = { reads: 0, writes: 0, upstream: 0, active: 0, peak: 0 };
const rows = new Map<string, unknown>();
let alarm: number | null = null, tail = Promise.resolve();
const state: CloudState = {
  storage: {
    get: async <T>(key: string) => { counts.reads++; return structuredClone(rows.get(key)) as T | undefined; },
    put: async (key, value) => { counts.writes++; rows.set(key, structuredClone(value)); },
    deleteAll: async () => { rows.clear(); alarm = null; },
    getAlarm: async () => alarm, setAlarm: async time => { alarm = time; },
  },
  blockConcurrencyWhile: <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn); tail = result.then(() => {}, () => {}); return result;
  },
  acceptWebSocket: () => {}, getWebSockets: () => [],
};
const env: CloudEnv = { APP_ORIGIN: origin, ROOMS: {
  idFromName: name => name, get: () => { throw new Error('Rooms are outside this benchmark'); },
} };
const coordinator = new AppCoordinator(state, env, async () => {
  counts.upstream++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
  try {
    await new Promise(resolve => setTimeout(resolve, 30));
    return new Response('<html><div class="apphub_AppName">Fixture</div><div id="game_area_description">Fixture</div></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  } finally { counts.active--; }
});
const route = (id: number) => `/api/ai-disclosures?ids=${id}`;
const call = async (path: string) => {
  const start = performance.now();
  const response = await coordinator.fetch(new Request(origin + path));
  await response.text();
  return { status: response.status, ms: performance.now() - start };
};
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1] ?? 0;
async function sample(name: string, paths: string[]) {
  const before = { ...counts }, start = performance.now();
  const responses = await Promise.all(paths.map(call));
  const statuses: Record<string, number> = {};
  for (const response of responses) statuses[response.status] = (statuses[response.status] ?? 0) + 1;
  const success = responses.filter(response => response.status === 200);
  return { name, requests: paths.length, statuses, durationMs: performance.now() - start,
    successP50Ms: percentile(success.map(row => row.ms), 0.5), successP95Ms: percentile(success.map(row => row.ms), 0.95),
    storageGetCalls: counts.reads - before.reads, storagePutCalls: counts.writes - before.writes,
    syntheticSteamRequests: counts.upstream - before.upstream };
}
await call(route(570));
const warm = await sample('cached-128-concurrent', Array.from({ length: 128 }, () => route(570)));
const cold = await sample('distinct-cold-20', Array.from({ length: 20 }, (_, i) => route(1000 + i)));
const overload = await sample('distinct-cold-overload-80', Array.from({ length: 80 }, (_, i) => route(2000 + i)));
const recovery = await call(route(570));
if (warm.statuses['200'] !== 128 || warm.syntheticSteamRequests !== 0 || cold.statuses['200'] !== 20
  || !overload.statuses['503'] || recovery.status !== 200 || counts.active !== 0) throw new Error('Capacity regression');
const report = {
  generatedAt: new Date().toISOString(), node: process.version,
  scope: 'In-process real AppCoordinator/catalog/Steam parser. Fake durable storage and 30ms synthetic Steam transport.',
  excludes: 'Real workerd/Cloudflare storage billing, Worker authentication, HTTP/TLS, CDN, real Steam limits, browser rendering, production visitor capacity.',
  // The previous path persisted one ledger entry per API request. This is a
  // source-derived operation count, NOT a measured latency baseline.
  previousWarmLedgerWritesBySource: warm.requests,
  warmLedgerWriteReductionPercent: (warm.requests - warm.storagePutCalls) / warm.requests * 100,
  samples: [warm, cold, overload], recoveryStatus: recovery.status,
  peakSyntheticSteamFetches: counts.peak,
};
const directory = new URL('../.playcision/benchmarks/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('server-capacity.json', directory), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log('Report: ' + fileURLToPath(new URL('server-capacity.json', directory)));
