import { loadEnv } from 'vite';
import { githubProjectLink, supportConfiguration } from '../src/web/support-config.js';

const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const config = supportConfiguration(env);
const preparedOnly = process.argv.includes('--prepared');
for (const tier of config.configured) console.log(`NT$ ${tier.amount}: ${tier.url ? 'PAYUNi hosted URL configured' : 'NOT READY: missing, invalid or duplicated URL'}`);
console.log(`Collection release switch: ${config.enabled ? 'enabled' : 'disabled (no payment links shown to players)'}`);
const repository = githubProjectLink(env.VITE_SUPPORT_REPOSITORY_URL || 'https://github.com/bm1016bm-svg/playcision');
console.log(`GitHub project: ${repository ? 'configured' : 'not configured'}`);
console.log('Local configuration check only; this does not verify PAYUNi approval, live amounts, payment methods or successful payment.');
console.log('Before enabling collection: verify merchant and credit-card approval, all three fixed amounts, and a real payment performed by the owner.');
if (config.configured.some(tier => !tier.url) || (!preparedOnly && !config.enabled)) process.exitCode = 1;
