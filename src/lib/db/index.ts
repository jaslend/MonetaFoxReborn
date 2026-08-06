/**
 * Barrel for the MonetaFox Reborn data foundation.
 *
 * Callers import from `@/lib/db` (or `../db`) to reach the database class,
 * the encrypted-repository factory, and the domain model types.
 */

export { MonetaFoxDB } from './database';
export { createRepositories } from './repository';
export type { Repositories } from './repository';

export type {
  Account,
  Transaction,
  Category,
  Budget,
  ScheduledTransaction,
  Asset,
  Holding,
  PricePoint,
  Settings,
  AccountType,
  AssetType,
  TransactionType,
  EncryptionMode,
  Recurrence,
  Split,
} from './models';
