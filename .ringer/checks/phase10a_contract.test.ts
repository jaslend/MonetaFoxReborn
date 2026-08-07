// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 10a (reports).
// Copied into src/lib/reports/ by the Ringer check, run against the real
// module, then removed. Pins the base-currency reporting maths: spending by
// category (split-aware, expenses only, FX-converted), spending by payee,
// income vs expenses, net worth (cash balances + investment portfolio), and
// net worth over time (date-scoped). rates[c] = base units per 1 unit of c.

import { describe, it, expect } from 'vitest';

import {
  spendingByCategory,
  spendingByPayee,
  incomeVsExpenses,
  netWorth,
  netWorthOverTime,
} from './index';

const base = 'GBP';
const rates = { USD: 0.8 };

const accounts = [
  { id: 'a1', name: 'UK', type: 'checking', currency: 'GBP', openingBalance: 100 },
  { id: 'a2', name: 'US', type: 'checking', currency: 'USD', openingBalance: 0 },
] as never[];

const txns = [
  { id: 't1', accountId: 'a1', date: '2026-01-10', amount: -30, currency: 'GBP', categoryId: 'food', payee: 'Tesco' },
  { id: 't2', accountId: 'a1', date: '2026-01-20', amount: 2000, currency: 'GBP', categoryId: 'salary', payee: 'Employer' },
  { id: 't3', accountId: 'a2', date: '2026-01-15', amount: -50, currency: 'USD', categoryId: 'food', payee: 'Cafe' },
] as never[];

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);
const byKey = <T extends Record<string, unknown>>(rows: T[], k: keyof T, v: unknown) =>
  rows.find((r) => r[k] === v);

describe('Phase 10a contract: spending reports (base currency, expenses only)', () => {
  it('sums spending by category, converting foreign amounts and excluding income', () => {
    const rows = spendingByCategory(txns, base, rates);
    // food: £30 + (−$50 → £40) = £70 ; salary is income and must not appear.
    near((byKey(rows, 'categoryId', 'food') as { total: number }).total, 70);
    expect(byKey(rows, 'categoryId', 'salary')).toBeUndefined();
  });

  it('sums spending by payee', () => {
    const rows = spendingByPayee(txns, base, rates);
    near((byKey(rows, 'payee', 'Tesco') as { total: number }).total, 30);
    near((byKey(rows, 'payee', 'Cafe') as { total: number }).total, 40);
    expect(byKey(rows, 'payee', 'Employer')).toBeUndefined(); // income
  });
});

describe('Phase 10a contract: income vs expenses', () => {
  it('separates income and expenses in base currency', () => {
    const r = incomeVsExpenses(txns, base, rates);
    near(r.income, 2000);
    near(r.expenses, 70);
    near(r.net, 1930);
  });
});

describe('Phase 10a contract: net worth', () => {
  it('sums account balances in base plus the investment portfolio', () => {
    // a1 = 100 − 30 + 2000 = 2070 ; a2 = −50 USD → −£40 ; total £2030.
    near(netWorth(accounts, txns, [], [], base, rates), 2030);

    const holdings = [{ id: 'h1', accountId: 'a2', assetId: 'btc', units: 0.5 }] as never[];
    const prices = [{ id: 'p1', assetId: 'btc', date: '2026-01-01', price: 50000 }] as never[];
    near(netWorth(accounts, txns, holdings, prices, base, rates), 2030 + 25000);
  });
});

describe('Phase 10a contract: net worth over time', () => {
  it('computes net worth at each date using only transactions up to that date', () => {
    const series = netWorthOverTime(accounts, txns, [], [], base, rates, ['2026-01-15', '2026-01-31']);
    expect(series.map((p) => p.date)).toEqual(['2026-01-15', '2026-01-31']);
    // At Jan 15: a1 = 100 − 30 = 70 ; a2 = −$50 → −£40 ; = £30 (salary is Jan 20).
    near(series[0].value, 30);
    // At Jan 31: everything → £2030.
    near(series[1].value, 2030);
  });
});
