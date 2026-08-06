import { describe, it, expect } from 'vitest';

import type { Transaction } from '@/lib/db/models';

import {
  filterTransactions,
  searchTransactions,
  categoryTotals,
  matchesFilter,
  type TransactionFilter,
} from './index';

function tx(
  partial: Partial<Transaction> & Pick<Transaction, 'id' | 'amount'>,
): Transaction {
  return {
    accountId: 'a1',
    date: '2026-02-10',
    currency: 'GBP',
    payee: 'ACME',
    ...partial,
  };
}

const sample: Transaction[] = [
  tx({
    id: 't1',
    accountId: 'a1',
    date: '2026-01-05',
    payee: 'Tesco',
    categoryId: 'food',
    amount: -20,
    cleared: true,
    tags: ['groceries'],
  }),
  tx({
    id: 't2',
    accountId: 'a1',
    date: '2026-02-10',
    payee: 'Amazon',
    categoryId: 'shop',
    amount: -50,
    cleared: false,
    tags: ['gift', 'online'],
    splits: [
      { categoryId: 'shop', amount: -30 },
      { categoryId: 'gifts', amount: -20 },
    ],
  }),
  tx({
    id: 't3',
    accountId: 'a2',
    date: '2026-03-01',
    payee: 'Salary Inc',
    amount: 2000,
    cleared: true,
    tags: ['income'],
    notes: 'monthly salary',
  }),
];

const ids = (r: Transaction[]) => r.map((t) => t.id).sort();

describe('filterTransactions', () => {
  it('an empty filter returns everything (in input order)', () => {
    expect(filterTransactions(sample, {}).map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
  });

  it('filters by account (exact)', () => {
    expect(ids(filterTransactions(sample, { accountId: 'a2' }))).toEqual([
      't3',
    ]);
  });

  it('date range is inclusive on both ends', () => {
    expect(
      ids(
        filterTransactions(sample, {
          dateFrom: '2026-02-10',
          dateTo: '2026-02-10',
        }),
      ),
    ).toEqual(['t2']);
    expect(
      ids(
        filterTransactions(sample, {
          dateFrom: '2026-01-05',
          dateTo: '2026-03-01',
        }),
      ),
    ).toEqual(['t1', 't2', 't3']);
    expect(
      ids(
        filterTransactions(sample, {
          dateFrom: '2026-02-11',
          dateTo: '2026-02-28',
        }),
      ),
    ).toEqual([]);
  });

  it('filters by category on the parent categoryId', () => {
    expect(ids(filterTransactions(sample, { categoryId: 'food' }))).toEqual([
      't1',
    ]);
  });

  it('filters by category on a SPLIT categoryId (not the parent)', () => {
    // t2.parent categoryId is 'shop'; 'gifts' only appears on a split line.
    expect(ids(filterTransactions(sample, { categoryId: 'gifts' }))).toEqual([
      't2',
    ]);
  });

  it('a category that is BOTH the parent and a split still matches once', () => {
    expect(ids(filterTransactions(sample, { categoryId: 'shop' }))).toEqual([
      't2',
    ]);
  });

  it('filters by payee case-insensitively as a substring', () => {
    expect(ids(filterTransactions(sample, { payee: 'tesc' }))).toEqual(['t1']);
    expect(ids(filterTransactions(sample, { payee: 'AMAZ' }))).toEqual(['t2']);
    expect(ids(filterTransactions(sample, { payee: 'zzz' }))).toEqual([]);
  });

  it('filters by cleared (exact, treating unset as false)', () => {
    expect(ids(filterTransactions(sample, { cleared: true }))).toEqual([
      't1',
      't3',
    ]);
    expect(ids(filterTransactions(sample, { cleared: false }))).toEqual(['t2']);
  });

  it('filters by reconciled (exact, treating unset as false)', () => {
    expect(ids(filterTransactions(sample, { reconciled: false }))).toEqual([
      't1',
      't2',
      't3',
    ]);
    expect(ids(filterTransactions(sample, { reconciled: true }))).toEqual([]);
  });

  it('tags filter requires ALL given tags (intersection, order-independent)', () => {
    expect(ids(filterTransactions(sample, { tags: ['online'] }))).toEqual([
      't2',
    ]);
    expect(
      ids(filterTransactions(sample, { tags: ['gift', 'online'] })),
    ).toEqual(['t2']);
    expect(
      ids(filterTransactions(sample, { tags: ['gift', 'missing'] })),
    ).toEqual([]);
  });

  it('combines multiple fields (AND)', () => {
    expect(
      ids(filterTransactions(sample, { accountId: 'a1', cleared: false })),
    ).toEqual(['t2']);
    expect(
      ids(filterTransactions(sample, { accountId: 'a1', categoryId: 'gifts' })),
    ).toEqual(['t2']);
  });

  it('does not mutate the input array', () => {
    const copy = [...sample];
    filterTransactions(sample, { accountId: 'a1' });
    expect(sample.map((t) => t.id)).toEqual(copy.map((t) => t.id));
  });
});

describe('matchesFilter', () => {
  it('returns true for the empty filter', () => {
    for (const t of sample) expect(matchesFilter(t, {})).toBe(true);
  });
  it('respects each field independently', () => {
    const f: TransactionFilter = {
      accountId: 'a1',
      dateFrom: '2026-02-01',
      payee: 'am',
    };
    expect(matchesFilter(sample[1], f)).toBe(true);
    expect(matchesFilter(sample[0], f)).toBe(false); // date too early
  });
});

describe('searchTransactions', () => {
  it('an empty query returns everything', () => {
    expect(searchTransactions(sample, '').map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
  });
  it('a whitespace-only query returns everything', () => {
    expect(searchTransactions(sample, '   ').map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
  });
  it('matches payee case-insensitively', () => {
    expect(ids(searchTransactions(sample, 'salary'))).toEqual(['t3']);
  });
  it('matches notes', () => {
    expect(ids(searchTransactions(sample, 'monthly'))).toEqual(['t3']);
  });
  it('matches a tag', () => {
    expect(ids(searchTransactions(sample, 'grocer'))).toEqual(['t1']);
    expect(ids(searchTransactions(sample, 'gift'))).toEqual(['t2']);
  });
  it('matches nothing for an unknown term', () => {
    expect(searchTransactions(sample, 'zzzz')).toEqual([]);
  });
  it('does not mutate the input', () => {
    const before = sample.map((t) => t.id);
    searchTransactions(sample, 'a');
    expect(sample.map((t) => t.id)).toEqual(before);
  });
});

describe('categoryTotals', () => {
  it('allocates non-split amounts to their categoryId', () => {
    const totals = categoryTotals([
      tx({ id: 'x', categoryId: 'food', amount: -20 }),
    ]);
    expect(totals.food).toBe(-20);
  });

  it('allocates split lines to their own categories (NOT the parent amount)', () => {
    const t = tx({
      id: 'x',
      categoryId: 'shop',
      amount: -50,
      splits: [
        { categoryId: 'shop', amount: -30 },
        { categoryId: 'gifts', amount: -20 },
      ],
    });
    const totals = categoryTotals([t]);
    expect(totals.shop).toBe(-30); // split line only — the -50 parent is NOT added
    expect(totals.gifts).toBe(-20);
  });

  it('matches the Phase 5b contract sample exactly', () => {
    const totals = categoryTotals(sample);
    expect(totals.food).toBe(-20); // t1
    expect(totals.shop).toBe(-30); // t2 split line
    expect(totals.gifts).toBe(-20); // t2 split line
    // t3 has no category -> no bucket, and never an empty-string bucket.
    expect(totals[''] ?? 0).toBe(0);
    expect('income' in totals).toBe(false); // t3's tag must not become a bucket
  });

  it('skips a split line with no categoryId (no empty bucket)', () => {
    const t = tx({
      id: 'x',
      amount: -50,
      splits: [{ amount: -30, categoryId: 'a' }, { amount: -20 }],
    });
    const totals = categoryTotals([t]);
    expect(totals.a).toBe(-30);
    expect(totals[''] ?? 0).toBe(0);
  });

  it('skips a non-split transaction with no categoryId', () => {
    const t = tx({ id: 'x', amount: 100 }); // no categoryId
    const totals = categoryTotals([t]);
    expect(totals).toEqual({});
  });

  it('accumulates across transactions', () => {
    const txns = [
      tx({ id: '1', categoryId: 'food', amount: -10 }),
      tx({ id: '2', categoryId: 'food', amount: -5 }),
      tx({ id: '3', categoryId: 'food', amount: 100 }),
    ];
    expect(categoryTotals(txns).food).toBe(85);
  });
});
