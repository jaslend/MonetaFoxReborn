// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { deriveKey } from './keyDerivation';
import { encrypt, decrypt } from './CryptoStore';

async function key() {
  return deriveKey({ mode: 'advanced', passphrase: 'hunter2', salt: 'salty' });
}

describe('CryptoStore', () => {
  it('round-trips encrypt -> decrypt', async () => {
    const k = await key();
    const ct = await encrypt(k, 'the quick brown fox');
    expect(await decrypt(k, ct)).toBe('the quick brown fox');
  });

  it('uses a fresh IV per call (same plaintext => different ciphertext)', async () => {
    const k = await key();
    const a = await encrypt(k, 'same');
    const b = await encrypt(k, 'same');
    expect(a).not.toBe(b);
    expect(await decrypt(k, a)).toBe('same');
    expect(await decrypt(k, b)).toBe('same');
  });

  it('rejects a wrong key', async () => {
    const k1 = await key();
    const k2 = await deriveKey({
      mode: 'advanced',
      passphrase: 'other',
      salt: 'salty',
    });
    const ct = await encrypt(k1, 'classified');
    await expect(decrypt(k2, ct)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const k = await key();
    const ct = await encrypt(k, 'tamper test');
    const decoded = Buffer.from(ct, 'base64');
    decoded[decoded.length - 1] ^= 0x01;
    const tampered = decoded.toString('base64');
    await expect(decrypt(k, tampered)).rejects.toThrow();
  });

  it('rejects a truncated payload', async () => {
    const k = await key();
    const ct = await encrypt(k, 'truncate me');
    const truncated = ct.slice(0, ct.length - 8);
    await expect(decrypt(k, truncated)).rejects.toThrow();
  });

  it('handles unicode round-trip', async () => {
    const k = await key();
    const text = 'héllo 世界 — 🦊';
    const ct = await encrypt(k, text);
    expect(await decrypt(k, ct)).toBe(text);
  });
});
