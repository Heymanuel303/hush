import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The only automated check of the popup: panel.html opened from disk with a shim for the
// extension APIs, no extension host. It stores a locked hub profile and expects the read-only UI.
const POPUP = pathToFileURL(resolve(__dirname, '../src/popup/panel.html')).href;

type Seed = Record<string, unknown>;
const HUB = { url: 'http://hub.test', deviceId: 'd1', token: 't', profileName: 'Kid (shim)', hubName: 'Home hub', pairedAt: 1 };
const CFG = {
  version: 3, profileName: 'Kid (shim)', locked: false, blockWords: [], enabledPacks: [], packs: [],
  siteWords: {}, siteOptions: {}, quietHours: null, etag: '"x"',
};
// 2026-10-12 is a Monday; a UTC window 09:00-17:00 on Mondays (cases.json "plain window").
const WINDOW = { timezone: 'UTC', windows: [{ days: [1], start: '09:00', end: '17:00' }] };

async function open(page: Page, seed: Seed, now?: string) {
  await page.addInitScript(
    ([seedJson, nowIso]) => {
      if (nowIso) {
        const fixed = new Date(nowIso as string).getTime();
        const RealDate = Date;
        // @ts-expect-error shim: a fixed clock for the quiet-hours line
        window.Date = class extends RealDate {
          constructor(...a: unknown[]) { super(...(a.length ? (a as [number]) : [fixed])); }
          static now() { return fixed; }
        };
      }
      const data: Record<string, unknown> = { enabled: true, seenOnboarding: true, blockWords: [], ...JSON.parse(seedJson as string) };
      const sent: unknown[] = [];
      (window as any).__sent = sent;
      (window as any).__perm = 0;
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
          sendMessage: async (m: unknown) => { sent.push(m); return { ok: false, error: 'network' }; },
          getPlatformInfo: async () => ({ os: 'linux' }),
          onMessage: listeners,
        },
        permissions: { request: () => { (window as any).__perm++; return Promise.resolve(true); } },
        tabs: { query: async () => [], sendMessage: async () => ({}) },
      };
    },
    [JSON.stringify(seed), now ?? null],
  );
  await page.goto(POPUP);
  await page.locator('#tab-household').click();
}

const PRIVACY = 'Hush downloads rules from this hub. It never sends what you read or hide.';
const synced = { lastSync: 1, lastAttempt: 1, error: null };

test('not connected', async ({ page }) => {
  await open(page, {});
  const p = page.locator('#panel-household');
  await expect(p).toHaveAttribute('data-hub-state', 'off');
  await expect(p).toContainText('Connect to your hub');
  await expect(p).toContainText('Your hub sends this browser a profile: words, packs and quiet hours.');
  await expect(p).toContainText(PRIVACY);
  for (const l of ['Hub address', 'Pairing code', 'This device']) await expect(p.getByLabel(l)).toBeVisible();
  await expect(p).toContainText('Get a code on the hub: Devices → Pair a device. It expires in 10 minutes.');
  await expect(page.locator('#hubConnect')).toHaveText('Connect');
});

test('connect asks permission first, sends hubPair, shows Connecting…', async ({ page }) => {
  await open(page, {});
  await page.fill('#hubUrl', 'http://hub.test');
  await page.fill('#hubCode', 'abcdef');
  await page.click('#hubConnect');
  await expect.poll(() => page.evaluate(() => (window as any).__perm)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__sent)).toEqual([
    { type: 'hubPair', url: 'http://hub.test', code: 'ABCDEF', label: expect.any(String) },
  ]);
  await expect(page.locator('#hubError')).toContainText('Could not reach the hub');
});

test('connecting state disables the button', async ({ page }) => {
  await open(page, {});
  await page.evaluate(() => {
    (window as any).chrome.permissions.request = () => new Promise(() => {});
  });
  await page.fill('#hubUrl', 'http://hub.test');
  await page.fill('#hubCode', 'ABCDEF');
  await page.click('#hubConnect');
  await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'connecting');
  await expect(page.locator('#hubConnect')).toBeDisabled();
  await expect(page.locator('#hubConnect')).toHaveText('Connecting…');
  await expect(page.locator('#hubUrl')).toBeEnabled();
});

test('connected, no quiet hours, never synced', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: CFG, hubStatus: { lastSync: null, error: null } });
  await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'on');
  await expect(page.locator('#hubSummary')).toHaveText('Kid (shim)');
  await expect(page.locator('#hubFrom')).toHaveText('from Home hub · not synced yet');
  await expect(page.locator('#hubQuiet')).toHaveText('Hub rules apply all day');
  await expect(page.locator('#hubSyncInfo')).toBeHidden();
});

test('connected, synced, inside a quiet-hours window', async ({ page }) => {
  const now = '2026-10-12T12:00:00+00:00';
  await open(page, { hub: HUB, hubConfig: { ...CFG, quietHours: WINDOW }, hubStatus: { ...synced, lastSync: new Date(now).getTime() - 5 * 60000 } }, now);
  await expect(page.locator('#hubFrom')).toHaveText('from Home hub · synced 5m ago');
  await expect(page.locator('#hubQuiet')).toHaveText(/^Hub rules apply now, until \d/);
});

test('connected, outside a quiet-hours window', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: { ...CFG, quietHours: WINDOW }, hubStatus: synced }, '2026-10-12T08:59:00+00:00');
  await expect(page.locator('#hubQuiet')).toHaveText(/^Hub rules start at \d/);
});

test('paused, unlocked: says hub rules are off', async ({ page }) => {
  await open(page, { enabled: false, hub: HUB, hubConfig: CFG, hubStatus: synced });
  await expect(page.locator('#hubPaused')).toHaveText('Hush is paused, so hub rules are off too.');
});

test('offline and invalid status lines', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: CFG, hubStatus: { ...synced, error: 'offline', offlineSince: Date.now() } });
  await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'offline');
  await expect(page.locator('#hubSyncInfo')).toHaveText(/^Can't reach Home hub\. Using the rules from \d/);
  await expect(page.locator('#hubSyncInfo')).toHaveClass(/warn/);
});
test('offline without offlineSince', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: CFG, hubStatus: { ...synced, error: 'offline' } });
  await expect(page.locator('#hubSyncInfo')).toHaveText("Can't reach Home hub. Using the rules from the last sync.");
});
test('invalid', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: CFG, hubStatus: { ...synced, error: 'invalid' } });
  await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'invalid');
  await expect(page.locator('#hubSyncInfo')).toHaveText("The hub sent rules Hush can't use. Keeping the last good set.");
});

test('revoked', async ({ page }) => {
  await open(page, { hubRevokedSeen: 5, hubStatus: { lastSync: 1, error: 'revoked', revokedAt: 5 } });
  const p = page.locator('#panel-household');
  await expect(p).toHaveAttribute('data-hub-state', 'revoked');
  await expect(page.locator('#hubRevokedLine')).toHaveText('This browser was removed from the hub. Your own words still work.');
  await expect(page.locator('#hubOffForm')).toBeVisible();
  await expect(page.locator('#hubHelp')).toHaveText('To rejoin, get a new code on the hub.');
});

test('sync sends hubSync; disconnect needs a second press', async ({ page }) => {
  await open(page, { hub: HUB, hubConfig: CFG, hubStatus: synced });
  await page.click('#hubSync');
  await expect.poll(() => page.evaluate(() => (window as any).__sent)).toEqual([{ type: 'hubSync' }]);
  await page.click('#hubDisconnect');
  await expect(page.locator('#hubDisconnect')).toHaveText('Press again to disconnect');
  expect(await page.evaluate(() => (window as any).__sent.length)).toBe(1);
  await page.click('#hubDisconnect');
  await expect.poll(() => page.evaluate(() => (window as any).__sent.at(-1))).toEqual({ type: 'hubDisconnect' });
});

test('a locked hub profile renders the popup read-only', async ({ page }) => {
  await open(page, { blockWords: ['local'], hub: HUB, hubConfig: { ...CFG, locked: true, blockWords: ['prank'] }, hubStatus: synced });
  await expect(page.locator('#lockBanner')).toContainText('Managed by Home hub');
  await expect(page.locator('#word')).toBeDisabled();
  await expect(page.locator('#toggle')).toBeDisabled();
  await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'locked');
  await expect(page.locator('#hubDisconnect')).toBeHidden();
  await expect(page.locator('#hubLockedNote')).toHaveText('To release this browser, revoke it on the hub.');
  await expect(page.locator('#hubSync')).toBeEnabled();
});

test('screenshots of every state', async ({ page }) => {
  test.skip(!process.env.SCREENS, 'set SCREENS=dir to write them');
  const states: Record<string, Seed> = {
    off: {},
    on: { hub: HUB, hubConfig: { ...CFG, quietHours: WINDOW }, hubStatus: synced },
    paused: { enabled: false, hub: HUB, hubConfig: CFG, hubStatus: synced },
    offline: { hub: HUB, hubConfig: CFG, hubStatus: { ...synced, error: 'offline', offlineSince: Date.now() } },
    invalid: { hub: HUB, hubConfig: CFG, hubStatus: { ...synced, error: 'invalid' } },
    revoked: { hubRevokedSeen: 5, hubStatus: { error: 'revoked', revokedAt: 5 } },
    locked: { hub: HUB, hubConfig: { ...CFG, locked: true }, hubStatus: synced },
  };
  for (const w of [324, 375]) {
    for (const [name, seed] of Object.entries(states)) {
      await page.setViewportSize({ width: w, height: 640 });
      await page.addInitScript(() => {});
      await open(page, seed, '2026-10-12T12:00:00+00:00');
      await page.screenshot({ path: `${process.env.SCREENS}/household-${name}-${w}.png` });
    }
  }
});
