import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright harness for MonetaFox Reborn (Phase 13).
 *
 * The `webServer` builds the production bundle once and serves `dist/` via
 * `vite preview`, so CI (and any local run with a browser installed) drives
 * the real built app. GitHub Actions installs the browsers; this sandbox has
 * none, so `pnpm run test:e2e` is only expected to run green in CI.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Build once, then serve dist/. `preview` stays alive for the suite.
    command: 'corepack pnpm run build && corepack pnpm preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
