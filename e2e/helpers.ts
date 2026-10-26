import { expect, type Page } from '@playwright/test';

// The development ADMIN_EMAIL of the api; the oidc-stub accepts any email.
export const ADMIN_EMAIL = 'admin@hush.local';

// Signs in through the oidc-stub (playwright.config.ts starts it first), never a real idp:
// the button on /signin, the stub's login form, then the callback back into the app.
export async function signInWithEmail(page: Page, email: string): Promise<void> {
  await page.getByRole('link', { name: 'Sign in with Hey Id' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signInAsAdmin(page: Page): Promise<void> {
  await signInWithEmail(page, ADMIN_EMAIL);
  await expect(page).toHaveURL(/\/(setup|profiles)$/);
}
