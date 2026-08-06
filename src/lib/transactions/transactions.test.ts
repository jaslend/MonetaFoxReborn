import { describe, it, expect } from 'vitest';

import type { Transaction, TransactionSplit } from '@/lib/db/models';

import { splitSum, isSplitBalanced, SPLIT_EPSILON } from './index';

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'amount'>,
): Transaction {
  return {
    id: 't1',
    accountId: 'a1',
    date: '2026-01-15',
    currency: 'USD',
    payee: 'ACME',
    ...partial,
  };
}

describe('splitSum', () => {
  it('returns 0 for an empty array', () => {
    expect(splitSum([])).toBe(0);
  });

  it('sums signed split amounts', () => {
    const splits: TransactionSplit[] = [{ amount: -60 }, { amount: -40 }];
    expect(splitSum(splits)).toBe(-100);
  });

  it('handles a single split', () => {
    expect(splitSum([{ amount: 42.5 }])).toBe(42.5);
  });

  it('accumulates floating-point amounts', () => {
    const splits: TransactionSplit[] = [{ amount: 0.1 }, { amount: 0.2 }];
    expect(splitSum(splits)).toBeCloseTo(0.3, 10);
  });
});

describe('isSplitBalanced', () => {
  it('is trivially balanced when there are no splits', () => {
    expect(isSplitBalanced(tx({ amount: -100 }))).toBe(true);
  });

  it('is trivially balanced when splits is undefined', () => {
    expect(isSplitBalanced(tx({ amount: -100, splits: undefined }))).toBe(true);
  });

  it('is balanced when signed splits sum exactly to the parent amount', () => {
    expect(
      isSplitBalanced(
        tx({
          amount: -100,
          splits: [{ amount: -60 }, { amount: -40 }],
        }),
      ),
    ).toBe(true);
  });

  it('is balanced for inflow (positive) splits', () => {
    expect(
      isSplitBalanced(
        tx({
          amount: 250,
          splits: [{ amount: 200 }, { amount: 50 }],
        }),
      ),
    ).toBe(true);
  });

  it('is unbalanced when splits do not sum to the parent amount', () => {
    expect(
      isSplitBalanced(
        tx({
          amount: -100,
          splits: [{ amount: -60 }, { amount: -30 }],
        }),
      ),
    ).toBe(false);
  });

  it('is unbalanced when split signs disagree with the parent', () => {
    // parent is an outflow (-100) but splits are positive — wrong sign.
    expect(
      isSplitBalanced(
        tx({
          amount: -100,
          splits: [{ amount: 60 }, { amount: 40 }],
        }),
      ),
    ).toBe(false);
  });

  it('treats a zero-amount parent with zero-sum splits as balanced', () => {
    expect(
      isSplitBalanced(
        tx({
          amount: 0,
          splits: [{ amount: 0 }, { amount: 0 }],
        }),
      ),
    ).toBe(true);
  });

  it('is balanced within SPLIT_EPSILON for floating-point dust', () => {
    // 0.1 + 0.2 is not exactly 0.3 in float; epsilon tolerates the dust.
    expect(SPLIT_EPSILON).toBeLessThan(1e-2);
    expect(
      isSplitBalanced(
        tx({
          amount: 0.3,
          splits: [{ amount: 0.1 }, { amount: 0.2 }],
        }),
      ),
    ).toBe(true);
  });
});
