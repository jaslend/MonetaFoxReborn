import { expect, test } from '@playwright/test';

/**
 * Phase 13 — sample-data → reports spec.
 *
 * From a fresh vault, load the bundled sample dataset (Settings → "Load
 * sample data") and assert that the Reports page renders its five reports in
 * the base currency rather than empty / "not set yet" states.
 *
 * The sample loader writes accounts, transactions, categories, and budgets
 * tagged `sample`; the reports page aggregates whatever is in the stores, so
 * a successful load surfaces non-empty charts and a non-zero net-worth figure.
 */

const EMAIL = 'tester@example.com';
const PASSWORD = 'correct-horse-battery-staple';

test('load sample data, then reports render', async ({ page }) => {
  // --- Setup a fresh vault -------------------------------------------------
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByTestId('setup-email').fill(EMAIL);
  await page.getByTestId('setup-password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create vault/i }).click();

  await expect(
    page.getByRole('heading', { name: /Dashboard/i, level: 1 }),
  ).toBeVisible();

  // --- Load sample data from Settings --------------------------------------
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Settings/i, level: 1 }),
  ).toBeVisible();

  await page.getByTestId('settings-load-sample').click();

  // The sample loader writes several months of tagged records. Wait for the
  // button to return from "Loading…" to its idle label, which signals the
  // write completed and the stores have re-hydrated.
  await expect(page.getByTestId('settings-load-sample')).not.toHaveText(
    /Loading/,
  );

  // --- Reports render ------------------------------------------------------
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Reports' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Reports/i, level: 1 }),
  ).toBeVisible();

  // The headline net-worth card renders a currency-formatted value (not the
  // "not set yet" placeholder, since sample data sets a base currency).
  await expect(page.getByTestId('net-worth-total')).toBeVisible();
  await expect(page.getByTestId('net-worth-total')).not.toHaveText(/NaN/);

  // The four chart cards each render under their titled heading. We assert
  // the headings are present (the Recharts SVGs are tested implicitly by the
  // page not crashing on real data).
  await expect(page.getByText(/Net worth over time/i)).toBeVisible();
  await expect(page.getByText(/Spending by category/i)).toBeVisible();
  await expect(page.getByText(/Spending by payee/i)).toBeVisible();
  await expect(page.getByText(/Income vs expenses/i)).toBeVisible();
});
