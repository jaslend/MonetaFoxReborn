/**
 * Domain models for MonetaFox Reborn (Phase 3a data foundation).
 *
 * Every record is stored as WHOLE-RECORD ciphertext via `EncryptedTable`, so
 * these types describe the *plaintext* shape callers see on read — never the
 * on-disk shape. Each table is keyed only by a string `id`; no field other
 * than `id` is persisted in plaintext.
 *
 * The types are declared as `type` aliases (not `interface`) on purpose:
 * `EncryptedTable<T extends Record<string, unknown>>` requires `T` to carry
 * an implicit string index signature, which TypeScript only synthesizes for
 * object-literal type aliases, not for `interface` declarations. Using a type
 * alias is what lets `EncryptedTable<Account>` type-check.
 *
 * Primary keys are string UUIDs from `crypto.randomUUID()`; callers set `id`
 * before calling `repository.add(item)`.
 */

/** Account kinds per spec §"Currency & Account Support". */
export type AccountType =
  'checking' | 'savings' | 'credit' | 'cash' | 'investment' | 'loan';

/** Asset classes for investment accounts (BTC/ETH-style holdings). */
export type AssetType =
  | 'stock'
  | 'etf'
  | 'mutual'
  | 'bond'
  | 'commodity'
  | 'crypto'
  | 'forex'
  | 'other';

/** Signed money direction; abs(amount) is always stored. */
export type TransactionType = 'expense' | 'income' | 'transfer';

/** Encryption mode chosen at setup, per spec §"User Accounts & Security". */
export type EncryptionMode = 'basic' | 'advanced';

/** Recurrence pattern for scheduled transactions, per spec §"Transactions". */
export type Recurrence = {
  /** How often the scheduled transaction fires. */
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Multiplier on `freq` (e.g. freq=monthly, interval=3 => every quarter). */
  interval?: number;
  /** Optional inclusive ISO date after which no more occurrences fire. */
  endDate?: string;
};

/** One leg of a split transaction; splits must sum to the parent amount. */
export type Split = {
  id: string;
  amount: number;
  categoryId?: string;
  notes?: string;
};

/**
 * Phase 5a split leg. A transaction's `splits` allocate the PARENT `amount`
 * across categories and MUST sum to it (see `src/lib/transactions/isSplitBalanced`).
 *
 * Sign convention (pinned by the Phase 5a contract): `Transaction.amount` is
 * SIGNED, so each split's `amount` carries the SAME sign as the parent (outflow
 * splits are negative, inflow splits are positive). Account balance is driven
 * by the parent amount only — splits never affect the balance, they only
 * distribute the parent across categories for reporting. A transaction with no
 * `splits` is trivially balanced.
 */
export type TransactionSplit = {
  categoryId?: string;
  amount: number;
  notes?: string;
};

/** A financial account. */
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  /** ISO 4217 code (e.g. 'GBP'); investments may hold multiple assets. */
  currency: string;
  archived?: boolean;
  /**
   * Opening balance in the account's OWN currency, added to the sum of signed
   * transaction amounts to give the account balance. Defaults to 0 when unset.
   */
  openingBalance?: number;
  /** ISO-8601 creation timestamp. */
  createdAt?: string;
};

/** A single ledger entry against an account. */
export type Transaction = {
  id: string;
  accountId: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Amount in `currency`; sign encodes direction (see `type`). */
  amount: number;
  currency: string;
  payee: string;
  categoryId?: string;
  notes?: string;
  tags?: string[];
  cleared?: boolean;
  reconciled?: boolean;
  /**
   * Optional split allocation of `amount` across categories. Each split's
   * `amount` is SIGNED with the same sign as `amount` and the split amounts
   * MUST sum to `amount` (see `src/lib/transactions`). Balance uses the PARENT
   * `amount` only; splits are never double-counted.
   */
  splits?: TransactionSplit[];
  type?: TransactionType;
};

/** A user-defined category, optionally nested under a parent. */
export type Category = {
  id: string;
  name: string;
  parentId?: string;
  kind: 'income' | 'expense';
};

/** A monthly per-category spending limit, per spec §"Transactions". */
export type Budget = {
  id: string;
  categoryId: string;
  /** Calendar month, 'YYYY-MM'. */
  month: string;
  limit: number;
};

/**
 * A recurring transaction template, per spec §"Transactions" (auto or manual
 * entry on the due date). The `template` fields describe the transaction to
 * materialise when the schedule fires.
 */
export type ScheduledTransaction = {
  id: string;
  recurrence: Recurrence;
  /** Next due date as ISO string (YYYY-MM-DD). */
  nextDate: string;
  mode: 'auto' | 'manual';
  template: {
    accountId: string;
    amount: number;
    currency: string;
    payee: string;
    categoryId?: string;
    notes?: string;
    type?: TransactionType;
  };
};

/** A tradeable asset held inside an investment account. */
export type Asset = {
  id: string;
  symbol: string;
  name: string;
  type: AssetType;
};

/** Units of an asset held in an account, per spec §"Investments". */
export type Holding = {
  id: string;
  accountId: string;
  assetId: string;
  units: number;
};

/** A historical price observation for an asset. */
export type PricePoint = {
  id: string;
  assetId: string;
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  price: number;
};

/** App-level settings; a single row keyed by a fixed id. */
export type Settings = {
  id: string;
  baseCurrency: string;
  encryptionMode: EncryptionMode;
  /**
   * Manual FX rates: `rates[currency] = <base-currency units> per 1 unit of
   * <currency>`. The base currency itself is NOT stored here — converting it
   * to itself is the identity. A missing entry for a foreign currency means
   * "rate unknown" and `convertToBase` will throw rather than guess.
   */
  rates?: Record<string, number>;
};
