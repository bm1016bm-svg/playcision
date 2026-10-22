import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { configSchema } from '../config/schema.js';
import { assertSafePlaycisionPath, getProjectPaths, loadConfig, serializeConfig } from '../config/load.js';
import { startUiServer } from './server.js';
import { pruneRooms } from './rooms.js';

export function validateBetaEnv(env: NodeJS.ProcessEnv): void {
  if (env.PORT && (!/^\d+$/.test(env.PORT) || Number(env.PORT) < 1 || Number(env.PORT) > 65535)) throw new Error('PORT 必須介於 1 與 65535。');
  const origin = new URL(env.PUBLIC_ORIGIN ?? '');
  if (origin.origin !== env.PUBLIC_ORIGIN || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)))) throw new Error('PUBLIC_ORIGIN 必須是 HTTPS origin；僅本機驗證可用 HTTP。');
  if ((env.BETA_INVITE_CODE?.length ?? 0) < 16 || (env.BETA_INVITE_CODE?.length ?? 0) > 128) throw new Error('BETA_INVITE_CODE 需為 16–128 字元。');
  if ((env.SESSION_SECRET?.length ?? 0) < 32 || env.SESSION_SECRET === env.BETA_INVITE_CODE) throw new Error('SESSION_SECRET 需為獨立的至少 32 字元隨機值。');
}
export async function startBeta(): Promise<void> {
  validateBetaEnv(process.env);
  const cwd = path.resolve(process.env.BETA_DATA_DIR ?? './beta-data');
  await mkdir(cwd, { recursive: true });
  const paths = getProjectPaths(cwd);
  await assertSafePlaycisionPath(paths.root, { allowMissing: true }); await mkdir(paths.root, { recursive: true });
  await assertSafePlaycisionPath(paths.config, { allowMissing: true });
  const neutral = configSchema.parse({ state: { enabled: false }, outputs: { markdown: { enabled: false } } });
  try { await writeFile(paths.config, serializeConfig(neutral), { flag: 'wx', mode: 0o600 }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
  const config = await loadConfig(cwd);
  if (config.state.enabled || config.outputs.slack.enabled || config.outputs.markdown.enabled || config.outputs.json.enabled || config.deals.wishlistSteamId || config.deals.wishlistAppIds.length || Object.values(config.interests).some(list => list.length)) throw new Error('內測資料目錄含私人偏好或輸出設定，請改用新的 BETA_DATA_DIR。');
  process.env.PLAYCISION_BETA = '1';
  if (process.argv.includes('--preflight')) { process.stdout.write('Beta environment and configuration: OK\n'); return; }
  const cleanup = setInterval(() => { void pruneRooms().catch(() => process.stderr.write('room_cleanup_failed\n')); }, 60_000);
  cleanup.unref();
  try { await startUiServer({ cwd, host: process.env.HOST ?? '0.0.0.0', port: Number(process.env.PORT ?? 4174) }); }
  finally { clearInterval(cleanup); }
}
