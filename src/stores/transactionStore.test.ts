// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import { useTransactionStore, SplitUnbalancedError } from './transactionStore';
import { useAccountStore, initializeStores, resetStores } from './index';

function uuid(): string {
  return crypto.randomUUID();
}

let db: MonetaFoxDB;
let repos: Repositories;
let accId: string;

beforeEach(async () => {
  db = new MonetaFoxDB('test-tx-store-' + Math.random().toString(36).slice(2));
  const key = await deriveKey({
    mode: 'advanced',
    passphrase: 'pp',
    salt: 's',
  });
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
