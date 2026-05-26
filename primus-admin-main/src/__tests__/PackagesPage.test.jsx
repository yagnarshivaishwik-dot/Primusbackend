/**
 * Smoke test for PackagesPage — admin time-pack CRUD.
 *
 * Forensic audit M19. Validates the page renders without crashing
 * given a stubbed GET /api/offer/ response and shows the seeded pack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../utils/api', () => ({
  getApiBase: () => 'http://localhost:8000',
  authHeaders: () => ({}),
  showToast: vi.fn(),
}));

import PackagesPage from '../pages/Packages/PackagesPage.jsx';

describe('PackagesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', async () => {
    render(<PackagesPage cafeInfo={{ id: 1, name: 'Cafe Test' }} />);
    await waitFor(() => {
      // Either the empty-state copy or the controls — verify SOMETHING.
      expect(document.body.textContent || '').not.toBe('');
    });
  });

  it('shows pack name from the API response', async () => {
    const axios = (await import('axios')).default;
    axios.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: 'Test 1-Hour Pack',
          hours_minutes: 60,
          price: 50,
          active: true,
          display_order: 0,
        },
      ],
    });

    render(<PackagesPage cafeInfo={{ id: 1, name: 'Cafe Test' }} />);

    await waitFor(() => {
      // The exact label could be tucked in any cell — fall back to body text.
      expect(document.body.textContent || '').toContain('Test 1-Hour Pack');
    });
  });
});
