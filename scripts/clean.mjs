import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(projectRoot, 'dist');

if (path.dirname(dist) !== projectRoot || path.basename(dist) !== 'dist') {
  throw new Error(`Refusing to clean unexpected path: ${dist}`);
}

await rm(dist, { recursive: true, force: true });
