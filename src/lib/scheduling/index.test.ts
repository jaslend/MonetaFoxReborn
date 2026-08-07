import { describe, it, expect, vi } from 'vitest';

import type { Recurrence, ScheduledTransaction } from '@/lib/db';

import {
  nextOccurrence,
  isDue,
  generateFromSchedule,
  advanceSchedule,
  runDueSchedules,
} from './index';

const DAILY: Recurrence = { freq: 'daily' };
const WEEKLY: Recurrence = { freq: 'weekly' };
const MONTHLY: Recurrence = { freq: 'monthly' };
const YEARLY: Recurrence = { freq: 'yearly' };

function schedule(
  over: Partial<ScheduledTransaction> &
    Pick<ScheduledTransaction, 'nextDate' | 'mode'>,
): ScheduledTransaction {
  return {
    id: over.id ?? 's1',
    recurrence: over.recurrence ?? MONTHLY,
    nextDate: over.nextDate,
    mode: over.mode,
    template: over.template ?? {
      accountId: 'acc1',
      amount: -100,
      currency: 'USD',
      payee: 'Landlord',
    },
  };
}

describe('nextOccurrence', () => {
  it('advances a daily schedule by interval days (default 1)', () => {
    expect(nextOccurrence('2026-01-15', DAILY)).toBe('2026-01-16');
    expect(nextOccurrence('2026-01-15', { freq: 'daily', interval: 3 })).toBe(
      '2026-01-18',
    );
  });

  it('advances a weekly schedule by interval*7 days', () => {
    expect(nextOccurrence('2026-01-15', WEEKLY)).toBe('2026-01-22');
    expect(nextOccurrence('2026-01-15', { freq: 'weekly', interval: 2 })).toBe(
      '2026-01-29',
    );
  });

  it('advances a monthly schedule by interval months', () => {
    expect(nextOccurrence('2026-01-15', MONTHLY)).toBe('2026-02-15');
    expect(nextOccurrence('2026-01-15', { freq: 'monthly', interval: 3 })).toBe(
      '2026-04-15',
    );
  });

  it('clamps to month end when the day does not exist (Jan 31 + 1m -> Feb 28)', () => {
    expect(nextOccurrence('2026-01-31', MONTHLY)).toBe('2026-02-28');
    expect(nextOccurrence('2026-03-31', MONTHLY)).toBe('2026-04-30');
  });

  it('respects leap years for Feb 29 clamp', () => {
    // 2024 is a leap year: Jan 31 + 1m -> Feb 29.
    expect(nextOccurrence('2024-01-31', MONTHLY)).toBe('2024-02-29');
    // 2026 is not: Jan 31 + 1m -> Feb 28.
    expect(nextOccurrence('2026-01-31', MONTHLY)).toBe('2026-02-28');
  });

  it('rolls over the year boundary for monthly', () => {
    expect(nextOccurrence('2026-12-15', MONTHLY)).toBe('2027-01-15');
    expect(nextOccurrence('2026-12-31', MONTHLY)).toBe('2027-01-31');
  });

  it('quarterly = monthly interval 3', () => {
    expect(nextOccurrence('2026-01-31', { freq: 'monthly', interval: 3 })).toBe(
      '2026-04-30',
    );
  });

  it('advances a yearly schedule by interval years', () => {
    expect(nextOccurrence('2026-01-15', YEARLY)).toBe('2027-01-15');
    expect(nextOccurrence('2026-01-15', { freq: 'yearly', interval: 2 })).toBe(
      '2028-01-15',
    );
  });

  it('clamps Feb 29 yearly into Feb 28 of a non-leap year', () => {
    // 2024-02-29 + 1 year -> 2025-02-28 (2025 is not a leap year).
    expect(nextOccurrence('2024-02-29', YEARLY)).toBe('2025-02-28');
    // + 4 years lands on a leap year, so it stays Feb 29.
    expect(nextOccurrence('2024-02-29', { freq: 'yearly', interval: 4 })).toBe(
      '2028-02-29',
    );
  });

  it('throws on a malformed date', () => {
    expect(() => nextOccurrence('2026/01/15', MONTHLY)).toThrow();
    expect(() => nextOccurrence('not-a-date', MONTHLY)).toThrow();
  });
});

describe('isDue', () => {
  it('is due when nextDate <= asOf', () => {
    expect(
      isDue(schedule({ nextDate: '2026-01-15', mode: 'auto' }), '2026-01-15'),
    ).toBe(true);
    expect(
      isDue(schedule({ nextDate: '2026-01-15', mode: 'auto' }), '2026-01-16'),
    ).toBe(true);
  });

  it('is not due when nextDate > asOf', () => {
    expect(
      isDue(schedule({ nextDate: '2026-01-16', mode: 'auto' }), '2026-01-15'),
    ).toBe(false);
  });

  it('respects an inclusive endDate', () => {
    const s = schedule({
      nextDate: '2026-01-15',
      mode: 'auto',
      recurrence: { freq: 'monthly', endDate: '2026-01-15' },
    });
    expect(isDue(s, '2026-02-01')).toBe(true); // nextDate == endDate, inclusive
    const past = schedule({
      nextDate: '2026-02-15',
      mode: 'auto',
      recurrence: { freq: 'monthly', endDate: '2026-01-15' },
    });
    expect(isDue(past, '2026-03-01')).toBe(false); // nextDate > endDate
  });

  it('treats a missing endDate as unbounded', () => {
    expect(
      isDue(schedule({ nextDate: '2026-01-15', mode: 'auto' }), '2030-01-01'),
    ).toBe(true);
  });
});

describe('generateFromSchedule', () => {
  it('builds a Transaction dated at nextDate with the signed amount', () => {
    const s = schedule({
      id: 's1',
      nextDate: '2026-02-01',
      mode: 'auto',
      template: {
        accountId: 'acc1',
        amount: -250,
        currency: 'GBP',
        payee: 'Landlord',
        categoryId: 'cat1',
        notes: 'Rent',
        type: 'expense',
      },
    });
    const tx = generateFromSchedule(s, 'fixed-id');
    expect(tx).toEqual({
      id: 'fixed-id',
      accountId: 'acc1',
      date: '2026-02-01',
      amount: -250,
      currency: 'GBP',
      payee: 'Landlord',
      categoryId: 'cat1',
      notes: 'Rent',
      type: 'expense',
    });
  });

  it('uses crypto.randomUUID when no id is provided', () => {
    const fixed = '00000000-0000-4000-8000-000000000000';
    const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(fixed);
    const tx = generateFromSchedule(
      schedule({ nextDate: '2026-02-01', mode: 'auto' }),
    );
    expect(tx.id).toBe(fixed);
    uuidSpy.mockRestore();
  });

  it('omits optional fields when the template omits them', () => {
    const tx = generateFromSchedule(
      schedule({
        nextDate: '2026-02-01',
        mode: 'auto',
        template: {
          accountId: 'acc1',
          amount: 50,
          currency: 'USD',
          payee: 'Refund',
        },
      }),
      'x',
    );
    expect(tx.categoryId).toBeUndefined();
    expect(tx.notes).toBeUndefined();
    expect(tx.type).toBeUndefined();
  });
});

describe('advanceSchedule', () => {
  it('returns a copy with nextDate advanced by one period', () => {
    const s = schedule({
      nextDate: '2026-01-31',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const advanced = advanceSchedule(s);
    expect(advanced.nextDate).toBe('2026-02-28');
    expect(advanced).not.toBe(s);
    expect(s.nextDate).toBe('2026-01-31'); // original untouched
  });
});

describe('runDueSchedules', () => {
  it('generates exactly one transaction per due AUTO schedule and advances it', () => {
    const auto = schedule({
      id: 'auto1',
      nextDate: '2026-01-15',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const res = runDueSchedules([auto], '2026-02-01');
    expect(res.generated).toHaveLength(1);
    expect(res.generated[0].scheduleId).toBe('auto1');
    expect(res.generated[0].transaction.date).toBe('2026-01-15');
    expect(res.generated[0].transaction.amount).toBe(-100);
    expect(res.updatedSchedules[0].nextDate).toBe('2026-02-15');
    expect(res.pendingManual).toEqual([]);
  });

  it('surfaces due MANUAL schedules as pending and does NOT advance them', () => {
    const manual = schedule({
      id: 'm1',
      nextDate: '2026-01-15',
      mode: 'manual',
      recurrence: MONTHLY,
    });
    const res = runDueSchedules([manual], '2026-02-01');
    expect(res.generated).toEqual([]);
    expect(res.pendingManual).toEqual([manual]);
    expect(res.updatedSchedules[0].nextDate).toBe('2026-01-15'); // unchanged
  });

  it('leaves non-due schedules untouched in updatedSchedules', () => {
    const future = schedule({
      id: 'fut',
      nextDate: '2026-03-15',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const res = runDueSchedules([future], '2026-02-01');
    expect(res.generated).toEqual([]);
    expect(res.pendingManual).toEqual([]);
    expect(res.updatedSchedules).toEqual([future]);
    expect(res.updatedSchedules[0].nextDate).toBe('2026-03-15');
  });

  it('mixes auto, manual, and non-due schedules preserving order', () => {
    const auto = schedule({
      id: 'a',
      nextDate: '2026-01-10',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const manual = schedule({
      id: 'm',
      nextDate: '2026-01-12',
      mode: 'manual',
      recurrence: MONTHLY,
    });
    const future = schedule({
      id: 'f',
      nextDate: '2026-03-01',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const res = runDueSchedules([auto, manual, future], '2026-01-15');
    expect(res.generated.map((g) => g.scheduleId)).toEqual(['a']);
    expect(res.pendingManual.map((p) => p.id)).toEqual(['m']);
    // updatedSchedules preserves input order; auto advanced, manual + future unchanged.
    expect(res.updatedSchedules.map((s) => s.id)).toEqual(['a', 'm', 'f']);
    expect(res.updatedSchedules[0].nextDate).toBe('2026-02-10');
    expect(res.updatedSchedules[1].nextDate).toBe('2026-01-12');
    expect(res.updatedSchedules[2].nextDate).toBe('2026-03-01');
  });

  it('respects endDate: an expired AUTO schedule is not due and not generated', () => {
    const expired = schedule({
      id: 'exp',
      nextDate: '2026-02-15',
      mode: 'auto',
      recurrence: { freq: 'monthly', endDate: '2026-01-15' },
    });
    const res = runDueSchedules([expired], '2026-03-01');
    expect(res.generated).toEqual([]);
    expect(res.pendingManual).toEqual([]);
    expect(res.updatedSchedules).toEqual([expired]);
  });

  it('does not mutate the input array or its schedule objects', () => {
    const auto = schedule({
      id: 'a',
      nextDate: '2026-01-15',
      mode: 'auto',
      recurrence: MONTHLY,
    });
    const input = [auto];
    runDueSchedules(input, '2026-02-01');
    expect(input).toHaveLength(1);
    expect(auto.nextDate).toBe('2026-01-15');
  });
});
