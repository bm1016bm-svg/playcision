/** A retry may respect a short upstream delay, but must never hold a run indefinitely. */
export const MAX_RETRY_DELAY_MS = 5_000;

export function retryAfterMilliseconds(value: string | null, now = new Date()): number | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.ceil(Number(text) * 1000);
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), .+ GMT$/.test(text)) return undefined;
  const at = Date.parse(text);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now.getTime());
}

export class RetryDeadlineError extends Error {}

export class RetryBudget {
  private readonly deadline: number;
  constructor(timeoutMs: number, retries: number) { this.deadline = Date.now() + timeoutMs * (retries + 1); }
  remaining(): number {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) throw new RetryDeadlineError('Operation deadline exceeded; retry later.');
    return remaining;
  }
  async wait(delay: number, sleep: (ms: number) => Promise<void>, maximumDelayMs = MAX_RETRY_DELAY_MS): Promise<void> {
    if (!Number.isFinite(delay) || delay < 0 || delay > maximumDelayMs || delay >= this.remaining()) {
      throw new RetryDeadlineError('Retry-After exceeds the retry budget; retry later.');
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([sleep(delay), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RetryDeadlineError('Operation deadline exceeded; retry later.')), this.remaining());
      })]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}

export function cancelResponse(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

export async function boundedResponseText(response: Response, maximum: number, limitError: () => Error): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maximum) { cancelResponse(response); throw limitError(); }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) { void reader.cancel().catch(() => {}); throw limitError(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  } finally { reader.releaseLock(); }
}
