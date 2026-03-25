import { test, expect } from '@playwright/test';

test.describe('Shop purchase realtime', () => {
  test('admin sees purchase and time update', async ({ page }) => {
    // Assumes client has already purchased a pack via its UI.
    await page.goto('/');
    await page.getByText('PC list', { exact: true }).click();

    // Find first PC card
    const firstPc = page.locator('.card-animated').first();
    await expect(firstPc).toBeVisible();

    const beforeText = await firstPc.textContent();

    // Wait for a shop.purchase-driven remaining time update
    await expect
      .poll(
        async () => {
          const text = await firstPc.textContent();
          return text;
        },
        { timeout: 15_000 }
      )
      .not.toEqual(beforeText);
  });
});


