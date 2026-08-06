/**
 * Dexie database for MonetaFox Reborn.
 *
 * The database is opened WITHOUT a key. A `CryptoKey` is injected at unlock
 * time by `createRepositories` (see repository.ts), which is the seam Phase 2
 * auth calls after deriving the key from the user's credentials. Until then,
 * only the raw `&id`-keyed tables exist and their rows are opaque ciphertext
 * blobs.
 *
 * Schema rule (fixed architecture decision): every table is keyed ONLY by a
 * string `id` (schema `'&id'`). All other fields live inside the encrypted
 * `_enc` blob managed by `EncryptedTable`; no plaintext secondary indexes are
 * declared. Queries decrypt in memory.
 *
 * Migrations: future schema changes append another `this.version(N).stores(...)`
 * call below. Never mutate an already-shipped version's definition — always
 * add a new, higher version that describes the delta.
 */

import Dexie from 'dexie';
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
  TransactionTemplate,
} from './models';

export class MonetaFoxDB extends Dexie {
  accounts!: Dexie.Table<Account, string>;
  transactions!: Dexie.Table<Transaction, string>;
  categories!: Dexie.Table<Category, string>;
  budgets!: Dexie.Table<Budget, string>;
  scheduledTransactions!: Dexie.Table<ScheduledTransaction, string>;
  assets!: Dexie.Table<Asset, string>;
  holdings!: Dexie.Table<Holding, string>;
  prices!: Dexie.Table<PricePoint, string>;
  settings!: Dexie.Table<Settings, string>;
  transactionTemplates!: Dexie.Table<TransactionTemplate, string>;

  constructor(name = 'monetafox') {
    super(name);
    // Phase 1 schema (v1): every table keyed only by `&id`; no plaintext
    // secondary indexes. Never mutate a shipped version — only append.
    this.version(1).stores({
      // Every table is keyed only by `id`; no plaintext secondary indexes.
      accounts: '&id',
      transactions: '&id',
      categories: '&id',
      budgets: '&id',
      scheduledTransactions: '&id',
      assets: '&id',
      holdings: '&id',
      prices: '&id',
      settings: '&id',
    });

    // Phase 5b schema (v2): additive migration that adds the
    // `transactionTemplates` table for quick-entry templates. Only the DELTA
    // is declared — Dexie leaves every v1 table untouched when it is not
    // listed here, so existing data and indexes are preserved verbatim. To
    // delete a table in a future version, list it as `null`; to add another,
    // append a new `this.version(N).stores({ ...delta })` block chained after
    // this one. Versions must be declared in ascending order with no gaps.
    this.version(2).stores({
      transactionTemplates: '&id',
    });
  }
}
