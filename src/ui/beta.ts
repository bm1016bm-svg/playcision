import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { expectedLocalOrigin } from './request-host.js';

export function sameOrigin(req: IncomingMessage): boolean {
  try {
    const origin = new URL(req.headers.origin ?? '');
    return process.env.PLAYCISION_BETA === '1'
      ? origin.origin === process.env.PUBLIC_ORIGIN
      : origin.origin === expectedLocalOrigin(req);
  } catch { return false; }
}
export class WindowLimit {
  private buckets = new Map<string, { count: number; until: number }>();
  constructor(private max: number, private windowMs = 60_000) {}
  allow(key: string, now = Date.now()): boolean {
    for (const [id, bucket] of this.buckets) if (bucket.until <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 2048) return false;
      bucket = { count: 0, until: now + this.windowMs }; this.buckets.set(key, bucket);
    }
    return ++bucket.count <= this.max;
  }
}
export function signSession(expires: number, secret: string): string {
  const value = String(expires);
  return `${value}.${createHmac('sha256', secret).update(value).digest('hex')}`;
}
export function validSession(value: string, secret: string, now = Date.now()): boolean {
  if (!/^\d{13}\.[a-f0-9]{64}$/.test(value)) return false;
  const expires = Number(value.split('.')[0]);
  if (expires <= now || expires > now + 7 * 86400_000) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(signSession(expires, secret)));
}
const loginLimit = new WindowLimit(20);
const apiLimit = new WindowLimit(2400);
const mutationLimit = new WindowLimit(600);
export async function betaGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (process.env.PLAYCISION_BETA !== '1') return false;
  const pathname = new URL(req.url ?? '/', 'http://local').pathname;
  const send = (status: number, text: string, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(text);
  };
  if (pathname === '/healthz' && req.method === 'GET') { send(200, 'ok'); return true; }
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32 || (process.env.BETA_INVITE_CODE?.length ?? 0) < 16) { send(503, '內測入口尚未設定完成'); return true; }
  const cookie = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('pc_beta='))?.slice(8) ?? '';
  if (pathname === '/beta/login' && req.method === 'POST') {
    // Global bound also works when all connections arrive through the reverse proxy.
    if (!sameOrigin(req) || !loginLimit.allow('login')) { send(429, '請稍後再試'); return true; }
    let body = '';
    for await (const chunk of req) { body += String(chunk); if (Buffer.byteLength(body) > 2048) { send(413, '資料過大'); return true; } }
    const code = new URLSearchParams(body).get('code') ?? '';
    const hash = (v: string) => createHmac('sha256', secret).update(v).digest();
    if (!timingSafeEqual(hash(code), hash(process.env.BETA_INVITE_CODE ?? ''))) { send(403, '邀請碼不正確，請返回重試。'); return true; }
    const secure = process.env.PUBLIC_ORIGIN?.startsWith('https:') ? '; Secure' : '';
    res.setHeader('Set-Cookie', `pc_beta=${signSession(Date.now() + 7 * 86400_000, secret)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secure}`);
    const destination = new URLSearchParams(body).get('return') ?? '/';
    res.writeHead(303, { Location: /^\/\?room=[a-f0-9-]{36}$/.test(destination) ? destination : '/', 'Cache-Control': 'no-store' }); res.end(); return true;
  }
  if (!validSession(cookie, secret)) {
    if (pathname.startsWith('/api/')) { send(401, JSON.stringify({ error: '內測通行已到期，請重新整理並輸入邀請碼。' }), 'application/json'); return true; }
    const room = new URL(req.url ?? '/', 'http://local').searchParams.get('room') ?? '';
    const destination = /^[a-f0-9-]{36}$/.test(room) ? `/?room=${room}` : '/';
    send(200, '<!doctype html><html lang="zh-Hant"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Playcision 內測</title><style>body{margin:0;background:#0b1015;color:#eff2f4;font:16px system-ui;min-height:100svh;display:grid;place-items:center}main{width:min(360px,85vw)}h1{font-size:36px}p{color:#a9b3bc;line-height:1.7}input,button{box-sizing:border-box;width:100%;padding:16px;border-radius:12px;border:1px solid #48515a;background:#151d24;color:inherit;font:inherit;margin:8px 0}button{background:#c0dc96;color:#182111;cursor:pointer}</style><main><h1>Playcision</h1><p>用邀請碼加入內測，一起找到今晚想玩的遊戲。</p><form method="post" action="/beta/login"><input type="hidden" name="return" value="' + destination + '"><label for="code">邀請碼</label><input id="code" name="code" type="password" required maxlength="128" autocomplete="current-password"><button>開始探索</button></form></main></html>', 'text/html; charset=utf-8');
    return true;
  }
  if (pathname.startsWith('/api/') && (!apiLimit.allow('all') || (req.method === 'POST' && !mutationLimit.allow('writes')))) {
    res.setHeader('Retry-After', '60'); send(429, JSON.stringify({ error: '目前使用人數較多，請稍後再試。' }), 'application/json'); return true;
  }
  return false;
}
