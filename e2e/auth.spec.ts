import { expect, test } from '@playwright/test';

const EMAIL = 'admin@hush.local';
const PASSWORD = 'hush-dev-password';

async function signIn(page: import('@playwright/test').Page, password = PASSWORD) {
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.beforeEach(async ({ request }) => {
  // Wait for the api behind the dev proxy.
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
});

test('wrong password shows the error alert', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page, 'not-the-password');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Email or password is wrong' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/signin/);
});

test('correct credentials land on /profiles and sign-out returns', async ({ page }) => {
  await page.goto('/signin');
  await signIn(page);
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(page.getByRole('heading', { name: 'Profiles', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test('anonymous visit to /devices redirects with next, then returns after sign-in', async ({
  page,
}) => {
  await page.goto('/devices');
  await expect(page).toHaveURL(/\/signin\?next=\/devices$/);
  await signIn(page);
  await expect(page).toHaveURL(/\/devices$/);
});

test('the nav is reachable on desktop and through the menu on mobile', async ({ page }, info) => {
  await page.goto('/signin');
  await signIn(page);
  await expect(page).toHaveURL(/\/profiles$/);

  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Devices', exact: true }).click();
  } else {
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main' })
      .first()
      .getByRole('link', { name: 'Devices', exact: true })
      .click();
  }
  await expect(page).toHaveURL(/\/devices$/);
  await expect(page.getByRole('heading', { name: 'Devices', exact: true })).toBeVisible();
});
