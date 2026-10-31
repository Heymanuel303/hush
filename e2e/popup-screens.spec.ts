import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  HUB,
  HUB_CONFIG,
  HUB_CONFIG_LOCKED,
  POPUP_URL,
  QUIET_WINDOW,
  installPopupShim,
  type PopupSeed,
} from './popup-shim';

// Palette review set: every popup screen in light and dark at 324px and 375px, written to
// docs/screens/popup/. Opt-in so `pnpm e2e` and CI never regenerate binaries:
//   POPUP_SCREENS=1 pnpm e2e e2e/popup-screens.spec.ts --project=desktop
test.skip(
  process.env.POPUP_SCREENS !== '1',
  'set POPUP_SCREENS=1 to regenerate docs/screens/popup',
);

// file:// popups may not load the bundled woff2 without this.
test.use({ launchOptions: { args: ['--allow-file-access-from-files'] } });

const OUT = resolve(__dirname, '../docs/screens/popup');
const SIZES = [
  { w: 324, h: 600, os: 'linux' as const },
  { w: 375, h: 812, os: 'android' as const },
];
const SCHEMES = ['light', 'dark'] as const;

type Shim = Parameters<typeof installPopupShim>[2];
type Screen = { name: string; seed: PopupSeed; opts?: Shim; prep?: (page: Page) => Promise<void> };

// A recent sync, so "synced 2m ago" reads like real use instead of the shim's epoch-1 default.
const SYNCED = { lastSync: Date.now() - 120_000, lastAttempt: Date.now() - 120_000, error: null };
const SIX = ['spoiler', '=cat', 'finale', 'giveaway', '@brandname', 'sponsored'];
const connected = { popupTab: 'household', hub: HUB, hubConfig: HUB_CONFIG, hubStatus: SYNCED };

const SCREENS: Screen[] = [
  { name: 'words', seed: { popupTab: 'words', blockWords: SIX, enabledPacks: ['Spoilers'] } },
  { name: 'words-empty', seed: { popupTab: 'words', blockWords: [] } },
  {
    name: 'sites',
    seed: { popupTab: 'sites', blockWords: SIX, ytHomeRedirect: true },
    prep: async (page) => {
      await page.locator('.site-block[data-site="YouTube"] .site-toggle').click();
    },
  },
  { name: 'household-off', seed: { popupTab: 'household' } },
  {
    // permissions.request pending is what the popup shows as Connecting…; the shim has no hanging sendMessage.
    name: 'household-connecting',
    seed: { popupTab: 'household' },
    opts: { permission: 'hang' },
    prep: async (page) => {
      await page.locator('#hubUrl').fill('http://hub.home:3000');
      await page.locator('#hubCode').fill('ABCDEF');
      await page.getByRole('button', { name: 'Connect' }).click();
    },
  },
  {
    name: 'household-connected',
    seed: {
      ...connected,
      hubConfig: { ...HUB_CONFIG, quietHours: QUIET_WINDOW },
      hubStatus: {
        ...SYNCED,
        lastSync: Date.parse('2026-10-19T09:55:00Z'),
        lastAttempt: Date.parse('2026-10-19T09:55:00Z'),
      },
    },
    opts: { now: '2026-10-19T10:00:00Z' },
  },
  {
    name: 'household-offline',
    seed: {
      ...connected,
      hubStatus: { ...SYNCED, error: 'offline', offlineSince: Date.UTC(2026, 9, 15) },
    },
  },
  { name: 'household-invalid', seed: { ...connected, hubStatus: { ...SYNCED, error: 'invalid' } } },
  {
    name: 'household-revoked',
    seed: {
      popupTab: 'words',
      hubStatus: { lastSync: Date.now() - 86_400_000, error: 'revoked', revokedAt: 5 },
    },
    prep: async (page) => {
      await page.locator('#tab-household').click();
    },
  },
  {
    name: 'household-locked',
    seed: {
      popupTab: 'words',
      blockWords: SIX,
      hub: HUB,
      hubConfig: HUB_CONFIG_LOCKED,
      hubStatus: SYNCED,
    },
    // A locked device opens on Household by itself.
    prep: async (page) => {
      await expect(page.locator('#tab-household')).toHaveAttribute('aria-selected', 'true');
    },
  },
  {
    name: 'words-locked',
    seed: {
      popupTab: 'words',
      blockWords: SIX,
      hub: HUB,
      hubConfig: HUB_CONFIG_LOCKED,
      hubStatus: SYNCED,
    },
    // Opens on Household; move to Words to show the disabled editors under the banner.
    prep: async (page) => {
      await page.locator('#tab-words').click();
    },
  },
  { name: 'paused', seed: { ...connected, enabled: false } },
];

mkdirSync(OUT, { recursive: true });

for (const screen of SCREENS) {
  for (const scheme of SCHEMES) {
    for (const size of SIZES) {
      test(`${screen.name} ${scheme} ${size.w}`, async ({ page }) => {
        await page.setViewportSize({ width: size.w, height: size.h });
        await page.emulateMedia({ colorScheme: scheme });
        await installPopupShim(page, screen.seed, { os: size.os, ...screen.opts });
        await page.goto(POPUP_URL);
        await page.locator('[role="tab"][aria-selected="true"]').waitFor();
        await screen.prep?.(page);
        const ok = await page.evaluate(async () => {
          await document.fonts.ready;
          return document.fonts.check('13px "Atkinson Hyperlegible Next"');
        });
        if (!ok)
          throw new Error(
            'Atkinson Hyperlegible Next did not load; the capture would show the fallback font',
          );
        await page.screenshot({
          path: resolve(OUT, `${screen.name}-${scheme}-${size.w}.png`),
          fullPage: true,
          scale: 'css',
        });
      });
    }
  }
}
