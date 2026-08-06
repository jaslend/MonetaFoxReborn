/**
 * Transaction helpers for MonetaFox Reborn (Phase 5a + 5b).
 *
 * Sign + split conventions (pinned by the Phase 5a contract):
 * - `Transaction.amount` is SIGNED: positive = inflow, negative = outflow.
 * - Account balance is driven by the PARENT `amount` only (see
 *   `src/lib/accounts`). Splits allocate that parent amount across categories
 *   and MUST sum to it; splits are never double-counted in the balance.
 * - A transaction with no `splits` is trivially balanced.
 *
 * Phase 5b adds the deterministic, pure discovery core:
 * - `filterTransactions` — date range (inclusive), account, category (matches
 *   `tx.categoryId` OR any split's `categoryId`), payee (case-insensitive
 *   substring), cleared/reconciled (exact when provided), tags (transaction
 *   must contain ALL given tags). An empty filter returns everything.
 * - `searchTransactions` — case-insensitive match over payee, notes, and tags.
 *   An empty/whitespace query returns everything.
 * - `categoryTotals` — split lines allocate to their own `categoryId`; a
 *   non-split transaction allocates its `amount` to `tx.categoryId`; a
 *   transaction with no category (and no split categories) creates no bucket.
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

/**
 * Phase 5b filter predicate.
 *
 * Every field is optional; an empty filter matches every transaction. When a
 * field is present the match rule is:
 * - `accountId` — exact equality with `tx.accountId`.
 * - `dateFrom` / `dateTo` — inclusive bounds on the ISO date string
 *   (`tx.date >= dateFrom` and `tx.date <= dateTo`). Comparison is lexical on
 *   the `YYYY-MM-DD` form, which is also chronological.
 * - `categoryId` — matches `tx.categoryId` OR any split's `categoryId` (so a
 *   split transaction is found by each of its split categories).
 * - `payee` — case-insensitive SUBSTRING match on `tx.payee`.
 * - `cleared` / `reconciled` — exact equality with the flag, ONLY when the
 *   field is provided (a transaction with the flag unset is treated as
 *   `false`, so filtering for `cleared: false` still matches unset rows).
 * - `tags` — the transaction must contain ALL of the given tags (intersection;
 *   order-independent). Empty `tags` array is ignored.
 */
export interface TransactionFilter {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  payee?: string;
  cleared?: boolean;
  reconciled?: boolean;
  tags?: string[];
}

/** True if `haystack` contains `needle` (case-insensitive substring). */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** True if `tx` matches every present field of `f`. */
export function matchesFilter(tx: Transaction, f: TransactionFilter): boolean {
  if (f.accountId !== undefined && tx.accountId !== f.accountId) return false;
  if (f.dateFrom !== undefined && tx.date < f.dateFrom) return false;
  if (f.dateTo !== undefined && tx.date > f.dateTo) return false;
  if (f.categoryId !== undefined) {
    const onParent = tx.categoryId === f.categoryId;
    const onSplit =
      tx.splits?.some((s) => s.categoryId === f.categoryId) ?? false;
    if (!onParent && !onSplit) return false;
  }
  if (f.payee !== undefined && f.payee !== '') {
    if (!contains(tx.payee ?? '', f.payee)) return false;
  }
  if (f.cleared !== undefined && !!tx.cleared !== f.cleared) return false;
  if (f.reconciled !== undefined && !!tx.reconciled !== f.reconciled)
    return false;
  if (f.tags && f.tags.length > 0) {
    const have = new Set(tx.tags ?? []);
    for (const t of f.tags) {
      if (!have.has(t)) return false;
    }
  }
  return true;
}

/**
 * Return the subset of `txns` matching `f`. An empty filter returns every
 * transaction (a shallow copy, in input order).
 */
export function filterTransactions(
  txns: Transaction[],
  f: TransactionFilter,
): Transaction[] {
  return txns.filter((tx) => matchesFilter(tx, f));
}

/**
 * Case-insensitive search over `payee`, `notes`, and every `tag`. An empty or
 * whitespace-only query returns every transaction (a shallow copy, in input
 * order).
 */
export function searchTransactions(
  txns: Transaction[],
  query: string,
): Transaction[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...txns];
  return txns.filter((tx) => {
    if (contains(tx.payee ?? '', q)) return true;
    if (tx.notes && contains(tx.notes, q)) return true;
    if (tx.tags) {
      for (const t of tx.tags) {
        if (t.toLowerCase().includes(q)) return true;
      }
    }
    return false;
  });
}

/**
 * Allocate each transaction's amount to categories, RESPECTING SPLITS.
 *
 * For each transaction:
 * - if it has `splits`, each split line's `amount` is added to THAT split's
 *   `categoryId` (the parent `amount` is NOT added anywhere — splits already
 *   sum to it, so adding the parent too would double-count);
 * - otherwise the parent `amount` is added to `tx.categoryId`.
 *
 * A transaction (or split line) with no `categoryId` is skipped — it never
 * creates a bucket, and in particular no empty-string (`''`) bucket is ever
 * created. Returns a `Record<categoryId, signed total>`.
 */
export function categoryTotals(txns: Transaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const tx of txns) {
    if (tx.splits && tx.splits.length > 0) {
      for (const s of tx.splits) {
        if (!s.categoryId) continue;
        totals[s.categoryId] = (totals[s.categoryId] ?? 0) + s.amount;
      }
    } else if (tx.categoryId) {
      totals[tx.categoryId] = (totals[tx.categoryId] ?? 0) + tx.amount;
    }
  }
  return totals;
}
