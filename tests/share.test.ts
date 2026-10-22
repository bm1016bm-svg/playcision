import { describe, expect, it } from 'vitest';
import { shareList } from '../src/web/consumer/share.js';

describe('portable saved lists', () => {
  it('exports canonical links and deduplicates IDs', () => {
    const result = shareList([{ id: '730', name: 'Counter-Strike' }, { id: '730', name: 'Duplicate' }, { id: '../bad', name: 'Invalid' }], 'text');
    expect(result).toEqual(['Playcision · 我的遊戲清單\n\nCounter-Strike\nhttps://store.steampowered.com/app/730/']);
  });
  it('returns no content for empty lists', () => { expect(shareList([], 'discord')).toEqual([]); });
  it('escapes injected markdown and neutralizes Discord mentions', () => {
    const [result] = shareList([{ id: '1', name: '@everyone [Fake](https://evil.test)\n<script>' }], 'discord');
    expect(result).not.toContain('@everyone');
    expect(result).toContain('@\u200beveryone');
    expect(result).toContain('\\[Fake\\]');
    expect(result).toContain('\nhttps://store.steampowered.com/app/1/');
    expect(result).not.toContain('<https://');
    expect(result).not.toContain('<script>');
  });
  it('generates Markdown links with escaped labels', () => {
    expect(shareList([{ id: '10', name: 'A [B]' }], 'markdown')[0]).toContain('- [A \\[B\\]](https://store.steampowered.com/app/10/)');
  });
  it('splits Discord lists without losing or duplicating game links', () => {
    const games = Array.from({ length: 100 }, (_, i) => ({ id: String(i + 1), name: '*'.repeat(500) }));
    const chunks = shareList(games, 'discord');
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 2000)).toBe(true);
    const links = chunks.join('\n').match(/https:\/\/store.steampowered.com\/app\/\d+\//g);
    expect(links).toHaveLength(100);
    expect(new Set(links).size).toBe(100);
  });
});

