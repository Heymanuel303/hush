import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The only automated check of the popup: panel.html opened from disk with a shim for the
// extension APIs, no extension host. It stores a locked hub profile and expects the read-only UI.
const POPUP = pathToFileURL(resolve(__dirname, '../src/popup/panel.html')).href;

test('a locked hub profile renders the popup read-only', async ({ page }) => {
  await page.addInitScript(() => {
    const data: Record<string, unknown> = {
      enabled: true,
      advanced: true,
      seenOnboarding: true,
      blockWords: ['local'],
      hub: {
        url: 'http://hub.test',
        deviceId: 'd1',
        token: 't',
        profileName: 'Kid (shim)',
        hubName: 'Home hub',
        pairedAt: 1,
      },
      hubConfig: {
        version: 3,
        profileName: 'Kid (shim)',
        locked: true,
        blockWords: ['prank'],
        enabledPacks: [],
        packs: [],
        siteWords: {},
        siteOptions: {},
        quietHours: null,
        etag: '"x"',
      },
      hubStatus: { lastSync: Date.now(), lastAttempt: Date.now(), error: null },
    };
    const pick = (keys?: string | string[] | null) => {
      const list = keys == null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, data[k]]));
    };
    const listeners = { addListener() {}, removeListener() {} };
    (window as any).chrome = {
      storage: {
        local: {
          get: async (keys?: string | string[] | null) => pick(keys),
          set: async (obj: Record<string, unknown>) => void Object.assign(data, obj),
          remove: async () => {},
        },
        onChanged: listeners,
      },
      runtime: {
        sendMessage: async () => ({ ok: true }),
        getPlatformInfo: async () => ({ os: 'linux' }),
        onMessage: listeners,
      },
      permissions: { request: async () => true },
      tabs: { query: async () => [], sendMessage: async () => ({}) },
    };
  });

  await page.goto(POPUP);
  const banner = page.locator('#lockBanner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Managed by Home hub');
  await expect(page.locator('#word')).toBeDisabled();
  await expect(page.locator('#toggle')).toBeDisabled();

  await expect(page.locator('#tab-household')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hubSummary')).toContainText('profile Kid (shim)');
  await expect(page.locator('#hubDisconnect')).toBeDisabled();
});
