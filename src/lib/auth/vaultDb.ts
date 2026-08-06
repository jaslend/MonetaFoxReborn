/**
 * Dedicated Dexie database holding the NON-SENSITIVE vault metadata for the
 * local-only auth model.
 *
 * This is deliberately a SEPARATE database from the encrypted data DB
 * (`monetafox`): it must be readable before the user unlocks (so the app can
 * tell setup vs. unlock and look up the verifier), so it carries only public
 * metadata — never the password, passphrase, or derived `CryptoKey`.
 *
 * Schema: a single `vault` table keyed by the normalized email (one record per
 * local user; MonetaFox is a single-user local-first app, so in practice there
 * is at most one row).
 */
import Dexie from 'dexie';

/** The persisted, plaintext, NON-SENSITIVE metadata record. */
export interface VaultRecord {
  /** Normalized email — primary key. */
  email: string;
  /** Encryption mode used at setup. */
  mode: 'basic' | 'advanced';
  /**
   * ADVANCED mode only: base64 of the random 16-byte salt generated at setup.
   * BASIC mode: null.
   */
  salt: string | null;
  /**
   * BASIC mode only: base64 of the optional mouse-entropy bytes captured at
   * setup, or null when none was provided. Stored so the key is reproducible on
   * unlock — mouse entropy acts as a per-user salt mixed into the keying
   * material (see deriveKey's `basic` mode).
   */
  entropy: string | null;
  /**
   * base64 of `encrypt(key, VERIFIER_PLAINTEXT)`. AES-GCM authenticated: a
   * wrong secret throws on decrypt, which is how we reject bad credentials
   * without ever storing the secret.
   */
  verifier: string;
  /** Setup timestamp (ms). */
  createdAt: number;
  /** Recent successful-login timestamps (ms), newest last; capped at 50. */
  loginHistory: number[];
  /** Last successful cloud-sync timestamp (ms), or null. */
  lastSyncAt: number | null;
}

export const AUTH_DB_NAME = 'monetafox-auth';

export class AuthDB extends Dexie {
  vault!: Dexie.Table<VaultRecord, string>;

  constructor(name = AUTH_DB_NAME) {
    super(name);
    this.version(1).stores({ vault: '&email' });
  }
}
