import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://blinkit.com/s/?q=maagaani');
  const pinCodes = ['500001', '500004', '500009', '500072'];
  for (const pinCode of pinCodes) {
    await page.getByRole('textbox', { name: 'search delivery location' }).click();
    await page.getByRole('textbox', { name: 'search delivery location' }).fill(pinCode);
    await expect(page.getByText(pinCode, { exact: false }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Maagaani', exact: true }).click();

  }

  const products = [
    'Maagaani Organic Moringa Powder',
    'MAAGAANI Sugar Control Rice(Low GI',
    'MAAGAANI Single Polish Low GI Rice',
    'Maagaani Khapli Multi Millet Multigrain Atta',
  ];

  for (const product of products) {
    await expect(page.locator(`div:has-text("${product}")`).locator('div.tw-rounded-md[role="button"]', { hasText: 'ADD' })).toBeVisible();
  }
  
});