// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '../crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from './index';

function uuid(): string {
  return crypto.randomUUID();
}

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
  db = new MonetaFoxDB('test-db-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
});

afterEach(async () => {
  await db.delete();
});

describe('MonetaFoxDB schema', () => {
  it('declares every entity table keyed only by &id', () => {
    const stores = db.tables.map((t) => t.name).sort();
    expect(stores).toEqual(
      [
        'accounts',
        'assets',
        'budgets',
        'categories',
        'holdings',
        'prices',
        'scheduledTransactions',
        'settings',
        'transactionTemplates',
        'transactions',
      ].sort(),
    );
    for (const table of db.tables) {
      const primKey = table.schema.primKey;
      // Only `id` is indexed — no plaintext secondary indexes.
      expect(primKey.keyPath).toBe('id');
      expect(primKey.auto).toBeFalsy();
      expect(table.schema.indexes).toEqual([]);
    }
  });
});

describe('encrypted repositories: round-trip + ciphertext-at-rest', () => {
  it('stores an account as ciphertext and returns plaintext on read', async () => {
    const id = uuid();
    await repos.accounts.add({
      id,
      name: 'My Checking',
      type: 'checking',
      currency: 'GBP',
    });

    // The raw IndexedDB row must not leak any plaintext field value.
    const raw = await db.accounts.get(id);
    expect(raw).toBeDefined();
    const rawKeys = Object.keys(raw as Record<string, unknown>);
    expect(rawKeys).toContain('_enc');
    expect(rawKeys).toContain('id');
    expect(rawKeys.filter((k) => k !== '_enc' && k !== 'id')).toEqual([]);
    expect(JSON.stringify(raw)).not.toContain('My Checking');
    expect(JSON.stringify(raw)).not.toContain('GBP');

    // Reading through the repository decrypts transparently.
    const got = await repos.accounts.get(id);
    expect(got).toEqual({
      id,
      name: 'My Checking',
      type: 'checking',
      currency: 'GBP',
    });
  });

  it('round-trips every entity through its repository', async () => {
    const accId = uuid();
    const catId = uuid();
    const txId = uuid();
    const budgetId = uuid();
    const schedId = uuid();
    const assetId = uuid();
    const holdId = uuid();
    const priceId = uuid();
    const settingsId = 'singleton';

    await repos.accounts.add({
      id: accId,
      name: 'Wallet',
      type: 'cash',
      currency: 'GBP',
    });
    await repos.categories.add({
      id: catId,
      name: 'Groceries',
      kind: 'expense',
    });
    await repos.transactions.add({
      id: txId,
      accountId: accId,
      date: '2026-01-15',
      amount: 42.5,
      currency: 'GBP',
      payee: 'ACME Corp',
      categoryId: catId,
      tags: ['food'],
      cleared: true,
    });
    await repos.budgets.add({
      id: budgetId,
      categoryId: catId,
      month: '2026-01',
      limit: 400,
    });
    await repos.scheduledTransactions.add({
      id: schedId,
      recurrence: { freq: 'monthly' },
      nextDate: '2026-02-01',
      mode: 'auto',
      template: {
        accountId: accId,
        amount: 1200,
        currency: 'GBP',
        payee: 'Landlord',
      },
    });
    await repos.assets.add({
      id: assetId,
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
    });
    await repos.holdings.add({
      id: holdId,
      accountId: accId,
      assetId,
      units: 0.5,
    });
    await repos.prices.add({
      id: priceId,
      assetId,
      date: '2026-01-15',
      price: 60000,
    });
    await repos.settings.add({
      id: settingsId,
      baseCurrency: 'GBP',
      encryptionMode: 'advanced',
    });

    expect((await repos.accounts.get(accId))?.name).toBe('Wallet');
    expect((await repos.transactions.get(txId))?.payee).toBe('ACME Corp');
    expect((await repos.categories.get(catId))?.kind).toBe('expense');
    expect((await repos.budgets.get(budgetId))?.limit).toBe(400);
    expect((await repos.scheduledTransactions.get(schedId))?.mode).toBe('auto');
    expect((await repos.assets.get(assetId))?.symbol).toBe('BTC');
    expect((await repos.holdings.get(holdId))?.units).toBe(0.5);
    expect((await repos.prices.get(priceId))?.price).toBe(60000);
    expect((await repos.settings.get(settingsId))?.baseCurrency).toBe('GBP');
  });

  it('toArray decrypts all rows and nothing leaks as plaintext at rest', async () => {
    await repos.accounts.add({
      id: uuid(),
      name: 'Secret One',
      type: 'checking',
      currency: 'USD',
    });
    await repos.accounts.add({
      id: uuid(),
      name: 'Secret Two',
      type: 'savings',
      currency: 'USD',
    });

    const all = await repos.accounts.toArray();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.name).sort()).toEqual(['Secret One', 'Secret Two']);

    // Every raw row is ciphertext: only `id` and `_enc` keys, no plaintext.
    const raws = await db.accounts.toArray();
    for (const raw of raws) {
      const keys = Object.keys(raw as Record<string, unknown>);
      expect(keys.filter((k) => k !== '_enc' && k !== 'id')).toEqual([]);
      const blob = JSON.stringify(raw);
      expect(blob).not.toContain('Secret');
      expect(blob).not.toContain('USD');
    }
  });

  it('put updates an existing record and keeps ciphertext at rest', async () => {
    const id = uuid();
    await repos.accounts.put({
      id,
      name: 'Old',
      type: 'checking',
      currency: 'GBP',
    });
    await repos.accounts.put({
      id,
      name: 'New',
      type: 'savings',
      currency: 'EUR',
    });
    const got = await repos.accounts.get(id);
    expect(got).toEqual({ id, name: 'New', type: 'savings', currency: 'EUR' });
    expect(JSON.stringify(await db.accounts.get(id))).not.toContain('New');
  });

  it('delete removes a record', async () => {
    const id = uuid();
    await repos.accounts.add({
      id,
      name: 'Gone',
      type: 'cash',
      currency: 'GBP',
    });
    await repos.accounts.delete(id);
    expect(await repos.accounts.get(id)).toBeUndefined();
  });

  it('a wrong key cannot read a record written with another key', async () => {
    const id = uuid();
    await repos.accounts.add({
      id,
      name: 'Confidential',
      type: 'savings',
      currency: 'GBP',
    });

    const wrongKey = await deriveKey({
      mode: 'advanced',
      passphrase: 'wrong',
      salt: 's',
    });
    const wrongRepos = createRepositories(db, wrongKey);
    await expect(wrongRepos.accounts.get(id)).rejects.toBeDefined();
  });
});
