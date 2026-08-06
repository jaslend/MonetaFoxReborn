/**
 * Phase 2 local auth vault service.
 *
 * MODEL — unlock-on-reload (local-only, no server):
 * "Authentication" = derive the encryption key from credentials and prove it
 * against a stored verifier. The derived `CryptoKey` lives in MEMORY ONLY and
 * is NEVER persisted (deriveKey already returns `extractable: false`). After a
 * page reload the key is gone, so the user re-enters their secret to UNLOCK
 * (re-derive). We never store the password/passphrase or the key.
 *
 * VAULT RECORD — a plaintext, NON-SENSITIVE record per user (see vaultDb.ts):
 *   { email, mode, salt, entropy, verifier, createdAt, loginHistory, lastSyncAt }
 * Verifier = encrypt(key, 'monetafox-verifier'); a wrong secret throws on
 * AES-GCM decrypt, which is how we reject bad credentials.
 */
import { deriveKey, encrypt, decrypt } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import { AuthDB, type VaultRecord } from './vaultDb';

/** Fixed plaintext sealed by the derived key as the unlock verifier. */
export const VERIFIER_PLAINTEXT = 'monetafox-verifier';

/** Cap on retained login-history entries (newest last). */
const LOGIN_HISTORY_CAP = 50;

export type SetupInput =
  | { mode: 'basic'; email: string; password: string; entropy?: Uint8Array }
  | { mode: 'advanced'; email: string; passphrase: string };

export type AuthResult = {
  key: CryptoKey;
  db: MonetaFoxDB;
  repositories: Repositories;
  sessionId: string;
};

export type VaultInfo = {
  exists: boolean;
  email?: string;
  mode?: 'basic' | 'advanced';
};

/** Lowercase + trim an email so the same identity resolves to the same record. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Encode bytes (ArrayBuffer-backed) to base64, chunked to avoid call-stack limits. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

/** Decode base64 to a fresh ArrayBuffer-backed Uint8Array. */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Generate a fresh random base64 salt (16 bytes). */
function generateSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** Fresh session id used for single-active-session enforcement. */
function newSessionId(): string {
  return crypto.randomUUID();
}

/** Open the auth metadata DB. */
function openAuthDb(): AuthDB {
  const db = new AuthDB();
  void db.open();
  return db;
}

/**
 * Does a vault exist (any record)? Returns the first record's email + mode.
 * MonetaFox is a single-user local app, so at most one record is expected.
 */
export async function getVaultInfo(): Promise<VaultInfo> {
  const db = openAuthDb();
  try {
    const all = await db.vault.toArray();
    if (all.length === 0) return { exists: false };
    const rec = all[0] as VaultRecord;
    return { exists: true, email: rec.email, mode: rec.mode };
  } finally {
    db.close();
  }
}

/**
 * The raw persisted, NON-SENSITIVE metadata record for `email`, or undefined.
 * Used for setup detection and verification by callers that already know the
 * email. Never returns the secret (it is not stored).
 */
export async function getStoredVault(
  email: string,
): Promise<Record<string, unknown> | undefined> {
  const db = openAuthDb();
  try {
    const rec = await db.vault.get(normalizeEmail(email));
    return rec as Record<string, unknown> | undefined;
  } finally {
    db.close();
  }
}

/**
 * First-run setup. Normalizes email, derives the key from the supplied
 * credentials (storing the per-user salt/entropy so the key is reproducible),
 * seals the verifier, opens the data DB, and returns the unlock bundle.
 * Throws if a vault already exists for this email.
 */
export async function setupVault(input: SetupInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const authDb = openAuthDb();
  try {
    const existing = await authDb.vault.get(email);
    if (existing) throw new Error('Vault already exists for this email');

    let salt: string | null = null;
    let entropyB64: string | null = null;
    let key: CryptoKey;
    if (input.mode === 'basic') {
      const entropy =
        input.entropy && input.entropy.length > 0 ? input.entropy : undefined;
      if (entropy) entropyB64 = bytesToBase64(entropy);
      key = await deriveKey({
        mode: 'basic',
        email,
        password: input.password,
        entropy,
      });
    } else {
      salt = generateSalt();
      key = await deriveKey({
        mode: 'advanced',
        passphrase: input.passphrase,
        salt,
      });
    }

    const verifier = await encrypt(key, VERIFIER_PLAINTEXT);
    const now = Date.now();
    const rec: VaultRecord = {
      email,
      mode: input.mode,
      salt,
      entropy: entropyB64,
      verifier,
      createdAt: now,
      loginHistory: [now],
      lastSyncAt: null,
    };
    await authDb.vault.put(rec);

    const db = new MonetaFoxDB();
    await db.open();
    const repositories = createRepositories(db, key);
    return { key, db, repositories, sessionId: newSessionId() };
  } finally {
    authDb.close();
  }
}

/**
 * Login AND unlock. Looks up the metadata by normalized email, rebuilds the
 * exact derivation inputs from the STORED mode+salt+entropy and the supplied
 * secret, re-derives the key, and requires `decrypt(key, verifier)` to equal
 * the known verifier string (AES-GCM auth tag rejects a wrong secret). On
 * success appends to login history and returns the unlock bundle.
 */
export async function authenticate(input: {
  email: string;
  secret: string;
}): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const authDb = openAuthDb();
  try {
    const rec = await authDb.vault.get(email);
    if (!rec) throw new Error('No vault found for this email');

    let key: CryptoKey;
    if (rec.mode === 'basic') {
      const entropy = rec.entropy ? base64ToBytes(rec.entropy) : undefined;
      key = await deriveKey({
        mode: 'basic',
        email,
        password: input.secret,
        entropy,
      });
    } else {
      if (!rec.salt) throw new Error('Corrupt vault record: missing salt');
      key = await deriveKey({
        mode: 'advanced',
        passphrase: input.secret,
        salt: rec.salt,
      });
    }

    // Prove the key is correct. AES-GCM throws on a wrong key (auth tag).
    let verified: string;
    try {
      verified = await decrypt(key, rec.verifier);
    } catch {
      throw new Error('Invalid credentials');
    }
    if (verified !== VERIFIER_PLAINTEXT) throw new Error('Invalid credentials');

    const now = Date.now();
    const loginHistory = [...rec.loginHistory, now].slice(-LOGIN_HISTORY_CAP);
    await authDb.vault.update(email, { loginHistory });

    const db = new MonetaFoxDB();
    await db.open();
    const repositories = createRepositories(db, key);
    return { key, db, repositories, sessionId: newSessionId() };
  } finally {
    authDb.close();
  }
}

/**
 * Wipe the vault + ALL app data. Deletes BOTH the auth metadata DB and the
 * encrypted data DB (every table), so no data survives.
 */
export async function deleteVault(): Promise<void> {
  const authDb = new AuthDB();
  await authDb.delete();
  const dataDb = new MonetaFoxDB();
  await dataDb.delete();
}
