import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createTestHarness } from 'wrangler';

// Public app, isolated runtime/storage, no invitation or login credentials.
process.env.WRANGLER_SEND_METRICS = 'false';
const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:4174';
const server = createTestHarness({ root, workers: [{ configPath: './wrangler.jsonc',
  vars: { APP_ORIGIN: origin } }] });
const sockets = [];
const timeout = (promise, ms = 12000) => {
  let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('smoke deadline exceeded')), ms); })]).finally(() => clearTimeout(timer));
};
try {
  await server.listen();
  const handle = server.getWorker();
  assert.equal((await server.fetch(origin + '/api/discovery?source=bad')).status, 400);
  assert.equal((await server.fetch('https://wrong.example/api/digest')).status, 403);
  assert.equal((await server.fetch(origin + '/api/rooms', { method: 'POST', headers: { Origin: 'https://wrong.example' }, body: '{}' })).status, 403);
  const call = (path, token, body) => timeout(server.fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const index = await call('/'); assert.equal(index.status, 200); const html = await index.text(); assert.match(html, /<script/);
  assert.doesNotMatch(html, /邀請碼/); assert.equal(index.headers.get('Set-Cookie'), null);
  assert.equal(index.headers.get('Cache-Control'), 'no-store');
  const asset = /src="([^\"]+\.js)"/.exec(html)?.[1]; assert.ok(asset);
  const script = await call(asset); assert.equal(script.status, 200);
  assert.equal(script.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  const font = /<link[^>]+href="([^\"]+\.woff2)"/.exec(html)?.[1];
  if (font) assert.equal((await call(font)).headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  assert.equal((await call(asset + '.map')).status, 404);
  assert.equal((await call('/api/preferences', undefined, {})).status, 403);
  assert.equal((await call('/api/rooms', randomUUID(), { name: 'x'.repeat(5000) })).status, 413);
  assert.equal((await call('/api/discovery?source=bad')).status, 400);
  const host = randomUUID(), friend = randomUUID();
  const created = await call('/api/rooms', host, { name: 'Host' }); assert.equal(created.status, 200);
  const room = await created.json(); assert.ok(Math.abs(room.expiresAt - room.serverNow - 600000) < 10);
  const path = '/api/rooms/' + room.id;
  assert.equal((await call(path, friend)).status, 400);
  assert.equal((await call(path, friend, { type: 'join', name: 'Friend' })).status, 200);
  async function connect(token) {
    const response = await server.fetch(origin + path + '/live', { headers: { Origin: origin, Upgrade: 'websocket' } });
    assert.equal(response.status, 101); const ws = response.webSocket; assert.ok(ws); ws.accept(); sockets.push(ws);
    const first = timeout(new Promise((resolve, reject) => { ws.addEventListener('message', event => resolve(JSON.parse(event.data)), { once: true }); ws.addEventListener('close', () => reject(Error('socket closed before handshake')), { once: true }); }));
    ws.send(JSON.stringify({ token })); const view = await first; assert.ok(view.me); assert.ok(!JSON.stringify(view).includes(token));
    return ws;
  }
  const ws = await connect(friend);
  const outsider = await server.fetch(origin + path + '/live', { headers: { Origin: origin, Upgrade: 'websocket' } });
  assert.equal(outsider.status, 101); outsider.webSocket.accept(); sockets.push(outsider.webSocket);
  const rejected = timeout(new Promise(resolve => outsider.webSocket.addEventListener('close', resolve, { once: true })));
  outsider.webSocket.send(JSON.stringify({ token: randomUUID() })); assert.equal((await rejected).code, 1008);
  await handle.evictDurableObject('ROOMS', { name: room.id, webSockets: 'hibernate' });
  const pushed = timeout(new Promise(resolve => ws.addEventListener('message', event => resolve(JSON.parse(event.data)), { once: true })));
  assert.equal((await call(path, host, { type: 'ready', ready: true })).status, 200);
  assert.ok((await pushed).players.find(player => player.name === 'Host').ready);
  await handle.evictDurableObject('COORDINATOR', { name: 'global-v1' });
  assert.equal((await call(path, host)).status, 200);
  assert.equal((await call('/api/rooms/' + randomUUID(), host)).status, 404);
  for (let i = 1; i < 12; i++) assert.equal((await call('/api/rooms', randomUUID(), { name: 'Guest' })).status, 200);
  await handle.evictDurableObject('COORDINATOR', { name: 'global-v1' });
  assert.equal((await call('/api/rooms', randomUUID(), { name: 'Over quota' })).status, 429);
  console.log('PASS Workers runtime: public entry, assets, body bounds, room privacy, WebSocket hibernation, persistent shared quotas.');
  if (process.argv.includes('--steam')) {
    const checks = [
      ['/api/digest', value => Array.isArray(value.popular) && value.popular.length > 0],
      ['/api/discovery?source=popular&genre=all&platform=windows&price=free&players=multi&earlyAccess=exclude&offset=0', value => Array.isArray(value.games)],
      ['/api/recommendations?offset=50', value => Array.isArray(value.games)],
      ['/api/steam-events?offset=0', value => Array.isArray(value.events)],
      ['/api/presentation?appId=570&language=zh-TW', value => typeof value === 'object'],
      ['/api/review-stats?appId=570&language=zh-TW&scope=localized', value => value.localized || value.recent],
      ['/api/reviews?appId=570&language=zh-TW&scope=localized', value => Array.isArray(value.reviews)],
      ['/api/ai-disclosures?ids=570,730,10', value => value.results?.length === 3],
    ];
    for (const [path, verify] of checks) {
      const response = await timeout(server.fetch(origin + path, { headers: { Origin: origin } }), 60000);
      const data = await response.json(); assert.equal(response.status, 200, path + ' returned ' + response.status); assert.ok(verify(data), path + ' shape');
      console.log('PASS live Steam:', path.split('?')[0]);
    }
  }
} catch (error) {
  // Runtime error messages can contain upstream URLs; never print cookies or bindings.
  console.error('Cloud smoke failed:', error instanceof Error ? error.stack?.split('\n').slice(0, 10).join('\n') : 'unknown error'); process.exitCode = 1;
} finally {
  for (const socket of sockets) { try { socket.close(1000); } catch {} }
  await server.close();
}
