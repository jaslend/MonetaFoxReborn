/**
 * Reporting analytics for MonetaFox Reborn (Phase 10a).
 *
 * Pure, side-effect-free aggregations over the in-memory domain records. The
 * Reports page (and the later Phase 10b dashboard) compose these; the data
 * layer (`src/lib/db`) owns persistence and the currency/accounts/transactions/
 * investments helpers own the single-source-of-truth logic each report builds
 * on — this module only glues them together for reporting.
 *
 * Conventions (pinned by the Phase 10a contract):
 * - `Transaction.amount` is SIGNED (income +, expense −). Splits carry the
 *   same sign as their parent (outflow splits are negative, inflow splits
 *   positive) and MUST sum to the parent amount (see `src/lib/transactions`).
 * - Every figure is in the BASE currency. Each transaction/split is converted
 *   from its OWN currency (the transaction's `currency`) via `convertToBase`,
 *   which throws on a missing rate — the page surfaces that, the pure
 *   functions do not swallow it.
 * - SPENDING reports include ONLY outflows (expenses, i.e. negative amounts),
 *   reported as POSITIVE totals. Income (positive amounts) is therefore
 *   excluded by construction — there is no "income category" bucket in a
 *   spending report. A split line contributes to ITS OWN category (or payee),
 *   so a split transaction is never double-counted: the parent amount is not
 *   added when splits are present (splits already sum to it).
 * - `incomeVsExpenses` is split-aware too: when a transaction has splits, each
 *   split's converted amount is bucketed (positive → income, |negative| →
 *   expenses); otherwise the parent amount is bucketed. For the common case
 *   (all splits share the parent's sign) this is identical to using the parent.
 * - `netWorth` = Σ live account balances converted to base (via
 *   `netWorthInBase`, which excludes archived accounts) PLUS the investment
 *   portfolio value (`portfolioValue`, already in the base currency since
 *   prices are stored as plain base-currency numbers).
 * - `netWorthOverTime` evaluates net worth at EACH `asOf` date using ONLY
 *   transactions dated `<= asOf` and prices dated `<= asOf` (holdings carry
 *   no date, so all holdings are valued at every point). Each point's value
 *   is `netWorthInBase(accounts, txns<=asOf, …) + portfolioValue(holdings,
 *   prices<=asOf)`. Results are returned in the order of `asOfDates`.
 */
import type { Account, Holding, PricePoint, Transaction } from '@/lib/db';
import { convertToBase } from '@/lib/currency';
import { netWorthInBase } from '@/lib/accounts';
import { portfolioValue } from '@/lib/investments';

/** A category total from a spending report (positive, base currency). */
export interface CategoryTotal {
  categoryId: string;
  total: number;
}

/** A payee total from a spending report (positive, base currency). */
export interface PayeeTotal {
  payee: string;
  total: number;
}

/** Net-worth series point. */
export interface NetWorthPoint {
  date: string;
  value: number;
}

/**
 * Iterate a transaction's money lines split-aware: when `splits` are present
 * each split is one (amount, categoryId) line; otherwise the parent amount is
 * the single (amount, categoryId) line. The `currency` for every line is the
 * transaction's own currency (splits inherit it).
 */
function moneyLines(
  tx: Transaction,
): { amount: number; categoryId?: string; currency: string }[] {
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.map((s) => ({
      amount: s.amount,
      categoryId: s.categoryId,
      currency: tx.currency,
    }));
  }
  return [
    { amount: tx.amount, categoryId: tx.categoryId, currency: tx.currency },
  ];
}

/**
 * Spending by category — split-aware, expenses only (outflows), positive base
 * totals. Income (positive amounts) is excluded by the outflow filter; a split
 * line contributes to its own `categoryId`. Lines with no `categoryId` (and a
 * blank payee) are skipped — no empty-string bucket is ever created, matching
 * `categoryTotals`. Results are in encounter order (first appearance of each
 * category). Throws on a missing FX rate (via `convertToBase`).
 */
export function spendingByCategory(
  transactions: Transaction[],
  base: string,
  rates: Record<string, number>,
): CategoryTotal[] {
  const totals: Record<string, number> = {};
  for (const tx of transactions) {
    for (const line of moneyLines(tx)) {
      if (line.amount >= 0) continue; // outflows only (expenses)
      if (!line.categoryId) continue;
      const converted = convertToBase(
        Math.abs(line.amount),
        line.currency,
        base,
        rates,
      );
      totals[line.categoryId] = (totals[line.categoryId] ?? 0) + converted;
    }
  }
  return Object.entries(totals).map(([categoryId, total]) => ({
    categoryId,
    total,
  }));
}

/**
 * Spending by payee — expenses only (outflows), positive base totals. A split
 * transaction attributes each outflow split to the parent's `payee` (splits
 * have no payee of their own). Payees that are empty/whitespace are skipped so
 * a blank label never appears. Results are in encounter order. Throws on a
 * missing FX rate (via `convertToBase`).
 */
export function spendingByPayee(
  transactions: Transaction[],
  base: string,
  rates: Record<string, number>,
): PayeeTotal[] {
  const totals: Record<string, number> = {};
  for (const tx of transactions) {
    const payee = (tx.payee ?? '').trim();
    if (!payee) continue;
    for (const line of moneyLines(tx)) {
      if (line.amount >= 0) continue; // outflows only
      const converted = convertToBase(
        Math.abs(line.amount),
        line.currency,
        base,
        rates,
      );
      totals[payee] = (totals[payee] ?? 0) + converted;
    }
  }
  return Object.entries(totals).map(([payee, total]) => ({ payee, total }));
}

/**
 * Income vs expenses — split-aware, in the base currency.
 *
 * For each money line (split line when splits exist, else the parent amount):
 * the converted value is added to `income` when positive, or its absolute
 * value to `expenses` when negative. `net = income − expenses`. For the
 * common case where all splits share the parent's sign, this is identical to
 * bucketing the parent amount. Throws on a missing FX rate.
 */
export function incomeVsExpenses(
  transactions: Transaction[],
  base: string,
  rates: Record<string, number>,
): { income: number; expenses: number; net: number } {
  let income = 0;
  let expenses = 0;
  for (const tx of transactions) {
    for (const line of moneyLines(tx)) {
      const converted = convertToBase(line.amount, line.currency, base, rates);
      if (converted >= 0) {
        income += converted;
      } else {
        expenses += Math.abs(converted);
      }
    }
  }
  return { income, expenses, net: income - expenses };
}

/**
 * Net worth in the base currency: Σ live (non-archived) account balances
 * converted to base (via `netWorthInBase`) PLUS the investment portfolio value
 * (`portfolioValue`, already in base). Throws on a missing account FX rate.
 */
export function netWorth(
  accounts: Account[],
  transactions: Transaction[],
  holdings: Holding[],
  prices: PricePoint[],
  base: string,
  rates: Record<string, number>,
): number {
  return (
    netWorthInBase(accounts, transactions, base, rates) +
    portfolioValue(holdings, prices)
  );
}

/**
 * Net worth over time: for each `asOf` date, evaluate net worth using ONLY
 * transactions dated `<= asOf` and prices dated `<= asOf` (holdings carry no
 * date, so every holding is valued at every point with the latest price known
 * on or before `asOf`). Each point's value is `netWorthInBase(accounts,
 * txns<=asOf, …) + portfolioValue(holdings, prices<=asOf)`. Results follow the
 * order of `asOfDates`. Throws on a missing account FX rate at any point.
 */
export function netWorthOverTime(
  accounts: Account[],
  transactions: Transaction[],
  holdings: Holding[],
  prices: PricePoint[],
  base: string,
  rates: Record<string, number>,
  asOfDates: string[],
): NetWorthPoint[] {
  return asOfDates.map((date) => {
    const txns = transactions.filter((t) => t.date <= date);
    const px = prices.filter((p) => p.date <= date);
    return {
      date,
      value:
        netWorthInBase(accounts, txns, base, rates) +
        portfolioValue(holdings, px),
    };
  });
}
