import { loadEnv } from 'vite';
import { githubProjectLink, supportOptions } from '../src/web/support-config.js';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const options = supportOptions(env);
for (const tier of options) console.log(`NT$ ${tier.amount}: ${tier.url ? 'official hosted URL configured' : 'NOT READY: missing, invalid or duplicated URL'}`);
const repository = githubProjectLink(env.VITE_SUPPORT_REPOSITORY_URL || 'https://github.com/bm1016bm-svg/playcision');
console.log(`GitHub project: ${repository ? 'configured' : 'not configured'}`);
console.log('Format check only. Verify merchant identity, fixed amount and a real payment in ECPay before opening collection.');
if (options.some(tier => !tier.url)) process.exitCode = 1;
