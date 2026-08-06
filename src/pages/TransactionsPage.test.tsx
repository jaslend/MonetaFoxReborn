import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import {
  useAccountStore,
  useCategoryStore,
  useSettingsStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from '@/stores';

import { TransactionsPage } from './TransactionsPage';

// PBKDF2 is the suite's slowest single op; the AES key is a pure function of
// (passphrase, salt) with no state, so derive it once per file and reuse it.
// Per-test isolation comes from the fresh DB created in beforeEach.
let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB('test-tx-page-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
  await useSettingsStore.getState().setBaseCurrency('USD');
  await useAccountStore.getState().createAccount({
    name: 'Checking',
    type: 'checking',
    currency: 'USD',
  });
  await useCategoryStore.getState().add({
    id: crypto.randomUUID(),
    name: 'Groceries',
    kind: 'expense',
  });
});

afterEach(async () => {
  cleanup();
  resetStores();
  await db.delete();
});

describe('TransactionsPage', () => {
  it('creates a transaction through the form and lists it, most-recent first', async () => {
    const user = userEvent.setup();
    render(<TransactionsPage />);

    // Seed an earlier transaction directly so we can verify ordering.
    const acc = useAccountStore.getState().items[0];
    await useTransactionStore.getState().add({
      id: crypto.randomUUID(),
      accountId: acc.id,
      date: '2020-01-01',
      amount: -5,
      currency: 'USD',
      payee: 'Old',
    });

    await user.click(screen.getByTestId('add-transaction'));
    await user.type(screen.getByTestId('tx-payee'), 'ACME Corp');
    await user.type(screen.getByTestId('tx-amount'), '42');
    await user.click(screen.getByTestId('tx-submit'));

    // The form's `submit` handler is async (it awaits `addTx`, which awaits the
    // encrypted repository + a store `load`); `user.click` only dispatches the
    // click and does NOT await the handler's promise. Wait for the store to
    // reflect the saved row before reading the DOM, so the assertion is not
    // racing the async write pipeline.
    await waitFor(() => {
      expect(useTransactionStore.getState().items).toHaveLength(2);
    });
    const rows = screen.getAllByTestId(/^transaction-row-/);
    expect(rows).toHaveLength(2);
    // Most-recent first: the new (default today) transaction is above the 2020 one.
    const firstPayee = rows[0].querySelector('td:nth-child(2)');
    expect(firstPayee).toHaveTextContent('ACME Corp');
    expect(useTransactionStore.getState().items).toHaveLength(2);
  });

  it('blocks save when splits do not sum to the amount, then saves when balanced', async () => {
    const user = userEvent.setup();
    render(<TransactionsPage />);

    await user.click(screen.getByTestId('add-transaction'));
    await user.type(screen.getByTestId('tx-payee'), 'Split payee');
    await user.type(screen.getByTestId('tx-amount'), '100');
    // Add two splits that do NOT sum to 100 yet (60 only).
    await user.click(screen.getByTestId('split-add'));
    await user.type(screen.getByTestId('split-amount-0'), '60');

    // Submit is disabled while unbalanced.
    expect(screen.getByTestId('tx-submit')).toBeDisabled();
    expect(useTransactionStore.getState().items).toHaveLength(0);

    // Balance it with a second split of 40.
    await user.click(screen.getByTestId('split-add'));
    await user.type(screen.getByTestId('split-amount-1'), '40');
    expect(screen.getByTestId('tx-submit')).not.toBeDisabled();
    await user.click(screen.getByTestId('tx-submit'));

    // `submit` is async (see above); wait for the store write to land before
    // asserting on the persisted projection.
    await waitFor(() => {
      expect(useTransactionStore.getState().items).toHaveLength(1);
    });
    const items = useTransactionStore.getState().items;
    expect(items).toHaveLength(1);
    // Parent amount is signed (expense = negative) and splits sum to it.
    expect(items[0].amount).toBe(-100);
    expect(items[0].splits).toEqual([
      { amount: -60, categoryId: undefined, notes: undefined },
      { amount: -40, categoryId: undefined, notes: undefined },
    ]);
  });

  it('toggles Cleared and Reconciled inline', async () => {
    const user = userEvent.setup();
    render(<TransactionsPage />);

    const acc = useAccountStore.getState().items[0];
    await useTransactionStore.getState().add({
      id: crypto.randomUUID(),
      accountId: acc.id,
      date: '2026-01-01',
      amount: -10,
      currency: 'USD',
      payee: 'Cafe',
    });

    const id = useTransactionStore.getState().items[0].id;
    const clearedBtn = await screen.findByTestId(`tx-cleared-${id}`);
    const reconBtn = screen.getByTestId(`tx-reconciled-${id}`);

    await user.click(clearedBtn);
    await user.click(reconBtn);

    // The toggle handlers await `setCleared`/`setReconciled`, each of which
    // awaits an encrypted `update` + store `load`. Wait for both flags to land
    // before asserting rather than racing the async pipeline.
    await waitFor(() => {
      expect(useTransactionStore.getState().items[0].cleared).toBe(true);
      expect(useTransactionStore.getState().items[0].reconciled).toBe(true);
    });
    expect(useTransactionStore.getState().items[0].cleared).toBe(true);
    expect(useTransactionStore.getState().items[0].reconciled).toBe(true);
  });

  it('deletes a transaction after confirm', async () => {
    const user = userEvent.setup();
    render(<TransactionsPage />);

    const acc = useAccountStore.getState().items[0];
    await useTransactionStore.getState().add({
      id: crypto.randomUUID(),
      accountId: acc.id,
      date: '2026-01-01',
      amount: -10,
      currency: 'USD',
      payee: 'Doomed',
    });

    const id = useTransactionStore.getState().items[0].id;
    await user.click(screen.getByTestId(`tx-delete-${id}`));
    await user.click(screen.getByTestId('confirm-confirm'));

    // `handleDelete` awaits `removeTx` (encrypted delete + store `load`); wait
    // for the projection to empty before asserting.
    await waitFor(() => {
      expect(useTransactionStore.getState().items).toHaveLength(0);
    });
    expect(useTransactionStore.getState().items).toHaveLength(0);
  });
});
