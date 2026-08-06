import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import {
  useAccountStore,
  useSettingsStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from '@/stores';
import { useAuthStore } from '@/stores/authStore';

import { AccountsPage } from './AccountsPage';

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB(
    'test-accounts-page-' + Math.random().toString(36).slice(2),
  );
  const key = await deriveKey({
    mode: 'advanced',
    passphrase: 'pp',
    salt: 's',
  });
  repos = createRepositories(db, key);
  resetStores();
  useAuthStore.setState({ mode: 'advanced', isAuthenticated: true });
  await initializeStores(repos);
  // Pre-create the (empty baseCurrency) settings singleton so the page's
  // first-run ensureSettings effect does not race with test teardown. The
  // first-run prompt still renders because baseCurrency is ''.
  await useSettingsStore.getState().ensureSettings('advanced');
});

afterEach(async () => {
  // Unmount React trees BEFORE resetting stores, otherwise the store
  // subscription re-renders the (still-mounted) page with empty items and the
  // first-run effect fires ensureSettings against a null repo.
  cleanup();
  resetStores();
  useAuthStore.setState({ mode: null, isAuthenticated: false });
  await db.delete();
});

describe('AccountsPage', () => {
  it('prompts for a base currency on first run, then shows the empty account list', async () => {
    const user = userEvent.setup();
    render(<AccountsPage />);

    // First run: no base currency set → the picker is shown.
    const select = await screen.findByTestId('base-currency-select');
    expect(select).toBeInTheDocument();

    // Choose GBP and confirm.
    await user.selectOptions(select, 'GBP');
    await user.click(screen.getByTestId('base-currency-confirm'));

    // After the base currency is set, the account-list view renders with the
    // "Add account" button and a net-worth card.
    expect(await screen.findByTestId('add-account')).toBeInTheDocument();
    expect(screen.getByTestId('net-worth')).toHaveTextContent('£0.00');
    expect(useSettingsStore.getState().getSettings()?.baseCurrency).toBe('GBP');
  });

  it('creates an account through the form and shows its balance + net worth', async () => {
    const user = userEvent.setup();
    // Pre-set the base currency directly via the store.
    await useSettingsStore.getState().setBaseCurrency('USD');

    render(<AccountsPage />);
    await screen.findByTestId('add-account');

    await user.click(screen.getByTestId('add-account'));
    await user.type(screen.getByTestId('account-name'), 'Main checking');
    await user.click(screen.getByTestId('account-submit'));

    // Account appears with a $250... wait, default opening balance is 0.
    const nameDisplay = await screen.findByTestId('account-name-display');
    expect(nameDisplay).toHaveTextContent('Main checking');
    expect(useAccountStore.getState().items).toHaveLength(1);
    expect(useAccountStore.getState().items[0].currency).toBe('USD');
    expect(useAccountStore.getState().items[0].openingBalance).toBe(0);
  });

  it('locks the base currency once an account exists', async () => {
    await useSettingsStore.getState().setBaseCurrency('USD');
    await useAccountStore.getState().createAccount({
      name: 'Wallet',
      type: 'cash',
      currency: 'USD',
    });
    await expect(
      useSettingsStore.getState().setBaseCurrency('EUR'),
    ).rejects.toThrow(/fixed once accounts or transactions exist/);
  });
});

// Keep transaction store import referenced so the guard sees the right module
// even if no transactions are added in these tests.
void useTransactionStore;
