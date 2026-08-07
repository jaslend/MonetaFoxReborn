// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';

import {
  MemoryProvider,
  GoogleDriveProvider,
  OneDriveProvider,
  registerCloudProvider,
  getCloudProvider,
  listCloudProviders,
  syncUp,
  syncDown,
  DEFAULT_SYNC_KEY,
  type CloudStorageProvider,
} from '@/lib/sync';
import { BACKUP_VERSION, type BackupData } from '@/lib/export';

function sampleData(): BackupData {
  return {
    version: BACKUP_VERSION,
    accounts: [
      { id: 'acc-1', name: 'Checking', type: 'checking', currency: 'GBP' },
    ],
    transactions: [
      {
        id: 'tx-1',
        accountId: 'acc-1',
        date: '2026-02-05',
        amount: -1234.56,
        currency: 'GBP',
        payee: 'Tesco, Ltd',
        notes: 'secret shopping',
      },
    ],
    categories: [{ id: 'cat-1', name: 'Groceries' }],
    budgets: [{ id: 'b-1', categoryId: 'cat-1', month: '2026-02', limit: 200 }],
  };
}

describe('provider registry', () => {
  beforeEach(() => {
    // The registry is module-level; isolate each test by registering fresh
    // instances under unique ids so order can't matter.
  });

  it('register/get/list round-trip a provider by id', () => {
    const p: CloudStorageProvider = {
      id: 'test-prov-' + Math.random().toString(36).slice(2),
      label: 'Test',
      upload: async () => {},
      download: async () => null,
    };
    registerCloudProvider(p);
    expect(getCloudProvider(p.id)).toBe(p);
    expect(listCloudProviders()).toContain(p.id);
  });

  it('getCloudProvider returns undefined for unknown id', () => {
    expect(getCloudProvider('does-not-exist')).toBeUndefined();
  });

  it('re-registering replaces the entry', () => {
    const id = 'replace-' + Math.random().toString(36).slice(2);
    const a: CloudStorageProvider = {
      id,
      label: 'A',
      upload: async () => {},
      download: async () => null,
    };
    const b: CloudStorageProvider = {
      id,
      label: 'B',
      upload: async () => {},
      download: async () => null,
    };
    registerCloudProvider(a);
    registerCloudProvider(b);
    expect(getCloudProvider(id)).toBe(b);
  });
});

describe('encrypted sync round-trip (MemoryProvider)', () => {
  const passphrase = 'correct horse battery staple';

  it('syncUp then syncDown restores the identical store', async () => {
    const provider = new MemoryProvider();
    const data = sampleData();
    const { key, bytes } = await syncUp(provider, data, passphrase);
    expect(key).toBe(DEFAULT_SYNC_KEY);
    expect(bytes).toBeGreaterThan(0);

    const restored = await syncDown(provider, passphrase);
    expect(restored).not.toBeNull();
    expect(restored!.version).toBe(BACKUP_VERSION);
    expect(restored!.accounts).toEqual(data.accounts);
    expect(restored!.transactions).toEqual(data.transactions);
    expect(restored!.categories).toEqual(data.categories);
    expect(restored!.budgets).toEqual(data.budgets);
    // Payee (plaintext) survives the round-trip.
    expect(restored!.transactions[0].payee).toBe('Tesco, Ltd');
  });

  it('the stored blob does NOT contain plaintext (e.g. a payee)', async () => {
    const provider = new MemoryProvider();
    await syncUp(provider, sampleData(), passphrase);
    const raw = await provider.download(DEFAULT_SYNC_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('Tesco, Ltd');
    expect(raw).not.toContain('secret shopping');
    expect(raw).not.toContain('Checking');
    expect(raw).not.toContain('Groceries');
  });

  it('syncDown with a WRONG passphrase REJECTS', async () => {
    const provider = new MemoryProvider();
    await syncUp(provider, sampleData(), passphrase);
    await expect(syncDown(provider, 'wrong passphrase')).rejects.toThrow();
  });

  it('syncDown returns null when nothing is stored', async () => {
    const provider = new MemoryProvider();
    const restored = await syncDown(provider, passphrase);
    expect(restored).toBeNull();
  });

  it('honours a custom key', async () => {
    const provider = new MemoryProvider();
    const key = 'custom/path/backup.enc';
    await syncUp(provider, sampleData(), passphrase, key);
    expect(await provider.download('monetafox/backup.enc')).toBeNull();
    expect(await provider.download(key)).not.toBeNull();
    const restored = await syncDown(provider, passphrase, key);
    expect(restored!.transactions[0].payee).toBe('Tesco, Ltd');
  });

  it('uses a fresh salt each upload (different ciphertext, same data)', async () => {
    const provider = new MemoryProvider();
    const data = sampleData();
    await syncUp(provider, data, passphrase, 'a.enc');
    await syncUp(provider, data, passphrase, 'b.enc');
    const a = await provider.download('a.enc');
    const b = await provider.download('b.enc');
    expect(a).not.toBe(b);
  });
});

describe('Drive / OneDrive providers (construction only)', () => {
  it('GoogleDriveProvider has stable id/label and is a CloudStorageProvider', () => {
    const p = new GoogleDriveProvider(async () => 'token');
    expect(p.id).toBe('google-drive');
    expect(p.label).toBe('Google Drive');
    expect(typeof p.upload).toBe('function');
    expect(typeof p.download).toBe('function');
  });

  it('OneDriveProvider has stable id/label and is a CloudStorageProvider', () => {
    const p = new OneDriveProvider(async () => 'token');
    expect(p.id).toBe('one-drive');
    expect(p.label).toBe('OneDrive');
    expect(typeof p.upload).toBe('function');
    expect(typeof p.download).toBe('function');
  });

  it('can be registered and resolved by id', () => {
    const drive = new GoogleDriveProvider(async () => 'token');
    const one = new OneDriveProvider(async () => 'token');
    registerCloudProvider(drive);
    registerCloudProvider(one);
    expect(getCloudProvider('google-drive')).toBe(drive);
    expect(getCloudProvider('one-drive')).toBe(one);
  });
});
