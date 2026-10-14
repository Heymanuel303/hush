import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the tests at a running deployment; without it Playwright
// starts `pnpm dev` (api on :3000 and web on :5173) and waits for the web URL.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  // Deviation from the starter kit: one admin sign-in shared by specs (see e2e/global-setup.ts).
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  // The hub has one Pi-hole connection; the desktop and mobile runs of e2e/pihole.spec.ts share it.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // The html report is what ci.yml uploads when a run fails.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      // Chromium with a phone-sized touch viewport: no second browser download.
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
