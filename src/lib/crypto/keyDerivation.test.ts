// @vitest-environment node

import './globalPolyfill';
import { describe, it, expect } from 'vitest';
import { deriveKey, PBKDF2_ITERATIONS, type KeyInput } from './keyDerivation';
import { encrypt, decrypt } from './CryptoStore';

describe('deriveKey', () => {
  it('derives a usable AES-GCM key in basic mode', async () => {
    const key = await deriveKey({
      mode: 'basic',
      email: 'alice@example.com',
      password: 'correct horse battery staple',
    });
    expect(key).toBeInstanceOf(CryptoKey);
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
    expect(key.usages).toEqual(expect.arrayContaining(['encrypt', 'decrypt']));
  });

  it('derives a usable AES-GCM key in advanced mode', async () => {
    const key = await deriveKey({
      mode: 'advanced',
      passphrase: 'a strong passphrase',
      salt: 'some-fixed-salt',
    });
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('uses at least 100000 PBKDF2 iterations', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100000);
  });

  it('produces the same key for the same basic identity (case/whitespace-insensitive)', async () => {
    const ct1 = await encrypt(
      await deriveKey({
        mode: 'basic',
        email: 'Alice@Example.com ',
        password: 'pw',
      }),
      'hello',
    );
    const ct2 = await encrypt(
      await deriveKey({
        mode: 'basic',
        email: '  alice@example.com',
        password: 'pw',
      }),
      'hello',
    );
    const pt = await decrypt(
      await deriveKey({
        mode: 'basic',
        email: 'ALICE@example.com',
        password: 'pw',
      }),
      ct1,
    );
    expect(pt).toBe('hello');
    // Same plaintext encrypted under two fresh IVs must differ in form but
    // both decrypt correctly.
    expect(ct1).not.toBe(ct2);
  });

  it('mixes entropy into the basic key material', async () => {
    const base: KeyInput = {
      mode: 'basic',
      email: 'bob@example.com',
      password: 'pw',
    };
    const noEntropy = await deriveKey(base);
    const withEntropy = await deriveKey({
      ...base,
      entropy: new Uint8Array([1, 2, 3, 4]),
    });

    const ct = await encrypt(noEntropy, 'secret');
    await expect(decrypt(withEntropy, ct)).rejects.toThrow();
  });

  it('derives the same key for the same advanced input', async () => {
    const k1 = await deriveKey({
      mode: 'advanced',
      passphrase: 'p',
      salt: 's',
    });
    const k2 = await deriveKey({
      mode: 'advanced',
      passphrase: 'p',
      salt: 's',
    });
    const ct = await encrypt(k1, 'round trip');
    expect(await decrypt(k2, ct)).toBe('round trip');
  });

  it('rejects a different advanced passphrase', async () => {
    const k1 = await deriveKey({
      mode: 'advanced',
      passphrase: 'p1',
      salt: 's',
    });
    const k2 = await deriveKey({
      mode: 'advanced',
      passphrase: 'p2',
      salt: 's',
    });
    const ct = await encrypt(k1, 'data');
    await expect(decrypt(k2, ct)).rejects.toThrow();
  });
});
