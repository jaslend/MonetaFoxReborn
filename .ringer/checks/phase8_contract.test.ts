// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 8 (scheduled txns).
// Copied into src/lib/scheduling/ by the Ringer check, run against the real
// module, then removed. Pins recurrence-date math (incl. month-end clamping)
// and the auto-vs-manual due-processing rule: a due AUTO schedule generates
// exactly one transaction and advances; a due MANUAL schedule is surfaced but
// posts nothing. Uses the existing Recurrence shape { freq, interval? }.

import { describe, it, expect } from 'vitest';

import { nextOccurrence, runDueSchedules } from './index';

describe('Phase 8 contract: recurrence date math', () => {
  it('advances by the frequency and interval', () => {
    expect(nextOccurrence('2026-02-05', { freq: 'daily' })).toBe('2026-02-06');
    expect(nextOccurrence('2026-02-05', { freq: 'weekly', interval: 2 })).toBe('2026-02-19');
    expect(nextOccurrence('2026-01-15', { freq: 'monthly' })).toBe('2026-02-15');
    expect(nextOccurrence('2026-02-15', { freq: 'monthly', interval: 3 })).toBe('2026-05-15'); // quarterly
    expect(nextOccurrence('2026-03-10', { freq: 'yearly' })).toBe('2027-03-10');
  });

  it('clamps to month end when the day does not exist in the target month', () => {
    // Jan 31 + 1 month -> Feb has no 31st; clamp to Feb 28 (2026 is not a leap year).
    expect(nextOccurrence('2026-01-31', { freq: 'monthly' })).toBe('2026-02-28');
  });
});

describe('Phase 8 contract: due processing (auto vs manual)', () => {
  const autoDue = {
    id: 's1', mode: 'auto', nextDate: '2026-02-01', recurrence: { freq: 'monthly' },
    template: { accountId: 'a1', amount: -1000, currency: 'GBP', payee: 'Landlord', categoryId: 'housing' },
  };
  const manualDue = {
    id: 's2', mode: 'manual', nextDate: '2026-02-03', recurrence: { freq: 'monthly' },
    template: { accountId: 'a1', amount: -40, currency: 'GBP', payee: 'Gym' },
  };
  const future = {
    id: 's3', mode: 'auto', nextDate: '2026-12-01', recurrence: { freq: 'monthly' },
    template: { accountId: 'a1', amount: -10, currency: 'GBP', payee: 'Later' },
  };

  it('an AUTO schedule that is due generates exactly one transaction and advances', () => {
    const r = runDueSchedules([autoDue] as never[], '2026-02-05');
    expect(r.generated.length).toBe(1);
    const { scheduleId, transaction } = r.generated[0];
    expect(scheduleId).toBe('s1');
    expect(transaction.accountId).toBe('a1');
    expect(transaction.amount).toBe(-1000);
    expect(transaction.payee).toBe('Landlord');
    expect(transaction.date).toBe('2026-02-01'); // posted for the due date
    const updated = r.updatedSchedules.find((s) => s.id === 's1');
    expect(updated?.nextDate).toBe('2026-03-01'); // advanced one period
    expect(r.pendingManual.length).toBe(0);
  });

  it('a MANUAL schedule that is due posts nothing and is surfaced as pending', () => {
    const r = runDueSchedules([manualDue] as never[], '2026-02-05');
    expect(r.generated.length).toBe(0);
    expect(r.pendingManual.map((s) => s.id)).toContain('s2');
  });

  it('a schedule not yet due does nothing', () => {
    const r = runDueSchedules([future] as never[], '2026-02-05');
    expect(r.generated.length).toBe(0);
    expect(r.pendingManual.length).toBe(0);
  });
});
