// @vitest-environment node

import { describe, it, expect } from 'vitest';

import type { Budget, Transaction } from '@/lib/db/models';

import { budgetStatus, budgetStatuses, categorySpentForMonth } from './index';

const near = (a: number, b: number) =>
  expect(Math.abs(a - b)).toBeLessThan(1e-6);

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'amount'>,
): Transaction {
  return {
    accountId: 'a',
    currency: 'GBP',
    payee: 'ACME',
    ...partial,
  } as Transaction;
}

const TXNS: Transaction[] = [
  tx({ id: 't1', date: '2026-02-05', categoryId: 'food', amount: -50 }),
  tx({ id: 't2', date: '2026-02-20', categoryId: 'food', amount: -30 }),
  tx({ id: 't3', date: '2026-01-15', categoryId: 'food', amount: -999 }),
  tx({
    id: 't4',
    date: '2026-02-10',
    amount: -40,
    splits: [
      { categoryId: 'food', amount: -25 },
      { categoryId: 'fun', amount: -15 },
    ],
  }),
  tx({ id: 't5', date: '2026-02-28', categoryId: 'food', amount: 12 }), // refund
];

const FOOD_BUDGET = (limit: number, month = '2026-02'): Budget => ({
  id: 'b',
  categoryId: 'food',
  month,
  limit,
});

describe('categorySpentForMonth', () => {
  it('sums the category outflow for the month (split-aware) and returns a positive figure', () => {
    // 50 + 30 + 25 (split) - 12 (refund) = 93 outflow => spent = 93
    near(categorySpentForMonth('food', '2026-02', TXNS), 93);
  });

  it('excludes transactions outside the budget month', () => {
    near(categorySpentForMonth('food', '2026-01', TXNS), 999);
    near(categorySpentForMonth('food', '2026-03', TXNS), 0);
  });

  it('counts a split line only on its own categoryId, not the parent', () => {
    near(categorySpentForMonth('fun', '2026-02', TXNS), 15);
  });

  it('skips a non-split transaction whose categoryId does not match', () => {
    near(categorySpentForMonth('unknown', '2026-02', TXNS), 0);
  });
});

describe('budgetStatus', () => {
  it('computes spent/remaining/percentUsed/overBudget per the contract', () => {
    const s = budgetStatus(FOOD_BUDGET(200), TXNS);
    near(s.spent, 93);
    near(s.limit, 200);
    near(s.remaining, 107);
    near(s.percentUsed, 46.5);
    expect(s.overBudget).toBe(false);
    expect(s.categoryId).toBe('food');
  });

  it('flags over-budget with a negative remaining', () => {
    const s = budgetStatus(FOOD_BUDGET(50), TXNS);
    near(s.spent, 93);
    near(s.remaining, -43);
    near(s.percentUsed, 186);
    expect(s.overBudget).toBe(true);
  });

  it('reports zero spend and full remaining for a category with no activity', () => {
    const s = budgetStatus(
      { id: 'b', categoryId: 'fun', month: '2026-03', limit: 50 },
      TXNS,
    );
    near(s.spent, 0);
    near(s.remaining, 50);
    near(s.percentUsed, 0);
    expect(s.overBudget).toBe(false);
  });

  it('treats a zero/positive-spent budget as not over-budget when spent <= limit', () => {
    const s = budgetStatus(FOOD_BUDGET(1000, '2026-01'), TXNS);
    near(s.spent, 999);
    expect(s.overBudget).toBe(false);
  });

  it('returns percentUsed 0 when limit is 0 (even if spent > 0)', () => {
    const s = budgetStatus(FOOD_BUDGET(0), TXNS);
    near(s.percentUsed, 0);
    // spent > 0 with limit 0 is still "over budget"
    expect(s.overBudget).toBe(true);
  });

  it('does not double-count the parent of a split transaction', () => {
    const s = budgetStatus(FOOD_BUDGET(1, '2026-02'), TXNS);
    // t4's parent (-40) must NOT be counted; only the -25 food split line.
    near(s.spent, 93);
  });
});

describe('budgetStatuses', () => {
  it('maps a list of budgets to statuses in input order', () => {
    const rows = budgetStatuses(
      [
        FOOD_BUDGET(200, '2026-02'),
        { id: 'b2', categoryId: 'fun', month: '2026-02', limit: 20 },
      ],
      TXNS,
    );
    expect(rows.length).toBe(2);
    near(rows[0].spent, 93);
    near(rows[1].spent, 15);
    expect(rows[1].overBudget).toBe(false);
  });

  it('returns an empty list for no budgets', () => {
    expect(budgetStatuses([], TXNS)).toEqual([]);
  });
});
