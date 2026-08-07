/**
 * Phase 7b — data EXPORT.
 *
 * Two exports:
 *
 * - `exportQIF(account, transactions)` — emits a Microsoft Money-style QIF
 *   document (`!Type:<mapped>` header, `DD/MM'YYYY` dates, `T<amount>` with 2
 *   decimals, `P`ayee, `L` category, `M`emo, `C*` when cleared, `^`
 *   terminator) that Phase 7a's `parseQIF` reads back to the SAME
 *   date/amount/payee/cleared (round-trip contract).
 *
 * - `exportEncrypted(data, passphrase)` / `importEncrypted(blob, passphrase)`
 *   — a portable, passphrase-protected JSON backup. A fresh random salt is
 *   generated per backup and embedded in the envelope; the key is re-derived
 *   on restore via the Phase 1 crypto layer (PBKDF2 → AES-GCM). The envelope
 *   is `{ v, salt, data }` where `data` is base64(iv || ciphertext). Wrong
 *   passphrase → AES-GCM auth failure → rejection (never garbage).
 *
 * No new dependencies: reuses `deriveKey`/`encrypt`/`decrypt` from
 * `@/lib/crypto` and `parseQIF` round-trip is verified in the test suite.
 */
import { deriveKey, encrypt, decrypt } from '@/lib/crypto';
import type { Account, Transaction } from '@/lib/db';

/** Current backup envelope version. Bump on incompatible changes. */
export const BACKUP_VERSION = 1;

/**
 * The plaintext backup payload. `categories`/`budgets` are typed `unknown[]`
 * (per the Phase 7b contract) so this module does not depend on every domain
 * model; the restore site in `SettingsPage` casts as it writes them back.
 * The index signature lets future fields ride along without a version bump.
 */
export interface BackupData {
  version: number;
  accounts: Account[];
  transactions: Transaction[];
  categories: unknown[];
  budgets: unknown[];
  [k: string]: unknown;
}

/** Envelope written to disk: version + salt + base64(iv || ciphertext). */
interface BackupEnvelope {
  v: number;
  salt: string;
  data: string;
}

/**
 * Map a MonetaFox `Account.type` to the QIF `!Type:` value. The mapping is
 * conservative — bank-like accounts become `Bank`, cash stays `Cash`, credit
 * becomes `CCard`, investments `Invst`. `parseQIF` only reads the header to
 * populate `type`; it does not branch on it, so any value round-trips.
 */
export function accountTypeToQifType(type: Account['type']): string {
  switch (type) {
    case 'cash':
      return 'Cash';
    case 'credit':
      return 'CCard';
    case 'investment':
      return 'Invst';
    case 'checking':
    case 'savings':
    case 'loan':
    default:
      return 'Bank';
  }
}

/** Format a signed amount as a 2-decimal QIF `T` value (no thousands sep). */
function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toFixed(2);
}

/**
 * Convert an ISO `YYYY-MM-DD` date to the Microsoft Money QIF form
 * `DD/MM'YYYY` (apostrophe separates the year). Inverse of `parseQifDate`.
 */
export function formatQifDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}'${m[1]}`;
}

/**
 * Emit a QIF document for `account` + its `transactions`. Field order per
 * entry: `D`ate, `T`amount, `P`ayee, `L`category, `M`emo (when present),
 * `C*` (when cleared), then `^`.
 */
export function exportQIF(
  account: Account,
  transactions: Transaction[],
): string {
  const lines: string[] = [];
  lines.push(`!Type:${accountTypeToQifType(account.type)}`);

  for (const tx of transactions) {
    lines.push(`D${formatQifDate(tx.date)}`);
    lines.push(`T${formatAmount(tx.amount)}`);
    lines.push(`P${tx.payee ?? ''}`);
    if (tx.categoryId !== undefined && tx.categoryId !== '') {
      lines.push(`L${tx.categoryId}`);
    }
    if (tx.notes !== undefined && tx.notes !== '') {
      lines.push(`M${tx.notes}`);
    }
    if (tx.cleared) {
      lines.push('C*');
    }
    lines.push('^');
  }

  return lines.join('\n') + '\n';
}

/** Generate a fresh random salt as a base64 string (16 bytes of entropy). */
function freshSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Serialize `data` to JSON, derive an AES-GCM key from `passphrase` + a FRESH
 * random salt, encrypt, and return a portable JSON envelope embedding the
 * salt + ciphertext. Plaintext (payees, etc.) never appears in the output.
 */
export async function exportEncrypted(
  data: BackupData,
  passphrase: string,
): Promise<string> {
  const salt = freshSalt();
  const key = await deriveKey({ mode: 'advanced', passphrase, salt });
  const plaintext = JSON.stringify(data);
  const ciphertext = await encrypt(key, plaintext);
  const envelope: BackupEnvelope = {
    v: BACKUP_VERSION,
    salt,
    data: ciphertext,
  };
  return JSON.stringify(envelope);
}

/**
 * Reverse `exportEncrypted`: re-derive the key from `passphrase` + the
 * embedded salt, decrypt, and `JSON.parse` to `BackupData`. A wrong
 * passphrase fails AES-GCM authentication and REJECTS (no garbage return).
 */
export async function importEncrypted(
  blob: string,
  passphrase: string,
): Promise<BackupData> {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(blob) as BackupEnvelope;
  } catch {
    throw new Error('Invalid backup file: not a JSON envelope');
  }
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    typeof envelope.salt !== 'string' ||
    typeof envelope.data !== 'string'
  ) {
    throw new Error('Invalid backup file: missing salt/data fields');
  }

  const key = await deriveKey({
    mode: 'advanced',
    passphrase,
    salt: envelope.salt,
  });
  let plaintext: string;
  try {
    plaintext = await decrypt(key, envelope.data);
  } catch {
    throw new Error(
      'Could not decrypt backup — wrong passphrase or corrupted file',
    );
  }

  let data: BackupData;
  try {
    data = JSON.parse(plaintext) as BackupData;
  } catch {
    throw new Error('Invalid backup file: decrypted payload is not JSON');
  }
  if (typeof data.version !== 'number') {
    throw new Error('Invalid backup file: missing version');
  }
  return data;
}
