/**
 * Transaction helpers for MonetaFox Reborn (Phase 5a).
 *
 * Sign + split conventions (pinned by the Phase 5a contract):
 * - `Transaction.amount` is SIGNED: positive = inflow, negative = outflow.
 * - Account balance is driven by the PARENT `amount` only (see
 *   `src/lib/accounts`). Splits allocate that parent amount across categories
 *   and MUST sum to it; splits are never double-counted in the balance.
 * - A transaction with no `splits` is trivially balanced.
 *
 * Scope note: filtering, search, and category-totals are Phase 5b and live
 * elsewhere — this module is intentionally tiny.
 */

import type { Transaction, TransactionSplit } from '@/lib/db/models';

export type { TransactionSplit } from '@/lib/db/models';

/** Tolerance for split-vs-parent balance checks (sub-cent). */
export const SPLIT_EPSILON = 1e-6;

/**
 * Sum the `amount` of every split. Empty (or undefined) → 0. The result is
 * SIGNED and must equal the parent `Transaction.amount` for a balanced split.
 */
export function splitSum(splits: TransactionSplit[]): number {
  if (!splits || splits.length === 0) return 0;
  let sum = 0;
  for (const s of splits) sum += s.amount;
  return sum;
}

/**
 * True if the transaction's splits (if any) sum to its parent `amount`.
 *
 * A transaction with no `splits` is trivially balanced. When splits are
 * present, `|splitSum(splits) − amount|` must be below `SPLIT_EPSILON` so that
 * floating-point dust on currency arithmetic does not flag a balanced split.
 */
export function isSplitBalanced(tx: Transaction): boolean {
  if (!tx.splits || tx.splits.length === 0) return true;
  return Math.abs(splitSum(tx.splits) - tx.amount) < SPLIT_EPSILON;
}
