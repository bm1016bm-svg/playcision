import type { Digest, Game } from '../domain/types.js';
import { formatMoney } from '../ui/theme.js';

export interface SlackTextObject {
  type: 'mrkdwn' | 'plain_text';
  text: string;
}

export type SlackBlock =
  | { type: 'header'; text: SlackTextObject }
  | { type: 'section'; text: SlackTextObject }
  | { type: 'divider' }
  | { type: 'context'; elements: SlackTextObject[] };

export interface SlackPayload {
  text: string;
  blocks: SlackBlock[];
}

export const SLACK_MAX_GAMES_PER_SECTION = 10;

function slackEscape(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function gameBlock(game: Game): SlackBlock {
  const price = game.price.isFree ? 'FREE' : formatMoney(game.price.current);
  const discount = game.price.discountPercent > 0 ? ` · *-${game.price.discountPercent}%*` : '';
  const tags = [...game.tags, ...game.genres].slice(0, 4).map(slackEscape).join(' / ');
  const url = `https://store.steampowered.com/app/${game.id}/`;
  const text = [`*<${url}|${slackEscape(game.name)}>*`, `${slackEscape(price)}${discount}`, tags]
    .filter(Boolean)
    .join('\n');
  return { type: 'section', text: { type: 'mrkdwn', text: text.slice(0, 3_000) } };
}

function appendGames(blocks: SlackBlock[], title: string, games: Game[], maxGames: number): void {
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*// ${title.toUpperCase()} [${games.length}]*` } });
  if (games.length === 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_No matches in this live run._' }] });
    return;
  }
  blocks.push(...games.slice(0, maxGames).map(gameBlock));
  if (games.length > maxGames) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `+ ${games.length - maxGames} more not included in this Slack message` }],
    });
  }
}

export function renderSlackDigest(digest: Digest, maxGames = SLACK_MAX_GAMES_PER_SECTION): SlackPayload {
  const blocks: SlackBlock[] = [
    { type: 'header', text: { type: 'plain_text', text: 'PLAYCISION // 遊豫不決' } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Stop browsing. Start playing. · Game of Throws.' }] },
    { type: 'divider' },
  ];
  appendGames(blocks, 'Discover', digest.discover, maxGames);
  blocks.push({ type: 'divider' });
  appendGames(blocks, 'Deals', digest.deals, maxGames);
  if (digest.roll) {
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '*// ROLL*' } });
    blocks.push(gameBlock(digest.roll.game));
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Why: ${digest.roll.reason.map(slackEscape).join(' · ')}`.slice(0, 3_000) }],
    });
  }
  if (digest.warnings.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*Warnings*\n${digest.warnings.map((warning) => `• ${slackEscape(warning)}`).join('\n')}`.slice(0, 3_000),
      }],
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Live provider run · ${slackEscape(digest.generatedAt)}` }],
  });
  return {
    text: `Playcision: ${digest.discover.length} releases, ${digest.deals.length} deals${digest.roll ? `, roll: ${slackEscape(digest.roll.game.name)}` : ''}.`,
    blocks: blocks.slice(0, 50),
  };
}
