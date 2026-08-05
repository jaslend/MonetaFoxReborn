/**
 * Phase 1 key derivation for MonetaFox Reborn.
 *
 * Two modes are supported, per spec §"User Accounts & Security":
 *  - basic:    key derived from email (salt) + password, with optional
 *              mouse-movement entropy mixed into the keying material.
 *  - advanced: key derived from a user-supplied passphrase + explicit salt.
 *
 * Both modes use PBKDF2 (SHA-256) to derive a 256-bit AES-GCM `CryptoKey`.
 */

export type EncryptionMode = 'basic' | 'advanced';

/** PBKDF2 iteration count. Must be >= 100000 per spec. */
export const PBKDF2_ITERATIONS = 250000;

export type KeyInput =
  | {
      mode: 'basic';
      email: string;
      password: string;
      entropy?: Uint8Array;
    }
  | {
      mode: 'advanced';
      passphrase: string;
      salt: string;
    };

const encoder = new TextEncoder();

/** Lowercase + trim an email so the same identity yields the same salt/key. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toBytes(value: string): Uint8Array<ArrayBuffer> {
  const encoded = encoder.encode(value);
  // Copy into a guaranteed ArrayBuffer-backed view so the WebCrypto DOM types
  // (which require ArrayBufferView<ArrayBuffer>) accept it.
  const copy = new Uint8Array(encoded.length);
  copy.set(encoded, 0);
  return copy;
}

/**
 * Derive a 256-bit AES-GCM key from the supplied input.
 *
 * BASIC:   PBKDF2 over (password bytes, optionally appended with entropy
 *          bytes), salt = normalized email bytes.
 * ADVANCED: PBKDF2 over passphrase bytes, salt = supplied salt bytes.
 */
export async function deriveKey(input: KeyInput): Promise<CryptoKey> {
  let keyMaterial: Uint8Array<ArrayBuffer>;
  let salt: Uint8Array<ArrayBuffer>;

  if (input.mode === 'basic') {
    const passwordBytes = toBytes(input.password);
    if (input.entropy !== undefined && input.entropy.length > 0) {
      const merged = new Uint8Array(
        passwordBytes.length + input.entropy.length,
      );
      merged.set(passwordBytes, 0);
      merged.set(input.entropy, passwordBytes.length);
      keyMaterial = merged;
    } else {
      keyMaterial = passwordBytes;
    }
    salt = toBytes(normalizeEmail(input.email));
  } else {
    keyMaterial = toBytes(input.passphrase);
    salt = toBytes(input.salt);
  }

  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}
