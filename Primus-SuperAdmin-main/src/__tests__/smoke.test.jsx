import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Smoke test: confirms ErrorBoundary renders without throwing. Mounting
 * the full App is deferred because it constructs the BrowserRouter and
 * polls /internal/* endpoints. We add an integration suite in P9.
 */
describe('Primus-SuperAdmin smoke', () => {
  it('mounts an ErrorBoundary without crashing', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>superadmin ok</div>
      </ErrorBoundary>,
    );
    expect(getByText('superadmin ok')).toBeTruthy();
  });
});
