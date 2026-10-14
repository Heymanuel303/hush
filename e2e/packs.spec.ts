import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';

// The admin session comes from e2e/global-setup.ts (the login route allows 10 attempts a
// minute per client); the tests share one page.
test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser, request }) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
  page = await (
    await browser.newContext({ ...test.info().project.use, storageState: ADMIN_STATE })
  ).newPage();
});

test.afterAll(async () => {
  await page.context().close();
});

test.beforeEach(async () => {
  await page.goto('/packs');
  await expect(page.getByRole('heading', { name: 'Packs', exact: true })).toBeVisible();
});

test('built-in rows have disabled actions', async () => {
  await expect(page.getByRole('row', { name: /Spoilers/ })).toContainText('Built in');
  await expect(page.getByRole('button', { name: 'Actions for Spoilers' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('create a household pack, rename it, delete it', async () => {
  const name = `Kitchen ${Date.now()}`;
  const renamed = `${name} b`;

  await page.getByRole('button', { name: 'New pack' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Add a word to the pack').fill('soup, =stew, bread');
  await dialog.getByLabel('Add a word to the pack').press('Enter');
  await expect(dialog.getByText('3 / 200')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('Household');
  // Toasts use the app typeface, not sonner's system stack.
  const toaster = page.locator('[data-sonner-toaster]');
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible();
  expect(await toaster.evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    'IBM Plex Sans',
  );
  await expect(row).toContainText('soup, stew, bread');

  await page.getByRole('button', { name: `Actions for ${name}` }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(renamed);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  const renamedRow = page.getByRole('row', { name: new RegExp(renamed) });
  await expect(renamedRow).toBeVisible();

  await page.getByRole('button', { name: `Actions for ${renamed}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toContainText('their devices update on the next pull');
  await page.getByRole('button', { name: 'Delete pack' }).click();
  await expect(renamedRow).toHaveCount(0);
});

test('a taken name shows as a field error', async () => {
  await page.getByRole('button', { name: 'New pack' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Spoilers');
  await dialog.getByLabel('Add a word to the pack').fill('x');
  await dialog.getByLabel('Add a word to the pack').press('Enter');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('already exists');
});
