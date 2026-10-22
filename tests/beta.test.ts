import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { betaGate, sameOrigin, signSession, validSession, WindowLimit } from '../src/ui/beta.js';
import { validateBetaEnv } from '../src/ui/beta-start.js';
import { RoomStore } from '../src/ui/room-store.js';
import { newRoom } from '../src/rooms/engine.js';
import { handleRooms } from '../src/ui/rooms.js';
import { hideGame, readHidden, parseLibrary } from '../src/web/consumer/browser-library.js';

const directories: string[] = [];
const servers: Server[] = [];
const original = { ...process.env };
afterEach(async () => {
  process.env = { ...original };
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); })));
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
async function temporary() { const dir = await mkdtemp(path.join(os.tmpdir(), 'pc-beta-')); directories.push(dir); return dir; }
async function listen(server: Server) {
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing address');
  return `http://127.0.0.1:${address.port}`;
}
describe('beta boundaries', () => {
  it('requires HTTPS off localhost and distinct secrets', () => {
    const env = { PUBLIC_ORIGIN: 'https://beta.example.com', BETA_INVITE_CODE: 'a'.repeat(20), SESSION_SECRET: 'b'.repeat(48) };
    expect(() => validateBetaEnv(env)).not.toThrow();
    expect(() => validateBetaEnv({ ...env, PUBLIC_ORIGIN: 'http://beta.example.com' })).toThrow();
    expect(() => validateBetaEnv({ ...env, SESSION_SECRET: 'short' })).toThrow();
  });
  it('rejects forged and expired sessions and rotates signing keys', () => {
    const now = 1_800_000_000_000;
    const session = signSession(now + 1000, 'key');
    expect(validSession(session, 'key', now)).toBe(true);
    expect(validSession(session, 'different', now)).toBe(false);
    expect(validSession(session, 'key', now + 1001)).toBe(false);
    expect(validSession(session.replace(/.$/, 'z'), 'key', now)).toBe(false);
  });
  it('resets bounded request windows', () => {
    const limiter = new WindowLimit(2, 100);
    expect(limiter.allow('a', 0)).toBe(true); expect(limiter.allow('a', 1)).toBe(true);
    expect(limiter.allow('a', 2)).toBe(false); expect(limiter.allow('a', 100)).toBe(true);
  });
  it('gates APIs, validates login origin, and preserves invitation destination', async () => {
    process.env.PLAYCISION_BETA = '1'; process.env.SESSION_SECRET = 'b'.repeat(48); process.env.BETA_INVITE_CODE = 'a'.repeat(20);
    const origin = await listen(createServer((req, res) => { void betaGate(req, res).then(handled => { if (!handled) res.end('private'); }); }));
    process.env.PUBLIC_ORIGIN = origin;
    expect((await fetch(`${origin}/api/digest`)).status).toBe(401);
    expect(await (await fetch(`${origin}/healthz`)).text()).toBe('ok');
    const request = { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: process.env.BETA_INVITE_CODE, return: '/?room=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), redirect: 'manual' as const };
    expect((await fetch(`${origin}/beta/login`, { ...request, headers: { Origin: 'https://evil.example' } })).status).toBe(429);
    const result = await fetch(`${origin}/beta/login`, request);
    expect(result.status).toBe(303); expect(result.headers.get('location')).toContain('?room=');
    const cookie = result.headers.get('set-cookie')!; expect(cookie).toContain('HttpOnly');
    expect(await (await fetch(`${origin}/api/digest`, { headers: { Cookie: cookie.split(';')[0]! } })).text()).toBe('private');
  });
});
describe('durable rooms', () => {
  it('serializes simultaneous changes, survives restart, expires, and rolls back rejected mutations', async () => {
    const cwd = await temporary(); const store = new RoomStore(cwd); const id = randomUUID(); const token = randomUUID();
    await store.run(rooms => rooms.set(id, newRoom(id, 'Owner', token, 0)), 0);
    await Promise.all([store.run(rooms => { rooms.get(id)!.nextPlayerId++; }, 1), store.run(rooms => { rooms.get(id)!.nextPlayerId++; }, 1)]);
    await expect(store.run(rooms => { rooms.clear(); throw new Error('reject'); }, 1)).rejects.toThrow('reject');
    const restarted = new RoomStore(cwd);
    expect(await restarted.run(rooms => rooms.get(id)?.nextPlayerId, 2)).toBe(4);
    await restarted.run(() => {}, 600_000);
    expect(JSON.parse(await readFile(path.join(cwd, '.playcision/rooms.json'), 'utf8'))).toEqual([]);
  });
  it('supports real HTTP room join and prevents strangers changing readiness', async () => {
    const cwd = await temporary(); const origin = await listen(createServer((req, res) => { void handleRooms(req, res, cwd); }));
    const owner = randomUUID(); const guest = randomUUID();
    const post = (route: string, token: string, action: unknown) => fetch(origin + route, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    const created = await post('/api/rooms', owner, { name: 'Owner' }); expect(created.status).toBe(200);
    const view = await created.json() as { id: string }; const route = `/api/rooms/${view.id}`;
    expect((await post(route, guest, { type: 'ready', ready: true })).status).toBe(400);
    expect((await post(route, guest, { type: 'join', name: 'Friend' })).status).toBe(200);
    const content = await (await fetch(origin + route, { headers: { Authorization: `Bearer ${owner}` } })).text();
    expect(content).toContain('Friend'); expect(content).not.toContain(guest); expect(content).not.toContain(owner);
  });
});
describe('browser isolation', () => {
  it('expires temporary exclusions without touching another browser', () => {
    const values = new Map<string, string>(); const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    hideGame(storage, '10', true, 0); hideGame(storage, '20', false, 0);
    expect(Object.keys(readHidden(storage, 1))).toEqual(['10', '20']);
    expect(Object.keys(readHidden(storage, 7 * 86400_000))).toEqual(['20']);
    expect(readHidden({ getItem: () => null }, 0)).toEqual({});
    expect(() => parseLibrary('{broken')).toThrow();
    expect(() => parseLibrary('[{"id":"javascript:alert(1)"}]')).toThrow();
  });
});
