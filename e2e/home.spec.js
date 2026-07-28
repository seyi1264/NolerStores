const { test, expect } = require('@playwright/test');

test('homepage loads and shows products', async ({ page }) => {
  await page.goto('http://localhost:4000/nolerstores.html');
  await expect(page).toHaveTitle(/NolerStores/);
  await expect(page.locator('#productGrid')).toBeVisible();
});
