import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('ships nonempty bilingual loading quotes with unique IDs and retained attribution', () => {
  const quotes = JSON.parse(readFileSync(new URL('../src/web/consumer/loading-quotes.json', import.meta.url), 'utf8')) as { id: number; zh: string; en: string; author: string; source: string }[];
  expect(quotes.length).toBeGreaterThan(0);
  expect(new Set(quotes.map(quote => quote.id)).size).toBe(quotes.length);
  for (const quote of quotes) for (const field of ['zh', 'en', 'author', 'source'] as const) {
    expect(quote[field].trim().length).toBeGreaterThan(0);
  }
});
