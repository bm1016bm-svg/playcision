// Loaded only by benchmark-local.mjs in an isolated child process.
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.PLAYCISION_BENCH !== 'isolated-fixtures') throw new Error('Benchmark fixture requires isolated mode.');
const latency = Number(process.env.BENCH_LATENCY_MS);
if (!Number.isFinite(latency) || latency < 0 || latency > 2000) throw new Error('Invalid benchmark latency.');
const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
let calls = 0, bytes = 0, active = 0, peakActive = 0, peakRss = 0, fixtureErrors = 0, cpu = process.cpuUsage(), started = performance.now();
const paths = {};
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10); sampler.unref();
process.on('message', message => {
  if (message.type === 'reset') {
    calls = bytes = active = peakActive = fixtureErrors = 0; for (const key of Object.keys(paths)) delete paths[key];
    peakRss = process.memoryUsage().rss; cpu = process.cpuUsage(); started = performance.now(); loop.reset();
  }
  const used = process.cpuUsage(cpu);
  process.send?.({ id: message.id, calls, bytes, paths, peakActive, fixtureErrors, peakRssMiB: peakRss / 1048576,
    cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - started,
    eventLoopP95Ms: loop.percentile(95) / 1e6 });
});

globalThis.fetch = async input => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!['store.steampowered.com', 'api.steampowered.com'].includes(url.hostname)) throw new Error('Benchmark forbids external network.');
  calls++; paths[url.pathname] = (paths[url.pathname] ?? 0) + 1;
  active++; peakActive = Math.max(peakActive, active);
  try {
    await delay(latency);
    let value;
    if (url.pathname.includes('/tagdata/')) value = [{ tagid: 19, name: 'Action' }];
    else if (url.pathname === '/search/results/') {
      const offset = Number(url.searchParams.get('start') ?? 0);
      value = { success: 1, total_count: 5000, results_html: Array.from({ length: 50 }, (_, index) => {
        const id = 10000 + offset + index;
        return `<a class="search_result_row" data-ds-appid="${id}" data-ds-tagids="[19]"><div class="search_capsule"><img src="https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg"></div><div class="search_name"><span class="title">測試遊戲 ${id}</span><div class="search_released">2026-10-01</div><span class="platform_img win"></span></div><div class="search_price_discount_combined" data-price-final="29900"><div class="discount_final_price">NT$ 299.00</div></div></a>`;
      }).join('') };
    } else if (url.pathname === '/api/appdetails') {
      const id = url.searchParams.get('appids');
      value = { [id]: { success: true, data: { name: `測試遊戲 ${id}`, short_description: '<p>固定的測試介紹，用來量測解析與請求合併。</p>'.repeat(8),
        header_image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`, developers: ['Fixture'], publishers: ['Fixture'] } } };
    } else if (url.pathname.includes('/IStoreBrowseService/')) {
      const query = JSON.parse(url.searchParams.get('input_json'));
      value = { response: { store_items: query.ids.map(({ appid }) => ({ appid, assets: { asset_url_format: 'steam/apps/' + appid + '/${FILENAME}', main_capsule_2x: 'capsule_616x353.jpg' } })) } };
    } else throw new Error(`Unmodelled upstream endpoint: ${url.pathname}`);
    const body = JSON.stringify(value); bytes += Buffer.byteLength(body);
    return new Response(body, { headers: { 'content-type': 'application/json' } });
  } catch (error) { fixtureErrors++; throw error; }
  finally { active--; }
};
