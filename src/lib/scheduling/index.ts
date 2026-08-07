/**
 * Scheduled-transaction scheduling core (Phase 8).
 *
 * Pure, side-effect-free helpers that materialise recurring transactions and
 * decide which schedules are due as of a given date. The store
 * (`src/stores/scheduledStore`) and UI compose these; nothing here touches the
 * database or `crypto.randomUUID` except where explicitly passed an `id`.
 *
 * Conventions (pinned by the Phase 8 contract):
 * - `Recurrence.interval` defaults to 1; `freq: 'monthly', interval: 3` is a
 *   quarterly schedule.
 * - `Transaction.amount` is SIGNED (positive = income, negative = expense);
 *   the template's signed amount is copied verbatim into the generated
 *   transaction.
 * - `nextOccurrence` advances a date by `freq * interval` and CLAMPS the day
 *   to the end of the target month when that day does not exist (e.g.
 *   2026-01-31 + 1 month → 2026-02-28). Yearly advances keep the month/day and
 *   clamp Feb 29 → Feb 28 in non-leap years.
 * - A schedule is due when `nextDate <= asOf` AND (`endDate` is unset OR
 *   `nextDate <= endDate`).
 * - On a run: a due AUTO schedule generates EXACTLY ONE transaction dated at
 *   `schedule.nextDate` and advances `nextDate` by one period; a due MANUAL
 *   schedule generates nothing and is surfaced as pending for the user to post
 *   (its `nextDate` is NOT advanced until the user posts it).
 */

import type { Recurrence, ScheduledTransaction, Transaction } from '@/lib/db';

/** Default multiplier on `freq` when `Recurrence.interval` is unset. */
const DEFAULT_INTERVAL = 1;

/**
 * Parse an ISO `YYYY-MM-DD` date into local-time components. We deliberately
 * use the `Date(year, monthIndex, day)` constructor (NOT `Date.parse`) so the
 * date is interpreted in the host's local time zone — calendar arithmetic is
 * done on the Y/M/D fields and the result is formatted back as `YYYY-MM-DD`,
 * so no time-zone drift can move the day.
 */
function parseIso(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new Error(`nextOccurrence: expected ISO YYYY-MM-DD, got '${iso}'`);
  }
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
  };
}

/** Format a `Date`'s local Y/M/D fields as `YYYY-MM-DD`. */
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Last calendar day of the month for `(year, monthIndex)`. */
function daysInMonth(year: number, monthIndex: number): number {
  // Day 0 of next month = last day of this month.
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Advance `isoDate` by one `recurrence` period (freq × interval), clamping
 * the day to the end of the target month when it does not exist.
 *
 * - daily  → add `interval` days.
 * - weekly → add `interval * 7` days.
 * - monthly → add `interval` months; clamp day to month end (Jan 31 + 1m →
 *   Feb 28/29).
 * - yearly  → add `interval` years; clamp Feb 29 → Feb 28 in non-leap years.
 */
export function nextOccurrence(
  isoDate: string,
  recurrence: Recurrence,
): string {
  const { freq, interval = DEFAULT_INTERVAL } = recurrence;
  const { y, m, d } = parseIso(isoDate);
  const monthIndex = m - 1;

  if (freq === 'daily') {
    const dt = new Date(y, monthIndex, d);
    dt.setDate(dt.getDate() + interval);
    return toIso(dt);
  }
  if (freq === 'weekly') {
    const dt = new Date(y, monthIndex, d);
    dt.setDate(dt.getDate() + interval * 7);
    return toIso(dt);
  }
  if (freq === 'monthly') {
    const targetMonthIndex = monthIndex + interval;
    const targetYear = y + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastDay = daysInMonth(targetYear, targetMonth);
    const day = Math.min(d, lastDay);
    return toIso(new Date(targetYear, targetMonth, day));
  }
  // yearly
  const targetYear = y + interval;
  const lastDay = daysInMonth(targetYear, monthIndex);
  const day = Math.min(d, lastDay);
  return toIso(new Date(targetYear, monthIndex, day));
}

/**
 * True if `schedule` is due as of `asOf` (inclusive on both bounds):
 * `nextDate <= asOf` AND (`endDate` is unset OR `nextDate <= endDate`).
 */
export function isDue(schedule: ScheduledTransaction, asOf: string): boolean {
  if (schedule.nextDate > asOf) return false;
  const { endDate } = schedule.recurrence;
  if (endDate !== undefined && schedule.nextDate > endDate) return false;
  return true;
}

/**
 * Build a `Transaction` from a schedule's template, dated at the schedule's
 * `nextDate`. The signed `amount` is copied verbatim. `id` defaults to a fresh
 * `crypto.randomUUID()`; callers may pass an explicit id (e.g. deterministic
 * tests).
 */
export function generateFromSchedule(
  schedule: ScheduledTransaction,
  id?: string,
): Transaction {
  const { template, nextDate } = schedule;
  const tx: Transaction = {
    id: id ?? crypto.randomUUID(),
    accountId: template.accountId,
    date: nextDate,
    amount: template.amount,
    currency: template.currency,
    payee: template.payee,
  };
  if (template.categoryId !== undefined) tx.categoryId = template.categoryId;
  if (template.notes !== undefined) tx.notes = template.notes;
  if (template.type !== undefined) tx.type = template.type;
  return tx;
}

/**
 * Return a copy of `schedule` with `nextDate` advanced by one period via
 * `nextOccurrence`. The original is not mutated.
 */
export function advanceSchedule(
  schedule: ScheduledTransaction,
): ScheduledTransaction {
  return {
    ...schedule,
    nextDate: nextOccurrence(schedule.nextDate, schedule.recurrence),
  };
}

/**
 * Result of running due schedules as of `asOf`.
 *
 * - `generated` — one `{ scheduleId, transaction }` per due AUTO schedule, in
 *   input order.
 * - `updatedSchedules` — every schedule with its post-run state: AUTO due
 *   schedules are advanced by one period; MANUAL due schedules and all non-due
 *   schedules are passed through unchanged (MANUAL is NOT advanced until the
 *   user posts it).
 * - `pendingManual` — the due MANUAL schedules, for the UI to surface with a
 *   "Post" affordance.
 */
export type RunDueResult = {
  generated: { scheduleId: string; transaction: Transaction }[];
  updatedSchedules: ScheduledTransaction[];
  pendingManual: ScheduledTransaction[];
};

/**
 * Run every schedule against `asOf`, applying the auto-vs-manual rule:
 *
 * - AUTO due → generate EXACTLY ONE transaction (dated at `nextDate`) and
 *   advance `nextDate` by one period.
 * - MANUAL due → generate nothing; surface as `pendingManual` (do NOT
 *   advance).
 * - Not due → untouched in `updatedSchedules`.
 *
 * Order is preserved: `generated`, `pendingManual`, and `updatedSchedules`
 * follow the input order of `schedules`.
 */
export function runDueSchedules(
  schedules: ScheduledTransaction[],
  asOf: string,
): RunDueResult {
  const generated: { scheduleId: string; transaction: Transaction }[] = [];
  const updatedSchedules: ScheduledTransaction[] = [];
  const pendingManual: ScheduledTransaction[] = [];

  for (const s of schedules) {
    if (!isDue(s, asOf)) {
      updatedSchedules.push(s);
      continue;
    }
    if (s.mode === 'auto') {
      generated.push({
        scheduleId: s.id,
        transaction: generateFromSchedule(s),
      });
      updatedSchedules.push(advanceSchedule(s));
    } else {
      // manual: do not generate, do not advance; surface for posting.
      pendingManual.push(s);
      updatedSchedules.push(s);
    }
  }

  return { generated, updatedSchedules, pendingManual };
}
