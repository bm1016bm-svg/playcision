import type { Digest, Game, Recommendation } from '../domain/types.js';
import { formatMoney } from '../ui/theme.js';

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()<>#+.!|\-])/g, '\\$1');
}

function safeStoreUrl(game: Game): string {
  return game.store === 'steam' && /^\d+$/.test(game.id)
    ? `https://store.steampowered.com/app/${game.id}/`
    : '#';
}

function gameMarkdown(game: Game): string {
  const price = game.price.isFree ? 'Free' : formatMoney(game.price.current);
  const discount = game.price.discountPercent > 0 ? ` · **-${game.price.discountPercent}%**` : '';
  const metadata = [price, game.releaseDate, [...game.tags, ...game.genres].slice(0, 4).join(' / ')]
    .filter(Boolean)
    .map((value) => escapeMarkdown(String(value)))
    .join(' · ');
  return `- [**${escapeMarkdown(game.name)}**](${safeStoreUrl(game)})${discount}\n  ${metadata}`;
}

function section(title: string, games: Game[]): string {
  if (games.length === 0) return `## ${title}\n\n_No matching games in this live run._`;
  return `## ${title}\n\n${games.map(gameMarkdown).join('\n')}`;
}

function rollSection(recommendation: Recommendation): string {
  return [
    '## Roll',
    '',
    gameMarkdown(recommendation.game),
    '',
    `**Why:** ${recommendation.reason.map(escapeMarkdown).join(' · ')}`,
    '',
    `**Replay:** \`playcision roll --seed ${escapeMarkdown(recommendation.seed)}\``,
  ].join('\n');
}

export function renderMarkdownDigest(digest: Digest): string {
  const output = [
    '# Playcision / 遊豫不決',
    '',
    '> Stop browsing. Start playing. / 別選了，開始玩。',
    '>',
    '> Game of Throws / 擲戲之王',
    '',
    section('Discover', digest.discover),
    '',
    section('Deals', digest.deals),
  ];
  if (digest.roll) output.push('', rollSection(digest.roll));
  if (digest.warnings.length > 0) {
    output.push('', '## Warnings', '', ...digest.warnings.map((warning) => `- ${escapeMarkdown(warning)}`));
  }
  output.push('', `Generated from live provider data at ${digest.generatedAt}.`);
  return `${output.join('\n')}\n`;
}

export function renderMarkdownGames(title: string, games: Game[], generatedAt = new Date().toISOString()): string {
  return `# Playcision / ${escapeMarkdown(title)}\n\n${section(title, games)}\n\nGenerated at ${generatedAt}.\n`;
}
