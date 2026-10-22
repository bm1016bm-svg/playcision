import type { IncomingMessage } from 'node:http';

const approvedOrigins = new WeakMap<IncomingMessage, string>();
const loopback = ['localhost', '127.0.0.1', '[::1]'];

function authority(value: string | undefined, protocol = 'http:'): URL | undefined {
  if (!value || /[\s,/@\\?#]/u.test(value)) return undefined;
  try {
    const parsed = new URL(`${protocol}//${value}`);
    return parsed.pathname === '/' && !parsed.username && !parsed.password ? parsed : undefined;
  } catch { return undefined; }
}

function localOrigin(req: IncomingMessage, bindHost?: string, port = req.socket?.localPort): string | undefined {
  const url = authority(req.headers.host);
  if (!url || !port || Number(url.port || 80) !== port) return undefined;
  const address = req.socket?.localAddress?.replace(/^::ffff:/, '');
  const allowed = new Set(loopback);
  if (address && !['0.0.0.0', '::'].includes(address)) allowed.add(address.includes(':') ? `[${address}]` : address);
  if (bindHost && !['0.0.0.0', '::'].includes(bindHost)) allowed.add(bindHost.includes(':') && !bindHost.startsWith('[') ? `[${bindHost}]` : bindHost.toLowerCase());
  return allowed.has(url.hostname) ? url.origin : undefined;
}

/** Called before every API, static response and dev middleware. */
export function authorizeRequestHost(req: IncomingMessage, bindHost?: string, port?: number): boolean {
  if (process.env.PLAYCISION_BETA === '1') {
    try {
      const expected = new URL(process.env.PUBLIC_ORIGIN ?? '');
      if (authority(req.headers.host, expected.protocol)?.origin === expected.origin) return true;
      // Container health probes use loopback rather than the public TLS hostname.
      return req.method === 'GET' && req.url === '/healthz' && loopback.includes(authority(req.headers.host)?.hostname ?? '') && Boolean(localOrigin(req, undefined, port));
    } catch { return false; }
  }
  const origin = localOrigin(req, bindHost, port);
  if (!origin) return false;
  approvedOrigins.set(req, origin);
  return true;
}

export function expectedLocalOrigin(req: IncomingMessage): string | undefined {
  return approvedOrigins.get(req) ?? localOrigin(req);
}
