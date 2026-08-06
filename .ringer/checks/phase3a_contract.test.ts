// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 3a (data layer).
// The Ringer check copies this into src/lib/db/ before running, executes it
// against the worker's real modules, then deletes it. It pins the minimal
// data-layer seam the rest of the app (and Phase 2 auth) will build on:
// an encrypted Dexie database whose repositories store ciphertext at rest and
// return plaintext on read, keyed by a CryptoKey injected at unlock time.

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

import { deriveKey } from '../crypto';
import { MonetaFoxDB, createRepositories } from './index';

function uuid(): string {
  return crypto.randomUUID();
}

describe('Phase 3a contract: encrypted database & repositories', () => {
  it('constructs and exposes the core entity repositories', async () => {
    const db = new MonetaFoxDB('phase3a-contract-a');
    const key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const repos = createRepositories(db, key);
    for (const name of ['accounts', 'transactions', 'categories', 'budgets', 'settings'] as const) {
      expect(repos[name], `repositories.${name} must exist`).toBeDefined();
    }
    await db.delete();
  });

  it('stores accounts as ciphertext at rest and returns plaintext on read', async () => {
    const db = new MonetaFoxDB('phase3a-contract-b');
    const key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const repos = createRepositories(db, key);

    const id = uuid();
    await repos.accounts.add({ id, name: 'My Checking', type: 'checking', currency: 'GBP' });

    // Raw IndexedDB row must not leak the plaintext.
    const raw = await db.accounts.get(id);
    expect(JSON.stringify(raw)).not.toContain('My Checking');

    const got = await repos.accounts.get(id);
    expect(got?.name).toBe('My Checking');
    expect(got?.currency).toBe('GBP');

    await db.delete();
  });

  it('stores transactions encrypted and lists them back', async () => {
    const db = new MonetaFoxDB('phase3a-contract-c');
    const key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const repos = createRepositories(db, key);

    const accId = uuid();
    await repos.accounts.add({ id: accId, name: 'Wallet', type: 'cash', currency: 'GBP' });

    const txId = uuid();
    await repos.transactions.add({
      id: txId,
      accountId: accId,
      date: '2026-01-15',
      amount: 42.5,
      currency: 'GBP',
      payee: 'ACME Corp',
    });

    const raw = await db.transactions.get(txId);
    expect(JSON.stringify(raw)).not.toContain('ACME Corp');

    const all = await repos.transactions.toArray();
    expect(all.some((t) => t.payee === 'ACME Corp')).toBe(true);

    await db.delete();
  });

  it('a wrong key cannot read a record written with another key', async () => {
    const db = new MonetaFoxDB('phase3a-contract-d');
    const good = await deriveKey({ mode: 'advanced', passphrase: 'right', salt: 's' });
    const bad = await deriveKey({ mode: 'advanced', passphrase: 'wrong', salt: 's' });

    const id = uuid();
    await createRepositories(db, good).accounts.add({ id, name: 'Secret', type: 'savings', currency: 'GBP' });

    await expect(createRepositories(db, bad).accounts.get(id)).rejects.toBeDefined();
    await db.delete();
  });
});
