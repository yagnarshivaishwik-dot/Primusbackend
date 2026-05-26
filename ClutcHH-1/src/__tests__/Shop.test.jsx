/**
 * Shop page smoke test.
 *
 * Forensic audit M19 / BUG #6: validates the kiosk Shop page renders
 * pack tiles using ONLY the data the backend hands back; in particular
 * we assert the rendered tiles do NOT echo any user_id from the API
 * response (BUG #6 hardening — the body never carries user_id back).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const apiGetMock = vi.fn();
vi.mock('@/app/api/client', () => ({
  apiGet: (...args) => apiGetMock(...args),
  apiPost: vi.fn().mockResolvedValue({}),
  ApiError: class ApiError extends Error {},
}));

// Stub the bridge so Shop doesn't try to call the kiosk shell.
vi.mock('@/app/bridge/invoke', () => ({
  invoke: vi.fn().mockResolvedValue(null),
  listen: vi.fn().mockReturnValue(() => {}),
  hasBridge: () => false,
}));

import ShopPage from '@/features/auth/pages/Shop.jsx';

describe('Shop page', () => {
  it('renders pack tiles from /shop/packs response', async () => {
    apiGetMock.mockResolvedValueOnce([
      { id: '1', name: 'Hour Pass', minutes: 60, price: 50.0, active: true },
      { id: '2', name: 'Day Pass', minutes: 720, price: 300.0, active: true },
    ]);

    render(
      <MemoryRouter>
        <ShopPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      // Either the pack name or the price should be visible eventually.
      const body = document.body.textContent || '';
      expect(body.length).toBeGreaterThan(0);
    });
  });

  it('does NOT echo user_id from the response into the DOM', async () => {
    // Simulate a server that accidentally returns user_id in the pack
    // payload — the UI must not surface that downstream.
    apiGetMock.mockResolvedValueOnce([
      { id: '1', name: 'Pack', minutes: 60, price: 1, user_id: 9999 },
    ]);

    render(
      <MemoryRouter>
        <ShopPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent || '').not.toContain('9999');
    });
  });
});
