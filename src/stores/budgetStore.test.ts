// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import {
  useBudgetStore,
  useCategoryStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from './index';

function uuid(): string {
  return crypto.randomUUID();
}

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB(
    'test-budget-store-' + Math.random().toString(36).slice(2),
  );
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

describe('useBudgetStore', () => {
  it('CRUDs budgets against the encrypted database', async () => {
    const b = { id: uuid(), categoryId: uuid(), month: '2026-01', limit: 400 };
    await useBudgetStore.getState().add(b);
    expect(useBudgetStore.getState().items[0].limit).toBe(400);
    await useBudgetStore.getState().update(b.id, { limit: 500 });
    expect(useBudgetStore.getState().items[0].limit).toBe(500);
    await useBudgetStore.getState().remove(b.id);
    expect(useBudgetStore.getState().items).toEqual([]);
  });

  it('createBudget assigns a fresh UUID and persists', async () => {
    const cat = uuid();
    const b = await useBudgetStore.getState().createBudget({
      categoryId: cat,
      month: '2026-02',
      limit: 200,
    });
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(b.categoryId).toBe(cat);
    expect(b.month).toBe('2026-02');
    expect(b.limit).toBe(200);
    expect(useBudgetStore.getState().items.map((x) => x.id)).toContain(b.id);
  });

  it('statusesForMonth scopes to the month and computes spent/remaining', async () => {
    const food = uuid();
    const fun = uuid();

    await useCategoryStore.getState().add({
      id: food,
      name: 'Food',
      kind: 'expense',
    });
    await useCategoryStore.getState().add({
      id: fun,
      name: 'Fun',
      kind: 'expense',
    });

    await useBudgetStore.getState().createBudget({
      categoryId: food,
      month: '2026-02',
      limit: 100,
    });
    await useBudgetStore.getState().createBudget({
      categoryId: fun,
      month: '2026-03', // different month — must be excluded
      limit: 50,
    });

    const accId = uuid();
    await useTransactionStore.getState().add({
      id: uuid(),
      accountId: accId,
      date: '2026-02-05',
      amount: -50,
      currency: 'GBP',
      payee: 'Cafe',
      categoryId: food,
    });
    await useTransactionStore.getState().add({
      id: uuid(),
      accountId: accId,
      date: '2026-02-10',
      amount: -40,
      currency: 'GBP',
      payee: 'Cinema',
      splits: [
        { categoryId: food, amount: -25 },
        { categoryId: fun, amount: -15 },
      ],
    });

    const transactions = useTransactionStore.getState().items;
    const rows = useBudgetStore
      .getState()
      .statusesForMonth('2026-02', transactions);

    expect(rows.length).toBe(1);
    expect(rows[0].categoryId).toBe(food);
    expect(rows[0].spent).toBeCloseTo(75, 10);
    expect(rows[0].limit).toBe(100);
    expect(rows[0].remaining).toBeCloseTo(25, 10);
    expect(rows[0].overBudget).toBe(false);
  });
});
