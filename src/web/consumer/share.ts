export type ShareFormat = 'discord' | 'markdown' | 'text';
export interface ShareGame { id: string; name: string }
const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const markdown = (value: string) => value.replace(/[\\`*_{}\[\]()<>#+.!|~>-]/g, '\\$&');

/** Export only canonical public store links; never preferences, seed or local URLs. */
export function shareList(games: readonly ShareGame[], format: ShareFormat, title = '我的遊戲清單'): string[] {
  const seen = new Set<string>();
  const entries = games.filter(game => /^\d{1,10}$/.test(game.id) && !seen.has(game.id) && !!seen.add(game.id));
  if (!entries.length) return [];
  const heading = `Playcision · ${clean(title)}`;
  const lines = entries.map(game => {
    let name = clean(game.name) || `Steam ${game.id}`;
    if (format === 'discord') name = Array.from(name).slice(0, 240).join('').replace(/@/g, '@\u200b');
    const url = `https://store.steampowered.com/app/${game.id}/`;
    return format === 'text' ? `${name}\n${url}` : format === 'discord' ? `• ${markdown(name)}\n${url}` : `- [${markdown(name)}](${url})`;
  });
  if (format !== 'discord') return [`${heading}\n\n${lines.join('\n\n')}`];
  const chunks: string[] = [];
  let chunk = heading;
  for (const line of lines) {
    if (chunk.length + line.length + 2 > 1900) { chunks.push(chunk); chunk = heading; }
    chunk += `\n\n${line}`;
  }
  chunks.push(chunk);
  return chunks.map((text, index) => chunks.length > 1 ? `${text}\n\n（${index + 1}/${chunks.length}）` : text);
}
