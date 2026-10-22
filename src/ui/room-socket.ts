import { ServerResponse, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { sameOrigin, betaGate, WindowLimit } from './beta.js';
import { authorizeRequestHost } from './request-host.js';
import { roomTokenSchema } from '../rooms/engine.js';
import { roomPush, roomPushKey, roomSnapshot } from './rooms.js';

export function attachRoomSockets(server: Server, host: string, port: number, cwd: string, allowOtherUpgrades = false): () => void {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 256, perMessageDeflate: false });
  const attempts = new WindowLimit(120);
  server.on('upgrade', (request, socket, head) => {
    let pathname: string;
    try { pathname = new URL(request.url ?? '/', 'http://local').pathname; }
    catch { socket.destroy(); return; }
    if (!pathname.match(/^\/api\/rooms\/[a-f0-9-]{36}\/live$/i)) {
      if (!allowOtherUpgrades) socket.destroy();
      return;
    }
    socket.on('error', () => {});
    void (async () => {
      if (!authorizeRequestHost(request, host, request.socket.localPort ?? port) || !sameOrigin(request) || sockets.clients.size >= 800 || !attempts.allow('all')) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
      }
      const response = new ServerResponse(request); response.assignSocket(socket as Socket);
      if (await betaGate(request, response)) { socket.end(); return; }
      response.detachSocket(socket as Socket);
      sockets.handleUpgrade(request, socket, head, ws => {
        ws.on('error', () => {});
        const roomId = new URL(request.url!, 'http://local').pathname.split('/')[3]!;
        let unsubscribe: (() => void) | undefined;
        let authenticating = false;
        const timeout = setTimeout(() => ws.terminate(), 5000);
        ws.on('close', () => { clearTimeout(timeout); unsubscribe?.(); });
        // Credentials are sent once inside the encrypted connection, never in URLs.
        ws.on('message', data => {
          if (authenticating) { ws.close(1008, '不支援的訊息'); return; }
          authenticating = true;
          void (async () => {
            const body = JSON.parse(data.toString()) as { token?: unknown };
            const token = roomTokenSchema.parse(body.token);
            const storeCwd = process.env.PLAYCISION_BETA === '1' ? cwd : undefined;
            const room = await roomSnapshot(roomId, token, storeCwd);
            if (ws.readyState !== WebSocket.OPEN) return;
            clearTimeout(timeout);
            unsubscribe = roomPush.subscribe(roomPushKey(roomId, storeCwd), room, token, view => {
              if (ws.readyState !== WebSocket.OPEN) return;
              if (!view) { ws.close(1008, '房間已到期或已離開'); return; }
              if (ws.bufferedAmount > 65536) { ws.terminate(); return; }
              ws.send(JSON.stringify(view));
              if (view.phase === 'finished') ws.close(1000, '本輪已結束');
            });
          })().catch(() => ws.close(1008, '無法加入即時同步，請重新加入房間'));
        });
      });
    })().catch(() => socket.destroy());
  });
  return () => { roomPush.close(); for (const ws of sockets.clients) ws.terminate(); sockets.close(); };
}
