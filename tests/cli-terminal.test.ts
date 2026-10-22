import { expect, it, vi } from 'vitest';

vi.mock('../src/application/service.js', () => ({
  buildAndDeliverDigest: vi.fn(async () => ({
    digest: { generatedAt: '2026-10-15T00:00:00Z', discover: [], deals: [], warnings: [] },
    delivery: { files: ['.playcision/outputs/中文\u001b[2J.md'], slack: 'disabled' },
  })),
  createSteamProvider: vi.fn(), dealGames: vi.fn(), discoverGames: vi.fn(), rollGame: vi.fn(),
}));

it('escapes the successful digest file-path notice through the real CLI', async () => {
  const argv = process.argv; const exitCode = process.exitCode;
  const output: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(value => { output.push(String(value)); return true; });
  try {
    process.argv = ['node', 'playcision', '--plain', 'digest', '--no-roll'];
    await import('../src/cli.js');
    const text = output.join('');
    expect(text).toContain('// WROTE .playcision/outputs/中文\\u001b[2J.md');
    expect(text).not.toContain('\u001b');
    expect(text).toContain('// DISCOVER');
  } finally { process.argv = argv; process.exitCode = exitCode; }
});
