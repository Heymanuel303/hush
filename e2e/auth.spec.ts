import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, signInAsAdmin, signInWithEmail } from './helpers';

test.beforeEach(async ({ request }) => {
  // Wait for the api behind the dev proxy.
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
});

test('another email lands on the sign-in page with not_an_admin', async ({ page }) => {
  await page.goto('/signin');
  await signInWithEmail(page, 'someone-else@example.com');
  await expect(page).toHaveURL(/\/signin\?error=not_an_admin$/);
  await expect(page.getByRole('alert')).toContainText("not the hub's admin");
});

test('the admin lands on the home page and sign-out returns', async ({ page }) => {
  await page.goto('/signin');
  await signInAsAdmin(page);
  // A hub with no profiles opens on /setup, otherwise on /profiles.
  await expect(page).toHaveURL(/\/(setup|profiles)$/);
  await page.goto('/profiles');
  await expect(page.getByRole('heading', { name: 'Profiles', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  // The stub's end_session returns to the post-logout URI.
  await expect(page).toHaveURL(/\/signin$/);
});

test('anonymous visit to /devices redirects with next, then returns after sign-in', async ({
  page,
}) => {
  await page.goto('/devices');
  await expect(page).toHaveURL(/\/signin\?next=\/devices$/);
  await signInWithEmail(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/devices$/);
});

test('the nav is reachable on desktop and through the menu on mobile', async ({ page }, info) => {
  await page.goto('/signin');
  await signInAsAdmin(page);

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
