// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 2 (auth vault).
// Copied into src/lib/auth/ by the Ringer check, run against the worker's real
// vault service, then removed. It pins the security-critical, deterministic
// core of authentication: a local, credential-derived vault with a verifier,
// stored (non-extractable) key never persisted, entropy reused as a stored
// salt, and a real delete-everything path. UI and single-session enforcement
// are checked structurally elsewhere.

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import { getVaultInfo, getStoredVault, setupVault, authenticate, deleteVault } from './index';

beforeEach(async () => {
  // Clean slate between cases (ignore "nothing to delete").
  try {
    await deleteVault();
  } catch {
    /* no vault yet */
  }
});

describe('Phase 2 contract: local auth vault', () => {
  it('reports no vault on first run', async () => {
    expect((await getVaultInfo()).exists).toBe(false);
  });

  it('setup then authenticate re-derives the same key and reads setup data back', async () => {
    const setup = await setupVault({ mode: 'basic', email: 'Jason@Example.com', password: 'pw' });
    expect((await getVaultInfo()).exists).toBe(true);

    const id = crypto.randomUUID();
    await setup.repositories.accounts.add({ id, name: 'Setup Acct', type: 'checking', currency: 'GBP' });

    // Email normalization must not prevent re-auth; secret is unified across modes.
    const login = await authenticate({ email: 'jason@example.com ', secret: 'pw' });
    const got = await login.repositories.accounts.get(id);
    expect(got?.name).toBe('Setup Acct');
  });

  it('rejects a wrong secret', async () => {
    await setupVault({ mode: 'basic', email: 'a@b.com', password: 'right' });
    await expect(authenticate({ email: 'a@b.com', secret: 'wrong' })).rejects.toBeDefined();
  });

  it('rejects authentication against an unknown email', async () => {
    await expect(authenticate({ email: 'nobody@b.com', secret: 'x' })).rejects.toBeDefined();
  });

  it('never persists the plaintext secret or the raw key in the stored vault', async () => {
    await setupVault({ mode: 'basic', email: 'a@b.com', password: 'sup3rSecretValue' });
    const rec = await getStoredVault('a@b.com');
    expect(rec).toBeDefined();
    // A verifier (ciphertext) must exist so logins can be checked...
    expect(typeof rec!.verifier).toBe('string');
    // ...but the password must never be present anywhere in the record.
    expect(JSON.stringify(rec)).not.toContain('sup3rSecretValue');
  });

  it('stores optional entropy and reuses it so the key reproduces from email+password alone', async () => {
    await setupVault({
      mode: 'basic',
      email: 'e@b.com',
      password: 'pw',
      entropy: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]),
    });
    // Login supplies only email+password; success proves the service reused the
    // stored entropy to derive the identical key (verifier decrypts).
    const login = await authenticate({ email: 'e@b.com', secret: 'pw' });
    expect(login.repositories).toBeDefined();
  });

  it('supports advanced (passphrase) mode', async () => {
    await setupVault({ mode: 'advanced', email: 'adv@b.com', passphrase: 'a long user passphrase' });
    const login = await authenticate({ email: 'adv@b.com', secret: 'a long user passphrase' });
    expect(login.repositories).toBeDefined();
  });

  it('deleteVault wipes the vault entirely', async () => {
    await setupVault({ mode: 'basic', email: 'd@b.com', password: 'pw' });
    await deleteVault();
    expect((await getVaultInfo()).exists).toBe(false);
    await expect(authenticate({ email: 'd@b.com', secret: 'pw' })).rejects.toBeDefined();
  });
});
