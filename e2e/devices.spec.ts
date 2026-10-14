import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';
import { startFakePihole } from '../apps/api/test/fake-pihole';
import type { FakePihole } from '../apps/api/test/fake-pihole';

const SHOTS = '/tmp/screens';
const DISCLAIMER =
  'The hub manages what Hush hides. It cannot stop someone removing or disabling Hush on a device that is not force-installed by a browser policy. For a locked device see browser/firefox/policies.json in the repository.';

let pihole: FakePihole;

test.describe.configure({ mode: 'serial' });
test.use({ storageState: ADMIN_STATE });

test.beforeAll(async () => {
  pihole = await startFakePihole({ password: 'app-password' });
});
test.afterAll(async () => {
  await pihole.close();
});

test('pair, rename, kid mode and revoke', async ({ page, request }, info) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
  const label = `Den PC ${info.project.name} ${Date.now()}`;

  // A profile to pair to, and a Pi-hole connection for kid mode.
  const created = await request.post('/api/profiles', { data: { name: `Kids ${info.project.name} ${Date.now()}` } });
  expect(created.ok()).toBeTruthy();
  const profile = (await created.json()) as { id: string; name: string };
  const put = await request.put('/api/pihole', {
    data: { url: pihole.url, appPassword: 'app-password', kidGroupName: 'Kid' },
  });
  expect(put.ok()).toBeTruthy();

  await page.goto('/devices');
  await expect(page.getByRole('heading', { name: 'Devices', level: 1 })).toBeVisible();
  // The disclaimer is always on screen, verbatim, on both layouts.
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/devices-loaded-${info.project.name}.png`, fullPage: true });

  // Pair through the dialog, standing in for the extension with the public route.
  await page.getByRole('button', { name: 'Pair a device' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Profile' }).click();
  await page.getByRole('option', { name: profile.name }).click();
  await dialog.getByRole('button', { name: 'Show code' }).click();
  await expect(dialog.getByTestId('code-tile')).toHaveCount(6);
  const code = (await dialog.getByTestId('code-tile').allTextContents()).join('');
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(dialog.getByTestId('code-remaining')).toHaveText(/^(9:5\d|10:00)$/);
  await page.screenshot({ path: `${SHOTS}/devices-pair-${info.project.name}.png` });

  const paired = await request.post('/api/devices/pair', { data: { code, label, browser: 'firefox' } });
  expect(paired.status()).toBe(201);
  const { token } = (await paired.json()) as { token: string };
  await expect(dialog.getByText(`Paired: ${label}`)).toBeVisible({ timeout: 10_000 });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText(label).filter({ visible: true }).first()).toBeVisible();

  // Rename.
  await page.getByRole('button', { name: `Actions for ${label}` }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(`${label} renamed`);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`${label} renamed`).filter({ visible: true }).first()).toBeVisible();
  const name = `${label} renamed`;

  // Kid mode needs an IP.
  await page.getByRole('button', { name: `Actions for ${name}` }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'Set Tailscale IP' }).click();
  await page.getByRole('textbox', { name: 'Tailscale IP' }).fill('100.64.0.7');
  await page.getByRole('button', { name: 'Save' }).click();
  const kid = page.getByRole('switch', { name: `Kid mode for ${name}` }).filter({ visible: true });
  await expect(kid).toBeEnabled();
  await kid.click();
  await expect(page.getByTestId('kid-state').filter({ visible: true }).first()).toHaveText('kid');
  await expect(kid).toBeChecked();
  await page.screenshot({ path: `${SHOTS}/devices-kid-${info.project.name}.png`, fullPage: true });

  // Revoke: the token stops working.
  expect((await request.get('/api/device/config', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);
  await page.getByRole('button', { name: `Actions for ${name}` }).filter({ visible: true }).click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await expect(page.getByText('The device drops back to its own local words')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect((await request.get('/api/device/config', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);
  await page.getByLabel('Show revoked').click();
  await expect(page.getByText("Revoked").filter({ visible: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/devices-revoked-${info.project.name}.png`, fullPage: true });
});

test('empty and error states', async ({ page }, info) => {
  await page.route('**/api/devices', (route) => route.fulfill({ status: 200, json: [] }));
  await page.goto('/devices');
  await expect(page.getByText('No devices paired yet')).toBeVisible();
  await expect(page.getByText(DISCLAIMER)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/devices-empty-${info.project.name}.png`, fullPage: true });

  await page.unroute('**/api/devices');
  await page.route('**/api/devices', (route) =>
    route.fulfill({ status: 500, json: { error: 'boom', message: 'The hub is unwell.' } }),
  );
  await page.reload();
  await expect(page.getByText('The hub is unwell.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/devices-error-${info.project.name}.png`, fullPage: true });
});
