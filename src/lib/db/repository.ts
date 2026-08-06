/**
 * Encrypted repositories over the Dexie tables.
 *
 * `createRepositories(db, key)` is the unlock seam: Phase 2 derives a
 * `CryptoKey` from the user's credentials, calls this, and hands the result to
 * `initializeStores(repos)` (see src/stores/index.ts). Each repository wraps a
 * raw Dexie table in an `EncryptedTable`, so every row is persisted as
 * whole-record ciphertext and decrypted transparently on read.
 */

import { EncryptedTable } from '../crypto';
import type { MonetaFoxDB } from './database';
import type {
  Account,
  Transaction,
  Category,
  Budget,
  ScheduledTransaction,
  Asset,
  Holding,
  PricePoint,
  Settings,
} from './models';

/** One encrypted repository per entity. */
export type Repositories = {
  accounts: EncryptedTable<Account>;
  transactions: EncryptedTable<Transaction>;
  categories: EncryptedTable<Category>;
  budgets: EncryptedTable<Budget>;
  scheduledTransactions: EncryptedTable<ScheduledTransaction>;
  assets: EncryptedTable<Asset>;
  holdings: EncryptedTable<Holding>;
  prices: EncryptedTable<PricePoint>;
  settings: EncryptedTable<Settings>;
};

/**
 * Build the encrypted repositories for an open `MonetaFoxDB` given the user's
 * `CryptoKey`. The database itself is opened without a key; this injection is
 * what makes reads/writes transparently encrypt/decrypt.
 */
export function createRepositories(
  db: MonetaFoxDB,
  key: CryptoKey,
): Repositories {
  return {
    accounts: new EncryptedTable<Account>(db.accounts, key),
    transactions: new EncryptedTable<Transaction>(db.transactions, key),
    categories: new EncryptedTable<Category>(db.categories, key),
    budgets: new EncryptedTable<Budget>(db.budgets, key),
    scheduledTransactions: new EncryptedTable<ScheduledTransaction>(
      db.scheduledTransactions,
      key,
    ),
    assets: new EncryptedTable<Asset>(db.assets, key),
    holdings: new EncryptedTable<Holding>(db.holdings, key),
    prices: new EncryptedTable<PricePoint>(db.prices, key),
    settings: new EncryptedTable<Settings>(db.settings, key),
  };
}
