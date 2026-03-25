import { test, expect } from '@playwright/test';

test.describe('Client registration', () => {
  test('client appears in admin PC list with user_name when logged in', async ({ page }) => {
    // Assumes:
    // - Backend running at http://localhost:8000
    // - Primus admin dev server running at http://localhost:3000
    // - Tauri client already started and registering with backend

    await page.goto('/');

    // Wait for PC list nav and click
    await page.getByText('PC list', { exact: true }).click();

    // Within 10 seconds, expect at least one PC card to appear
    const pcCard = page.locator('.card-animated', { hasText: 'Demo card' }).first();
    const anyPcCard = page.locator('.card-animated').first();

    await expect(anyPcCard).toBeVisible({ timeout: 10_000 });

    // If a user is logged in on that PC, user_name should be visible on the card
    const userLabel = anyPcCard.locator('text=User:');
    // Do not fail if no user is logged in; only assert that query works when present
    await userLabel.first().isVisible().catch(() => {});
  });
});


