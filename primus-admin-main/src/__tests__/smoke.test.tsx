import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

/**
 * Smoke test: confirms the React tree mounts a primitive without
 * throwing. The full AdminEntry mount is deferred to an integration
 * test because the request interceptor in `utils/api.js` installs onto
 * the global axios singleton at import time, which we want to control.
 */
describe('primus-admin smoke', () => {
  it('mounts an ErrorBoundary without crashing', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>admin ok</div>
      </ErrorBoundary>,
    );
    expect(getByText('admin ok')).toBeTruthy();
  });
});
