// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 6 (budgets).
// Copied into src/lib/budgets/ by the Ringer check, run against the real
// module, then removed. Pins budget-vs-actual math: spending for a category is
// scoped to the budget's month, respects split lines, and (since amounts are
// SIGNED with expenses negative) is reported as a positive "spent" figure.

import { describe, it, expect } from 'vitest';

import { budgetStatus, budgetStatuses } from './index';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

const txns = [
  { id: 't1', accountId: 'a', date: '2026-02-05', categoryId: 'food', amount: -50, currency: 'GBP' },
  { id: 't2', accountId: 'a', date: '2026-02-20', categoryId: 'food', amount: -30, currency: 'GBP' },
  { id: 't3', accountId: 'a', date: '2026-01-15', categoryId: 'food', amount: -999, currency: 'GBP' }, // Jan — excluded
  { id: 't4', accountId: 'a', date: '2026-02-10', amount: -40, currency: 'GBP',
    splits: [{ categoryId: 'food', amount: -25 }, { categoryId: 'fun', amount: -15 }] },
] as never[];

describe('Phase 6 contract: budget vs actual', () => {
  it('sums the category spend for the budget month, including split lines, as a positive figure', () => {
    // Feb food: 50 + 30 + 25 (split) = 105 ; the Jan -999 is out of scope.
    const s = budgetStatus({ id: 'b1', categoryId: 'food', month: '2026-02', limit: 200 } as never, txns);
    near(s.spent, 105);
    near(s.limit, 200);
    near(s.remaining, 95);
    near(s.percentUsed, 52.5);
    expect(s.overBudget).toBe(false);
  });

  it('flags over-budget and a negative remaining', () => {
    const s = budgetStatus({ id: 'b2', categoryId: 'food', month: '2026-02', limit: 100 } as never, txns);
    near(s.spent, 105);
    near(s.remaining, -5);
    expect(s.overBudget).toBe(true);
  });

  it('reports zero spend for a category with no activity that month', () => {
    const s = budgetStatus({ id: 'b3', categoryId: 'fun', month: '2026-03', limit: 50 } as never, txns);
    near(s.spent, 0);
    near(s.remaining, 50);
    expect(s.overBudget).toBe(false);
  });

  it('maps a list of budgets to their statuses', () => {
    const rows = budgetStatuses(
      [
        { id: 'b1', categoryId: 'food', month: '2026-02', limit: 200 },
        { id: 'b4', categoryId: 'fun', month: '2026-02', limit: 20 },
      ] as never,
      txns,
    );
    expect(rows.length).toBe(2);
    near(rows[0].spent, 105);
    near(rows[1].spent, 15); // the fun split line
    expect(rows[1].overBudget).toBe(false);
  });
});
