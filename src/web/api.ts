import type { UiPayload } from './types.js';

async function responseJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as { error?: string } & T;
  if (!response.ok) throw new Error(value.error ?? `Request failed with ${response.status}.`);
  return value;
}

export async function fetchDigest(signal?: AbortSignal): Promise<UiPayload> {
  const response = await fetch('/api/digest', {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  });
  return responseJson<UiPayload>(response);
}

export async function updatePreference(
  action: 'skip' | 'exclude',
  appId: string,
): Promise<string> {
  const response = await fetch('/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action, appId, ...(action === 'skip' ? { days: 7 } : {}) }),
  });
  return (await responseJson<{ message: string }>(response)).message;
}
