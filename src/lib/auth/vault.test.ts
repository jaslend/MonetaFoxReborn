// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  getVaultInfo,
  getStoredVault,
  setupVault,
  authenticate,
  deleteVault,
  VERIFIER_PLAINTEXT,
  type AuthResult,
} from '@/lib/auth';
import { deriveKey, decrypt } from '@/lib/crypto';
import { MonetaFoxDB } from '@/lib/db';

async function cleanup(): Promise<void> {
  await deleteVault();
}

describe('vault service', () => {
  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('getVaultInfo', () => {
    it('reports no vault before setup', async () => {
      const info = await getVaultInfo();
      expect(info.exists).toBe(false);
    });

    it('reports the vault after setup', async () => {
      const r = await setupVault({
        mode: 'advanced',
        email: 'User@Example.com',
        passphrase: 'a strong passphrase',
      });
      const info = await getVaultInfo();
      expect(info.exists).toBe(true);
      // email is normalized
      expect(info.email).toBe('user@example.com');
      expect(info.mode).toBe('advanced');
      r.db.close();
    });
  });

  describe('setupVault (advanced)', () => {
    it('returns a non-extractable key, open db, repositories, and a session id', async () => {
      const result = await setupVault({
        mode: 'advanced',
        email: 'alice@example.com',
        passphrase: 'correct horse battery staple',
      });
      expect(result.key).toBeInstanceOf(CryptoKey);
      expect(result.key.extractable).toBe(false);
      expect(result.db).toBeInstanceOf(MonetaFoxDB);
      expect(result.repositories.accounts).toBeDefined();
      expect(result.repositories.settings).toBeDefined();
      expect(typeof result.sessionId).toBe('string');
      expect(result.sessionId.length).toBeGreaterThan(0);
      result.db.close();
    });

    it('persists a non-sensitive metadata record (no secret, verifier is ciphertext)', async () => {
      const email = 'bob@example.com';
      const r = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'a b c d e f g h i j',
      });
      const rec = (await getStoredVault(email)) as Record<string, unknown>;
      expect(rec).toBeDefined();
      expect(rec.email).toBe(email);
      expect(rec.mode).toBe('advanced');
      expect(typeof rec.salt).toBe('string');
      expect(rec.salt).not.toBe('');
      expect(rec.entropy).toBeNull();
      expect(typeof rec.verifier).toBe('string');
      // Verifier is a ciphertext blob — must NOT contain the plaintext marker
      // nor the passphrase.
      expect(rec.verifier as string).not.toContain(VERIFIER_PLAINTEXT);
      expect(JSON.stringify(rec)).not.toContain('a b c d e f g h i j');
      expect(Array.isArray(rec.loginHistory)).toBe(true);
      expect(rec.lastSyncAt).toBeNull();
      r.db.close();
    });

    it('throws if a vault already exists for the email', async () => {
      const a = await setupVault({
        mode: 'advanced',
        email: 'dup@example.com',
        passphrase: 'first passphrase1',
      });
      await expect(
        setupVault({
          mode: 'advanced',
          email: 'DUP@example.com',
          passphrase: 'second passphrase2',
        }),
      ).rejects.toThrow(/already exists/i);
      a.db.close();
    });
  });

  describe('setupVault (basic) with entropy', () => {
    it('stores entropy and makes the key reproducible from the stored record', async () => {
      const email = 'carol@example.com';
      const entropy = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const result = await setupVault({
        mode: 'basic',
        email,
        password: 'supersecret',
        entropy,
      });
      const rec = (await getStoredVault(email)) as Record<string, unknown>;
      expect(rec.mode).toBe('basic');
      expect(rec.salt).toBeNull();
      expect(typeof rec.entropy).toBe('string');
      expect(rec.entropy).not.toBe('');

      // Re-derive from the stored entropy + supplied secret and verify against
      // the stored verifier — proves the key is reproducible (unlock works).
      const entropyBytes = Uint8Array.from(atob(rec.entropy as string), (c) =>
        c.charCodeAt(0),
      );
      const rederived = await deriveKey({
        mode: 'basic',
        email,
        password: 'supersecret',
        entropy: entropyBytes,
      });
      const verified = await decrypt(rederived, rec.verifier as string);
      expect(verified).toBe(VERIFIER_PLAINTEXT);
      result.db.close();
    });

    it('works without entropy (email+password only)', async () => {
      const result = await setupVault({
        mode: 'basic',
        email: 'dave@example.com',
        password: 'password123',
      });
      expect(result.key).toBeInstanceOf(CryptoKey);
      const rec = (await getStoredVault('dave@example.com')) as Record<
        string,
        unknown
      >;
      expect(rec.entropy).toBeNull();
      result.db.close();
    });
  });

  describe('authenticate (login + unlock)', () => {
    it('unlocks with the correct advanced passphrase and appends login history', async () => {
      const email = 'eve@example.com';
      const setupRes = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'the real passphrase1',
      });
      setupRes.db.close();
      const before = (await getStoredVault(email)) as Record<string, unknown>;
      const historyBefore = before.loginHistory as number[];
      expect(historyBefore).toHaveLength(1);

      const result = await authenticate({
        email: 'EVE@example.com', // case-insensitive
        secret: 'the real passphrase1',
      });
      expect(result.key).toBeInstanceOf(CryptoKey);
      expect(result.key.extractable).toBe(false);
      expect(result.repositories).toBeDefined();
      expect(typeof result.sessionId).toBe('string');

      const after = (await getStoredVault(email)) as Record<string, unknown>;
      expect(after.loginHistory as number[]).toHaveLength(2);
      result.db.close();
    });

    it('unlocks basic mode with the correct password + stored entropy', async () => {
      const email = 'frank@example.com';
      const entropy = crypto.getRandomValues(new Uint8Array(32));
      const setupRes = await setupVault({
        mode: 'basic',
        email,
        password: 'correctpw',
        entropy,
      });
      setupRes.db.close();
      const result = await authenticate({
        email,
        secret: 'correctpw',
      });
      expect(result.key).toBeInstanceOf(CryptoKey);
      // A different password must fail (AES-GCM auth tag).
      await expect(authenticate({ email, secret: 'wrongpw' })).rejects.toThrow(
        /invalid credentials/i,
      );
      result.db.close();
    });

    it('rejects a wrong passphrase', async () => {
      const email = 'grace@example.com';
      const r = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'the real passphrase2',
      });
      await expect(
        authenticate({ email, secret: 'the wrong passphrase2' }),
      ).rejects.toThrow(/invalid credentials/i);
      r.db.close();
    });

    it('rejects an unknown email', async () => {
      await expect(
        authenticate({ email: 'nobody@example.com', secret: 'x' }),
      ).rejects.toThrow(/no vault found/i);
    });

    it('yields a key that actually decrypts domain data', async () => {
      const email = 'henry@example.com';
      const setupRes = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'data passphrase1',
      });
      const { repositories, db } = setupRes;
      const accId = crypto.randomUUID();
      await repositories.accounts.add({
        id: accId,
        name: 'Checking',
        type: 'checking',
        currency: 'GBP',
      });
      db.close();

      // Unlock in a "new session" — re-open db + repos from authenticate.
      const unlocked = await authenticate({
        email,
        secret: 'data passphrase1',
      });
      const read = await unlocked.repositories.accounts.get(accId);
      expect(read?.name).toBe('Checking');
      unlocked.db.close();
    });
  });

  describe('verifier design', () => {
    it('verifier is AES-GCM ciphertext of the fixed marker (tamper-evident)', async () => {
      const email = 'ivan@example.com';
      const result = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'passphrase-ivan-1',
      });
      const rec = (await getStoredVault(email)) as Record<string, unknown>;
      // Decrypts to the marker with the right key.
      const plain = await decrypt(result.key, rec.verifier as string);
      expect(plain).toBe(VERIFIER_PLAINTEXT);
      // A wrong key cannot decrypt (auth tag).
      const wrongKey = await deriveKey({
        mode: 'advanced',
        passphrase: 'different',
        salt: rec.salt as string,
      });
      await expect(decrypt(wrongKey, rec.verifier as string)).rejects.toThrow();
      result.db.close();
    });
  });

  describe('deleteVault', () => {
    it('wipes the auth metadata and all encrypted data', async () => {
      const email = 'judy@example.com';
      const setupRes = await setupVault({
        mode: 'advanced',
        email,
        passphrase: 'delete-me-passphrase',
      });
      const accId = crypto.randomUUID();
      await setupRes.repositories.accounts.add({
        id: accId,
        name: 'Doomed',
        type: 'cash',
        currency: 'GBP',
      });
      setupRes.db.close();

      await deleteVault();

      expect((await getVaultInfo()).exists).toBe(false);
      expect(await getStoredVault(email)).toBeUndefined();

      // The data DB itself is gone: re-open and confirm it's empty.
      const db = new MonetaFoxDB();
      await db.open();
      expect(await db.accounts.toArray()).toEqual([]);
      await db.delete();
    });
  });

  describe('AuthResult shape (contract)', () => {
    it('exposes exactly key/db/repositories/sessionId', async () => {
      const result: AuthResult = await setupVault({
        mode: 'advanced',
        email: 'shape@example.com',
        passphrase: 'shape-passphrase1',
      });
      expect(Object.keys(result).sort()).toEqual(
        ['db', 'key', 'repositories', 'sessionId'].sort(),
      );
      result.db.close();
    });
  });
});
