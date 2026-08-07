/**
 * Reports page — Phase 10a.
 *
 * Reads accounts / transactions / holdings / prices from their stores and the
 * base currency + FX rates from the settings store, then renders the spec's
 * five reports in the base currency:
 *
 * - Net worth (a number: live balances + portfolio).
 * - Net worth over time (a Recharts line chart of monthly snapshots).
 * - Spending by category (a Recharts pie chart).
 * - Spending by payee (a Recharts bar chart).
 * - Income vs expenses (a Recharts bar chart).
 *
 * An optional date-range control scopes the spending/income reports and the
 * net-worth-over-time span; the headline net-worth number always uses every
 * transaction (it is the current net worth). All FX conversions go through
 * `convertToBase`, which throws on a missing rate — the page surfaces that as
 * a clear inline message rather than crashing.
 *
 * The pure aggregations live in `src/lib/reports`; this page only glues stores
 * to those functions and formats money via `formatCurrency`. The Dashboard
 * (recent transactions, upcoming bills, account balances) is Phase 10b and is
 * NOT built here.
 */
import { useMemo, useState } from 'react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { filterTransactions } from '@/lib/transactions';
import {
  incomeVsExpenses,
  netWorth,
  netWorthOverTime,
  spendingByCategory,
  spendingByPayee,
} from '@/lib/reports';

import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTransactionStore } from '@/stores/transactionStore';

import { IncomeVsExpensesChart } from '@/components/reports/IncomeVsExpensesChart';
import { NetWorthOverTimeChart } from '@/components/reports/NetWorthOverTimeChart';
import { SpendingByCategoryChart } from '@/components/reports/SpendingByCategoryChart';
import { SpendingByPayeeChart } from '@/components/reports/SpendingByPayeeChart';

/** Today's ISO date (YYYY-MM-DD), local-time, for the date-range default. */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Monthly as-of dates spanning [`start`, `end`] (inclusive, ISO YYYY-MM-DD).
 * Each point is the last day of a month, clamped to `end`; the series starts at
 * the month of `start`. Returns `[]` when `start > end`. Used as the net-worth
 * over time axis.
 */
function monthlyAsOfDates(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const asOf = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    out.push(asOf > end ? end : asOf);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function ReportsPage() {
  const accounts = useAccountStore((s) => s.items);
  const transactions = useTransactionStore((s) => s.items);
  const holdings = useInvestmentStore((s) => s.holdings);
  const prices = useInvestmentStore((s) => s.prices);
  const categories = useCategoryStore((s) => s.items);
  const settings = useSettingsStore((s) => s.items[0]);

  const baseCurrency = settings?.baseCurrency ?? '';
  const rates = useMemo(() => settings?.rates ?? {}, [settings]);

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Category id → display name (falls back to the id when unknown).
  const categoryNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  // Net-worth span for the over-time chart: from the chosen `dateFrom`, or the
  // earliest transaction date, through `dateTo` or today.
  const netWorthSpan = useMemo(() => {
    const today = todayISO();
    const earliest = transactions.length
      ? transactions.reduce(
          (min, t) => (t.date < min ? t.date : min),
          transactions[0].date,
        )
      : today;
    return { start: dateFrom || earliest, end: dateTo || today };
  }, [transactions, dateFrom, dateTo]);

  const asOfDates = useMemo(
    () => monthlyAsOfDates(netWorthSpan.start, netWorthSpan.end),
    [netWorthSpan],
  );

  // Transactions in the chosen range for the spending/income reports. When no
  // range is set, `filterTransactions({})` returns everything.
  const rangeTxns = useMemo(
    () =>
      filterTransactions(transactions, {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [transactions, dateFrom, dateTo],
  );

  // Headline net worth (current — uses every transaction). A missing rate
  // surfaces inline rather than crashing the page.
  const netWorthView = useMemo(() => {
    if (!baseCurrency) return { value: 0, error: null };
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
      };
    } catch (e) {
      return {
        value: NaN,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [accounts, transactions, holdings, prices, baseCurrency, rates]);

  // Net worth over time — same missing-rate handling.
  const netWorthSeriesView = useMemo(() => {
    if (!baseCurrency) return { data: [], error: null };
    try {
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
  }, [
    accounts,
    transactions,
    holdings,
    prices,
    baseCurrency,
    rates,
    asOfDates,
  ]);

  // Spending + income reports — also rate-sensitive.
  const spendingCategoryView = useMemo(() => {
    if (!baseCurrency) return { data: [], error: null };
    try {
      return {
        data: spendingByCategory(rangeTxns, baseCurrency, rates),
        error: null,
      };
    } catch (e) {
      return { data: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [rangeTxns, baseCurrency, rates]);

  const spendingPayeeView = useMemo(() => {
    if (!baseCurrency) return { data: [], error: null };
    try {
      return {
        data: spendingByPayee(rangeTxns, baseCurrency, rates),
        error: null,
      };
    } catch (e) {
      return { data: [], error: e instanceof Error ? e.message : String(e) };
    }
  }, [rangeTxns, baseCurrency, rates]);

  const incomeView = useMemo(() => {
    if (!baseCurrency)
      return { data: { income: 0, expenses: 0, net: 0 }, error: null };
    try {
      return {
        data: incomeVsExpenses(rangeTxns, baseCurrency, rates),
        error: null,
      };
    } catch (e) {
      return {
        data: { income: 0, expenses: 0, net: 0 },
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [rangeTxns, baseCurrency, rates]);

  const clearRange = () => {
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">
          All figures in your base currency ({baseCurrency || 'not set yet'}).
          Foreign amounts are converted at the rates on the Settings page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range (optional)</CardTitle>
          <CardDescription>
            Scope the spending and income reports and the net-worth-over-time
            span. Leave blank for all time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
              data-testid="report-date-from"
              className="border-border bg-background ring-offset-background flex h-9 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
              data-testid="report-date-to"
              className="border-border bg-background ring-offset-background flex h-9 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
            />
          </label>
          <button
            type="button"
            onClick={clearRange}
            data-testid="report-clear-range"
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
          >
            Clear
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Net worth</CardTitle>
          <CardDescription>
            Live account balances plus your investment portfolio, in your base
            currency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {netWorthView.error ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="net-worth-error"
            >
              {netWorthView.error} — set the missing rate on the Settings page.
            </p>
          ) : (
            <p className="text-2xl font-semibold" data-testid="net-worth-total">
              {formatCurrency(netWorthView.value, baseCurrency || 'USD')}
            </p>
          )}
        </CardContent>
      </Card>

      <NetWorthOverTimeChart
        data={netWorthSeriesView.data}
        baseCurrency={baseCurrency}
        error={netWorthSeriesView.error}
      />

      {spendingCategoryView.error ? (
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm" role="alert">
              {spendingCategoryView.error} — set the missing rate on the
              Settings page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SpendingByCategoryChart
          data={spendingCategoryView.data}
          categoryNames={categoryNames}
          baseCurrency={baseCurrency}
        />
      )}

      {spendingPayeeView.error ? (
        <Card>
          <CardHeader>
            <CardTitle>Spending by payee</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm" role="alert">
              {spendingPayeeView.error} — set the missing rate on the Settings
              page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <SpendingByPayeeChart
          data={spendingPayeeView.data}
          baseCurrency={baseCurrency}
        />
      )}

      {incomeView.error ? (
        <Card>
          <CardHeader>
            <CardTitle>Income vs expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm" role="alert">
              {incomeView.error} — set the missing rate on the Settings page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <IncomeVsExpensesChart
          data={incomeView.data}
          baseCurrency={baseCurrency}
        />
      )}
    </div>
  );
}
