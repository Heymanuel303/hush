import { expect, test } from '@playwright/test';

test('app shell renders', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('header')).toBeVisible();
});

test('api health answers through the dev proxy', async ({ request }) => {
  // `pnpm dev` starts api and web together and Playwright only waits for the
  // web URL, so give the api a moment to finish booting.
  await expect
    .poll(async () => (await request.get('/api/health')).status(), {
      timeout: 30_000,
    })
    .toBe(200);

  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
