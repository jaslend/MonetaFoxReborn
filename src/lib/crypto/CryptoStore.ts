/**
 * AES-GCM encrypt/decrypt helpers.
 *
 * `encrypt` returns base64 of (iv || ciphertext) where a fresh 12-byte random
 * IV is generated for every call. `decrypt` reverses it and throws if the key
 * is wrong or the payload has been tampered with (AES-GCM authenticated).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const IV_LENGTH = 12;

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  const cipherBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(IV_LENGTH + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, IV_LENGTH);
  return bytesToBase64(combined);
}

export async function decrypt(
  key: CryptoKey,
  payload: string,
): Promise<string> {
  const combined = base64ToBytes(payload);
  const iv = combined.subarray(0, IV_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return decoder.decode(plaintext);
}
