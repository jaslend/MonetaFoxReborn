// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 10b (dashboard).
// Copied into src/lib/dashboard/ by the Ringer check, run against the real
// module, then removed. Pins the two deterministic dashboard selectors:
// most-recent transactions, and upcoming scheduled items within a window.

import { describe, it, expect } from 'vitest';

import { recentTransactions, upcomingScheduled } from './index';

const txns = [
  { id: 't1', accountId: 'a', date: '2026-01-05', amount: -10, currency: 'GBP', payee: 'A' },
  { id: 't2', accountId: 'a', date: '2026-03-01', amount: -20, currency: 'GBP', payee: 'B' },
  { id: 't3', accountId: 'a', date: '2026-02-10', amount: -30, currency: 'GBP', payee: 'C' },
  { id: 't4', accountId: 'a', date: '2026-02-28', amount: -40, currency: 'GBP', payee: 'D' },
] as never[];

describe('Phase 10b contract: recent transactions', () => {
  it('returns the most recent N by date, newest first', () => {
    const r = recentTransactions(txns, 2);
    expect(r.map((t) => t.id)).toEqual(['t2', 't4']); // Mar 1, then Feb 28
  });

  it('returns all (sorted) when the limit exceeds the count', () => {
    expect(recentTransactions(txns, 10).map((t) => t.id)).toEqual(['t2', 't4', 't3', 't1']);
  });
});

describe('Phase 10b contract: upcoming scheduled ("upcoming bills")', () => {
  const schedules = [
    { id: 's1', mode: 'auto', nextDate: '2026-02-03', recurrence: { freq: 'monthly' }, template: { accountId: 'a', amount: -100, currency: 'GBP', payee: 'Rent' } },
    { id: 's2', mode: 'manual', nextDate: '2026-02-25', recurrence: { freq: 'monthly' }, template: { accountId: 'a', amount: -40, currency: 'GBP', payee: 'Gym' } },
    { id: 's3', mode: 'auto', nextDate: '2026-05-01', recurrence: { freq: 'monthly' }, template: { accountId: 'a', amount: -10, currency: 'GBP', payee: 'Later' } },
    { id: 's4', mode: 'auto', nextDate: '2026-01-01', recurrence: { freq: 'monthly' }, template: { accountId: 'a', amount: -5, currency: 'GBP', payee: 'Past' } },
  ] as never[];

  it('returns schedules due within the window [asOf, asOf+withinDays], soonest first', () => {
    // asOf 2026-02-01, within 30 days -> up to 2026-03-03: s1 (Feb 3), s2 (Feb 25).
    const r = upcomingScheduled(schedules, '2026-02-01', 30);
    expect(r.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('excludes items outside the window (already past or too far out)', () => {
    const r = upcomingScheduled(schedules, '2026-02-01', 30);
    expect(r.map((s) => s.id)).not.toContain('s3'); // May
    expect(r.map((s) => s.id)).not.toContain('s4'); // Jan (past)
  });
});
