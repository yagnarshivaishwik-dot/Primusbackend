import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Smoke test: confirms the React tree at least mounts a top-level
 * primitive without throwing. We deliberately do NOT mount the full
 * App because it touches the C# bridge (`window.__TAURI__`), which is
 * undefined under jsdom. A separate integration test should stub the
 * bridge — tracked as a follow-up.
 */
describe('ClutcHH-1 kiosk smoke', () => {
  it('mounts an ErrorBoundary without crashing', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>kiosk ok</div>
      </ErrorBoundary>,
    );
    expect(getByText('kiosk ok')).toBeTruthy();
  });
});
