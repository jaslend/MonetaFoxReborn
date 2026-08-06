/**
 * Budget-vs-actual helpers for MonetaFox Reborn (Phase 6).
 *
 * Conventions (pinned by the Phase 6 contract):
 * - `Transaction.amount` is SIGNED: positive = inflow, negative = outflow. A
 *   budget tracks OUTFLOW, so `spent` is reported as a POSITIVE figure — the
 *   magnitude of the category's signed spend in the budget's month:
 *   `spent = -(sum of the category's signed amounts in that month)`.
 * - A budget's spend is scoped to its month: a transaction counts if its
 *   `date` starts with `budget.month` (`tx.date.slice(0, 7) === month`).
 * - Spend RESPECTS SPLITS: a split line with `categoryId` matching the
 *   budget's `categoryId` contributes its `amount`; the parent `amount` of a
 *   split transaction is NOT counted (splits already sum to it). A non-split
 *   transaction contributes its `amount` when `tx.categoryId` matches.
 *
 * `Budget.remaining = limit - spent`; `percentUsed = limit > 0 ?
 * spent / limit * 100 : 0`; `overBudget = spent > limit`.
 */
import type { Budget, Transaction } from '@/lib/db/models';

export interface BudgetStatus {
  categoryId: string;
  limit: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  overBudget: boolean;
}

/**
 * Sum the SIGNED amounts that fall under `categoryId` for the month, following
 * the split-aware rule above, and return the outflow magnitude as a positive
 * `spent`. Outflow (negative) amounts drive `spent` up; inflow (positive)
 * amounts (e.g. a refund in the same category) reduce it. The sum is negated so
 * a net outflow is reported positive and a net inflow is reported negative —
 * matching the contract's `spent = -(sum of signed amounts)` definition.
 */
export function categorySpentForMonth(
  categoryId: string,
  month: string,
  transactions: Transaction[],
): number {
  let sum = 0;
  for (const tx of transactions) {
    if (tx.date.slice(0, 7) !== month) continue;
    if (tx.splits && tx.splits.length > 0) {
      for (const s of tx.splits) {
        if (s.categoryId === categoryId) sum += s.amount;
      }
    } else if (tx.categoryId === categoryId) {
      sum += tx.amount;
    }
  }
  return -sum;
}

/**
 * Compute the budget-vs-actual status for a single `budget` against the given
 * `transactions`. Pure and deterministic; no store or DB access.
 */
export function budgetStatus(
  budget: Budget,
  transactions: Transaction[],
): BudgetStatus {
  const spent = categorySpentForMonth(
    budget.categoryId,
    budget.month,
    transactions,
  );
  const limit = budget.limit;
  const remaining = limit - spent;
  const percentUsed = limit > 0 ? (spent / limit) * 100 : 0;
  const overBudget = spent > limit;
  return {
    categoryId: budget.categoryId,
    limit,
    spent,
    remaining,
    percentUsed,
    overBudget,
  };
}

/**
 * Map a list of budgets to their statuses, in input order. Pure; a thin
 * `map` over `budgetStatus` for ergonomic batch use.
 */
export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
): BudgetStatus[] {
  return budgets.map((b) => budgetStatus(b, transactions));
}
