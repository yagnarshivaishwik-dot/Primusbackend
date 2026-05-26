import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Forensic audit P9: smoke-test scaffold for the SuperAdmin SPA.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/__tests__/**/*.test.{js,jsx,ts,tsx}'],
    setupFiles: [],
  },
});
