import { expect, test } from '@playwright/test';

/**
 * Phase 0 smoke test (refreshed in Phase 13): the built app boots and the
 * first-run Login / Setup screen is reachable. Deeper flows live in
 * core-flow.spec.ts and sample-data.spec.ts.
 */
test('app boots to the first-run setup screen', async ({ page }) => {
  await page.goto('/');

  // Unauthenticated users are redirected to /login by RequireAuth; on a fresh
  // browser context (no IndexedDB vault) the auth store is in 'setup' status,
  // so the SetupForm renders with a "Create vault" primary action.
  await expect(page).toHaveURL(/\/login/);

  await expect(page.getByRole('heading', { name: /MonetaFox/i })).toBeVisible();

  await expect(
    page.getByRole('button', { name: /Create vault/i }),
  ).toBeVisible();
});
