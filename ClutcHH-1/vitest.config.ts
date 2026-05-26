import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Forensic audit P9: each SPA was shipping with zero tests. This config
 * gives ops a single-command smoke check that the React tree at least
 * renders without throwing.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: [],
  },
});
