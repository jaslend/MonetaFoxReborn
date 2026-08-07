import { describe, it, expect } from 'vitest';

import type { ScheduledTransaction, Transaction } from '@/lib/db';

import { recentTransactions, upcomingScheduled } from './index';

function tx(
  over: Partial<Transaction> & Pick<Transaction, 'id' | 'date'>,
): Transaction {
  return {
    accountId: 'a',
    amount: -10,
    currency: 'GBP',
    payee: 'P',
    ...over,
  } as Transaction;
}

function sched(
  over: Partial<ScheduledTransaction> &
    Pick<ScheduledTransaction, 'id' | 'nextDate'>,
): ScheduledTransaction {
  return {
    recurrence: { freq: 'monthly' },
    mode: 'auto',
    template: {
      accountId: 'a',
      amount: -100,
      currency: 'GBP',
      payee: 'Rent',
    },
    ...over,
  } as ScheduledTransaction;
}

describe('recentTransactions', () => {
  it('returns the most recent N by date, newest first', () => {
    const txns = [
      tx({ id: 't1', date: '2026-01-05' }),
      tx({ id: 't2', date: '2026-03-01' }),
      tx({ id: 't3', date: '2026-02-10' }),
      tx({ id: 't4', date: '2026-02-28' }),
    ];
    expect(recentTransactions(txns, 2).map((t) => t.id)).toEqual(['t2', 't4']);
  });

  it('returns all (sorted) when the limit exceeds the count', () => {
    const txns = [
      tx({ id: 't1', date: '2026-01-05' }),
      tx({ id: 't2', date: '2026-03-01' }),
      tx({ id: 't3', date: '2026-02-10' }),
    ];
    expect(recentTransactions(txns, 10).map((t) => t.id)).toEqual([
      't2',
      't3',
      't1',
    ]);
  });

  it('does not mutate the input array', () => {
    const txns = [
      tx({ id: 't1', date: '2026-01-05' }),
      tx({ id: 't2', date: '2026-03-01' }),
    ];
    const before = txns.map((t) => t.id);
    recentTransactions(txns, 5);
    expect(txns.map((t) => t.id)).toEqual(before);
  });

  it('keeps input order for equal dates (stable)', () => {
    const txns = [
      tx({ id: 't1', date: '2026-02-10' }),
      tx({ id: 't2', date: '2026-02-10' }),
      tx({ id: 't3', date: '2026-02-10' }),
    ];
    expect(recentTransactions(txns, 5).map((t) => t.id)).toEqual([
      't1',
      't2',
      't3',
    ]);
  });

  it('returns an empty list for a non-positive or non-finite limit', () => {
    const txns = [tx({ id: 't1', date: '2026-01-01' })];
    expect(recentTransactions(txns, 0)).toEqual([]);
    expect(recentTransactions(txns, -3)).toEqual([]);
    expect(recentTransactions(txns, Number.NaN)).toEqual([]);
  });
});

describe('upcomingScheduled', () => {
  const schedules = [
    sched({ id: 's1', nextDate: '2026-02-03' }),
    sched({ id: 's2', nextDate: '2026-02-25' }),
    sched({ id: 's3', nextDate: '2026-05-01' }),
    sched({ id: 's4', nextDate: '2026-01-01' }),
  ];

  it('returns schedules due within [asOf, asOf+withinDays], soonest first', () => {
    // asOf 2026-02-01, within 30 days -> upper bound 2026-03-03.
    expect(
      upcomingScheduled(schedules, '2026-02-01', 30).map((s) => s.id),
    ).toEqual(['s1', 's2']);
  });

  it('excludes items already past or beyond the window', () => {
    const r = upcomingScheduled(schedules, '2026-02-01', 30).map((s) => s.id);
    expect(r).not.toContain('s3'); // May — too far
    expect(r).not.toContain('s4'); // Jan — already past
  });

  it('includes an item exactly on the asOf lower bound', () => {
    const s = sched({ id: 'edge', nextDate: '2026-02-01' });
    expect(upcomingScheduled([s], '2026-02-01', 30).map((x) => x.id)).toEqual([
      'edge',
    ]);
  });

  it('includes an item exactly on the asOf+withinDays upper bound', () => {
    // asOf 2026-02-01 + 30 days = 2026-03-03 (upper bound, inclusive).
    const s = sched({ id: 'edge', nextDate: '2026-03-03' });
    expect(upcomingScheduled([s], '2026-02-01', 30).map((x) => x.id)).toEqual([
      'edge',
    ]);
  });

  it('excludes an item one day beyond the upper bound', () => {
    const s = sched({ id: 'edge', nextDate: '2026-03-04' });
    expect(upcomingScheduled([s], '2026-02-01', 30)).toEqual([]);
  });

  it('sorts soonest-first and does not mutate the input', () => {
    const unordered = [
      sched({ id: 'b', nextDate: '2026-02-25' }),
      sched({ id: 'a', nextDate: '2026-02-03' }),
    ];
    const before = unordered.map((s) => s.id);
    expect(
      upcomingScheduled(unordered, '2026-02-01', 30).map((s) => s.id),
    ).toEqual(['a', 'b']);
    expect(unordered.map((s) => s.id)).toEqual(before);
  });

  it('returns an empty list for a non-positive or non-finite withinDays', () => {
    expect(upcomingScheduled(schedules, '2026-02-01', 0)).toEqual([]);
    expect(upcomingScheduled(schedules, '2026-02-01', -5)).toEqual([]);
    expect(upcomingScheduled(schedules, '2026-02-01', Number.NaN)).toEqual([]);
  });
});
