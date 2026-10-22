#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { Command, Option } from 'commander';
import { buildAndDeliverDigest, createSteamProvider, dealGames, discoverGames, rollGame } from './application/service.js';
import { renderDigestCommand, renderGameCommand, type OutputFormat } from './application/output.js';
import { updateRollState, type RollStateAction } from './application/preferences.js';
import { loadConfig } from './config/load.js';
import { runDoctor, renderDoctorReport } from './doctor.js';
import { runInitWizard } from './init/wizard.js';
import { launchSteamGame, openSteamStore } from './platform/open.js';
import { SteamProviderError } from './provider/errors.js';
import { startUiServer } from './ui/server.js';
import { VERSION } from './version.js';
import { terminalText } from './ui/terminal-text.js';

interface GlobalOptions {
  cwd: string;
  plain?: boolean | undefined;
}

function globalOptions(command: Command): GlobalOptions {
  const options = command.optsWithGlobals<GlobalOptions>();
  return { cwd: path.resolve(options.cwd), plain: options.plain };
}

function print(value: string): void {
  process.stdout.write(value.endsWith('\n') ? value : `${value}\n`);
}

function parseInteger(value: string): number {
  const result = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`Expected a non-negative integer, received: ${value}`);
  return result;
}

function parsePort(value: string): number {
  const result = parseInteger(value);
  if (result < 1 || result > 65_535) throw new Error(`Expected a port between 1 and 65535, received: ${value}`);
  return result;
}

function setLimit<T>(items: T[], limit: string | undefined): T[] {
  if (limit === undefined) return items;
  const parsed = parseInteger(limit);
  return items.slice(0, parsed);
}

function formatOption(): Option {
  return new Option('-f, --format <format>', 'terminal, markdown, or json')
    .choices(['terminal', 'markdown', 'json'])
    .default('terminal');
}

function colorOptions(plain: boolean | undefined): { color?: boolean } {
  return plain ? { color: false } : {};
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name('playcision')
    .description('Stop browsing. Start playing. // local-first game discovery, deals, and deterministic rolls')
    .version(VERSION)
    .option('--cwd <path>', 'project directory containing .playcision', process.cwd())
    .option('--plain', 'disable ANSI colors')
    .showHelpAfterError()
    .addHelpText('after', '\nGame of Throws / 擲戲之王\n');

  program
    .command('ui')
    .description('launch the local swipe-first game discovery dashboard')
    .option('--host <host>', 'listen host; loopback is private by default', '127.0.0.1')
    .option('-p, --port <port>', 'listen port', parsePort, 4173)
    .option('--open', 'open the UI in the default browser')
    .option('--dev', 'serve the UI through Vite with hot reload')
    .action(async (
      options: { host: string; port: number; open?: boolean; dev?: boolean },
      command: Command,
    ) => {
      const { cwd } = globalOptions(command);
      await startUiServer({
        cwd,
        host: options.host,
        port: options.port,
        ...(options.open === undefined ? {} : { open: options.open }),
        ...(options.dev === undefined ? {} : { dev: options.dev }),
      });
    });

  program
    .command('init')
    .description('create .playcision/config.yaml with an interactive agent-friendly wizard')
    .option('-y, --yes', 'use safe defaults without prompts')
    .option('--force', 'regenerate generated files after review; existing state.json is preserved')
    .action(async (options: { yes?: boolean; force?: boolean }, command: Command) => {
      const { cwd } = globalOptions(command);
      const created = await runInitWizard(cwd, options);
      if (options.yes) print(`Initialized Playcision. Created ${created.length} files. Run: playcision doctor --offline`);
    });

  program
    .command('discover')
    .description('get live new and recently released games matching your preferences')
    .addOption(formatOption())
    .option('-n, --limit <count>', 'limit displayed results')
    .action(async (options: { format: OutputFormat; limit?: string }, command: Command) => {
      const { cwd, plain } = globalOptions(command);
      const games = setLimit(await discoverGames(cwd), options.limit);
      print(renderGameCommand('Discover', games, options.format, colorOptions(plain)));
    });

  program
    .command('deals')
    .description('get current deals, tracked App IDs, price changes, and local observed lows')
    .addOption(formatOption())
    .option('-n, --limit <count>', 'limit displayed results')
    .action(async (options: { format: OutputFormat; limit?: string }, command: Command) => {
      const { cwd, plain } = globalOptions(command);
      const games = setLimit(await dealGames(cwd), options.limit);
      print(renderGameCommand('Deals', games, options.format, colorOptions(plain)));
    });

  program
    .command('roll')
    .description('deterministically choose one game from the current eligible pool')
    .addOption(formatOption())
    .option('--seed <seed>', 'replayable seed, for example friday-night')
    .option('--reroll <counter>', 'zero-based reroll counter', parseInteger, 0)
    .option('--installed', 'add locally installed Steam games to the candidate pool')
    .option('--skip <appId>', 'temporarily skip a Steam App ID')
    .option('--unskip <appId>', 'remove a temporary skip')
    .option('--skip-days <days>', 'temporary skip duration', parseInteger, 7)
    .option('--exclude <appId>', 'permanently exclude a Steam App ID')
    .option('--include <appId>', 'undo a permanent exclusion')
    .option('--open-store', 'open the selected Steam store page')
    .option('--launch', 'launch the selected game through the Steam protocol')
    .action(async (
      options: {
        format: OutputFormat;
        seed?: string;
        reroll: number;
        installed?: boolean;
        skip?: string;
        unskip?: string;
        skipDays: number;
        exclude?: string;
        include?: string;
        openStore?: boolean;
        launch?: boolean;
      },
      command: Command,
    ) => {
      const { cwd, plain } = globalOptions(command);
      const stateActions: Array<[RollStateAction, string | undefined]> = [
        ['skip', options.skip],
        ['unskip', options.unskip],
        ['exclude', options.exclude],
        ['include', options.include],
      ];
      const requested = stateActions.filter(([, appId]) => appId !== undefined) as Array<[RollStateAction, string]>;
      if (requested.length > 1) throw new Error('Use only one of --skip, --unskip, --exclude, or --include per command.');
      if (requested[0]) {
        const [action, appId] = requested[0];
        print(await updateRollState(cwd, action, appId, { days: options.skipDays }));
        return;
      }
      if (options.openStore && options.launch) throw new Error('Use either --open-store or --launch, not both.');
      const recommendation = await rollGame(cwd, {
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        reroll: options.reroll,
        ...(options.installed === undefined ? {} : { installed: options.installed }),
      });
      if (!recommendation) {
        process.exitCode = 4;
        throw new Error('No eligible games. Relax Roll filters, skips, exclusions, or price cap.');
      }
      print(renderGameCommand('Roll', recommendation, options.format, colorOptions(plain)));
      if (options.openStore) await openSteamStore(recommendation.game.id);
      if (options.launch) await launchSteamGame(recommendation.game.id);
    });

  program
    .command('digest')
    .description('build Discover + Deals + Roll and deliver configured outputs')
    .addOption(formatOption())
    .option('--notify', 'send enabled notification sinks such as Slack')
    .option('--dry-run', 'print without writing outputs, state, or notifications')
    .option('--no-roll', 'omit Roll from the digest')
    .action(async (
      options: { format: OutputFormat; notify?: boolean; dryRun?: boolean; roll: boolean },
      command: Command,
    ) => {
      const { cwd, plain } = globalOptions(command);
      const result = await buildAndDeliverDigest(cwd, {
        ...(options.notify === undefined ? {} : { notify: options.notify }),
        ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        includeRoll: options.roll,
      });
      print(renderDigestCommand(result.digest, options.format, colorOptions(plain)));
      if (result.delivery.files.length > 0 && options.format === 'terminal') {
        print(`// WROTE ${result.delivery.files.map(terminalText).join(', ')}`);
      }
      if (result.delivery.slack === 'sent' && options.format === 'terminal') print('// SLACK SENT');
    });

  program
    .command('doctor')
    .description('validate config, state, outputs, schedule, secrets, and Steam reachability')
    .option('--offline', 'skip Steam network diagnostics')
    .option('--json', 'emit an agent-readable JSON report')
    .action(async (options: { offline?: boolean; json?: boolean }, command: Command) => {
      const { cwd, plain } = globalOptions(command);
      let provider;
      if (!options.offline) {
        const config = await loadConfig(cwd);
        provider = createSteamProvider(config);
      }
      const report = await runDoctor(cwd, {
        ...(options.offline === undefined ? {} : { offline: options.offline }),
        ...(provider ? { provider } : {}),
      });
      print(options.json ? JSON.stringify(report, null, 2) : renderDoctorReport(report, colorOptions(plain)));
      if (!report.ok) process.exitCode = 2;
    });

  return program;
}

function classifyExitCode(error: unknown): number {
  if (process.exitCode && process.exitCode !== 0) return Number(process.exitCode);
  if (error instanceof SteamProviderError) return 3;
  const message = error instanceof Error ? error.message : String(error);
  if (/Slack delivery|required for Slack/i.test(message)) return 5;
  if (/config|initialized|YAML|state|App ID|Expected|Use only|requires Node/i.test(message)) return 2;
  return 1;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    process.exitCode = classifyExitCode(error);
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`playcision: ${terminalText(message)}\n`);
    if (process.env.PLAYCISION_DEBUG === '1' && error instanceof Error && error.stack) {
      process.stderr.write(`${terminalText(error.stack)}\n`);
    }
  }
}

await main();
