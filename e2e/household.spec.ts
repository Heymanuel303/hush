import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';
import { startFakePihole } from '../apps/api/test/fake-pihole';
import type { FakePihole } from '../apps/api/test/fake-pihole';

// The release check: the household flows through the browser (admin) and the public API
// (standing in for the extension) together. Every name carries the run stamp, no data is shared
// with other specs. The admin session comes from e2e/global-setup.ts.
const DISCLAIMER =
  'The hub manages what Hush hides. It cannot stop someone removing or disabling Hush on a device that is not force-installed by a browser policy. For a locked device see browser/firefox/policies.json in the repository.';
const IP = '100.64.0.42';

test.describe.configure({ mode: 'serial' });
test.use({ storageState: ADMIN_STATE });

let page: Page;
let pihole: FakePihole;
let stamp: string;
let kidName: string;
let calmName: string;
let kidId: string;
let label: string;
let word: string;
let token = '';
let etag = '';
let usedCode = '';

const bearer = () => ({ Authorization: `Bearer ${token}` });
const config = (request: APIRequestContext, headers: Record<string, string> = {}) =>
  request.get('/api/device/config', { headers: { ...bearer(), ...headers } });
// The device's own row (table row on desktop, stacked card on mobile); other specs leave devices behind.
const row = (p: Page) =>
  p.locator('tr, li').filter({ hasText: label }).filter({ visible: true }).first();
const visible = (p: Page, text: string) => p.getByText(text).filter({ visible: true }).first();

test.beforeAll(async ({ browser, request }) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
  const info = test.info();
  stamp = `${info.project.name}-${Date.now()}`;
  kidName = `Kid (e2e ${stamp})`;
  calmName = `Calm (e2e ${stamp})`;
  label = `e2e Firefox ${stamp}`;
  word = `e2e-${stamp}`;
  pihole = await startFakePihole({ password: 'e2e' });
  page = await (
    await browser.newContext({ ...info.project.use, storageState: ADMIN_STATE })
  ).newPage();
});

test.afterAll(async ({ request }) => {
  // Leave no connection pointing at the closed fake server for later specs.
  await request.delete('/api/pihole');
  await pihole.close();
  await page.context().close();
});

async function createProfile(name: string, template: string) {
  await page.goto('/profiles');
  await page.getByRole('button', { name: 'New profile' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: template }).click();
  await dialog.getByRole('button', { name: 'Create profile' }).click();
  await expect(page).toHaveURL(/\/profiles\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return page.url().split('/').pop()!;
}

async function openPairing(profileName: string) {
  await page.goto('/devices');
  await page.getByRole('button', { name: 'Pair a device' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Profile' }).click();
  await page.getByRole('option', { name: profileName }).click();
  await dialog.getByRole('button', { name: 'Show code' }).click();
  await expect(dialog.getByTestId('code-tile')).toHaveCount(6);
  const code = (await dialog.getByTestId('code-tile').allTextContents()).join('');
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  return { dialog, code };
}

test('1. create the locked kid profile from young-kid', async () => {
  kidId = await createProfile(kidName, 'Young kid, locked');
  await expect(page.getByTestId('version')).toHaveText('v1');
});

test('2. pair a device with the code from the Devices screen', async ({ request }) => {
  const { dialog, code } = await openPairing(kidName);
  usedCode = code;
  const paired = await request.post('/api/devices/pair', {
    data: { code, label, browser: 'firefox' },
  });
  expect(paired.status()).toBe(201);
  const body = (await paired.json()) as { token: string; profileName: string };
  expect(body.token).toHaveLength(43);
  expect(body.profileName).toBe(kidName);
  token = body.token;
  await expect(dialog.getByText(`Paired: ${label}`)).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(visible(page, label)).toBeVisible();
  // Nothing has pulled the config yet.
  await expect(row(page)).toContainText('never');
});

test('3. the first config pull: ETag, locked, 304, last seen', async ({ request }) => {
  const res = await config(request);
  expect(res.status()).toBe(200);
  etag = res.headers()['etag'] ?? '';
  expect(etag).not.toBe('');
  const body = (await res.json()) as { locked: boolean; blockWords: string[]; version: number };
  expect(body.locked).toBe(true);
  expect(body.blockWords).toContain('prank');
  expect((await config(request, { 'If-None-Match': etag })).status()).toBe(304);

  await page.goto('/devices');
  await expect(visible(page, label)).toBeVisible();
  await expect(row(page)).toContainText('just now');
  await expect(row(page)).not.toContainText('never');
});

test('4. editing the profile changes the ETag and carries the new word and version', async ({
  request,
}) => {
  await page.goto(`/profiles/${kidId}`);
  await page.getByRole('tab', { name: 'Words' }).click();
  await page.getByLabel('Add a word', { exact: true }).fill(word);
  await page.getByLabel('Add a word', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  await expect(page.getByTestId('version')).toHaveText('v2');

  const res = await config(request, { 'If-None-Match': etag });
  expect(res.status()).toBe(200);
  const newEtag = res.headers()['etag'];
  expect(newEtag).toBeTruthy();
  expect(newEtag).not.toBe(etag);
  const body = (await res.json()) as { blockWords: string[]; version: number };
  expect(body.blockWords).toContain(word);
  expect(`v${body.version}`).toBe(await page.getByTestId('version').innerText());
  etag = newEtag!;
});

test('5. moving the device to an unlocked profile unlocks the config', async ({ request }) => {
  await createProfile(calmName, 'Calm adult');
  await page.goto('/devices');
  await page
    .getByRole('button', { name: `Actions for ${label}` })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Change profile' }).click();
  await page.getByRole('dialog').getByRole('combobox', { name: 'Profile' }).click();
  await page.getByRole('option', { name: calmName }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const res = await config(request, { 'If-None-Match': etag });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { locked: boolean; profileName: string; blockWords: string[] };
  expect(body.locked).toBe(false);
  expect(body.profileName).toBe(calmName);
  expect(body.blockWords).not.toContain(word);
});

test('6. kid mode moves the device through the fake Pi-hole', async () => {
  await page.goto('/pihole');
  const disconnect = page.getByRole('button', { name: 'Disconnect', exact: true });
  if (await disconnect.isVisible().catch(() => false)) {
    await disconnect.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  }
  await expect(page.getByText('Not connected')).toBeVisible();
  await page.getByLabel('URL').fill(pihole.url);
  await page.getByLabel('App password').fill('e2e');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Pi-hole traffic')).toBeVisible();

  await page.goto('/devices');
  await page
    .getByRole('button', { name: `Actions for ${label}` })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Set Tailscale IP' }).click();
  await page.getByRole('textbox', { name: 'Tailscale IP' }).fill(IP);
  await page.getByRole('button', { name: 'Save' }).click();
  const kid = page.getByRole('switch', { name: `Kid mode for ${label}` }).filter({ visible: true });
  await expect(kid).toBeEnabled();
  await kid.click();
  await expect(page.getByTestId('kid-state').filter({ visible: true }).first()).toHaveText('kid');
  await expect.poll(() => pihole.state.clients.find((c) => c.client === IP)?.groups).toEqual([1]);

  await kid.click();
  await expect(page.getByTestId('kid-state').filter({ visible: true }).first()).toHaveText(
    'default',
  );
  await expect.poll(() => pihole.state.clients.find((c) => c.client === IP)?.groups).toEqual([0]);
});

test('7. revoking the device answers 401 revoked and hides the row', async ({ request }) => {
  await page.goto('/devices');
  await page
    .getByRole('button', { name: `Actions for ${label}` })
    .filter({ visible: true })
    .click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  const res = await config(request);
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: 'revoked' });
  await expect(page.getByText(label)).toHaveCount(0);
  await page.getByLabel('Show revoked').click();
  await expect(visible(page, label)).toBeVisible();
});

test('8. a consumed code cannot be reused; an open code shows an m:ss countdown', async ({
  request,
}) => {
  const reuse = await request.post('/api/devices/pair', {
    data: { code: usedCode, label: `${label} again`, browser: 'firefox' },
  });
  expect(reuse.status()).toBe(410);
  expect(await reuse.json()).toMatchObject({ error: 'code_used' });

  // An expired code would take ten minutes to wait for: assert the countdown format instead.
  const { dialog } = await openPairing(calmName);
  await expect(dialog.getByTestId('code-remaining')).toHaveText(/^\d{1,2}:\d{2}$/);
});

test('9. the Devices screen carries the bypass disclaimer', async () => {
  await page.goto('/devices');
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
});
