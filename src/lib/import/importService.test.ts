// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import type { ParsedTransaction } from '@/lib/import/types';

import { importTransactions } from './importService';

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB('import-test-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
});

afterEach(async () => {
  await db.delete();
});

const SAMPLE: ParsedTransaction[] = [
  {
    date: '2026-02-05',
    amount: -1234.56,
    payee: 'Tesco, Ltd',
    category: 'Groceries',
    memo: 'Shop',
    cleared: true,
  },
  {
    date: '2026-02-06',
    amount: 2500,
    payee: 'Salary',
    category: 'Income',
    cleared: true,
  },
];

describe('importTransactions — new account', () => {
  it('creates the account, auto-creates categories, and inserts transactions', async () => {
    const result = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'new', name: 'Main', type: 'checking', currency: 'GBP' },
      autoCreateCategories: true,
    });

    expect(result.accountsCreated).toBe(1);
    expect(result.categoriesCreated).toBe(2);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);

    const account = await repos.accounts.get(result.accountId);
    expect(account?.name).toBe('Main');
    expect(account?.currency).toBe('GBP');

    const txs = await repos.transactions.toArray();
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.accountId === result.accountId)).toBe(true);
    expect(txs.every((t) => t.currency === 'GBP')).toBe(true);
    expect(txs.every((t) => t.id.length > 0)).toBe(true);

    const cats = await repos.categories.toArray();
    const byName = new Map(cats.map((c) => [c.name, c]));
    expect(byName.get('Groceries')?.kind).toBe('expense');
    expect(byName.get('Income')?.kind).toBe('income');

    // The transaction's categoryId resolves to the created category.
    const grocery = txs.find((t) => t.payee === 'Tesco, Ltd');
    expect(grocery?.categoryId).toBe(byName.get('Groceries')?.id);
    expect(grocery?.notes).toBe('Shop');
    expect(grocery?.cleared).toBe(true);
  });

  it('reuses an existing category by name (case-insensitive) and does not recreate it', async () => {
    await repos.categories.add({
      id: crypto.randomUUID(),
      name: 'Groceries',
      kind: 'expense',
    });
    const result = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'new', name: 'Main', type: 'checking', currency: 'GBP' },
      autoCreateCategories: true,
    });
    // Only 'Income' is new; 'Groceries' already existed.
    expect(result.categoriesCreated).toBe(1);
    const cats = await repos.categories.toArray();
    expect(
      cats.filter((c) => c.name.toLowerCase() === 'groceries'),
    ).toHaveLength(1);
  });

  it('leaves categoryId unset for unknown categories when autoCreate is off', async () => {
    const result = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'new', name: 'Main', type: 'checking', currency: 'GBP' },
      autoCreateCategories: false,
    });
    expect(result.categoriesCreated).toBe(0);
    const txs = await repos.transactions.toArray();
    expect(txs.every((t) => t.categoryId === undefined)).toBe(true);
    expect(await repos.categories.toArray()).toHaveLength(0);
  });
});

describe('importTransactions — existing account', () => {
  it('throws when the target account does not exist', async () => {
    await expect(
      importTransactions(repos, {
        parsed: SAMPLE,
        target: { mode: 'existing', accountId: 'nope' },
      }),
    ).rejects.toThrow(/not found/);
  });

  it('imports into the existing account and uses its currency', async () => {
    const accId = crypto.randomUUID();
    await repos.accounts.add({
      id: accId,
      name: 'Wallet',
      type: 'cash',
      currency: 'USD',
    });
    const result = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'existing', accountId: accId },
      autoCreateCategories: true,
    });
    expect(result.accountsCreated).toBe(0);
    expect(result.created).toBe(2);
    const txs = await repos.transactions.toArray();
    expect(txs.every((t) => t.currency === 'USD')).toBe(true);
  });
});

describe('importTransactions — dedupe (idempotent re-import)', () => {
  it('skips rows already present on the target account', async () => {
    const r1 = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'new', name: 'Main', type: 'checking', currency: 'GBP' },
      autoCreateCategories: true,
    });
    const r2 = await importTransactions(repos, {
      parsed: SAMPLE,
      target: { mode: 'existing', accountId: r1.accountId },
      autoCreateCategories: true,
    });
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(2);
    expect(r2.categoriesCreated).toBe(0);
    const txs = await repos.transactions.toArray();
    expect(txs).toHaveLength(2);
  });

  it('imports genuinely new rows alongside duplicates', async () => {
    const r1 = await importTransactions(repos, {
      parsed: [SAMPLE[0]],
      target: { mode: 'new', name: 'Main', type: 'checking', currency: 'GBP' },
      autoCreateCategories: true,
    });
    const r2 = await importTransactions(repos, {
      parsed: [SAMPLE[0], SAMPLE[1]],
      target: { mode: 'existing', accountId: r1.accountId },
      autoCreateCategories: true,
    });
    expect(r2.created).toBe(1);
    expect(r2.skipped).toBe(1);
  });
});
