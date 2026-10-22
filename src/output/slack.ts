import type { SlackPayload } from '../render/slack.js';
import { cancelResponse, retryAfterMilliseconds, RetryBudget } from '../http/safety.js';

export interface SlackDeliveryOptions {
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  retries?: number;
  timeoutMs?: number;
}

export function validateSlackWebhook(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Slack webhook environment variable is not a valid URL.');
  }
  const allowed = url.hostname === 'hooks.slack.com' || url.hostname === 'hooks.slack-gov.com';
  if (url.protocol !== 'https:' || url.username || url.password || !allowed || !url.pathname.startsWith('/services/')) {
    throw new Error('Slack webhook must be an HTTPS hooks.slack.com (or GovSlack) /services URL.');
  }
  return url;
}

export async function deliverSlack(
  webhookValue: string,
  payload: SlackPayload,
  options: SlackDeliveryOptions = {},
): Promise<void> {
  const url = validateSlackWebhook(webhookValue);
  const fetcher = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(retries) || retries < 0 || retries > 5) {
    throw new RangeError('Slack retries must be an integer from 0 to 5.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new RangeError('Slack timeoutMs must be from 1000 to 60000.');
  }

  const budget = new RetryBudget(timeoutMs, retries);
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response: Response;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      response = await Promise.race([
        fetcher(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: controller.signal,
        }),
        new Promise<Response>((_resolve, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error(`Slack delivery timed out after ${timeoutMs}ms.`));
          }, Math.min(timeoutMs, budget.remaining()));
        }),
      ]);
    } catch {
      // Transport diagnostics may contain the credential-bearing webhook URL.
      throw new Error('Slack delivery failed without retry because acceptance was ambiguous; transport details were redacted.');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }

    cancelResponse(response);
    if (response.ok) return;
    const retryable = response.status === 429;
    if (!retryable || attempt >= retries) {
      throw new Error(`Slack delivery failed with HTTP ${response.status}; webhook value was redacted.`);
    }
    const retryAfter = retryAfterMilliseconds(response.headers.get('retry-after'));
    await budget.wait(retryAfter ?? 250 * 2 ** attempt, sleep);
  }
}
