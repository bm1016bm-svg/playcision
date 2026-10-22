import { z } from 'zod';
import { parseLibrary } from './browser-library.js';
import type { Game } from '../types.js';

export const HISTORY_KEY = 'playcision.history.v1';
export type HistoryFolder = { id: string; name: string; games: Game[] };
const foldersSchema = z.array(z.object({ id: z.string().min(1).max(80), name: z.string().trim().min(1).max(40), games: z.array(z.unknown()).max(500) })).max(100);
export function parseHistory(raw: string | null): HistoryFolder[] {
  if (!raw) return [];
  if (raw.length > 4_000_000) throw new Error('歷史收藏資料過大');
  const folders = foldersSchema.parse(JSON.parse(raw));
  if (new Set(folders.map(folder => folder.id)).size !== folders.length) throw new Error('資料夾代號重複');
  return folders.map(folder => ({ ...folder, games: parseLibrary(JSON.stringify(folder.games)) }));
}
export function addToFolder(folders: HistoryFolder[], id: string, game: Game): HistoryFolder[] {
  if (!folders.some(folder => folder.id === id)) throw new Error('找不到資料夾，請重新選擇');
  return folders.map(folder => folder.id !== id ? folder : { ...folder, games: [...folder.games.filter(item => item.id !== game.id), game] });
}
export function saveHistory(storage: Pick<Storage, 'setItem'>, folders: HistoryFolder[]): HistoryFolder[] {
  const checked = parseHistory(JSON.stringify(folders));
  storage.setItem(HISTORY_KEY, JSON.stringify(checked));
  return checked;
}

