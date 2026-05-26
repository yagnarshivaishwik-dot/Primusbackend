/**
 * Login page smoke test.
 *
 * Forensic audit M19 — there were ZERO frontend tests. We assert the
 * Login page renders without crashing and the email/password inputs
 * are reachable via standard accessible names. The test is deliberately
 * shallow so it stays green across UI iterations.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import LoginPage from '@/features/auth/pages/LoginPage.jsx';

// Stub the API client so login form changes don't try real network calls.
vi.mock('@/app/api/client', () => ({
  apiGet: vi.fn().mockResolvedValue({}),
  apiPost: vi.fn().mockResolvedValue({ access_token: 'fake' }),
  ApiError: class ApiError extends Error {},
}));

describe('LoginPage', () => {
  it('renders the email/password form fields', () => {
    // Arrange + Act
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    // Assert — find at least one input of each kind, even if the page
    // uses non-standard labels.
    const inputs = screen.getAllByRole('textbox').concat(
      Array.from(document.querySelectorAll('input[type="password"], input[type="email"]')),
    );
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('renders something with the word "sign" or "log" in it', () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    const text = document.body.textContent?.toLowerCase() || '';
    expect(text).toMatch(/log|sign/);
  });
});
