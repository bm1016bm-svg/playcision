import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getProjectPaths, loadConfig } from './config/load.js';
import type { GameProvider } from './domain/types.js';
import { validateOutputPath } from './output/files.js';
import { playcisionStateSchema } from './state/schema.js';
import { validateSlackWebhook } from './output/slack.js';
import { terminalTheme } from './ui/theme.js';
import { terminalText } from './ui/terminal-text.js';

export type DiagnosticLevel = 'pass' | 'warn' | 'fail';

export interface Diagnostic {
  id: string;
  level: DiagnosticLevel;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  diagnostics: Diagnostic[];
}

export async function runDoctor(
  cwd: string,
  options: { offline?: boolean; provider?: GameProvider } = {},
): Promise<DoctorReport> {
  const diagnostics: Diagnostic[] = [];
  const [major = 0, minor = 0] = process.versions.node
    .split('.')
    .slice(0, 2)
    .map((part) => Number.parseInt(part, 10));
  const supportedNode = major > 22 || (major === 22 && minor >= 12);
  diagnostics.push({
    id: 'runtime.node',
    level: supportedNode ? 'pass' : 'fail',
    message: supportedNode
      ? `Node ${process.versions.node}`
      : `Node ${process.versions.node}; Playcision requires Node 22.12 or newer.`,
  });

  let config;
  try {
    config = await loadConfig(cwd);
    diagnostics.push({ id: 'config.schema', level: 'pass', message: 'config.yaml is valid schema v1.' });
  } catch (error) {
    diagnostics.push({ id: 'config.schema', level: 'fail', message: (error as Error).message });
    return { ok: false, generatedAt: new Date().toISOString(), diagnostics };
  }

  const paths = getProjectPaths(cwd);
  try {
    await access(paths.root, constants.W_OK);
    diagnostics.push({ id: 'filesystem.root', level: 'pass', message: '.playcision is writable.' });
  } catch {
    diagnostics.push({ id: 'filesystem.root', level: 'fail', message: '.playcision is not writable.' });
  }

  if (config.state.enabled) {
    try {
      const raw: unknown = JSON.parse(await readFile(paths.state, 'utf8'));
      const parsed = playcisionStateSchema.safeParse(raw);
      diagnostics.push({
        id: 'state.schema',
        level: parsed.success ? 'pass' : 'fail',
        message: parsed.success ? 'state.json is valid schema v1.' : 'state.json is invalid or has an unsupported version.',
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      diagnostics.push({
        id: 'state.schema',
        level: code === 'ENOENT' ? 'warn' : 'fail',
        message: code === 'ENOENT' ? 'state.json will be created on the first run.' : 'state.json is invalid; it was not modified.',
      });
    }
  } else {
    diagnostics.push({
      id: 'state.disabled',
      level: 'warn',
      message: 'State is disabled; dedupe, price changes, local observed lows, and persistent skips are unavailable.',
    });
  }

  for (const [name, configuredPath] of [
    ['Markdown', config.outputs.markdown.path],
    ['JSON', config.outputs.json.path],
  ] as const) {
    try {
      await validateOutputPath(cwd, configuredPath);
      diagnostics.push({ id: `output.${name.toLowerCase()}.path`, level: 'pass', message: `${name} output stays inside .playcision/outputs.` });
    } catch (error) {
      diagnostics.push({ id: `output.${name.toLowerCase()}.path`, level: 'fail', message: (error as Error).message });
    }
  }

  if (config.outputs.markdown.enabled && config.outputs.json.enabled) {
    try {
      const markdown = await validateOutputPath(cwd, config.outputs.markdown.path);
      const json = await validateOutputPath(cwd, config.outputs.json.path);
      const distinct = markdown !== json;
      diagnostics.push({
        id: 'output.paths.distinct',
        level: distinct ? 'pass' : 'fail',
        message: distinct
          ? 'Enabled output sinks use distinct files.'
          : 'Markdown and JSON outputs resolve to the same file.',
      });
    } catch {
      // Individual path diagnostics above already contain the actionable error.
    }
  }

  if (config.outputs.slack.enabled) {
    const value = process.env[config.outputs.slack.webhookEnv];
    if (!value) {
      diagnostics.push({
        id: 'output.slack.secret',
        level: 'fail',
        message: `${config.outputs.slack.webhookEnv} is not set. The value was not read or logged.`,
      });
    } else {
      try {
        validateSlackWebhook(value);
        diagnostics.push({ id: 'output.slack.secret', level: 'pass', message: 'Slack webhook shape is valid; value redacted.' });
      } catch (error) {
        diagnostics.push({ id: 'output.slack.secret', level: 'fail', message: (error as Error).message });
      }
    }
  } else {
    diagnostics.push({ id: 'output.slack.disabled', level: 'pass', message: 'Slack output is disabled.' });
  }

  if (config.schedule.type === 'github') {
    try {
      const workflow = await readFile(path.join(cwd, '.github', 'workflows', 'playcision-digest.yml'), 'utf8');
      const valid = workflow.includes(`timezone: "${config.schedule.timezone}"`) && workflow.includes('workflow_dispatch:');
      diagnostics.push({
        id: 'schedule.github',
        level: valid ? 'pass' : 'fail',
        message: valid ? 'GitHub Actions schedule is present with manual dispatch.' : 'Generated GitHub workflow is out of sync.',
      });
    } catch {
      diagnostics.push({ id: 'schedule.github', level: 'fail', message: 'GitHub Actions schedule is configured but missing.' });
    }
  }

  if (options.offline) {
    diagnostics.push({ id: 'provider.steam', level: 'warn', message: 'Steam reachability skipped in offline mode.' });
  } else if (options.provider) {
    try {
      const result = await options.provider.diagnose();
      diagnostics.push({
        id: 'provider.steam',
        level: result.ok ? 'pass' : 'fail',
        message: `${result.message}${result.latencyMs === undefined ? '' : ` (${result.latencyMs} ms)`}`,
      });
    } catch {
      diagnostics.push({
        id: 'provider.steam',
        level: 'fail',
        message: 'Steam provider check failed. No credentials or response body were logged.',
      });
    }
  } else {
    diagnostics.push({ id: 'provider.steam', level: 'warn', message: 'Steam provider check was not supplied.' });
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.level === 'fail'),
    generatedAt: new Date().toISOString(),
    diagnostics,
  };
}

export function renderDoctorReport(report: DoctorReport, options: { color?: boolean } = {}): string {
  const t = terminalTheme(options);
  const lines = report.diagnostics.map((diagnostic) => {
    const label = diagnostic.level === 'pass' ? '[PASS]' : diagnostic.level === 'warn' ? '[WARN]' : '[FAIL]';
    const styled = diagnostic.level === 'pass' ? t.success(label) : diagnostic.level === 'warn' ? t.warning(label) : t.danger(label);
    return `${styled} ${terminalText(diagnostic.id)} // ${terminalText(diagnostic.message)}`;
  });
  return [`${t.accent('//')} ${t.heading('PLAYCISION DOCTOR')}`, ...lines].join('\n');
}
