import { startBeta } from '../dist/ui/beta-start.js';
try { await startBeta(); }
catch (error) { console.error(error instanceof Error ? error.message : 'Beta startup failed'); process.exitCode = 1; }
