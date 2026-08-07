/**
 * Dashboard selectors for MonetaFox Reborn (Phase 10b).
 *
 * Pure, side-effect-free projections the Dashboard page composes on top of the
 * in-memory store records. The data layer (`src/lib/db`) owns persistence; the
 * single-source-of-truth helpers in `accounts` / `reports` / `currency` /
 * `scheduling` own the balance, net-worth, FX, and recurrence logic. This
 * module only selects + orders rows for the dashboard's three widgets:
 *
 * - `recentTransactions` — the most recent N transactions, NEWEST FIRST by
 *   date (descending). A stable sort is used so equal dates keep their input
 *   order; the input array is never mutated.
 * - `upcomingScheduled` — scheduled transactions whose `nextDate` falls in the
 *   INCLUSIVE window `[asOf, asOf + withinDays]`, sorted SOONEST FIRST
 *   (ascending by `nextDate`). Items already past (`nextDate < asOf`) or
 *   beyond the window (`nextDate > asOf + withinDays`) are excluded. The
 *   upper bound reuses `nextOccurrence` from `src/lib/scheduling` (a daily
 *   advance by `withinDays` days) so calendar arithmetic stays in one place.
 *
 * Conventions (pinned by the Phase 10b contract): ISO dates compare
 * lexicographically (`YYYY-MM-DD`), which is also chronological, so the window
 * bounds and the ordering are plain string comparisons.
 */
import type { ScheduledTransaction, Transaction } from '@/lib/db';
import { nextOccurrence } from '@/lib/scheduling';

/**
 * Return the most recent `limit` transactions sorted NEWEST FIRST by date
 * (descending). The input is not mutated; a shallow copy is sorted. When
 * `limit` exceeds the count, every transaction is returned (still sorted).
 * A non-finite or non-positive `limit` yields an empty list.
 */
export function recentTransactions(
  transactions: Transaction[],
  limit: number,
): Transaction[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const sorted = [...transactions].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return sorted.slice(0, Math.floor(limit));
}

/**
 * Return the scheduled transactions whose `nextDate` falls in the inclusive
 * window `[asOf, asOf + withinDays]`, sorted SOONEST FIRST (ascending by
 * `nextDate`). Items already past (`nextDate < asOf`) or beyond the window
 * (`nextDate > asOf + withinDays`) are excluded. The input is not mutated; a
 * shallow copy is sorted. A non-finite or non-positive `withinDays` yields an
 * empty list. The upper bound is computed via `nextOccurrence` (a daily
 * advance by `withinDays` days) so the calendar arithmetic reuses the
 * scheduling core rather than being reimplemented here.
 */
export function upcomingScheduled(
  schedules: ScheduledTransaction[],
  asOf: string,
  withinDays: number,
): ScheduledTransaction[] {
  if (!Number.isFinite(withinDays) || withinDays <= 0) return [];
  const upper = nextOccurrence(asOf, {
    freq: 'daily',
    interval: Math.floor(withinDays),
  });
  return [...schedules]
    .filter((s) => s.nextDate >= asOf && s.nextDate <= upper)
    .sort((a, b) =>
      a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0,
    );
}
