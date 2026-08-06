// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { useAuthStore } from './authStore';
import { deleteVault, getVaultInfo } from '@/lib/auth';
import { resetStores } from './index';
import { useAccountStore } from './accountStore';

const INITIAL = {
  isAuthenticated: false,
  status: 'setup' as const,
  email: null,
  mode: null,
  key: null,
  repositories: null,
  db: null,
  sessionId: null,
};

beforeEach(async () => {
  await deleteVault();
  resetStores();
  useAuthStore.setState(INITIAL);
});

afterEach(async () => {
  useAuthStore.getState().logout();
  resetStores();
  await deleteVault();
});

describe('authStore.bootstrap', () => {
  it('reports setup when no vault exists', async () => {
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('setup');
    expect(s.isAuthenticated).toBe(false);
  });

  it('reports locked when a vault exists', async () => {
    await useAuthStore.getState().setup({
      mode: 'advanced',
      email: 'boot@example.com',
      passphrase: 'passphrase-boot-1',
    });
    useAuthStore.getState().logout();
    await useAuthStore.getState().bootstrap();
    const s = useAuthStore.getState();
    expect(s.status).toBe('locked');
    expect(s.isAuthenticated).toBe(false);
    expect(s.email).toBe('boot@example.com');
    expect(s.mode).toBe('advanced');
  });
});

describe('authStore.setup', () => {
  it('unlocks and initializes domain stores; key is non-extractable + in-memory only', async () => {
    await useAuthStore.getState().setup({
      mode: 'advanced',
      email: 'setup@example.com',
      passphrase: 'passphrase-setup-1',
    });
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.status).toBe('unlocked');
    expect(s.email).toBe('setup@example.com');
    expect(s.mode).toBe('advanced');
    expect(s.key).toBeInstanceOf(CryptoKey);
    expect(s.key?.extractable).toBe(false);
    expect(s.repositories).not.toBeNull();
    expect(s.db).not.toBeNull();
    expect(typeof s.sessionId).toBe('string');
    // Domain store was initialized (bound to repos + empty items).
    expect(useAccountStore.getState().repos).toBe(s.repositories);
    expect(useAccountStore.getState().items).toEqual([]);
  });

  it('seeded data is readable through the domain store after unlock', async () => {
    await useAuthStore.getState().setup({
      mode: 'basic',
      email: 'data@example.com',
      password: 'password1234',
    });
    const accId = crypto.randomUUID();
    await useAccountStore.getState().add({
      id: accId,
      name: 'Wallet',
      type: 'cash',
      currency: 'GBP',
    });
    expect(useAccountStore.getState().items.map((a) => a.name)).toEqual([
      'Wallet',
    ]);
  });
});

describe('authStore.login (unlock)', () => {
  it('unlocks with the correct secret and re-initializes domain stores', async () => {
    await useAuthStore.getState().setup({
      mode: 'advanced',
      email: 'login@example.com',
      passphrase: 'passphrase-login-1',
    });
    // Seed data while unlocked.
    const accId = crypto.randomUUID();
    await useAccountStore.getState().add({
      id: accId,
      name: 'Seeded',
      type: 'checking',
      currency: 'GBP',
    });
    useAuthStore.getState().logout();
    // Domain store detached on logout.
    expect(useAccountStore.getState().repos).toBeNull();

    await useAuthStore.getState().login({
      email: 'LOGIN@example.com',
      secret: 'passphrase-login-1',
    });
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.status).toBe('unlocked');
    // Seeded data reloaded from the encrypted table after re-derive.
    expect(useAccountStore.getState().items.map((a) => a.name)).toEqual([
      'Seeded',
    ]);
  });

  it('rejects a wrong secret and stays locked', async () => {
    await useAuthStore.getState().setup({
      mode: 'advanced',
      email: 'wrong@example.com',
      passphrase: 'passphrase-right-1',
    });
    useAuthStore.getState().logout();
    await expect(
      useAuthStore.getState().login({
        email: 'wrong@example.com',
        secret: 'passphrase-WRONG',
      }),
    ).rejects.toThrow(/invalid credentials/i);
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.status).toBe('locked');
    expect(s.key).toBeNull();
    expect(s.repositories).toBeNull();
  });
});

describe('authStore.logout', () => {
  it('clears the in-memory key + repositories but keeps email/mode for unlock', async () => {
    await useAuthStore.getState().setup({
      mode: 'basic',
      email: 'out@example.com',
      password: 'password1234',
    });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.status).toBe('locked');
    expect(s.key).toBeNull();
    expect(s.repositories).toBeNull();
    expect(s.db).toBeNull();
    expect(s.sessionId).toBeNull();
    expect(useAccountStore.getState().repos).toBeNull();
    expect(useAccountStore.getState().items).toEqual([]);
  });
});

describe('authStore.deleteAccount', () => {
  it('wipes the vault + data and resets to setup', async () => {
    await useAuthStore.getState().setup({
      mode: 'advanced',
      email: 'doomed@example.com',
      passphrase: 'passphrase-doomed-1',
    });
    const accId = crypto.randomUUID();
    await useAccountStore.getState().add({
      id: accId,
      name: 'Gone',
      type: 'cash',
      currency: 'GBP',
    });

    await useAuthStore.getState().deleteAccount();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.status).toBe('setup');
    expect(s.email).toBeNull();
    expect(s.key).toBeNull();
    expect(s.repositories).toBeNull();
    expect(useAccountStore.getState().repos).toBeNull();

    expect((await getVaultInfo()).exists).toBe(false);
  });
});

describe('authStore.setAuthenticated (compat)', () => {
  it('still flips isAuthenticated for RequireAuth / dev bypass / tests', () => {
    useAuthStore.getState().setAuthenticated(true);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    useAuthStore.getState().setAuthenticated(false);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
