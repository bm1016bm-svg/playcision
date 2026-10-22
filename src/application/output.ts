import type { PlaycisionConfig } from '../config/schema.js';
import type { Digest, Game, Recommendation } from '../domain/types.js';
import { resolveWorkspacePath, writeOutputFile } from '../output/files.js';
import { deliverSlack } from '../output/slack.js';
import { renderJson } from '../render/json.js';
import { renderMarkdownDigest, renderMarkdownGames } from '../render/markdown.js';
import { renderSlackDigest } from '../render/slack.js';
import { renderTerminalDigest, renderTerminalGames, renderTerminalRoll } from '../render/terminal.js';

export type OutputFormat = 'terminal' | 'markdown' | 'json';

export function renderGameCommand(
  title: string,
  value: Game[] | Recommendation,
  format: OutputFormat,
  options: { color?: boolean } = {},
): string {
  if (format === 'json') return renderJson(value);
  if ('game' in value) {
    if (format === 'markdown') {
      const digest: Digest = {
        generatedAt: value.game.source.fetchedAt,
        discover: [],
        deals: [],
        roll: value,
        warnings: [],
      };
      return renderMarkdownDigest(digest);
    }
    return renderTerminalRoll(value, options);
  }
  return format === 'markdown'
    ? renderMarkdownGames(title, value)
    : renderTerminalGames(title, value, options);
}

export function renderDigestCommand(digest: Digest, format: OutputFormat, options: { color?: boolean } = {}): string {
  if (format === 'json') return renderJson(digest);
  if (format === 'markdown') return renderMarkdownDigest(digest);
  return renderTerminalDigest(digest, options);
}

export interface DeliverDigestOptions {
  notify?: boolean;
  dryRun?: boolean;
  fetch?: typeof globalThis.fetch;
}

export interface DeliveryResult {
  files: string[];
  slack: 'disabled' | 'dry-run' | 'sent';
}

export async function deliverDigestOutputs(
  cwd: string,
  config: PlaycisionConfig,
  digest: Digest,
  options: DeliverDigestOptions = {},
): Promise<DeliveryResult> {
  if (options.dryRun) {
    return { files: [], slack: config.outputs.slack.enabled && options.notify ? 'dry-run' : 'disabled' };
  }
  if (
    config.outputs.markdown.enabled &&
    config.outputs.json.enabled &&
    resolveWorkspacePath(cwd, config.outputs.markdown.path) ===
      resolveWorkspacePath(cwd, config.outputs.json.path)
  ) {
    throw new Error('Markdown and JSON outputs must use different files inside .playcision/outputs.');
  }
  const files: string[] = [];
  if (config.outputs.markdown.enabled) {
    files.push(await writeOutputFile(cwd, config.outputs.markdown.path, renderMarkdownDigest(digest)));
  }
  if (config.outputs.json.enabled) {
    files.push(await writeOutputFile(cwd, config.outputs.json.path, renderJson(digest)));
  }

  if (config.outputs.slack.enabled && options.notify) {
    const webhook = process.env[config.outputs.slack.webhookEnv];
    if (!webhook) throw new Error(`${config.outputs.slack.webhookEnv} is required for Slack output.`);
    try {
      await deliverSlack(webhook, renderSlackDigest(digest), options.fetch ? { fetch: options.fetch } : {});
    } catch (error) {
      const partial = files.length > 0 ? ` ${files.length} file output(s) were already written.` : '';
      throw new Error(`${error instanceof Error ? error.message : String(error)}${partial}`);
    }
    return { files, slack: 'sent' };
  }
  return { files, slack: 'disabled' };
}
