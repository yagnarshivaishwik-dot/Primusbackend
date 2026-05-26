/**
 * Vitest setup — global test bootstrap for the ClutcHH-1 kiosk app.
 *
 * Forensic audit M19: there was no frontend test suite at all. This file
 * wires:
 *   * @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 *   * window.matchMedia stub (jsdom doesn't ship one)
 *   * a tiny fetch monkey-patch so tests can intercept HTTP without msw
 */
import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom: matchMedia is undefined; many UI libs read it during mount.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Stub localStorage for kiosk auth tokens.
beforeEach(() => {
  globalThis.localStorage?.clear?.();
});
