// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import { BACKUP_VERSION } from '@/lib/export';
import { MemoryProvider } from '@/lib/sync';

import {
  useAccountStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from '@/stores';
import { useSyncStore } from '@/stores/syncStore';

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB('test-sync-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

/** Wipe the local encrypted rows + refresh the store projection. */
async function wipeLocal() {
  for (const a of useAccountStore.getState().items) {
    await repos.accounts.delete(a.id);
  }
  for (const t of useTransactionStore.getState().items) {
    await repos.transactions.delete(t.id);
  }
  await useAccountStore.getState().load();
  await useTransactionStore.getState().load();
}

/** Wire a MemoryProvider into the sync store (tokenGetter is unused). */
function useMemoryProvider() {
  useSyncStore.getState().connect('memory', async () => 'unused');
  useSyncStore.setState({ provider: new MemoryProvider() });
}

describe('useSyncStore round-trip (MemoryProvider)', () => {
  const passphrase = 'sync-passphrase';

  it('uploadNow then downloadNow restores the same store via repositories', async () => {
    const account = await useAccountStore.getState().createAccount({
      name: 'Checking',
      type: 'checking',
      currency: 'GBP',
    });
    await useTransactionStore.getState().add({
      id: crypto.randomUUID(),
      accountId: account.id,
      date: '2026-02-05',
      amount: -42.5,
      currency: 'GBP',
      payee: 'Tesco, Ltd',
    });

    useMemoryProvider();
    useSyncStore.getState().setSyncPassphrase(passphrase);

    await useSyncStore.getState().uploadNow();
    expect(useSyncStore.getState().syncStatus).toBe('idle');
    expect(useSyncStore.getState().lastSyncAt).not.toBeNull();

    // Wipe local data to simulate a fresh device, then download.
    await wipeLocal();
    expect(useAccountStore.getState().items).toHaveLength(0);
    expect(useTransactionStore.getState().items).toHaveLength(0);

    await useSyncStore.getState().downloadNow();
    expect(useAccountStore.getState().items).toHaveLength(1);
    expect(useAccountStore.getState().items[0].name).toBe('Checking');
    expect(useTransactionStore.getState().items).toHaveLength(1);
    expect(useTransactionStore.getState().items[0].payee).toBe('Tesco, Ltd');
  });

  it('downloadNow when nothing is stored is a no-op (not an error)', async () => {
    useMemoryProvider();
    useSyncStore.getState().setSyncPassphrase(passphrase);

    await useSyncStore.getState().downloadNow();
    expect(useSyncStore.getState().syncStatus).toBe('idle');
    expect(useAccountStore.getState().items).toHaveLength(0);
  });

  it('uploadNow rejects and leaves status idle when no passphrase is set', async () => {
    useMemoryProvider();
    await expect(useSyncStore.getState().uploadNow()).rejects.toThrow();
    // Precondition errors (no passphrase / no provider) are usage errors; they
    // throw before the sync even starts, so status stays idle rather than
    // marking a sync failure.
    expect(useSyncStore.getState().syncStatus).toBe('idle');
  });

  it('a wrong passphrase during downloadNow sets syncStatus=error', async () => {
    useMemoryProvider();
    useSyncStore.getState().setSyncPassphrase(passphrase);
    await useSyncStore.getState().uploadNow();

    // A "different device" with the wrong passphrase tries to download.
    useSyncStore.getState().setSyncPassphrase('wrong passphrase');
    await expect(useSyncStore.getState().downloadNow()).rejects.toThrow();
    expect(useSyncStore.getState().syncStatus).toBe('error');
    expect(useSyncStore.getState().lastError).toBeTruthy();
  });

  it('serializeBackupData produces the BackupData shape', () => {
    const data = useSyncStore.getState().serializeBackupData();
    expect(data.version).toBe(BACKUP_VERSION);
    expect(Array.isArray(data.accounts)).toBe(true);
    expect(Array.isArray(data.transactions)).toBe(true);
  });

  it('fullSync pulls remote then pushes local', async () => {
    const account = await useAccountStore.getState().createAccount({
      name: 'Savings',
      type: 'savings',
      currency: 'GBP',
    });
    useMemoryProvider();
    useSyncStore.getState().setSyncPassphrase(passphrase);
    await useSyncStore.getState().uploadNow();

    // Wipe local, then fullSync should repopulate from remote and re-push.
    await wipeLocal();
    expect(useAccountStore.getState().items).toHaveLength(0);

    await useSyncStore.getState().fullSync();
    expect(useAccountStore.getState().items).toHaveLength(1);
    expect(useAccountStore.getState().items[0].id).toBe(account.id);
  });
});
