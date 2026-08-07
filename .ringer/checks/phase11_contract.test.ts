// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 11 (cloud sync).
// Copied into src/lib/sync/ by the Ringer check, run against the real module,
// then removed. Pins the storage-provider abstraction and the encrypted sync
// round-trip: what is stored in the cloud is ciphertext, syncDown restores an
// identical store, a wrong passphrase rejects, and the provider registry works.
// Uses the in-memory provider so no real OAuth/network is needed.

import { describe, it, expect } from 'vitest';

import {
  MemoryProvider,
  registerCloudProvider,
  getCloudProvider,
  listCloudProviders,
  syncUp,
  syncDown,
} from './index';

const data = {
  version: 1,
  accounts: [{ id: 'a1', name: 'Main', type: 'checking', currency: 'GBP', openingBalance: 0 }],
  transactions: [{ id: 'x', accountId: 'a1', date: '2026-02-05', amount: -99, currency: 'GBP', payee: 'SecretPayee' }],
  categories: [],
  budgets: [],
} as never;

describe('Phase 11 contract: encrypted sync round-trip', () => {
  it('stores ciphertext in the cloud and restores an identical store', async () => {
    const mem = new MemoryProvider();
    const res = await syncUp(mem, data, 'correct horse');
    const raw = await mem.download(res.key);
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('SecretPayee'); // encrypted at rest in the cloud

    const restored = await syncDown(mem, 'correct horse');
    expect((restored as { transactions: { payee: string }[] }).transactions[0].payee).toBe('SecretPayee');
  });

  it('rejects a wrong passphrase on download', async () => {
    const mem = new MemoryProvider();
    await syncUp(mem, data, 'right');
    await expect(syncDown(mem, 'wrong')).rejects.toBeDefined();
  });

  it('returns null when the destination has no backup yet', async () => {
    expect(await syncDown(new MemoryProvider(), 'whatever')).toBeNull();
  });
});

describe('Phase 11 contract: provider registry (one active destination, pluggable)', () => {
  it('registers and resolves providers by id, and lists them', () => {
    registerCloudProvider(new MemoryProvider());
    expect(getCloudProvider('memory')).toBeDefined();
    expect(listCloudProviders()).toContain('memory');
  });
});
