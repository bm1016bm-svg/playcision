import type { Digest, Game, Recommendation } from '../domain/types.js';
import { terminalText } from '../ui/terminal-text.js';
import { formatGameLine, renderBanner, renderSection, terminalTheme, type ThemeOptions } from '../ui/theme.js';

export function renderTerminalGames(title: string, games: Game[], options: ThemeOptions = {}): string {
  return `${renderBanner(options)}\n${renderSection(title, games, options)}`;
}

export function renderTerminalRoll(recommendation: Recommendation, options: ThemeOptions = {}): string {
  const t = terminalTheme(options);
  const details = [
    `${t.accent('//')} ${t.heading('ROLL RESULT')}`,
    formatGameLine(recommendation.game, 0, options),
    '',
    `${t.dim('WHY')}  ${terminalText(recommendation.reason.join(' · '))}`,
    `${t.dim('SEED')} ${terminalText(recommendation.seed)}`,
    `${t.dim('POOL')} ${recommendation.candidateCount} candidates · index ${recommendation.selectedIndex} · weight ${recommendation.weight}`,
  ];
  return `${renderBanner(options)}\n${details.join('\n')}`;
}

export function renderTerminalDigest(digest: Digest, options: ThemeOptions = {}): string {
  const t = terminalTheme(options);
  const sections = [renderBanner(options), renderSection('Discover', digest.discover, options), renderSection('Deals', digest.deals, options)];
  if (digest.roll) sections.push(renderTerminalRoll(digest.roll, options).split('\n').slice(3).join('\n'));
  if (digest.warnings.length > 0) {
    sections.push(`${t.warning('// WARNINGS')}\n${digest.warnings.map((warning) => `- ${terminalText(warning)}`).join('\n')}`);
  }
  sections.push(t.dim(`LIVE RUN // ${terminalText(digest.generatedAt)}`));
  return sections.join('\n\n');
}
