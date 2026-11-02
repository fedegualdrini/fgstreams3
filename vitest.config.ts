import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    {
      name: 'node-cli-hashbang',
      enforce: 'pre',
      // Keep CLI hashbangs as comments when Vite hoists imports in its SSR transform.
      transform(code) {
        if (code.startsWith('#!')) return { code: `//${code.slice(2)}`, map: null };
      },
    },
    react(),
  ],
  test: {
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, '.claude/**', '.vercel/**'],
    globals: true,
    setupFiles: ['./types/vitest-setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
});
