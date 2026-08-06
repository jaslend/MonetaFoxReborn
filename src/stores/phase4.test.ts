// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import {
  useAccountStore,
  useSettingsStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from '@/stores';
import { SETTINGS_ID } from '@/stores/settingsStore';

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
  db = new MonetaFoxDB('test-phase4-' + Math.random().toString(36).slice(2));
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

describe('useSettingsStore (Phase 4)', () => {
  it('ensureSettings creates the singleton empty on first run', async () => {
    expect(useSettingsStore.getState().items).toEqual([]);
    const s = await useSettingsStore.getState().ensureSettings('advanced');
    expect(s.id).toBe(SETTINGS_ID);
    expect(s.baseCurrency).toBe('');
    expect(s.rates).toEqual({});
    expect(s.encryptionMode).toBe('advanced');
    expect(useSettingsStore.getState().getSettings()?.id).toBe(SETTINGS_ID);
  });

  it('ensureSettings is idempotent', async () => {
    const first = await useSettingsStore.getState().ensureSettings();
    const second = await useSettingsStore.getState().ensureSettings();
    expect(second).toBe(first);
    expect(useSettingsStore.getState().items).toHaveLength(1);
  });

  it('setBaseCurrency sets the base currency while no accounts exist', async () => {
    await useSettingsStore.getState().setBaseCurrency('GBP');
    expect(useSettingsStore.getState().getSettings()?.baseCurrency).toBe('GBP');
  });

  it('setBaseCurrency throws once an account exists', async () => {
    await useSettingsStore.getState().setBaseCurrency('USD');
    await useAccountStore.getState().createAccount({
      name: 'Wallet',
      type: 'cash',
      currency: 'USD',
    });
    await expect(
      useSettingsStore.getState().setBaseCurrency('EUR'),
    ).rejects.toThrow(/fixed once accounts or transactions exist/);
    // unchanged
    expect(useSettingsStore.getState().getSettings()?.baseCurrency).toBe('USD');
  });

  it('setBaseCurrency throws once a transaction exists (even with accounts)', async () => {
    await useSettingsStore.getState().setBaseCurrency('USD');
    // allow base currency change while neither accounts nor transactions exist:
    // create a transaction (needs an account first, but the guard checks both)
    const acc = await useAccountStore.getState().createAccount({
      name: 'Wallet',
      type: 'cash',
      currency: 'USD',
    });
    await useTransactionStore.getState().add({
      id: uuid(),
      accountId: acc.id,
      date: '2026-01-15',
      amount: 10,
      currency: 'USD',
      payee: 'x',
    });
    await expect(
      useSettingsStore.getState().setBaseCurrency('EUR'),
    ).rejects.toThrow(/fixed once accounts or transactions exist/);
  });

  it('setRate updates a manual FX rate on the singleton', async () => {
    await useSettingsStore.getState().setRate('EUR', 1.1);
    expect(useSettingsStore.getState().getSettings()?.rates?.EUR).toBeCloseTo(
      1.1,
    );
    await useSettingsStore.getState().setRate('EUR', 1.2);
    expect(useSettingsStore.getState().getSettings()?.rates?.EUR).toBeCloseTo(
      1.2,
    );
    await useSettingsStore.getState().setRate('JPY', 0.009);
    expect(useSettingsStore.getState().getSettings()?.rates).toEqual({
      EUR: 1.2,
      JPY: 0.009,
    });
  });

  it('setRate rejects a non-finite rate', async () => {
    await expect(
      useSettingsStore.getState().setRate('EUR', Number.NaN),
    ).rejects.toThrow(/finite/);
  });

  it('persists settings as ciphertext at rest', async () => {
    await useSettingsStore.getState().setBaseCurrency('GBP');
    await useSettingsStore.getState().setRate('EUR', 1.1);
    const raw = await db.settings.get(SETTINGS_ID);
    expect(JSON.stringify(raw)).not.toContain('GBP');
    expect(JSON.stringify(raw)).not.toContain('"EUR"');
  });
});

describe('useAccountStore (Phase 4)', () => {
  it('createAccount assigns id/createdAt/openingBalance/archived defaults', async () => {
    await useSettingsStore.getState().setBaseCurrency('USD');
    const acc = await useAccountStore.getState().createAccount({
      name: 'Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 250,
    });
    expect(acc.id).toBeTruthy();
    expect(acc.name).toBe('Checking');
    expect(acc.type).toBe('checking');
    expect(acc.currency).toBe('USD');
    expect(acc.openingBalance).toBe(250);
    expect(acc.archived).toBe(false);
    expect(acc.createdAt).toBeTruthy();
    expect(useAccountStore.getState().items.map((a) => a.name)).toEqual([
      'Checking',
    ]);
  });

  it('createAccount defaults openingBalance to 0', async () => {
    const acc = await useAccountStore.getState().createAccount({
      name: 'Empty',
      type: 'cash',
      currency: 'USD',
    });
    expect(acc.openingBalance).toBe(0);
  });

  it('archive/unarchive toggle the archived flag', async () => {
    const acc = await useAccountStore.getState().createAccount({
      name: 'A',
      type: 'savings',
      currency: 'USD',
    });
    await useAccountStore.getState().archive(acc.id);
    expect(useAccountStore.getState().items[0].archived).toBe(true);
    await useAccountStore.getState().unarchive(acc.id);
    expect(useAccountStore.getState().items[0].archived).toBe(false);
  });

  it('remove deletes the account', async () => {
    const acc = await useAccountStore.getState().createAccount({
      name: 'A',
      type: 'cash',
      currency: 'USD',
    });
    await useAccountStore.getState().remove(acc.id);
    expect(useAccountStore.getState().items).toEqual([]);
    expect(await repos.accounts.get(acc.id)).toBeUndefined();
  });
});
