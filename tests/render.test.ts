import { describe, expect, it } from 'vitest';
import type { Digest, Game } from '../src/domain/types.js';
import { renderMarkdownDigest } from '../src/render/markdown.js';
import { renderSlackDigest } from '../src/render/slack.js';
import { renderTerminalDigest } from '../src/render/terminal.js';

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: '413150',
    store: 'steam',
    name: 'Stardew Valley',
    url: 'https://store.steampowered.com/app/413150/',
    releaseDate: '2016-02-26',
    developers: ['ConcernedApe'],
    publishers: ['ConcernedApe'],
    tags: ['RPG', 'Farming Sim'],
    genres: ['Indie'],
    platforms: ['windows', 'macos', 'linux'],
    earlyAccess: false,
    mature: false,
    price: {
      current: { minor: 17900, currency: 'TWD', formatted: 'NT$ 179.00' },
      original: { minor: 39800, currency: 'TWD', formatted: 'NT$ 398.00' },
      discountPercent: 55,
      isFree: false,
    },
    source: { fetchedAt: '2026-08-10T09:00:00.000Z', provider: 'steam-store-experimental' },
    ...overrides,
  };
}

function digest(): Digest {
  return {
    generatedAt: '2026-08-10T09:00:00.000Z',
    discover: [game()],
    deals: [game()],
    warnings: ['Steam Store adapter is experimental.'],
  };
}

describe('renderers', () => {
  it.each([false, true])('escapes hostile terminal fields while preserving generated colors: %s', color => {
    const hostile = '\u001b]52;c;fixture\u0007\r\u009b2J';
    const sample = digest();
    const poisoned = game({ name: `中文${hostile}`, tags: [hostile], price: { ...game().price, current: { minor: 100, currency: 'TWD', formatted: hostile } } });
    sample.discover = [poisoned]; sample.warnings = [hostile]; sample.generatedAt = hostile;
    sample.roll = { game: poisoned, reason: [hostile], seed: hostile, candidateCount: 1, selectedIndex: 0, weight: 1 };
    const output = renderTerminalDigest(sample, { color });
    expect(output).not.toContain(hostile);
    expect(output).not.toContain('\r'); expect(output).not.toContain('\u0007'); expect(output).not.toContain('\u009b');
    expect(output).toContain('\\u001b]52;c;fixture\\u0007\\u000d\\u009b2J');
    expect(output).toContain('中文'); expect(output).toContain('\n');
    expect(output.includes('\u001b[')).toBe(color);
  });

  it('renders an ANSI-free terminal fallback with textual status', () => {
    const output = renderTerminalDigest(digest(), { color: false, columns: 64 });
    expect(output).toContain('PLAYCISION // 遊豫不決');
    expect(output).toContain('// DISCOVER [1]');
    expect(output).toContain('-55%');
    expect(output).not.toMatch(/\u001b\[/);
  });

  it('renders stable safe Steam links in Markdown', () => {
    const output = renderMarkdownDigest(digest());
    expect(output).toContain('Game of Throws / 擲戲之王');
    expect(output).toContain('https://store.steampowered.com/app/413150/');
    expect(output).not.toContain('<script>');
  });

  it('keeps Slack payloads within the 50-block limit', () => {
    const many = Array.from({ length: 80 }, (_, index) => game({ id: String(1000 + index), name: `Game ${index}` }));
    const payload = renderSlackDigest({ ...digest(), discover: many, deals: many }, 20);
    expect(payload.blocks.length).toBeLessThanOrEqual(50);
    expect(payload.text).toContain('80 releases');
    expect(JSON.stringify(payload.blocks)).toContain('Warnings');
    for (const block of payload.blocks) {
      if (block.type === 'section') expect(block.text.text.length).toBeLessThanOrEqual(3_000);
    }
  });
});
