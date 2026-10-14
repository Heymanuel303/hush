import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';

// The admin session comes from e2e/global-setup.ts (the login route is rate limited); the tests share one page and run in order.
test.describe.configure({ mode: 'serial' });

let page: Page;
let name: string;

test.beforeAll(async ({ browser, request }) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
  name = `Kid ${test.info().project.name} ${Date.now()}`;
  page = await (
    await browser.newContext({ ...test.info().project.use, storageState: ADMIN_STATE })
  ).newPage();
});

test.afterAll(async () => {
  await page.context().close();
});

const version = () => page.getByTestId('version');
const save = async () => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
};
const tab = (label: string) => page.getByRole('tab', { name: label });

test('create from the young-kid template', async () => {
  await page.goto('/profiles');
  await page.getByRole('button', { name: 'New profile' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Young kid, locked' }).click();
  await expect(dialog.getByRole('checkbox', { name: /Locked/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Create profile' }).click();

  await expect(page).toHaveURL(/\/profiles\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(version()).toHaveText('v1');
  await expect(page.getByText('giveaway')).toBeVisible();
  await tab('Lock').click();
  await expect(page.getByRole('switch', { name: 'Locked' })).toBeChecked();
});

test('add a word and save; the version increments', async () => {
  await tab('Words').click();
  await page.getByLabel('Add a word', { exact: true }).fill('tulip');
  await page.getByLabel('Add a word', { exact: true }).press('Enter');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await save();
  await expect(version()).toHaveText('v2');
});

test('enable a pack, add a YouTube word, toggle the site option', async () => {
  await tab('Packs').click();
  const spoilers = page.getByRole('switch', { name: /Spoilers/ });
  await expect(spoilers).not.toBeChecked();
  await spoilers.click();

  await tab('Sites').click();
  await page.getByLabel('Add a YouTube word').fill('unboxing');
  await page.getByLabel('Add a YouTube word').press('Enter');
  const option = page.getByRole('switch', { name: 'Open Subscriptions instead of the home page' });
  await expect(option).toBeChecked(); // the template turns it on
  await option.click();
  await expect(option).not.toBeChecked();
  await save();
  await expect(version()).toHaveText('v3');
  await expect(page.getByText('unboxing')).toBeVisible();
});

test('set a schedule window', async () => {
  await tab('Schedule').click();
  await page.getByRole('switch', { name: /Only apply these rules/ }).click();
  await expect(page.getByLabel('Start (window 1)')).toBeVisible();
  await page.getByLabel('Start (window 1)').fill('16:00');
  await page.getByRole('button', { name: 'Add window' }).click();
  await expect(page.getByLabel('Start (window 2)')).toBeVisible();
  await page.getByRole('button', { name: 'Remove window 2' }).click();
  await save();
  await expect(version()).toHaveText('v4');
  await expect(page.getByLabel('Start (window 1)')).toHaveValue('16:00');
});

test('unlock through the Lock tab', async () => {
  await tab('Lock').click();
  await page.getByRole('switch', { name: 'Locked' }).click();
  await expect(page.getByRole('switch', { name: 'Locked' })).not.toBeChecked();
  await page.goto('/profiles');
  await expect(page.getByRole('row', { name: new RegExp(name) }).getByLabel('Locked')).toHaveCount(0);
});

test('a stale save shows the 412 alert and Reload drops the edits', async ({ browser }) => {
  await page.getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  const other = await browser.newContext({
    ...test.info().project.use,
    storageState: await page.context().storageState(),
  });
  const second = await other.newPage();
  await second.goto(page.url());
  await expect(second.getByRole('heading', { name, exact: true })).toBeVisible();

  await page.getByLabel('Add a word', { exact: true }).fill('first');
  await page.getByLabel('Add a word', { exact: true }).press('Enter');
  await save();

  await second.getByLabel('Add a word', { exact: true }).fill('second');
  await second.getByLabel('Add a word', { exact: true }).press('Enter');
  await second.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(second.getByRole('alert').filter({ hasText: 'changed elsewhere' })).toBeVisible();
  await second.getByRole('button', { name: 'Reload' }).click();
  await expect(second.getByText('Unsaved changes')).toHaveCount(0);
  await expect(second.getByText('first', { exact: true })).toBeVisible();
  await expect(second.getByText('second', { exact: true })).toHaveCount(0);
  await other.close();
});

test('delete the profile', async () => {
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete profile' }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});

test('an unknown profile shows a way back', async () => {
  await page.goto('/profiles/00000000-0000-4000-8000-000000000000');
  await expect(page.getByText('Profile not found')).toBeVisible();
  await page.getByRole('link', { name: 'Back to profiles' }).click();
  await expect(page).toHaveURL(/\/profiles$/);
});
