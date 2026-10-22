import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { handleRooms } from '../src/ui/rooms.js';
import { attachRoomSockets } from '../src/ui/room-socket.js';

let server: Server | undefined; let dispose: (() => void) | undefined;
afterEach(async () => { dispose?.(); if (server) await new Promise<void>(resolve => server!.close(() => resolve())); vi.unstubAllEnvs(); });
async function setup() {
  vi.stubEnv('PLAYCISION_BETA', '0');
  server = createServer((req, res) => { void handleRooms(req, res); });
  dispose = attachRoomSockets(server, '127.0.0.1', 0, '.');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw Error('listen');
  const origin = `http://127.0.0.1:${address.port}`;
  const token = randomUUID();
  const post = async (path: string, body: unknown, credential = token) => {
    const res = await fetch(origin + '/api/rooms' + path, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(res.status).toBe(200); return res.json();
  };
  const room = await post('', { type: 'create', name: 'Host' });
  return { origin, token, room, post };
}
it('authenticates membership, pushes committed changes, and does not leak tokens', async () => {
  const { origin, token, room, post } = await setup();
  const ws = new WebSocket(origin.replace('http:', 'ws:') + `/api/rooms/${room.id}/live`, { origin });
  await once(ws, 'open');
  const initial = once(ws, 'message'); ws.send(JSON.stringify({ token }));
  const first = String((await initial)[0]); expect(JSON.parse(first).players).toHaveLength(1); expect(first).not.toContain(token);
  const updated = once(ws, 'message');
  await post(`/${room.id}`, { type: 'join', name: 'Friend' }, randomUUID());
  expect(JSON.parse(String((await updated)[0])).players).toHaveLength(2);
  ws.close(); await once(ws, 'close');
  const outsider = new WebSocket(origin.replace('http:', 'ws:') + `/api/rooms/${room.id}/live`, { origin });
  await once(outsider, 'open'); outsider.send(JSON.stringify({ token: randomUUID() }));
  const [code] = await once(outsider, 'close'); expect(code).toBe(1008);
});
it('rejects cross-origin upgrades', async () => {
  const { origin, room } = await setup();
  const ws = new WebSocket(origin.replace('http:', 'ws:') + `/api/rooms/${room.id}/live`, { origin: 'https://foreign.invalid' });
  ws.on('error', () => {});
  const response = await new Promise<number>(resolve => ws.once('unexpected-response', (_req, res) => { resolve(res.statusCode!); res.resume(); ws.terminate(); }));
  expect(response).toBe(403);
});

it('keeps the beta login gate on WebSocket upgrades', async () => {
  const { origin, room } = await setup();
  vi.stubEnv('PLAYCISION_BETA', '1'); vi.stubEnv('PUBLIC_ORIGIN', origin);
  vi.stubEnv('SESSION_SECRET', 's'.repeat(32)); vi.stubEnv('BETA_INVITE_CODE', 'i'.repeat(16));
  const ws = new WebSocket(origin.replace('http:', 'ws:') + `/api/rooms/${room.id}/live`, { origin });
  ws.on('error', () => {});
  const status = await new Promise<number>(resolve => ws.once('unexpected-response', (_req, res) => { resolve(res.statusCode!); res.resume(); ws.terminate(); }));
  expect(status).toBe(401);
});
