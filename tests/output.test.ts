import { describe, expect, it, vi } from 'vitest';
import { resolveWorkspacePath } from '../src/output/files.js';
import { deliverSlack } from '../src/output/slack.js';

describe('output safety', () => {
  it('rejects output path traversal', () => {
    expect(() => resolveWorkspacePath(process.cwd(), '../digest.md')).toThrow('inside .playcision/outputs');
    expect(() => resolveWorkspacePath(process.cwd(), 'package.json')).toThrow('inside .playcision/outputs');
    expect(() => resolveWorkspacePath(process.cwd(), '.playcision/state.json')).toThrow('inside .playcision/outputs');
  });

  it('rejects attacker-controlled webhook hosts', async () => {
    await expect(deliverSlack('https://example.com/services/a/b/c', { text: 'x', blocks: [] })).rejects.toThrow(
      'hooks.slack.com',
    );
  });

  it('retries Slack 429 using retry-after without exposing the secret', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate_limited', { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    await deliverSlack(
      'https://hooks.slack.com/services/secret/value/token',
      { text: 'x', blocks: [] },
      { fetch: fetcher, sleep },
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('does not retry an ambiguous Slack network failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('socket closed'));
    await expect(deliverSlack(
      'https://hooks.slack.com/services/secret/value/token',
      { text: 'x', blocks: [] },
      { fetch: fetcher },
    )).rejects.toThrow('acceptance was ambiguous');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Slack credential confidentiality', () => {
  it.each(['https://hooks.slack.com/services/synthetic-secret', 'synthetic-secret', '%73ynthetic-secret'])('redacts transport diagnostics: %s', async (detail) => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(detail));
    let caught: unknown;
    try { await deliverSlack('https://hooks.slack.com/services/synthetic-secret', { text: 'x', blocks: [] }, { fetch: fetcher }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).toContain('acceptance was ambiguous');
    expect((caught as Error).stack).not.toContain(detail);
    expect(JSON.stringify(caught)).not.toContain(detail);
    expect((caught as Error).cause).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['user@', ':pass@', '%75ser:p%61ss@'])('rejects URL userinfo %s before transport', async (userinfo) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(deliverSlack('https://' + userinfo + 'hooks.slack.com/services/synthetic-secret', { text: 'x', blocks: [] }, { fetch: fetcher })).rejects.toThrow('Slack webhook');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains GovSlack delivery', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'));
    await deliverSlack('https://hooks.slack-gov.com/services/test/value', { text: 'x', blocks: [] }, { fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
