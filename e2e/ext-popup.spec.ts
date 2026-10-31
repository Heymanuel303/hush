import { expect, test, type Page } from '@playwright/test';
import {
  HUB,
  HUB_CONFIG,
  HUB_CONFIG_LOCKED,
  POPUP_URL,
  QUIET_WINDOW,
  SYNCED,
  installPopupShim,
  type PopupSeed,
} from './popup-shim';

// The popup's behaviour suite: tab shell and Household states, no extension host.
const PRIVACY = 'Hush downloads rules from this hub. It never sends what you read or hide.';
const TABS = ['words', 'sites', 'household'] as const;

type ShimOpts = Parameters<typeof installPopupShim>[2];
async function open(page: Page, seed: PopupSeed = {}, opts: ShimOpts = {}) {
  const mobile = (page.viewportSize()?.width ?? 1280) <= 500;
  await installPopupShim(page, seed, { os: mobile ? 'android' : 'linux', ...opts });
  await page.goto(POPUP_URL);
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
}
const sets = (page: Page) =>
  page.evaluate(() => (window as any).__sets as Record<string, unknown>[]);
const messages = (page: Page) => page.evaluate(() => (window as any).__messages as unknown[]);
const selected = async (page: Page) => {
  for (const t of TABS) {
    if ((await page.locator(`#tab-${t}`).getAttribute('aria-selected')) === 'true') return t;
  }
  return null;
};
async function expectOnly(page: Page, tab: (typeof TABS)[number]) {
  expect(await selected(page)).toBe(tab);
  for (const t of TABS)
    await expect(page.locator(`#panel-${t}`)).toBeVisible({ visible: t === tab });
}
const popupTabWrites = async (page: Page) => (await sets(page)).filter((s) => 'popupTab' in s);

test('default tab is Words and nothing is written', async ({ page }) => {
  await open(page);
  await expectOnly(page, 'words');
  expect(await popupTabWrites(page)).toEqual([]);
});

test('persisted tab opens; clicking Household writes once', async ({ page }) => {
  await open(page, { popupTab: 'sites' });
  await expectOnly(page, 'sites');
  await page.locator('#tab-household').click();
  await expectOnly(page, 'household');
  expect(await popupTabWrites(page)).toEqual([{ popupTab: 'household' }]);
});

test('an invalid popupTab falls back to Words', async ({ page }) => {
  await open(page, { popupTab: 'nope' });
  await expectOnly(page, 'words');
  await expect(page.locator('#word')).toBeVisible();
});

test.describe('migration from Advanced', () => {
  test('advanced with no popupTab opens Sites and remembers it once', async ({ page }) => {
    await open(page, { advanced: true });
    await expectOnly(page, 'sites');
    expect(await popupTabWrites(page)).toEqual([{ popupTab: 'sites' }]);
  });
  test('advanced with a popupTab keeps that tab and writes nothing', async ({ page }) => {
    await open(page, { advanced: true, popupTab: 'words' });
    await expectOnly(page, 'words');
    expect(await popupTabWrites(page)).toEqual([]);
  });
});

test('arrow, Home and End keys move the selection', async ({ page }) => {
  await open(page);
  await page.locator('#tab-words').focus();
  const order: [string, (typeof TABS)[number]][] = [
    ['ArrowRight', 'sites'],
    ['ArrowRight', 'household'],
    ['ArrowRight', 'words'],
    ['End', 'household'],
    ['Home', 'words'],
  ];
  for (const [key, tab] of order) {
    await page.keyboard.press(key);
    await expect(page.locator(`#tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    for (const t of TABS)
      await expect(page.locator(`#tab-${t}`)).toHaveAttribute('tabindex', t === tab ? '0' : '-1');
    await expect(page.locator(`#tab-${tab}`)).toBeFocused();
  }
  await page.keyboard.press('ArrowRight');
  const outline = await page.locator('#tab-sites').evaluate((el) => {
    const s = getComputedStyle(el);
    return { matches: el.matches(':focus-visible'), width: s.outlineWidth, style: s.outlineStyle };
  });
  expect(outline.matches).toBe(true);
  expect(outline.style).not.toBe('none');
  expect(parseFloat(outline.width)).toBeGreaterThan(0);
});

test('unpaired: the connect form sends hubPair', async ({ page }) => {
  await open(page, { popupTab: 'household' });
  const p = page.locator('#panel-household');
  await expect(p).toContainText('Connect to your hub');
  for (const l of ['Hub address', 'Pairing code', 'This device'])
    await expect(p.getByLabel(l)).toBeVisible();
  await expect(p).toContainText(
    'Get a code on the hub: Devices → Pair a device. It expires in 10 minutes.',
  );
  await expect(p).toContainText(PRIVACY);
  await page.fill('#hubUrl', 'http://hub.test');
  await page.fill('#hubCode', 'abcdef');
  const label = await page.inputValue('#hubLabel');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect
    .poll(() => messages(page))
    .toEqual([{ type: 'hubPair', url: 'http://hub.test', code: 'ABCDEF', label }]);
});

test.describe('connected', () => {
  const connected = { popupTab: 'household', hub: HUB, hubStatus: SYNCED };

  test('no quiet hours: all day', async ({ page }) => {
    await open(page, { ...connected, hubConfig: HUB_CONFIG });
    await expect(page.locator('#hubSummary')).toHaveText('Kid (shim)');
    await expect(page.locator('#hubFrom')).toContainText('from Home hub · synced');
    await expect(page.locator('#hubQuiet')).toHaveText('Hub rules apply all day');
  });

  test('quiet-hours window follows the page isQuiet', async ({ page }) => {
    await open(page, { ...connected, hubConfig: { ...HUB_CONFIG, quietHours: QUIET_WINDOW } });
    const quiet = await page.evaluate((q) => (window as any).isQuiet(q, new Date()), QUIET_WINDOW);
    await expect(page.locator('#hubQuiet')).toHaveText(
      new RegExp(quiet ? '^Hub rules apply now, until' : '^Hub rules start at'),
    );
  });

  test('Sync now sends hubSync; Disconnect needs a second press', async ({ page }) => {
    await open(page, { ...connected, hubConfig: HUB_CONFIG });
    await page.getByRole('button', { name: 'Sync now' }).click();
    await expect.poll(() => messages(page)).toEqual([{ type: 'hubSync' }]);
    await page.locator('#hubDisconnect').click();
    await expect(page.locator('#hubDisconnect')).toHaveText('Press again to disconnect');
    expect(await messages(page)).toHaveLength(1);
    await page.locator('#hubDisconnect').click();
    await expect.poll(async () => (await messages(page)).at(-1)).toEqual({ type: 'hubDisconnect' });
  });
});

test('paused: hub rules are off too, dot still synced', async ({ page }) => {
  await open(page, {
    popupTab: 'household',
    enabled: false,
    hub: HUB,
    hubConfig: HUB_CONFIG,
    hubStatus: SYNCED,
  });
  await expect(page.locator('#hubPaused')).toHaveText('Hush is paused, so hub rules are off too.');
  await expect(page.locator('#tab-household')).toHaveAccessibleName('Household, synced');
});

test('offline and invalid', async ({ page }) => {
  await open(page, {
    popupTab: 'household',
    hub: HUB,
    hubConfig: HUB_CONFIG,
    hubStatus: { ...SYNCED, error: 'offline', offlineSince: Date.now() },
  });
  await expect(page.locator('#hubSyncInfo')).toContainText(
    "Can't reach Home hub. Using the rules from",
  );
  await expect(page.locator('#tab-household')).toHaveAccessibleName('Household, offline');

  const second = await page.context().newPage();
  await installPopupShim(second, {
    popupTab: 'household',
    hub: HUB,
    hubConfig: HUB_CONFIG,
    hubStatus: { ...SYNCED, error: 'invalid' },
  });
  await second.goto(POPUP_URL);
  await expect(second.locator('#hubSyncInfo')).toContainText(
    "The hub sent rules Hush can't use. Keeping the last good set.",
  );
  await expect(second.locator('#tab-household')).toHaveAccessibleName('Household, needs attention');
});

test.describe('revoked', () => {
  test('opens on Household once, then marks it seen', async ({ page }) => {
    await open(page, {
      popupTab: 'words',
      hubStatus: { lastSync: 1, error: 'revoked', revokedAt: 5 },
    });
    await expectOnly(page, 'household');
    // The hub record is gone on a fresh open, so the line falls back to "the hub".
    const line = 'This browser was removed from the hub. Your own words still work.';
    await expect(page.locator('#hubRevokedLine')).toHaveText(line);
    await expect(page.locator('#toastMsg')).toHaveText(line);
    await expect(page.locator('#hubOffForm')).toBeVisible();
    await expect(page.locator('#hubHelp')).toHaveText('To rejoin, get a new code on the hub.');
    await expect(page.locator('#tab-household')).toHaveAccessibleName('Household, removed');
    await expect
      .poll(async () => (await sets(page)).some((s) => s.hubRevokedSeen === 5), { timeout: 10_000 })
      .toBe(true);
  });
  test('already seen: opens on the remembered tab', async ({ page }) => {
    await open(page, {
      popupTab: 'words',
      hubRevokedSeen: 5,
      hubStatus: { lastSync: 1, error: 'revoked', revokedAt: 5 },
    });
    await expectOnly(page, 'words');
  });
});

test('locked: Household, banner everywhere, read-only', async ({ page }) => {
  await open(page, {
    popupTab: 'words',
    blockWords: ['local'],
    hub: HUB,
    hubConfig: HUB_CONFIG_LOCKED,
    hubStatus: SYNCED,
  });
  await expectOnly(page, 'household');
  for (const t of TABS) {
    await page.locator(`#tab-${t}`).click();
    await expect(page.locator('#lockBanner')).toBeVisible();
    await expect(page.locator('#lockBanner')).toContainText('Managed by Home hub');
  }
  await page.locator('#tab-words').click();
  for (const id of ['#word', '#add', '#clearAll', '#toggle'])
    await expect(page.locator(id)).toBeDisabled();
  await page.locator('#tab-sites').click();
  const inputs = page.locator('#sitesList input[type="text"]');
  expect(await inputs.count()).toBeGreaterThan(0);
  for (const input of await inputs.all()) await expect(input).toBeDisabled();
  await page.locator('#tab-household').click();
  await expect(page.getByRole('button', { name: 'Disconnect' })).toBeHidden();
  await expect(page.locator('#hubLockedNote')).toHaveText(
    'To release this browser, revoke it on the hub.',
  );
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeEnabled();
});

test('the tab bar stays in view and gains the stuck edge on scroll', async ({ page }) => {
  // The word list scrolls inside its own 210px box, so a short viewport is what makes the page scroll.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 360 });
  await open(page, { blockWords: Array.from({ length: 60 }, (_, i) => `word${i}`) });
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(360);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.locator('.tabs')).toHaveClass(/stuck/);
  const box = await page.locator('.tabs').boundingBox();
  const vh = page.viewportSize()!.height;
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh);
});

test('mobile: touch targets are at least 40px', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'html.mobile applies in the mobile project only');
  await open(page);
  await expect(page.locator('html')).toHaveClass(/mobile/);
  for (const sel of ['[role="tab"]', '#add']) {
    for (const el of await page.locator(sel).all()) {
      expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(40);
    }
  }
});

test.describe('connect and household edge cases', () => {
  const household = { popupTab: 'household' };

  test('unpaired shows what the hub sends', async ({ page }) => {
    await open(page, household);
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'off');
    await expect(page.locator('#panel-household')).toContainText(
      'Your hub sends this browser a profile: words, packs and quiet hours.',
    );
    await expect(page.locator('#hubConnect')).toHaveText('Connect');
  });

  test('Connect asks for permission before it sends hubPair', async ({ page }) => {
    await open(page, household);
    await page.fill('#hubUrl', 'http://hub.test');
    await page.fill('#hubCode', 'abcdef');
    await page.locator('#hubConnect').click();
    await expect.poll(() => messages(page)).toHaveLength(1);
    expect(await page.evaluate(() => (window as any).__perm.length)).toBe(1);
    expect(await page.evaluate(() => (window as any).__order)).toEqual(['permission', 'message']);
  });

  test('a failed pair shows the error', async ({ page }) => {
    await open(page, household, { reply: { ok: false, error: 'network' } });
    await page.fill('#hubUrl', 'http://hub.test');
    await page.fill('#hubCode', 'ABCDEF');
    await page.locator('#hubConnect').click();
    await expect(page.locator('#hubError')).toContainText('Could not reach the hub');
  });

  test('connecting disables the button', async ({ page }) => {
    await open(page, household, { permission: 'hang' });
    await page.fill('#hubUrl', 'http://hub.test');
    await page.fill('#hubCode', 'ABCDEF');
    await page.locator('#hubConnect').click();
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'connecting');
    await expect(page.locator('#hubConnect')).toBeDisabled();
    await expect(page.locator('#hubConnect')).toHaveText('Connecting…');
    await expect(page.locator('#hubUrl')).toBeEnabled();
  });

  test('connected but never synced', async ({ page }) => {
    await open(page, {
      ...household,
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: { lastSync: null, error: null },
    });
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'on');
    await expect(page.locator('#hubFrom')).toHaveText('from Home hub · not synced yet');
    await expect(page.locator('#hubSyncInfo')).toBeHidden();
  });

  test('offline without offlineSince falls back to the last sync', async ({ page }) => {
    await open(page, {
      ...household,
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: { ...SYNCED, error: 'offline' },
    });
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'offline');
    await expect(page.locator('#hubSyncInfo')).toHaveText(
      "Can't reach Home hub. Using the rules from the last sync.",
    );
    await expect(page.locator('#hubSyncInfo')).toHaveClass(/warn/);
  });

  test('invalid has its state attribute', async ({ page }) => {
    await open(page, {
      ...household,
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: { ...SYNCED, error: 'invalid' },
    });
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'invalid');
  });

  test('locked and offline keeps the warn style', async ({ page }) => {
    await open(page, {
      hub: HUB,
      hubConfig: HUB_CONFIG_LOCKED,
      hubStatus: { ...SYNCED, error: 'offline' },
    });
    await expect(page.locator('#panel-household')).toHaveAttribute('data-hub-state', 'locked');
    await expect(page.locator('#hubSyncInfo')).toHaveClass(/warn/);
  });

  test.describe('profile in another time zone', () => {
    test.use({ timezoneId: 'Europe/London', locale: 'en-US' });
    test('quiet-hours time is shown in the profile zone', async ({ page }) => {
      // Mon 18:00Z is 14:00 in New York (EDT); the window ends 17:00 there.
      const q = {
        timezone: 'America/New_York',
        windows: [{ days: [1], start: '09:00', end: '17:00' }],
      };
      await open(
        page,
        { ...household, hub: HUB, hubConfig: { ...HUB_CONFIG, quietHours: q }, hubStatus: SYNCED },
        { now: '2026-10-12T18:00:00+00:00' },
      );
      await expect(page.locator('#hubQuiet')).toHaveText(
        'Hub rules apply now, until 05:00 PM (America/New_York)',
      );
    });
  });
});

test('screenshots of every state', async ({ page }) => {
  test.skip(!process.env.SCREENS, 'set SCREENS=dir to write them');
  const now = '2026-10-12T12:00:00+00:00';
  const t = Date.parse(now) - 7_200_000;
  const off = { lastSync: t, lastAttempt: t };
  const synced = { ...SYNCED, lastSync: t, lastAttempt: t };
  const states: Record<string, PopupSeed> = {
    words: { blockWords: ['spoiler', '=cat'] },
    sites: { popupTab: 'sites' },
    off: { popupTab: 'household' },
    on: {
      popupTab: 'household',
      hub: HUB,
      hubConfig: { ...HUB_CONFIG, quietHours: QUIET_WINDOW },
      hubStatus: synced,
    },
    paused: {
      popupTab: 'household',
      enabled: false,
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: synced,
    },
    offline: {
      popupTab: 'household',
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: { ...off, error: 'offline', offlineSince: Date.parse(now) - 3_600_000 },
    },
    invalid: {
      popupTab: 'household',
      hub: HUB,
      hubConfig: HUB_CONFIG,
      hubStatus: { ...off, error: 'invalid' },
    },
    revoked: {
      hubRevokedSeen: 5,
      popupTab: 'household',
      hubStatus: { error: 'revoked', revokedAt: 5 },
    },
    locked: { hub: HUB, hubConfig: HUB_CONFIG_LOCKED, hubStatus: synced },
  };
  for (const w of [324, 375]) {
    for (const [name, seed] of Object.entries(states)) {
      const p = await page.context().newPage();
      await p.setViewportSize({ width: w, height: 640 });
      await installPopupShim(p, seed, { now, os: 'android' });
      await p.goto(POPUP_URL);
      await p.screenshot({ path: `${process.env.SCREENS}/popup-${name}-${w}.png` });
      await p.close();
    }
  }
});
