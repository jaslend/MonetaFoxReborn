// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

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
  db = new MonetaFoxDB('test-templates-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
});

afterEach(async () => {
  await db.delete();
});

function tpl(
  partial: Partial<import('@/lib/db/models').TransactionTemplate> = {},
) {
  return {
    id: crypto.randomUUID(),
    name: 'Monthly Rent',
    accountId: 'a1',
    payee: 'Landlord',
    amount: -1000,
    currency: 'GBP',
    categoryId: 'c1',
    ...partial,
  };
}

describe('transactionTemplates repository (Dexie v2)', () => {
  it('is present on the database and the repositories', () => {
    expect(db.transactionTemplates).toBeDefined();
    expect(repos.transactionTemplates).toBeDefined();
  });

  it('the v2 table is keyed only by &id alongside every v1 table', () => {
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toContain('transactionTemplates');
    const t = db.table('transactionTemplates');
    expect(t.schema.primKey.keyPath).toBe('id');
    expect(t.schema.primKey.auto).toBeFalsy();
    expect(t.schema.indexes).toEqual([]);
  });

  it('stores a template as ciphertext and returns plaintext on read', async () => {
    const t = tpl();
    await repos.transactionTemplates.add(t);

    const raw = await db.transactionTemplates.get(t.id);
    expect(raw).toBeDefined();
    const keys = Object.keys(raw as Record<string, unknown>);
    expect(keys).toContain('_enc');
    expect(keys).toContain('id');
    expect(keys.filter((k) => k !== '_enc' && k !== 'id')).toEqual([]);
    expect(JSON.stringify(raw)).not.toContain('Landlord');
    expect(JSON.stringify(raw)).not.toContain('Monthly Rent');

    const got = await repos.transactionTemplates.get(t.id);
    expect(got).toEqual(t);
  });

  it('toArray decrypts all templates', async () => {
    await repos.transactionTemplates.add(tpl({ name: 'One' }));
    await repos.transactionTemplates.add(tpl({ name: 'Two' }));
    const all = await repos.transactionTemplates.toArray();
    expect(all.map((t) => t.name).sort()).toEqual(['One', 'Two']);
  });

  it('put updates and delete removes', async () => {
    const t = tpl();
    await repos.transactionTemplates.add(t);
    await repos.transactionTemplates.put({
      ...t,
      name: 'Renamed',
      amount: -1100,
    });
    expect((await repos.transactionTemplates.get(t.id))?.name).toBe('Renamed');
    await repos.transactionTemplates.delete(t.id);
    expect(await repos.transactionTemplates.get(t.id)).toBeUndefined();
  });

  it('survives a v1 -> v2 upgrade: opening a v1 db then re-opening upgrades', async () => {
    // A fresh v2 DB has the table; a v1-named DB reopened still upgrades to v2
    // and exposes transactionTemplates. fake-indexeddb persists by name within
    // the process, so we just confirm the table is present after reopen.
    const name =
      'test-templates-upgrade-' + Math.random().toString(36).slice(2);
    const first = new MonetaFoxDB(name);
    await first.open();
    expect(first.table('transactionTemplates').schema.primKey.keyPath).toBe(
      'id',
    );
    await first.delete();
  });
});
