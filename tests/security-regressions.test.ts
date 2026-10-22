import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newRoom, changeRoom } from '../src/rooms/engine.js';
import { RoomStore } from '../src/ui/room-store.js';
import { handleRooms } from '../src/ui/rooms.js';
import { authorizeRequestHost } from '../src/ui/request-host.js';
import { sameOrigin } from '../src/ui/beta.js';
import { SteamProvider } from '../src/provider/steam.js';
import { deliverSlack } from '../src/output/slack.js';
import { boundedResponseText, retryAfterMilliseconds, RetryBudget } from '../src/http/safety.js';
import { terminalText } from '../src/ui/terminal-text.js';
import { renderDoctorReport } from '../src/doctor.js';
import worker from '../cloud/worker.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs(); vi.useRealTimers();
  await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});
async function temporary() { const dir = await mkdtemp(path.join(os.tmpdir(), 'pc-security-')); directories.push(dir); return dir; }
function request(host: string, origin?: string, address = '127.0.0.1', method = 'GET') {
  return { headers: { host, ...(origin ? { origin } : {}) }, socket: { localAddress: address, localPort: 4174 }, method, url: '/api/digest' } as IncomingMessage;
}
function provider(fetcher: typeof fetch, overrides = {}) {
  return new SteamProvider({ country: 'TW', language: 'tchinese', currency: 'TWD', maxPages: 1, requestDelayMs: 0, timeoutMs: 1000, maxRetries: 1, fetch: fetcher, ...overrides });
}

describe('room persistence admission', () => {
  it('rejects malformed create/join tokens at HTTP and engine boundaries without changing the valid snapshot', async () => {
    vi.stubEnv('PLAYCISION_BETA', '0');
    const cwd = await temporary(); const id = randomUUID(); const token = randomUUID();
    await new RoomStore(cwd).run(rooms => rooms.set(id, newRoom(id, 'Owner', token, Date.now())));
    const file = path.join(cwd, '.playcision', 'rooms.json'); const before = await readFile(file, 'utf8');
    for (const bad of ['a'.repeat(36), '--------'.repeat(4) + '----', 'aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa']) {
      expect(() => newRoom(randomUUID(), 'Owner', bad, 0)).toThrow();
      expect(() => changeRoom(newRoom(id, 'Owner', token, 0), { type: 'join', name: 'Guest' }, bad, 0)).toThrow();
      for (const route of ['/api/rooms', `/api/rooms/${id}`]) {
        const req = Object.assign(Readable.from([JSON.stringify({ name: 'Guest', type: 'join' })]), request('127.0.0.1:4174', 'http://127.0.0.1:4174', '127.0.0.1', 'POST'), { url: route });
        req.headers.authorization = `Bearer ${bad}`;
        let status = 200;
        const res = { setHeader() {}, set statusCode(value: number) { status = value; }, end() {} } as unknown as ServerResponse;
        await handleRooms(req as unknown as IncomingMessage, res, cwd);
        expect(status).toBe(400);
      }
    }
    expect(await readFile(file, 'utf8')).toBe(before);
    expect(await new RoomStore(cwd).run(rooms => rooms.get(id)?.players[0]?.token)).toBe(token);
  });
  it('rolls back an invalid transaction before disk publication', async () => {
    const cwd = await temporary(); const id = randomUUID(); const token = randomUUID(); const store = new RoomStore(cwd);
    await store.run(rooms => rooms.set(id, newRoom(id, 'Owner', token, 0)), 0);
    const before = await readFile(path.join(cwd, '.playcision/rooms.json'), 'utf8');
    await expect(store.run(rooms => { rooms.get(id)!.players[0]!.token = 'a'.repeat(36); }, 1)).rejects.toThrow();
    expect(await readFile(path.join(cwd, '.playcision/rooms.json'), 'utf8')).toBe(before);
    expect(await store.run(rooms => rooms.get(id)?.players[0]?.token, 2)).toBe(token);
  });
  it('quarantines an old invalid room, preserves the original and reloads unrelated rooms', async () => {
    const cwd = await temporary(); const good = newRoom(randomUUID(), 'Owner', randomUUID(), 0);
    await new RoomStore(cwd).run(rooms => rooms.set(good.id, good), 0);
    const bad = structuredClone(good); bad.id = randomUUID(); bad.players[0]!.token = 'a'.repeat(36);
    const file = path.join(cwd, '.playcision/rooms.json'); const original = JSON.stringify([good, bad]); await writeFile(file, original);
    const warning = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const restarted = new RoomStore(cwd);
    await expect(restarted.run(() => { throw new Error('unknown member'); }, 1)).rejects.toThrow('unknown member');
    expect(await readFile(file, 'utf8')).toBe(original);
    expect(await restarted.run(rooms => { rooms.get(good.id)!.nextPlayerId++; return [...rooms.keys()]; }, 1)).toEqual([good.id]);
    const backup = (await readdir(path.dirname(file))).find(f => f.startsWith('rooms.quarantine-'))!;
    expect(await readFile(path.join(path.dirname(file), backup), 'utf8')).toBe(original);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('quarantined'));
    expect(await new RoomStore(cwd).run(rooms => rooms.has(good.id), 2)).toBe(true);
    expect(await new RoomStore(cwd).run(rooms => rooms.size, 600_000)).toBe(0);
  });
});

describe('trusted HTTP authority', () => {
  it('rejects matching attacker Host and Origin for reads and writes', () => {
    vi.stubEnv('PLAYCISION_BETA', '0');
    for (const method of ['GET', 'POST']) {
      const req = request('attacker.invalid:4174', 'http://attacker.invalid:4174', '127.0.0.1', method);
      expect(authorizeRequestHost(req, '127.0.0.1', 4174)).toBe(false); expect(sameOrigin(req)).toBe(false);
    }
    for (const host of ['localhost:4174@attacker.invalid', '127.0.0.1:4174/evil', '127.0.0.1:9999', 'attacker.invalid.:4174']) expect(authorizeRequestHost(request(host), '127.0.0.1', 4174)).toBe(false);
  });
  it('preserves localhost, IPv6, explicit LAN host and ordinary GET without Origin', () => {
    vi.stubEnv('PLAYCISION_BETA', '0');
    for (const host of ['localhost:4174', '127.0.0.1:4174', '[::1]:4174']) {
      const req = request(host, `http://${host}`); expect(authorizeRequestHost(req, '127.0.0.1', 4174)).toBe(true); expect(sameOrigin(req)).toBe(true);
    }
    expect(authorizeRequestHost(request('127.0.0.1:4174'), '127.0.0.1', 4174)).toBe(true);
    const lan = request('games.lan:4174', 'http://games.lan:4174', '192.168.1.10');
    expect(authorizeRequestHost(lan, 'games.lan', 4174)).toBe(true); expect(sameOrigin(lan)).toBe(true);
  });
  it('preserves public beta reverse proxy authority and loopback health only', () => {
    vi.stubEnv('PLAYCISION_BETA', '1'); vi.stubEnv('PUBLIC_ORIGIN', 'https://beta.example.com');
    const req = request('beta.example.com', 'https://beta.example.com');
    expect(authorizeRequestHost(req, '0.0.0.0', 4174)).toBe(true); expect(sameOrigin(req)).toBe(true);
    expect(authorizeRequestHost(request('attacker.invalid'), '0.0.0.0', 4174)).toBe(false);
    const health = request('127.0.0.1:4174'); health.url = '/healthz';
    expect(authorizeRequestHost(health, '0.0.0.0', 4174)).toBe(true);
    health.url = '/api/digest'; expect(authorizeRequestHost(health, '0.0.0.0', 4174)).toBe(false);
  });
});

describe('upstream resource limits', () => {
  it.each([undefined, '1'])('cancels oversized streamed bodies with Content-Length %s', async length => {
    let generated = 0; let cancelled = false;
    const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      pull(controller) { generated += 512; controller.enqueue(new Uint8Array(512)); }, cancel() { cancelled = true; },
    }), { headers: length ? { 'content-length': length } : {} }));
    await expect(provider(fetcher, { maxResponseBytes: 1024 }).getPresentation('10')).rejects.toMatchObject({ code: 'STEAM_SCHEMA_DRIFT' });
    expect(cancelled).toBe(true); expect(generated).toBeLessThanOrEqual(2048); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('counts UTF-8 bytes and accepts an exact limit split across chunks', async () => {
    const encoded = new TextEncoder().encode('中文');
    const response = () => new Response(new ReadableStream({ start(c) { c.enqueue(encoded.slice(0, 1)); c.enqueue(encoded.slice(1)); c.close(); } }));
    await expect(boundedResponseText(response(), 6, () => new Error('limit'))).resolves.toBe('中文');
    await expect(boundedResponseText(response(), 5, () => new Error('limit'))).rejects.toThrow('limit');
  });
  it.each(['3600', '999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999', 'Wed, 01 Jan 2098 00:00:00 GMT'])('refuses excessive Retry-After %s in both transports', async header => {
    const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': header } })); const sleep = vi.fn(async () => {});
    await expect(provider(fetcher, { sleep }).getPresentation('10')).rejects.toMatchObject({ code: 'STEAM_TIMEOUT' });
    expect(sleep).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1); fetcher.mockClear();
    await expect(deliverSlack('https://hooks.slack.com/services/FAKE/TEST/ONLY', { text: 'fixture', blocks: [] }, { fetch: fetcher, sleep })).rejects.toThrow('budget');
    expect(sleep).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid numeric aliases and preserves dates and ordinary waits', async () => {
    for (const header of ['-1', '1oops', '1e8', 'Infinity']) expect(retryAfterMilliseconds(header)).toBeUndefined();
    expect(retryAfterMilliseconds('2')).toBe(2000);
    expect(retryAfterMilliseconds('Wed, 01 Jan 2025 00:00:02 GMT', new Date('2025-01-01T00:00:00Z'))).toBe(2000);
    const sleep = vi.fn(async () => {}); await new RetryBudget(1000, 2).wait(250, sleep); expect(sleep).toHaveBeenCalledWith(250);
  });
  it('bounds even a sleep that never resolves', async () => {
    vi.useFakeTimers(); const budget = new RetryBudget(1000, 1);
    const result = expect(budget.wait(250, () => new Promise(() => {}))).rejects.toThrow('deadline');
    await vi.advanceTimersByTimeAsync(2000); await result;
  });
  it('includes configured pacing in the retry deadline without truncating its delay', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'retry-after': '0' } }));
    const sleep = vi.fn(async () => {});
    await expect(provider(fetcher, { requestDelayMs: 10_000, sleep }).getPresentation('10')).rejects.toMatchObject({ code: 'STEAM_TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalledWith(10_000);
  });
});

it('keeps the undeployed Worker fail-closed before any namespace allocation', async () => {
  const idFromName = vi.fn(); const get = vi.fn(); const env = { APP_ORIGIN: 'https://beta.example.com', ROOMS: { idFromName, get } };
  for (const method of ['GET', 'POST', 'OPTIONS']) {
    const response = await worker.fetch(new Request('https://worker.example/api/rooms', { method, headers: { Origin: env.APP_ORIGIN, Authorization: `Bearer ${randomUUID()}` } }), env);
    expect(response.status).toBe(503);
  }
  expect(idFromName).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
});

it('escapes terminal controls without removing Unicode or application layout', () => {
  expect(terminalText('中文 🎮')).toBe('中文 🎮');
  expect(terminalText('\x1b]52;fixture\x07\x9b2J\r\n')).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/u);
  const output = renderDoctorReport({ ok: false, generatedAt: '', diagnostics: [{ id: 'bad\r', level: 'fail', message: '\x1b[2Jhidden' }] }, { color: false });
  expect(output).not.toContain('\x1b'); expect(output).toContain('\\u001b[2J');
});
