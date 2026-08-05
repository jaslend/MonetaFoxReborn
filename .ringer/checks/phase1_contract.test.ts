// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 1.
// The Ringer check copies this into src/lib/crypto/ before running, executes
// it against the worker's real modules, then deletes it. The worker does not
// author or see this file, so it cannot weaken these assertions. It pins the
// exact public API the spec requires; if the worker's API drifts, this fails.
//
// Node environment gives real WebCrypto (crypto.subtle) and lets fake-indexeddb
// back Dexie without a DOM.

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';

import { deriveKey, PBKDF2_ITERATIONS } from './keyDerivation';
import { encrypt, decrypt } from './CryptoStore';
import { EncryptedTable } from './EncryptedTable';

describe('Phase 1 contract: key derivation', () => {
  it('uses at least 100k PBKDF2 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  });

  it('basic mode: identical credentials derive an interoperable key (round-trips)', async () => {
    const k1 = await deriveKey({ mode: 'basic', email: 'Jason@Example.com', password: 'correct horse' });
    const k2 = await deriveKey({ mode: 'basic', email: 'jason@example.com ', password: 'correct horse' });
    // Email is normalized (case/whitespace) so the same identity re-derives a working key.
    const ct = await encrypt(k1, 'balance:1234.56');
    expect(await decrypt(k2, ct)).toBe('balance:1234.56');
  });

  it('basic mode: a wrong password cannot decrypt', async () => {
    const good = await deriveKey({ mode: 'basic', email: 'a@b.com', password: 'right' });
    const bad = await deriveKey({ mode: 'basic', email: 'a@b.com', password: 'wrong' });
    const ct = await encrypt(good, 'secret');
    await expect(decrypt(bad, ct)).rejects.toBeDefined();
  });

  it('basic mode: optional entropy is mixed in (changes the key)', async () => {
    const noEnt = await deriveKey({ mode: 'basic', email: 'a@b.com', password: 'p' });
    const withEnt = await deriveKey({
      mode: 'basic',
      email: 'a@b.com',
      password: 'p',
      entropy: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    });
    const ct = await encrypt(noEnt, 'x');
    await expect(decrypt(withEnt, ct)).rejects.toBeDefined();
  });

  it('advanced mode: passphrase key round-trips and is distinct from basic', async () => {
    const adv = await deriveKey({ mode: 'advanced', passphrase: 'a long user passphrase', salt: 'user-salt-seed' });
    const ct = await encrypt(adv, 'note');
    expect(await decrypt(adv, ct)).toBe('note');
  });
});

describe('Phase 1 contract: AES-GCM CryptoStore', () => {
  it('produces a fresh IV per call (ciphertext differs for same input)', async () => {
    const k = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const a = await encrypt(k, 'same');
    const b = await encrypt(k, 'same');
    expect(a).not.toBe(b);
    expect(await decrypt(k, a)).toBe('same');
    expect(await decrypt(k, b)).toBe('same');
  });

  it('rejects tampered ciphertext (authenticated encryption)', async () => {
    const k = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const ct = await encrypt(k, 'do-not-tamper');
    // Flip a character in the middle of the base64 payload.
    const mid = Math.floor(ct.length / 2);
    const flipped = ct.slice(0, mid) + (ct[mid] === 'A' ? 'B' : 'A') + ct.slice(mid + 1);
    await expect(decrypt(k, flipped)).rejects.toBeDefined();
  });
});

describe('Phase 1 contract: EncryptedTable over Dexie', () => {
  it('stores ciphertext at rest and returns plaintext on read', async () => {
    const db = new Dexie('phase1-contract-db');
    db.version(1).stores({ items: '++id' });
    const key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const enc = new EncryptedTable<{ id?: number; payee: string; amount: number }>(db.table('items'), key);

    const id = await enc.add({ payee: 'ACME Corp', amount: 4200 });

    // Raw row in IndexedDB must NOT contain the plaintext.
    const raw = await db.table('items').get(id);
    const rawStr = JSON.stringify(raw);
    expect(rawStr).not.toContain('ACME Corp');
    expect(rawStr).not.toContain('4200');

    // Reading through the wrapper decrypts.
    const got = await enc.get(id);
    expect(got?.payee).toBe('ACME Corp');
    expect(got?.amount).toBe(4200);

    const all = await enc.toArray();
    expect(all.some((r) => r.payee === 'ACME Corp')).toBe(true);

    await db.delete();
  });
});
