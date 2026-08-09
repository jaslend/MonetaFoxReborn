import { expect, test } from '@playwright/test';

/**
 * Phase 13 — end-to-end core flow.
 *
 * Walks the real built app through the spec's primary user journey on a fresh
 * browser context (empty IndexedDB):
 *
 *   1. First-run SETUP: create a vault in basic mode (email + password).
 *   2. First-run base-currency pick on the Accounts page.
 *   3. CREATE AN ACCOUNT.
 *   4. ADD A TRANSACTION against that account.
 *   5. Assert the transaction appears in the transactions list AND on the
 *      Dashboard's "Recent transactions" widget.
 *
 * Selectors prefer accessible roles / labels / text and fall back to the
 * stable `data-testid` attributes the components already expose. No app logic
 * is exercised that isn't part of the user-facing flow.
 */

const EMAIL = 'tester@example.com';
const PASSWORD = 'correct-horse-battery-staple';
const ACCOUNT_NAME = 'Test Checking';
const PAYEE = 'Blue Bottle Coffee';
const AMOUNT = '4.50';

test('first-run setup → create account → add transaction → see it', async ({
  page,
}) => {
  // --- 1. First-run setup (basic mode) -------------------------------------
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // Basic mode is the default; the radio is shown for completeness.
  await page.getByTestId('setup-email').fill(EMAIL);
  await page.getByTestId('setup-password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create vault/i }).click();

  // Setup creates the vault + authenticates; RequireAuth now lets us through
  // to the Dashboard. The first-run onboarding card ("Welcome to MonetaFox")
  // appears because there are no accounts yet.
  await expect(
    page.getByRole('heading', { name: /Dashboard/i, level: 1 }),
  ).toBeVisible();

  // --- 2. Pick base currency (Accounts page first-run gate) ----------------
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Accounts' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Accounts/i, level: 1 }),
  ).toBeVisible();

  await page.getByTestId('base-currency-select').selectOption('USD');
  await page.getByRole('button', { name: /Set base currency/i }).click();

  // Currency chosen → the "Add account" action appears.
  await expect(
    page.getByRole('button', { name: /Add account/i }),
  ).toBeVisible();

  // --- 3. Create an account ------------------------------------------------
  await page.getByRole('button', { name: /Add account/i }).click();

  const accountDialog = page.getByTestId('account-form-dialog');
  await expect(accountDialog).toBeVisible();
  await page.getByTestId('account-name').fill(ACCOUNT_NAME);
  // Type defaults to Checking, currency defaults to the base currency (USD),
  // opening balance defaults to 0 — all fine for this flow.
  await page.getByTestId('account-submit').click();

  await expect(accountDialog).not.toBeVisible();

  // The new account shows up under "Active".
  await expect(
    page.getByRole('heading', { name: /Active/i, level: 2 }),
  ).toBeVisible();
  await expect(page.getByText(ACCOUNT_NAME)).toBeVisible();

  // --- 4. Add a transaction against the new account ------------------------
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Transactions' })
    .click();
  await expect(
    page.getByRole('heading', { name: /Transactions/i, level: 1 }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Add transaction/i }).click();

  const txDialog = page.getByTestId('transaction-form-dialog');
  await expect(txDialog).toBeVisible();

  // The single existing account is preselected; date defaults to today;
  // direction defaults to Expense (−), which matches a coffee purchase.
  await page.getByTestId('tx-payee').fill(PAYEE);
  await page.getByTestId('tx-amount').fill(AMOUNT);
  await page.getByTestId('tx-submit').click();

  await expect(txDialog).not.toBeVisible();

  // --- 5. The transaction appears in the list ------------------------------
  await expect(
    page.getByRole('cell', { name: new RegExp(PAYEE) }),
  ).toBeVisible();
  // Signed amount (expense, −) with USD formatting. Match the magnitude so
  // the test is robust to Intl locale differences in the CI runner.
  await expect(page.locator('[data-testid^="tx-amount-"]')).toContainText(
    /4[.,]50/,
  );

  // --- And on the Dashboard's recent-transactions widget -------------------
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await expect(page.getByTestId('recent-transactions')).toBeVisible();
  await expect(
    page.getByTestId('recent-transactions').getByText(PAYEE),
  ).toBeVisible();
});
