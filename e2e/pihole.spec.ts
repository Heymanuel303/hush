import { expect, test } from '@playwright/test';
import { ADMIN_STATE } from './global-setup';
import { startFakePihole } from '../apps/api/test/fake-pihole';
import type { FakePihole } from '../apps/api/test/fake-pihole';

const PIHOLE_PASSWORD = 'app-password';
const SHOTS = '/tmp/screens';

let pihole: FakePihole;

test.describe.configure({ mode: 'serial' });
// The admin session comes from e2e/global-setup.ts (the login route is rate limited).
test.use({ storageState: ADMIN_STATE });

test.beforeAll(async () => {
  pihole = await startFakePihole({ password: PIHOLE_PASSWORD });
  pihole.state.topBlocked = [
    { ip: '100.64.0.7', name: 'kid-laptop', count: 412 },
    { ip: '100.64.0.9', name: 'tablet', count: 87 },
  ];
});

test.afterAll(async () => {
  await pihole.close();
});

test('connect, test, save, see the summary, reject a wrong password, disconnect', async ({ page, request }, info) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);

  await page.goto('/pihole');

  // Leave a clean slate if an earlier run stored a connection.
  await expect(page.getByRole('heading', { name: 'Pi-hole', level: 1 })).toBeVisible();
  const disconnectButton = page.getByRole('button', { name: 'Disconnect', exact: true });
  if (await disconnectButton.isVisible().catch(() => false)) {
    await disconnectButton.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  }
  await expect(page.getByText('Not connected')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/pihole-empty-${info.project.name}.png`, fullPage: true });

  await page.getByLabel('URL').fill(pihole.url);
  await page.getByLabel('App password').fill(PIHOLE_PASSWORD);
  // Test before anything is saved.
  await page.getByRole('button', { name: 'Test connection' }).click();
  const groups = page.getByRole('list', { name: 'Groups' });
  await expect(groups.getByText('Default')).toBeVisible();
  await expect(groups.getByText('Kid')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/pihole-tested-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Pi-hole traffic')).toBeVisible();
  await expect(page.getByRole('cell', { name: '100.64.0.7' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'kid-laptop' })).toBeVisible();
  // The stored password is never shown.
  await expect(page.getByLabel('App password')).toHaveValue('');
  await expect(page.getByLabel('App password')).toHaveAttribute(
    'placeholder',
    'Leave empty to keep the stored password',
  );
  expect(await page.content()).not.toContain(PIHOLE_PASSWORD);
  await page.screenshot({ path: `${SHOTS}/pihole-connected-${info.project.name}.png`, fullPage: true });

  // A test of the saved values updates the status card.
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connected to Pi-hole')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pi-hole traffic')).toBeVisible();
  await expect(page.getByText('Not yet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByText('Not connected')).toBeVisible();

  // A wrong password is reported by the test, not silently stored as working.
  await page.getByLabel('URL').fill(pihole.url);
  await page.getByLabel('App password').fill('nope');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connection failed')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();
});
