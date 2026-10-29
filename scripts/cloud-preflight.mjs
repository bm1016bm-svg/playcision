import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { unstable_readConfig } from 'wrangler';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = unstable_readConfig({ config: root + 'wrangler.jsonc' });
const url = new URL(config.vars.APP_ORIGIN);
if (url.protocol !== 'https:' || url.origin !== config.vars.APP_ORIGIN || /REPLACE|example|localhost/i.test(url.hostname)) throw Error('請先把 wrangler.jsonc 的 APP_ORIGIN 改成你實際的 HTTPS 網址。');
if (config.assets?.run_worker_first !== true) throw Error('入口必須先通過 Worker 的同源與路由檢查。');
if (config.migrations?.some(m => m.new_classes?.length)) throw Error('免費路線只允許 SQLite Durable Objects。');
if (!config.migrations?.flatMap(m => m.new_sqlite_classes ?? []).includes('AppCoordinator')) throw Error('缺少共用限額物件。');
await access(root + 'dist/web/index.html');
const ignored = await readFile(root + '.gitignore', 'utf8');
if (!ignored.includes('.dev.vars')) throw Error('本機密鑰檔必須排除版本控制。');
console.log('PASS deployment files. Public entry requires no invitation or login. Confirm Workers Free, deploy and complete external HTTPS/mobile/room checks.');
