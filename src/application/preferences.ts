import { getProjectPaths, loadConfig } from '../config/load.js';
import { excludeGame, includeGame, skipGame, unskipGame } from '../core/index.js';
import { loadState, saveState, withStateLock } from '../state/index.js';

export type RollStateAction = 'skip' | 'unskip' | 'exclude' | 'include';

export async function updateRollState(
  cwd: string,
  action: RollStateAction,
  appId: string,
  options: { days?: number; now?: Date } = {},
): Promise<string> {
  if (!/^\d+$/.test(appId)) throw new Error(`Expected a numeric Steam App ID, received: ${appId}`);
  const config = await loadConfig(cwd);
  if (!config.state.enabled) throw new Error('Persistent skip/exclude needs state.enabled: true.');
  const path = getProjectPaths(cwd).state;
  return withStateLock(path, async () => {
  const state = await loadState(path);
  const now = options.now ?? new Date();
  let next = state;
  let message: string;
  switch (action) {
    case 'skip': {
      const days = options.days ?? 7;
      if (!Number.isFinite(days) || days <= 0 || days > 3650) throw new Error('Skip days must be between 1 and 3650.');
      const until = new Date(now.getTime() + days * 86_400_000);
      next = skipGame(state, appId, until);
      message = `Steam ${appId} skipped until ${until.toISOString()}.`;
      break;
    }
    case 'unskip':
      next = unskipGame(state, appId);
      message = `Steam ${appId} is no longer skipped.`;
      break;
    case 'exclude':
      next = excludeGame(state, appId);
      message = `Steam ${appId} permanently excluded from Roll.`;
      break;
    case 'include':
      next = includeGame(state, appId);
      message = `Steam ${appId} removed from permanent exclusions.`;
      break;
  }
  await saveState(path, next);
  return message;
  });
}
