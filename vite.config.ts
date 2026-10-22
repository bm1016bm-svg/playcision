import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@web': fileURLToPath(new URL('./src/web', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: ['localhost', '127.0.0.1'],
  },
  build: {
    target: 'es2022',
    outDir: 'dist/web',
    emptyOutDir: false,
    sourcemap: true,
  },
});
