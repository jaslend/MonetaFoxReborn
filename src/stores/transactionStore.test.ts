// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import {
  useTransactionStore,
  SplitUnbalancedError,
  selectFilteredTransactions as selectFiltered,
} from './transactionStore';
import { useAccountStore, initializeStores, resetStores } from './index';

function uuid(): string {
  return crypto.randomUUID();
}

// The AES key is a pure function of (passphrase, salt) and holds no state, so
// derive it ONCE per file (PBKDF2 is the suite's slowest single op) and reuse
// it across tests. Per-test isolation comes from the fresh DB below — the same
// key encrypting different databases is exactly what production does.
let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;
let accId: string;

beforeEach(async () => {
  db = new MonetaFoxDB('test-tx-store-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
  accId = uuid();
  await useAccountStore.getState().add({
    id: accId,
    name: 'Wallet',
    type: 'cash',
    currency: 'USD',
  });
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

function baseTx(amount = -100): {
  id: string;
  accountId: string;
  date: string;
  amount: number;
  currency: string;
  payee: string;
} {
  return {
    id: uuid(),
    accountId: accId,
    date: '2026-01-15',
    amount,
    currency: 'USD',
    payee: 'ACME Corp',
  };
}

describe('useTransactionStore (Phase 5a)', () => {
  it('add/save a transaction with no splits (trivially balanced)', async () => {
    const tx = baseTx();
    await useTransactionStore.getState().add(tx);
    expect(useTransactionStore.getState().items.map((t) => t.payee)).toEqual([
      'ACME Corp',
    ]);
    expect(await repos.transactions.get(tx.id)).toBeDefined();
  });

  it('add rejects a transaction whose splits do not sum to amount', async () => {
    const tx = {
      ...baseTx(-100),
      splits: [{ amount: -60 }, { amount: -30 }],
    };
    await expect(useTransactionStore.getState().add(tx)).rejects.toBeInstanceOf(
      SplitUnbalancedError,
    );
    // Nothing persisted, nothing projected.
    expect(useTransactionStore.getState().items).toEqual([]);
    expect(await repos.transactions.get(tx.id)).toBeUndefined();
  });

  it('add accepts a transaction whose splits sum exactly to amount', async () => {
    const tx = {
      ...baseTx(-100),
      splits: [{ amount: -60 }, { amount: -40 }],
    };
    await useTransactionStore.getState().add(tx);
    expect(useTransactionStore.getState().items).toHaveLength(1);
    expect(useTransactionStore.getState().items[0].splits).toEqual([
      { amount: -60 },
      { amount: -40 },
    ]);
  });

  it('add rejects splits with the wrong sign vs the parent', async () => {
    const tx = {
      ...baseTx(-100),
      splits: [{ amount: 60 }, { amount: 40 }],
    };
    await expect(useTransactionStore.getState().add(tx)).rejects.toBeInstanceOf(
      SplitUnbalancedError,
    );
  });

  it('update rejects a patch that leaves splits unbalanced', async () => {
    const tx = {
      ...baseTx(-100),
      splits: [{ amount: -60 }, { amount: -40 }],
    };
    await useTransactionStore.getState().add(tx);
    // Knock a split off the total; the stored row must be left intact.
    await expect(
      useTransactionStore.getState().update(tx.id, {
        splits: [{ amount: -60 }, { amount: -30 }],
      }),
    ).rejects.toBeInstanceOf(SplitUnbalancedError);
    expect(useTransactionStore.getState().items[0].splits).toEqual([
      { amount: -60 },
      { amount: -40 },
    ]);
  });

  it('update accepts a patch that keeps splits balanced', async () => {
    const tx = baseTx(-100);
    await useTransactionStore.getState().add(tx);
    await useTransactionStore.getState().update(tx.id, {
      splits: [{ amount: -70 }, { amount: -30 }],
    });
    expect(useTransactionStore.getState().items[0].splits).toEqual([
      { amount: -70 },
      { amount: -30 },
    ]);
  });

  it('update merges a non-split patch onto a balanced split transaction', async () => {
    const tx = {
      ...baseTx(-100),
      splits: [{ amount: -60 }, { amount: -40 }],
    };
    await useTransactionStore.getState().add(tx);
    await useTransactionStore.getState().update(tx.id, { payee: 'New Co' });
    expect(useTransactionStore.getState().items[0].payee).toBe('New Co');
    expect(useTransactionStore.getState().items[0].splits).toHaveLength(2);
  });

  it('setCleared toggles the cleared flag', async () => {
    const tx = baseTx();
    await useTransactionStore.getState().add(tx);
    await useTransactionStore.getState().setCleared(tx.id, true);
    expect(useTransactionStore.getState().items[0].cleared).toBe(true);
    await useTransactionStore.getState().setCleared(tx.id, false);
    expect(useTransactionStore.getState().items[0].cleared).toBe(false);
  });

  it('setReconciled toggles the reconciled flag', async () => {
    const tx = baseTx();
    await useTransactionStore.getState().add(tx);
    await useTransactionStore.getState().setReconciled(tx.id, true);
    expect(useTransactionStore.getState().items[0].reconciled).toBe(true);
  });

  it('remove deletes a transaction', async () => {
    const tx = baseTx();
    await useTransactionStore.getState().add(tx);
    await useTransactionStore.getState().remove(tx.id);
    expect(useTransactionStore.getState().items).toEqual([]);
    expect(await repos.transactions.get(tx.id)).toBeUndefined();
  });

  it('add throws before the store is initialized', async () => {
    resetStores();
    await expect(useTransactionStore.getState().add(baseTx())).rejects.toThrow(
      /not initialized/,
    );
  });
});

describe('useTransactionStore (Phase 5b: filters + search)', () => {
  it('default filter/search expose every item via selectFilteredTransactions', async () => {
    await useTransactionStore.getState().add(baseTx(-100));
    await useTransactionStore
      .getState()
      .add({ ...baseTx(50), accountId: accId });
    const state = useTransactionStore.getState();
    expect(state.filter).toEqual({});
    expect(state.search).toBe('');
    expect(
      selectFiltered(state)
        .map((t) => t.amount)
        .sort(),
    ).toEqual([-100, 50]);
  });

  it('setFilter merges a patch and narrows the derived list', async () => {
    const t1 = baseTx(-100); // a1, 2026-01-15
    const t2 = { ...baseTx(50), date: '2026-03-20' };
    await useTransactionStore.getState().add(t1);
    await useTransactionStore.getState().add(t2);
    useTransactionStore.getState().setFilter({ dateFrom: '2026-03-01' });
    expect(
      selectFiltered(useTransactionStore.getState()).map((t) => t.id),
    ).toEqual([t2.id]);
    // merging: add an account filter that excludes everything
    useTransactionStore.getState().setFilter({ accountId: 'no-such-account' });
    expect(selectFiltered(useTransactionStore.getState())).toEqual([]);
  });

  it('clearFilter resets filter and search', async () => {
    await useTransactionStore.getState().add(baseTx());
    useTransactionStore.getState().setFilter({ cleared: true });
    useTransactionStore.getState().setSearch('xyz');
    useTransactionStore.getState().clearFilter();
    const s = useTransactionStore.getState();
    expect(s.filter).toEqual({});
    expect(s.search).toBe('');
    expect(selectFiltered(s)).toHaveLength(1);
  });

  it('setSearch narrows by payee/notes/tags', async () => {
    await useTransactionStore.getState().add({ ...baseTx(), payee: 'Tesco' });
    await useTransactionStore
      .getState()
      .add({ ...baseTx(), payee: 'Amazon', notes: 'books' });
    useTransactionStore.getState().setSearch('tesc');
    expect(
      selectFiltered(useTransactionStore.getState()).map((t) => t.payee),
    ).toEqual(['Tesco']);
    useTransactionStore.getState().setSearch('books');
    expect(
      selectFiltered(useTransactionStore.getState()).map((t) => t.payee),
    ).toEqual(['Amazon']);
  });

  it('filter + search compose (search first, then filter)', async () => {
    await useTransactionStore
      .getState()
      .add({ ...baseTx(-30), payee: 'Tesco' });
    await useTransactionStore
      .getState()
      .add({ ...baseTx(-10), payee: 'Tesco Express' });
    useTransactionStore.getState().setSearch('tesco');
    useTransactionStore.getState().setFilter({ accountId: accId });
    expect(selectFiltered(useTransactionStore.getState())).toHaveLength(2);
    useTransactionStore.getState().setFilter({ accountId: 'other' });
    expect(selectFiltered(useTransactionStore.getState())).toEqual([]);
  });
});

describe('useTransactionStore (Phase 5b: templates)', () => {
  it('saveAsTemplate persists a template derived from a transaction', async () => {
    const t = {
      ...baseTx(-100),
      payee: 'Landlord',
      categoryId: 'c',
      tags: ['rent'],
    };
    await useTransactionStore.getState().add(t);
    const saved = await useTransactionStore
      .getState()
      .saveAsTemplate(t, 'Rent');
    expect(saved.name).toBe('Rent');
    expect(saved.payee).toBe('Landlord');
    expect(saved.amount).toBe(-100);
    expect(saved.tags).toEqual(['rent']);
    expect(useTransactionStore.getState().templates.map((x) => x.name)).toEqual(
      ['Rent'],
    );
    expect((await repos.transactionTemplates.get(saved.id))?.payee).toBe(
      'Landlord',
    );
  });

  it('saveAsTemplate defaults the name to the payee', async () => {
    const t = { ...baseTx(-100), payee: 'Cafe' };
    await useTransactionStore.getState().add(t);
    const saved = await useTransactionStore.getState().saveAsTemplate(t);
    expect(saved.name).toBe('Cafe');
  });

  it('applyTemplate returns the template by id', async () => {
    const t = { ...baseTx(-100), payee: 'Gym' };
    await useTransactionStore.getState().add(t);
    const saved = await useTransactionStore
      .getState()
      .saveAsTemplate(t, 'Gym pass');
    expect(useTransactionStore.getState().applyTemplate(saved.id)?.name).toBe(
      'Gym pass',
    );
    expect(
      useTransactionStore.getState().applyTemplate('missing'),
    ).toBeUndefined();
  });

  it('listTemplates returns the in-memory templates', async () => {
    const t = { ...baseTx(-100), payee: 'P' };
    await useTransactionStore.getState().add(t);
    await useTransactionStore.getState().saveAsTemplate(t, 'A');
    await useTransactionStore.getState().saveAsTemplate(t, 'B');
    expect(
      useTransactionStore
        .getState()
        .listTemplates()
        .map((x) => x.name)
        .sort(),
    ).toEqual(['A', 'B']);
  });

  it('deleteTemplate removes a template', async () => {
    const t = { ...baseTx(-100), payee: 'P' };
    await useTransactionStore.getState().add(t);
    const saved = await useTransactionStore.getState().saveAsTemplate(t, 'X');
    await useTransactionStore.getState().deleteTemplate(saved.id);
    expect(useTransactionStore.getState().templates).toEqual([]);
    expect(await repos.transactionTemplates.get(saved.id)).toBeUndefined();
  });

  it('saveAsTemplate throws before the store is initialized', async () => {
    resetStores();
    await expect(
      useTransactionStore.getState().saveAsTemplate(baseTx()),
    ).rejects.toThrow(/not initialized/);
  });

  it('reset clears filter, search, and templates', async () => {
    const t = { ...baseTx(-100), payee: 'P' };
    await useTransactionStore.getState().add(t);
    await useTransactionStore.getState().saveAsTemplate(t, 'T');
    useTransactionStore.getState().setSearch('p');
    useTransactionStore.getState().setFilter({ cleared: true });
    resetStores();
    const s = useTransactionStore.getState();
    expect(s.items).toEqual([]);
    expect(s.templates).toEqual([]);
    expect(s.filter).toEqual({});
    expect(s.search).toBe('');
  });
});
