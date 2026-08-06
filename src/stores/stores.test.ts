// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import {
  useAccountStore,
  useTransactionStore,
  useCategoryStore,
  useBudgetStore,
  useSettingsStore,
  useUiStore,
  initializeStores,
  resetStores,
} from './index';

function uuid(): string {
  return crypto.randomUUID();
}

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB('test-stores-' + Math.random().toString(36).slice(2));
  const key = await deriveKey({
    mode: 'advanced',
    passphrase: 'pp',
    salt: 's',
  });
  repos = createRepositories(db, key);
  // Reset any carry-over state from a previous test, then unlock.
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

describe('useAccountStore', () => {
  it('CRUDs accounts against the encrypted database', async () => {
    const store = useAccountStore;
    expect(store.getState().items).toEqual([]);
    expect(store.getState().repos).toBe(repos);

    const acc = {
      id: uuid(),
      name: 'Checking',
      type: 'checking' as const,
      currency: 'GBP',
    };
    await store.getState().add(acc);
    expect(store.getState().items.map((a) => a.name)).toEqual(['Checking']);

    await store.getState().update(acc.id, { name: 'Main', archived: true });
    expect(store.getState().items[0]).toEqual({
      ...acc,
      name: 'Main',
      archived: true,
    });

    await store.getState().remove(acc.id);
    expect(store.getState().items).toEqual([]);
    expect(await repos.accounts.get(acc.id)).toBeUndefined();
  });

  it('reloads from the encrypted table on load()', async () => {
    const store = useAccountStore;
    const a = { id: uuid(), name: 'A', type: 'cash' as const, currency: 'GBP' };
    await store.getState().add(a);
    // Simulate a stale in-memory list by mutating state directly.
    store.setState({ items: [] });
    expect(store.getState().items).toEqual([]);
    await store.getState().load();
    expect(store.getState().items.map((x) => x.name)).toEqual(['A']);
  });

  it('persists at-rest ciphertext only (domain data never plaintext)', async () => {
    const a = {
      id: uuid(),
      name: 'SensitiveName',
      type: 'cash' as const,
      currency: 'GBP',
    };
    await useAccountStore.getState().add(a);
    const raw = await db.accounts.get(a.id);
    expect(JSON.stringify(raw)).not.toContain('SensitiveName');
  });
});

describe('useTransactionStore', () => {
  it('CRUDs transactions tied to an account', async () => {
    const accId = uuid();
    await useAccountStore.getState().add({
      id: accId,
      name: 'Wallet',
      type: 'cash',
      currency: 'GBP',
    });

    const tx = {
      id: uuid(),
      accountId: accId,
      date: '2026-01-15',
      amount: 42.5,
      currency: 'GBP',
      payee: 'ACME Corp',
    };
    await useTransactionStore.getState().add(tx);
    expect(useTransactionStore.getState().items.map((t) => t.payee)).toEqual([
      'ACME Corp',
    ]);

    await useTransactionStore.getState().update(tx.id, { cleared: true });
    expect(useTransactionStore.getState().items[0].cleared).toBe(true);

    await useTransactionStore.getState().remove(tx.id);
    expect(useTransactionStore.getState().items).toEqual([]);
  });
});

describe('useCategoryStore', () => {
  it('CRUDs categories', async () => {
    const c = { id: uuid(), name: 'Groceries', kind: 'expense' as const };
    await useCategoryStore.getState().add(c);
    expect(useCategoryStore.getState().items[0].name).toBe('Groceries');
    await useCategoryStore.getState().update(c.id, { name: 'Food' });
    expect(useCategoryStore.getState().items[0].name).toBe('Food');
    await useCategoryStore.getState().remove(c.id);
    expect(useCategoryStore.getState().items).toEqual([]);
  });
});

describe('useBudgetStore', () => {
  it('CRUDs budgets', async () => {
    const b = { id: uuid(), categoryId: uuid(), month: '2026-01', limit: 400 };
    await useBudgetStore.getState().add(b);
    expect(useBudgetStore.getState().items[0].limit).toBe(400);
    await useBudgetStore.getState().update(b.id, { limit: 500 });
    expect(useBudgetStore.getState().items[0].limit).toBe(500);
    await useBudgetStore.getState().remove(b.id);
    expect(useBudgetStore.getState().items).toEqual([]);
  });
});

describe('useSettingsStore', () => {
  it('CRUDs settings', async () => {
    const s = {
      id: 'singleton',
      baseCurrency: 'GBP',
      encryptionMode: 'advanced' as const,
    };
    await useSettingsStore.getState().add(s);
    expect(useSettingsStore.getState().items[0].baseCurrency).toBe('GBP');
    await useSettingsStore.getState().update(s.id, { baseCurrency: 'USD' });
    expect(useSettingsStore.getState().items[0].baseCurrency).toBe('USD');
    await useSettingsStore.getState().remove(s.id);
    expect(useSettingsStore.getState().items).toEqual([]);
  });
});

describe('useUiStore', () => {
  it('toggles UI state without touching domain data', () => {
    const ui = useUiStore.getState();
    expect(ui.sidebarOpen).toBe(true);
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarOpen).toBe(false);
    useUiStore.getState().setTheme('dark');
    expect(useUiStore.getState().theme).toBe('dark');
    useUiStore.getState().openModal('add-transaction', { foo: 1 });
    expect(useUiStore.getState().modal).toEqual({
      active: 'add-transaction',
      payload: { foo: 1 },
    });
    useUiStore.getState().closeModal();
    expect(useUiStore.getState().modal.active).toBeNull();
  });
});

describe('initializeStores (unlock seam)', () => {
  it('binds every domain store to the repositories and loads initial data', async () => {
    // Seed directly via the repositories, then re-initialise to confirm load.
    const accId = uuid();
    await repos.accounts.add({
      id: accId,
      name: 'Seeded',
      type: 'checking',
      currency: 'GBP',
    });
    resetStores();
    await initializeStores(repos);
    expect(useAccountStore.getState().repos).toBe(repos);
    expect(useAccountStore.getState().items.map((a) => a.name)).toEqual([
      'Seeded',
    ]);
  });

  it('resetStores detaches from the repositories and clears in-memory lists', async () => {
    const accId = uuid();
    await useAccountStore
      .getState()
      .add({ id: accId, name: 'X', type: 'cash', currency: 'GBP' });
    resetStores();
    expect(useAccountStore.getState().items).toEqual([]);
    expect(useAccountStore.getState().repos).toBeNull();
    // The encrypted row persists in IndexedDB; only the projection is cleared.
    expect((await repos.accounts.get(accId))?.name).toBe('X');
  });
});
