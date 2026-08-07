// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import {
  buildSampleData,
  clearSampleData,
  isSampleId,
  loadSampleData,
  SAMPLE_MARKER,
} from '@/lib/sample';

// PBKDF2 is slow; derive once per file.
let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB('test-sample-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
});

afterEach(async () => {
  await db.delete();
});

describe('buildSampleData', () => {
  const d = buildSampleData();

  it('returns a BackupData with the backup version', () => {
    expect(d.version).toBeTypeOf('number');
    expect(d.version).toBe(1);
  });

  it('has >=2 accounts, >=10 transactions, >=2 categories', () => {
    expect(d.accounts.length).toBeGreaterThanOrEqual(2);
    expect(d.transactions.length).toBeGreaterThanOrEqual(10);
    expect(d.categories.length).toBeGreaterThanOrEqual(2);
  });

  it('every account id carries the sample marker', () => {
    expect(d.accounts.every((a) => a.id.includes(SAMPLE_MARKER))).toBe(true);
  });

  it('every transaction/account/category/budget id carries the sample marker', () => {
    for (const t of d.transactions) expect(t.id).toContain(SAMPLE_MARKER);
    for (const c of d.categories)
      expect(String((c as { id: string }).id)).toContain(SAMPLE_MARKER);
    for (const b of d.budgets)
      expect(String((b as { id: string }).id)).toContain(SAMPLE_MARKER);
  });

  it('every transaction.accountId references an existing account', () => {
    const ids = new Set(d.accounts.map((a) => a.id));
    for (const t of d.transactions) expect(ids.has(t.accountId)).toBe(true);
  });

  it('every transaction.categoryId references an existing category', () => {
    const ids = new Set(
      d.categories.map((c) => String((c as { id: string }).id)),
    );
    for (const t of d.transactions) {
      if (t.categoryId) expect(ids.has(t.categoryId)).toBe(true);
    }
  });

  it('split sums equal the parent amount and split categoryIds are valid', () => {
    const catIds = new Set(
      d.categories.map((c) => String((c as { id: string }).id)),
    );
    for (const t of d.transactions) {
      if (t.splits && t.splits.length) {
        const sum = t.splits.reduce((acc, s) => acc + s.amount, 0);
        expect(Math.abs(sum - t.amount)).toBeLessThan(1e-9);
        for (const s of t.splits) {
          if (s.categoryId) expect(catIds.has(s.categoryId)).toBe(true);
        }
      }
    }
  });

  it('has both income (+) and expense (-) transactions', () => {
    expect(d.transactions.some((t) => t.amount > 0)).toBe(true);
    expect(d.transactions.some((t) => t.amount < 0)).toBe(true);
  });

  it('includes a split transaction', () => {
    expect(d.transactions.some((t) => t.splits && t.splits.length > 0)).toBe(
      true,
    );
  });

  it('includes at least one budget and one scheduled transaction', () => {
    expect(d.budgets.length).toBeGreaterThanOrEqual(1);
    const sched = d.scheduledTransactions as { id: string }[];
    expect(Array.isArray(sched)).toBe(true);
    expect(sched.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic (deep-equal across calls)', () => {
    const a = buildSampleData();
    const b = buildSampleData();
    expect(a).toEqual(b);
  });
});

describe('isSampleId', () => {
  it('true for ids containing the marker', () => {
    expect(isSampleId('acc-sample-checking')).toBe(true);
    expect(isSampleId('txn-sample-01')).toBe(true);
  });
  it('false for random uuids (real data)', () => {
    expect(isSampleId('1f3a9c2e-1234-4abc-9def-abc123def456')).toBe(false);
    expect(isSampleId('')).toBe(false);
  });
});

describe('loadSampleData / clearSampleData over encrypted repos', () => {
  it('writes every sample entity through the repositories', async () => {
    await loadSampleData(repos);
    const d = buildSampleData();
    expect(await repos.accounts.toArray()).toHaveLength(d.accounts.length);
    expect(await repos.transactions.toArray()).toHaveLength(
      d.transactions.length,
    );
    expect(await repos.categories.toArray()).toHaveLength(d.categories.length);
    expect(await repos.budgets.toArray()).toHaveLength(d.budgets.length);
    expect(await repos.scheduledTransactions.toArray()).toHaveLength(
      (d.scheduledTransactions as unknown[]).length,
    );
    expect(await repos.assets.toArray()).toHaveLength(
      (d.assets as unknown[]).length,
    );
    expect(await repos.holdings.toArray()).toHaveLength(
      (d.holdings as unknown[]).length,
    );
    expect(await repos.prices.toArray()).toHaveLength(
      (d.prices as unknown[]).length,
    );
  });

  it('is idempotent (re-loading does not duplicate)', async () => {
    await loadSampleData(repos);
    await loadSampleData(repos);
    const d = buildSampleData();
    expect(await repos.accounts.toArray()).toHaveLength(d.accounts.length);
    expect(await repos.transactions.toArray()).toHaveLength(
      d.transactions.length,
    );
  });

  it('clearSampleData removes only sample-marked records, leaving real data', async () => {
    await loadSampleData(repos);
    // Seed a "real" account + transaction (random uuids, no 'sample' marker).
    await repos.accounts.put({
      id: '1f3a9c2e-1234-4abc-9def-abc123def456',
      name: 'Real Checking',
      type: 'checking',
      currency: 'GBP',
    });
    await repos.transactions.put({
      id: '2f3a9c2e-1234-4abc-9def-abc123def456',
      accountId: '1f3a9c2e-1234-4abc-9def-abc123def456',
      date: '2026-03-01',
      amount: -10,
      currency: 'GBP',
      payee: 'Real Coffee',
    });

    await clearSampleData(repos);

    const accounts = await repos.accounts.toArray();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe('Real Checking');
    const txns = await repos.transactions.toArray();
    expect(txns).toHaveLength(1);
    expect(txns[0].payee).toBe('Real Coffee');
    expect(await repos.categories.toArray()).toHaveLength(0);
    expect(await repos.budgets.toArray()).toHaveLength(0);
    expect(await repos.scheduledTransactions.toArray()).toHaveLength(0);
    expect(await repos.assets.toArray()).toHaveLength(0);
    expect(await repos.holdings.toArray()).toHaveLength(0);
    expect(await repos.prices.toArray()).toHaveLength(0);
  });
});
