/**
 * Account balance + net-worth helpers for MonetaFox Reborn (Phase 4).
 *
 * Sign convention (pinned by the Phase 4 contract):
 * - `Transaction.amount` is SIGNED: positive = inflow, negative = outflow.
 * - An account's balance is `openingBalance + Σ signed amounts of that
 *   account's transactions`, expressed in the account's OWN currency. We never
 *   convert at storage time — amounts stay in their original currency and only
 *   `netWorthInBase` (and later reports) convert for reporting.
 *
 * FX convention (see ../currency): `rates[currency] = <base units> per 1 unit of
 * <currency>`; converting the base currency to itself is the identity; a
 * missing rate THROWS (surfaced by `convertToBase`).
 */

import type { Account, Transaction } from '@/lib/db';
import { convertToBase } from '@/lib/currency';

/**
 * Compute an account's balance in its OWN currency.
 *
 * `openingBalance` (defaults to 0 when unset) plus the sum of the signed
 * `amount` of every transaction whose `accountId` matches. Archived accounts
 * still have a balance — `netWorthInBase` is what excludes them.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
): number {
  const opening = account.openingBalance ?? 0;
  let sum = 0;
  for (const tx of transactions) {
    if (tx.accountId === account.id) sum += tx.amount;
  }
  return opening + sum;
}

/**
 * Compute net worth in the base currency: the sum over all NON-archived
 * accounts of `convertToBase(accountBalance(acc), acc.currency, base, rates)`.
 *
 * Archived accounts are excluded (they're closed and no longer part of net
 * worth). If any live account's currency differs from `base` and has no rate,
 * `convertToBase` throws — callers should catch and prompt the user to set the
 * missing rate rather than reporting a wrong total.
 */
export function netWorthInBase(
  accounts: Account[],
  transactions: Transaction[],
  base: string,
  rates: Record<string, number>,
): number {
  let total = 0;
  for (const acc of accounts) {
    if (acc.archived) continue;
    total += convertToBase(
      accountBalance(acc, transactions),
      acc.currency,
      base,
      rates,
    );
  }
  return total;
}
