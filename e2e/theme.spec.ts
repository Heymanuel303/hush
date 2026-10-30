import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { ADMIN_STATE } from './global-setup';

// The theme contract shared by ThemeMenu, useTheme and the no-flash script in apps/web/index.html:
// localStorage `hush-theme` = light | dark | auto, class `dark` on <html>. Never asserts on colours.

test.beforeAll(async ({ request }) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200);
});

// A fresh context per test: the admin session from e2e/global-setup.ts, no stored theme.
async function open(browser: Browser, options: BrowserContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({
    ...test.info().project.use,
    storageState: ADMIN_STATE,
    ...options,
  });
  return context.newPage();
}

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));
const stored = (page: Page) => page.evaluate(() => localStorage.getItem('hush-theme'));

async function choose(page: Page, label: 'Light' | 'Dark' | 'System') {
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: label }).click();
}

test('defaults to the OS scheme', async ({ browser }) => {
  for (const colorScheme of ['dark', 'light'] as const) {
    const page = await open(browser, { colorScheme });
    await page.goto('/profiles');
    await expect(page.getByRole('button', { name: 'Theme' })).toBeVisible();
    expect(await stored(page)).toBeNull();
    expect(await isDark(page)).toBe(colorScheme === 'dark');
    await page.context().close();
  }
});

test('choosing Dark applies the class and persists across reload', async ({ browser }) => {
  const page = await open(browser, { colorScheme: 'light' });
  await page.goto('/profiles');
  await choose(page, 'Dark');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  expect(await stored(page)).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  // With the app bundle blocked, only the inline script in index.html can have set it.
  await page.route(/\/src\/main\.ts$|\/assets\/index-[^/]*\.js$/, (route) => route.abort());
  await page.goto('/profiles', { waitUntil: 'domcontentloaded' });
  expect(await isDark(page)).toBe(true);
  await page.context().close();
});

test('choosing Light overrides a dark OS scheme', async ({ browser }) => {
  const page = await open(browser, { colorScheme: 'dark' });
  await page.goto('/profiles');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await choose(page, 'Light');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  expect(await stored(page)).toBe('light');
  await page.context().close();
});

test('System follows the OS again', async ({ browser }) => {
  const page = await open(browser, { colorScheme: 'dark' });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('hush-theme', 'dark');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await page.goto('/profiles');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveClass(/\bdark\b/); // stored dark still wins
  await choose(page, 'System');
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  expect(await stored(page)).toBe('auto');
  await page.context().close();
});

test('the sign-in page follows the stored preference', async ({ browser }) => {
  // No session: a signed-in admin is sent away from /signin.
  const page = await open(browser, { colorScheme: 'light', storageState: undefined });
  await page.addInitScript(() => localStorage.setItem('hush-theme', 'dark'));
  await page.goto('/signin');
  await expect(page).toHaveURL(/\/signin/);
  expect(await isDark(page)).toBe(true);
  await page.context().close();
});
