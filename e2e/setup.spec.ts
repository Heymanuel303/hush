import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';

const SHOTS = '/tmp/screens';

test.describe.configure({ mode: 'serial' });
test.use({ storageState: ADMIN_STATE });

// Specs share one database and earlier files leave profiles behind, so this one empties the
// hub's profiles itself: the redirect is only observable on a hub that has none.
test('a hub with no profiles opens on /setup and the wizard reaches Devices', async ({ page, request }, info) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
  const devices = (await (await request.get('/api/devices')).json()) as { id: string; revokedAt: string | null }[];
  for (const d of devices.filter((x) => !x.revokedAt)) await request.delete(`/api/devices/${d.id}`);
  const existing = (await (await request.get('/api/profiles')).json()) as { id: string }[];
  for (const p of existing) expect((await request.delete(`/api/profiles/${p.id}`)).ok()).toBeTruthy();
  await request.delete('/api/pihole');

  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'Set up Hush', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connect Pi-hole' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/setup-pihole-${info.project.name}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('heading', { name: 'Create the first profile' })).toBeVisible();
  const name = `Evenings ${info.project.name} ${Date.now()}`;
  await page.getByLabel('Name').fill(name);
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: /calm adult/i }).click();
  await page.screenshot({ path: `${SHOTS}/setup-profile-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create profile' }).click();

  await expect(page.getByRole('heading', { name: 'Pair a device' })).toBeVisible();
  const tiles = page.getByTestId('code-tile');
  await expect(tiles).toHaveCount(6);
  const code = (await tiles.allTextContents()).join('');
  await page.screenshot({ path: `${SHOTS}/setup-pair-${info.project.name}.png`, fullPage: true });

  const label = `Setup PC ${info.project.name} ${Date.now()}`;
  const paired = await request.post('/api/devices/pair', { data: { code, label, browser: 'firefox' } });
  expect(paired.status()).toBe(201);
  await expect(page.getByText(`Paired: ${label}`)).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { name: 'Setup finished' })).toBeVisible();
  await expect(page.getByText('devices pull changes within 15 minutes')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/setup-done-${info.project.name}.png`, fullPage: true });
  await page.getByRole('link', { name: 'Go to Devices' }).click();
  await expect(page).toHaveURL(/\/devices$/);
  await expect(page.getByText(label).locator('visible=true').first()).toBeVisible();

  // With a profile present, "/" no longer opens the wizard.
  await page.goto('/');
  await expect(page).toHaveURL(/\/profiles$/);
});
