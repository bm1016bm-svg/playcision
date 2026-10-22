// Real compiled HTTP server + parsers, synthetic Steam transport. No production user data.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variant = 'production';
const entry = path.join(root,'dist/cli.js');
const stage = await mkdtemp(path.join(os.tmpdir(), 'playcision-bench-'));
await mkdir(path.join(stage, '.playcision'));
await writeFile(path.join(stage, '.playcision/config.yaml'), 'version: 1\nstate:\n  enabled: false\noutputs:\n  markdown:\n    enabled: false\nproviders:\n  steam:\n    requestDelayMs: 0\n');
const results = [];
let requestId = 0;
function query(index = 0) {
  return '/api/discovery?' + new URLSearchParams({ source: ['popular','discover','deals'][Math.floor(index / 16) % 3],
    platform: ['all','windows','mac','linux'][index % 4], price: ['all','under300','free','paid'][Math.floor(index / 4) % 4],
    genre: 'all', players: 'all', earlyAccess: 'all', offset: String(Math.floor(index / 48) * 50) });
}
function metrics(child, type) {
  const id = ++requestId;
  return new Promise(resolve => {
    const receive = data => { if (data.id === id) { child.off('message', receive); resolve(data); } };
    child.on('message', receive); child.send({ id, type });
  });
}
function percentile(values, p) { const sorted = [...values].sort((a,b) => a-b); return sorted.length ? sorted[Math.ceil(sorted.length*p)-1] : null; }
async function scenario(name, latency, work, prime) {
  const reserve = createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['--import', pathToFileURL(path.join(root,'scripts/benchmark-upstream.mjs')).href, entry, '--cwd',stage,'ui','--host','127.0.0.1','--port',String(port)], {
    cwd: root, env: { ...process.env, PLAYCISION_BETA:'0', PLAYCISION_BENCH:'isolated-fixtures', BENCH_LATENCY_MS:String(latency) },
    windowsHide: true, stdio: ['ignore','pipe','pipe','ipc'],
  });
  const sample = [];
  const send = async route => {
    const began = performance.now();
    try {
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(30000) });
      const body = await response.text();
      const result = { status: response.status, ms: performance.now()-began, bytes: Buffer.byteLength(body) };
      sample.push(result); return result;
    } catch { const result = {status:0,ms:performance.now()-began,bytes:0}; sample.push(result); return result; }
  };
  try {
    await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>reject(new Error('Benchmark startup timeout')),15000);
      child.stdout.on('data',value=>{if(String(value).includes('UI ready')) {clearTimeout(timeout);resolve();}});
      child.stderr.on('data',value=>process.stderr.write(value));
      child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Benchmark server exited ${code}`));});
    });
    if(prime) await prime(send); sample.length=0;
    await metrics(child,'reset'); const began=performance.now(); await work(send);
    const server=await metrics(child,'stats');
    if(server.fixtureErrors) throw new Error('Invalid mock upstream; benchmark result rejected.');
    const successful=sample.filter(item=>item.status===200);
    const result={name,latencyMs:latency,requests:sample.length,success:successful.length,statusCounts:sample.reduce((a,x)=>(a[x.status]=(a[x.status]??0)+1,a),{}),
      successP50Ms:percentile(successful.map(x=>x.ms),.5),successP95Ms:percentile(successful.map(x=>x.ms),.95),durationMs:performance.now()-began,
      responseBytes:sample.reduce((sum,x)=>sum+x.bytes,0),upstream:server};
    results.push(result); console.log(JSON.stringify(result));
  } finally { if(child.exitCode===null && child.signalCode===null) { const exited=once(child,'exit'); child.kill(); await exited; } }
}

try {
  const latencies = [100,500];
  for(const latency of latencies) {
    await scenario('same-filter-cold-50',latency,send=>Promise.all(Array.from({length:50},()=>send(query()))));
    await scenario('different-filters-cold-20',latency,send=>Promise.all(Array.from({length:20},(_,i)=>send(query(i)))));
    await scenario('different-filters-revisit-20',latency,send=>Promise.all(Array.from({length:20},(_,i)=>send(query(i)))),async send=>{for(let i=0;i<20;i++)await send(query(i));});
    await scenario('presentation-preload-cold-20',latency,send=>Promise.all(Array.from({length:20},(_,i)=>send(`/api/presentation?appId=${10000+i}&language=zh-TW`))));
    await scenario('same-filter-warm-50',latency,send=>Promise.all(Array.from({length:50},()=>send(query()))),send=>send(query()));
    for(const count of [8,3]) await scenario(`initial-preload-${count}`,latency,send=>Promise.all(Array.from({length:count},(_,i)=>send(`/api/presentation?appId=${10000+i}&language=zh-TW`))));
  }
  const report={generatedAt:new Date().toISOString(),variant,model:{upstream:'synthetic Steam, no network',latenciesMs:latencies,gameRowsPerPage:50,server:'compiled Node UI, isolated cwd, state disabled',includes:'HTTP, YAML config reads, real provider/parsers, queues/cache, JSON serialization',excludes:'real Steam variability/429, images download/decode, browser rendering, TLS/CDN, Cloudflare isolates and CPU limits'},
    hardware:{cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalMemoryGiB:os.totalmem()/1073741824,node:process.version,platform:process.platform},results};
  await mkdir(path.join(root,'artifacts'),{recursive:true});
  const output=path.resolve(root,process.env.BENCH_OUTPUT??`artifacts/local-load-${variant}.json`);
  await writeFile(output,JSON.stringify(report,null,2)); console.log(`Saved ${output}`);
} finally {
  if(!stage.startsWith(path.join(os.tmpdir(),'playcision-bench-')))throw new Error('Unsafe cleanup path');
  await rm(stage,{recursive:true,force:true});
}
