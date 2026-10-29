export interface CloudStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  getAlarm(): Promise<number | null>;
  setAlarm(time: number): Promise<void>;
  deleteAll(): Promise<void>;
}
export interface CloudSocket {
  send(value: string): void;
  close(code: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): { token?: string; deadline?: number } | null;
}
export interface CloudState {
  storage: CloudStorage;
  blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T>;
  acceptWebSocket(socket: CloudSocket): void;
  getWebSockets(): CloudSocket[];
}
export interface CloudNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface CloudEnv {
  APP_ORIGIN: string;
  ROOMS: CloudNamespace;
  COORDINATOR?: CloudNamespace;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}
export const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const reply = (status: number, value: unknown) => Response.json(value, {
  status, headers: { 'Cache-Control': 'no-store', ...(status === 429 || status === 503 ? { 'Retry-After': '60' } : {}) },
});

/** Cap actual bytes and wall time, even without Content-Length or with a stalled stream. */
export async function requestText(request: Request, maximum: number): Promise<string> {
  if (Number(request.headers.get('Content-Length')) > maximum) throw new HttpError(413, '資料過大');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder(); let text = ''; let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => {
    reject(new HttpError(408, '傳送逾時，請重試')); void reader.cancel().catch(() => {});
  }, 3000); });
  try {
    while (true) {
      const part = await Promise.race([reader.read(), deadline]);
      if (part.done) return text + decoder.decode();
      size += part.value.byteLength;
      if (size > maximum) { void reader.cancel().catch(() => {}); throw new HttpError(413, '資料過大'); }
      text += decoder.decode(part.value, { stream: true });
    }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
