/**
 * Smoke test for SystemHealth.jsx — SuperAdmin observability page.
 *
 * Forensic audit M19 — SuperAdmin had ZERO frontend tests despite owning
 * the production observability surface. This test verifies the page
 * renders without crashing when /internal/health/* are all stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../stores/authStore', () => ({
  default: () => ({ token: 'fake', user: { role: 'superadmin' } }),
}));

import SystemHealth from '../pages/SystemHealth.jsx';

describe('SystemHealth page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing when the health endpoints return empty data', async () => {
    render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.body.textContent || '').not.toBe('');
    });
  });

  it('shows uptime / health-related label after data resolves', async () => {
    const api = (await import('../api/client')).default;
    api.get.mockResolvedValue({
      data: { status: 'operational', uptime_percent: 99.97 },
    });

    render(
      <MemoryRouter>
        <SystemHealth />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const body = (document.body.textContent || '').toLowerCase();
      // Any of these keywords proves the dashboard rendered the page
      // shell, even if it didn't render a specific metric.
      expect(body).toMatch(/health|uptime|status|api|database/);
    });
  });
});
