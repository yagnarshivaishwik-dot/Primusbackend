import { test, expect } from '@playwright/test';

test.describe('Realtime chat', () => {
  test('admin sees client name and user name in chat notification', async ({ page }) => {
    // This spec assumes:
    // - A test client has logged in with user name "John Doe"
    // - The client has already sent a chat message which triggers chat.message WS event

    await page.goto('/');
    await page.getByText('Dashboard', { exact: true }).click();

    // Open notification tray
    const bell = page.locator('button').filter({ hasText: '' }).first();
    await bell.click();

    // Look for notification formatted as "ClientName — John Doe"
    const notifHeader = page.locator('text=John Doe');
    await expect(notifHeader).toBeVisible();

    // Click notification to open thread
    await notifHeader.click();

    const header = page.locator('text=Chat with');
    await expect(header).toBeVisible();
  });
});


