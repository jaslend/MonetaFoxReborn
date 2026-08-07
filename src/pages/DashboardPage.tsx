/**
 * Dashboard page — Phase 10b (the index route '/').
 *
 * Composes the three widgets the spec calls out ("Dashboard includes: recent
 * transactions, upcoming bills, account balances") on top of the in-memory
 * store records, reusing — not reimplementing — the single-source-of-truth
 * helpers:
 *
 * - Net worth + per-account balances via `reports.netWorth` /
 *   `accounts.accountBalance`, money formatted via `formatCurrency`. A small
 *   net-worth-over-time sparkline (Recharts) reuses `reports.netWorthOverTime`.
 * - Recent transactions via the pure `recentTransactions` selector (newest
 *   first), each row linking into the Transactions page.
 * - Upcoming bills via the pure `upcomingScheduled` selector (next 30 days,
 *   soonest first), each row showing the schedule's payee, amount, and due
 *   date, linking into the Scheduled page.
 *
 * The base currency + FX rates come from the settings store. All FX
 * conversions go through `convertToBase` (inside `netWorth`), which throws on a
 * missing rate — the page surfaces that inline rather than crashing. Empty
 * states (no accounts / transactions / bills) are handled with a friendly
 * message and a link into the relevant section.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { accountBalance } from '@/lib/accounts';
import { netWorth, netWorthOverTime } from '@/lib/reports';
import { recentTransactions, upcomingScheduled } from '@/lib/dashboard';
import type { Account } from '@/lib/db';

import { useAccountStore } from '@/stores/accountStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useScheduledStore } from '@/stores/scheduledStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTransactionStore } from '@/stores/transactionStore';

import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { GettingStarted } from '@/components/onboarding/GettingStarted';
import { useSampleData } from '@/components/onboarding/useSampleData';

/** Number of recent transactions to surface on the dashboard. */
const RECENT_LIMIT = 7;
/** How far ahead (days) the upcoming-bills window reaches. */
const UPCOMING_WINDOW_DAYS = 30;
/** Number of monthly net-worth snapshots for the sparkline. */
const SPARKLINE_POINTS = 6;

const ACCOUNT_TYPE_LABELS: Record<Account['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
  loan: 'Loan',
};

/** Today's ISO date (YYYY-MM-DD) in the host's local time zone. */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Month-end ISO dates for the last `n` months, with the final point clamped
 * to `today` (the current month has not ended yet). Each point is the last day
 * of its month. Used as the as-of axis for the net-worth sparkline.
 */
function lastNMonthlyEnds(today: string, n: number): string[] {
  const [ty, tm] = today.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let y = ty;
    let m = tm - i; // 1-based month, may go <= 0
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push(
      `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
    );
  }
  if (out.length && out[out.length - 1] > today) out[out.length - 1] = today;
  return out;
}

export function DashboardPage() {
  const accounts = useAccountStore((s) => s.items);
  const transactions = useTransactionStore((s) => s.items);
  const schedules = useScheduledStore((s) => s.items);
  const holdings = useInvestmentStore((s) => s.holdings);
  const prices = useInvestmentStore((s) => s.prices);
  const settings = useSettingsStore((s) => s.items[0]);

  const sample = useSampleData();

  const baseCurrency = settings?.baseCurrency ?? '';
  const rates = useMemo(() => settings?.rates ?? {}, [settings]);
  const today = useMemo(() => todayISO(), []);

  const accountById = useMemo(() => {
    const map: Record<string, Account> = {};
    for (const a of accounts) map[a.id] = a;
    return map;
  }, [accounts]);

  // Net worth (current): live balances + portfolio, in the base currency. A
  // missing FX rate surfaces inline rather than crashing the page.
  const netWorthView = useMemo(() => {
    if (!baseCurrency) return { value: 0, error: null, ready: false };
    try {
      return {
        value: netWorth(
          accounts,
          transactions,
          holdings,
          prices,
          baseCurrency,
          rates,
        ),
        error: null,
        ready: true,
      };
    } catch (e) {
      return {
        value: NaN,
        error: e instanceof Error ? e.message : String(e),
        ready: true,
      };
    }
  }, [accounts, transactions, holdings, prices, baseCurrency, rates]);

  // Net-worth-over-time for the sparkline (monthly, last N months).
  const sparklineView = useMemo(() => {
    if (!baseCurrency) return { data: [], error: null };
    try {
      const asOfDates = lastNMonthlyEnds(today, SPARKLINE_POINTS);
      return {
        data: netWorthOverTime(
          accounts,
          transactions,
          holdings,
          prices,
          baseCurrency,
          rates,
          asOfDates,
        ),
        error: null,
      };
    } catch (e) {
      return { data: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [accounts, transactions, holdings, prices, baseCurrency, rates, today]);

  const recent = useMemo(
    () => recentTransactions(transactions, RECENT_LIMIT),
    [transactions],
  );

  const upcoming = useMemo(
    () => upcomingScheduled(schedules, today, UPCOMING_WINDOW_DAYS),
    [schedules, today],
  );

  // Live (non-archived) accounts first, then archived; stable within each group.
  const sortedAccounts = useMemo(
    () =>
      [...accounts].sort((a, b) => {
        const az = a.archived ? 1 : 0;
        const bz = b.archived ? 1 : 0;
        if (az !== bz) return az - bz;
        return 0;
      }),
    [accounts],
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Your money at a glance. Net worth, account balances, recent activity,
          and upcoming bills.
        </p>
      </div>

      {/* First-run onboarding: when the vault is empty (no accounts yet),
          show a getting-started guide instead of the empty dashboard. */}
      {accounts.length === 0 ? (
        <GettingStarted
          onLoadSample={() => void sample.loadSample()}
          loading={sample.loading}
        />
      ) : null}

      {/* Net worth + sparkline */}
      <Card>
        <CardHeader>
          <CardTitle>Net worth</CardTitle>
          <CardDescription>
            Live account balances plus your investment portfolio, in your base
            currency ({baseCurrency || 'not set yet'}).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {netWorthView.error ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="net-worth-error"
            >
              {netWorthView.error} — set the missing rate on the Settings page.
            </p>
          ) : !netWorthView.ready ? (
            <p className="text-muted-foreground text-sm">
              Set your base currency on the Settings page to see your net worth.
            </p>
          ) : (
            <p className="text-2xl font-semibold" data-testid="net-worth-total">
              {formatCurrency(netWorthView.value, baseCurrency)}
            </p>
          )}
          {sparklineView.error ? (
            <p className="text-destructive text-sm" role="alert">
              {sparklineView.error}
            </p>
          ) : (
            <NetWorthSparkline
              data={sparklineView.data}
              baseCurrency={baseCurrency}
            />
          )}
        </CardContent>
      </Card>

      {/* Per-account balances */}
      <Card>
        <CardHeader>
          <CardTitle>Account balances</CardTitle>
          <CardDescription>
            Each account in its own currency.{' '}
            <Link
              to="/accounts"
              className="text-primary underline-offset-4 hover:underline"
            >
              Manage accounts
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedAccounts.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="accounts-empty"
            >
              No accounts yet.{' '}
              <Link
                to="/accounts"
                className="text-primary underline-offset-4 hover:underline"
              >
                Add one
              </Link>{' '}
              to start tracking.
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y divide-border"
              data-testid="account-balances"
            >
              {sortedAccounts.map((acc) => (
                <li
                  key={acc.id}
                  className="flex items-center justify-between py-2"
                  data-testid="account-balance-row"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {acc.name}
                      {acc.archived ? (
                        <span className="text-muted-foreground ml-2 text-xs">
                          (archived)
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {ACCOUNT_TYPE_LABELS[acc.type]} · {acc.currency}
                    </span>
                  </div>
                  <span
                    className="font-medium tabular-nums"
                    data-testid="account-balance-amount"
                  >
                    {formatCurrency(
                      accountBalance(acc, transactions),
                      acc.currency,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>
            The last {RECENT_LIMIT} transactions, newest first.{' '}
            <Link
              to="/transactions"
              className="text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="recent-empty"
            >
              No transactions yet.{' '}
              <Link
                to="/transactions"
                className="text-primary underline-offset-4 hover:underline"
              >
                Add one
              </Link>{' '}
              to get started.
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y divide-border"
              data-testid="recent-transactions"
            >
              {recent.map((t) => {
                const acc = accountById[t.accountId];
                return (
                  <li key={t.id}>
                    <Link
                      to="/transactions"
                      className="flex items-center justify-between py-2 hover:underline"
                      data-testid="recent-transaction-row"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {t.payee || '(no payee)'}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {t.date}
                          {acc ? ` · ${acc.name}` : ''}
                        </span>
                      </div>
                      <span
                        className="tabular-nums"
                        data-testid="recent-transaction-amount"
                      >
                        {formatCurrency(t.amount, t.currency)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Upcoming bills */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming bills</CardTitle>
          <CardDescription>
            Scheduled transactions due in the next {UPCOMING_WINDOW_DAYS} days,
            soonest first.{' '}
            <Link
              to="/scheduled"
              className="text-primary underline-offset-4 hover:underline"
            >
              Manage schedules
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="upcoming-empty"
            >
              No bills due in the next {UPCOMING_WINDOW_DAYS} days.{' '}
              <Link
                to="/scheduled"
                className="text-primary underline-offset-4 hover:underline"
              >
                Set up a schedule
              </Link>
              .
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y divide-border"
              data-testid="upcoming-bills"
            >
              {upcoming.map((s) => {
                const acc = accountById[s.template.accountId];
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between py-2"
                    data-testid="upcoming-bill-row"
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {s.template.payee || '(no payee)'}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Due {s.nextDate}
                        {acc ? ` · ${acc.name}` : ''}
                        {s.mode === 'manual' ? ' · manual' : ''}
                      </span>
                    </div>
                    <span
                      className="tabular-nums"
                      data-testid="upcoming-bill-amount"
                    >
                      {formatCurrency(s.template.amount, s.template.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
