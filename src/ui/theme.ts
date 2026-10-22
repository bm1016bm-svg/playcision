import process from 'node:process';
import { createColors } from 'picocolors';
import type { Game, Money } from '../domain/types.js';
import { terminalText } from './terminal-text.js';

export interface ThemeOptions {
  color?: boolean;
  columns?: number;
}

const wordmark = [
  'PLAYCISION // 遊豫不決',
  'STOP BROWSING. START PLAYING.',
  'GAME OF THROWS // 擲戲之王',
];

export function terminalTheme(options: ThemeOptions = {}) {
  const useColor = options.color ?? (Boolean(process.stdout.isTTY) && !('NO_COLOR' in process.env));
  const color = createColors(useColor);
  const columns = Math.max(48, options.columns ?? process.stdout.columns ?? 88);
  const rule = '─'.repeat(Math.min(columns, 88));

  return {
    accent: color.cyan,
    danger: color.red,
    dim: color.dim,
    heading: color.bold,
    info: color.blue,
    rule: color.dim(rule),
    success: color.green,
    warning: color.yellow,
  };
}

export function renderBanner(options: ThemeOptions = {}): string {
  const t = terminalTheme(options);
  return [
    t.rule,
    t.heading(t.accent(wordmark[0]!)),
    t.dim(`${wordmark[1]}  /  ${wordmark[2]}`),
    t.rule,
  ].join('\n');
}

export function formatMoney(money: Money | null): string {
  if (!money) return 'TBA';
  if (money.formatted?.trim()) return money.formatted.trim();
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: money.currency,
      maximumFractionDigits: 2,
    }).format(money.minor / 100);
  } catch {
    return `${money.currency} ${(money.minor / 100).toFixed(2)}`;
  }
}

export function formatGameLine(game: Game, index: number, options: ThemeOptions = {}): string {
  const t = terminalTheme(options);
  const discount = game.price.discountPercent > 0 ? `  ${t.success(`-${game.price.discountPercent}%`)}` : '';
  const price = game.price.isFree ? 'FREE' : formatMoney(game.price.current);
  const tags = [...game.tags, ...game.genres].slice(0, 3).join(' / ');
  const meta = terminalText([price, game.releaseDate, tags].filter(Boolean).join('  ·  '));
  return `${t.dim(String(index + 1).padStart(2, '0'))}  ${t.heading(terminalText(game.name))}${discount}\n    ${t.dim(meta)}\n    ${t.info(terminalText(game.url))}`;
}

export function renderSection(title: string, games: Game[], options: ThemeOptions = {}): string {
  const t = terminalTheme(options);
  const header = `${t.accent('//')} ${t.heading(terminalText(title.toUpperCase()))} ${t.dim(`[${games.length}]`)}`;
  if (games.length === 0) return `${header}\n${t.dim('   No matching games in this live run.')}`;
  return `${header}\n${games.map((game, index) => formatGameLine(game, index, options)).join('\n\n')}`;
}
