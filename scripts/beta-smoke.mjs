import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifacts = path.resolve('artifacts');
await mkdir(artifacts, { recursive: true });
const directory = await mkdtemp(path.join(artifacts, 'beta-check-'));
const port = Number(process.env.SMOKE_PORT ?? 4177);
const origin = `http://127.0.0.1:${port}`;
const code = randomBytes(24).toString('hex');
const secret = randomBytes(48).toString('hex');
let child;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function start() {
  child = spawn(process.execPath, ['scripts/start-beta.mjs'], { env: { ...process.env, PUBLIC_ORIGIN: origin, BETA_INVITE_CODE: code, SESSION_SECRET: secret, BETA_DATA_DIR: directory, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  child.stderr.on('data', () => {});
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) throw new Error('Beta process could not start (check port availability)');
    try { if ((await fetch(`${origin}/healthz`)).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Beta startup timed out');
}
async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
let cookie = '';
async function request(route, body, token) {
  return fetch(origin + route, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
try {
  await start();
  assert.equal((await request('/api/digest')).status, 401);
  const login = await fetch(`${origin}/beta/login`, { method: 'POST', redirect: 'manual', headers: { Origin: origin }, body: new URLSearchParams({ code }) });
  assert.equal(login.status, 303); cookie = login.headers.get('set-cookie').split(';')[0];
  const page = await request('/'); assert.equal(page.status, 200); assert.match(await page.text(), /id="root"/);
  assert.equal((await request('/api/preferences', { action: 'exclude', appId: '10' })).status, 403);
  const host = randomUUID(), friend = randomUUID();
  const created = await request('/api/rooms', { name: 'Smoke host' }, host); assert.equal(created.status, 200);
  const room = await created.json(); const route = `/api/rooms/${room.id}`;
  assert.equal((await request(route, { type: 'join', name: 'Smoke friend' }, friend)).status, 200);
  await stop(); await start();
  const restored = await (await request(route, undefined, host)).json(); assert.equal(restored.players.length, 2);
  assert.equal((await request(route, { type: 'ready', ready: true }, host)).status, 200);
  assert.equal((await request(route, { type: 'ready', ready: true }, friend)).status, 200);
  const started = await (await request(route, { type: 'start' }, host)).json(); assert.equal(started.phase, 'proposing');
  console.log('PASS: beta startup, authentication, static assets, preference isolation, room join, restart recovery, round start');
} finally {
  await stop();
  if (path.dirname(directory) === artifacts && path.basename(directory).startsWith('beta-check-')) await rm(directory, { recursive: true, force: true });
}
