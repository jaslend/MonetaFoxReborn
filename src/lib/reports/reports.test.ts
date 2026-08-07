// @vitest-environment node
//
// Pure numeric analytics — no React, no DOM, no indexedDB. Use the light node
// environment (like the orchestrator's contract test) instead of the default
// jsdom, which trims per-file setup cost and keeps the suite deterministic.
import { describe, it, expect } from 'vitest';

import type {
  Account,
  Holding,
  PricePoint,
  Transaction,
} from '@/lib/db/models';

import {
  spendingByCategory,
  spendingByPayee,
  incomeVsExpenses,
  netWorth,
  netWorthOverTime,
} from './index';

// Base currency is USD throughout; EUR converts at 1.10 USD per EUR.
const BASE = 'USD';
const RATES: Record<string, number> = { EUR: 1.1 };

function mkTx(
  partial: Partial<Transaction> & Pick<Transaction, 'amount'>,
): Transaction {
  return {
    id: 't' + Math.random().toString(36).slice(2),
    accountId: 'a1',
    date: '2026-01-15',
    currency: 'USD',
    payee: 'ACME',
    ...partial,
  };
}

function mkAccount(partial: Partial<Account> & Pick<Account, 'id'>): Account {
  return {
    name: 'Main',
    type: 'checking',
    currency: 'USD',
    openingBalance: 0,
    ...partial,
  };
}

describe('spendingByCategory', () => {
  it('returns an empty array when there are no transactions', () => {
    expect(spendingByCategory([], BASE, RATES)).toEqual([]);
  });

  it('includes only outflows as positive totals and excludes income', () => {
    const txns = [
      mkTx({ amount: -100, categoryId: 'food', payee: 'Cafe' }),
      mkTx({ amount: 500, categoryId: 'salary', payee: 'Boss' }),
      mkTx({ amount: -40, categoryId: 'food', payee: 'Cafe' }),
    ];
    expect(spendingByCategory(txns, BASE, RATES)).toEqual([
      { categoryId: 'food', total: 140 },
    ]);
  });

  it('converts each transaction from its own currency to the base currency', () => {
    const txns = [
      mkTx({ amount: -100, currency: 'EUR', categoryId: 'food' }),
      mkTx({ amount: -50, currency: 'USD', categoryId: 'gas' }),
    ];
    const result = spendingByCategory(txns, BASE, RATES);
    const food = result.find((r) => r.categoryId === 'food');
    const gas = result.find((r) => r.categoryId === 'gas');
    expect(food?.total).toBeCloseTo(110, 10); // 100 EUR * 1.1
    expect(gas?.total).toBe(50);
  });

  it('is split-aware: a split line contributes to its own category', () => {
    // Parent -100 split into food (-60) and gas (-40); the parent is NOT
    // double-counted — each split lands in its own category.
    const txns = [
      mkTx({
        amount: -100,
        categoryId: 'ignored',
        splits: [
          { amount: -60, categoryId: 'food' },
          { amount: -40, categoryId: 'gas' },
        ],
      }),
    ];
    expect(spendingByCategory(txns, BASE, RATES)).toEqual([
      { categoryId: 'food', total: 60 },
      { categoryId: 'gas', total: 40 },
    ]);
  });

  it('skips split lines with no categoryId and never creates an empty bucket', () => {
    const txns = [
      mkTx({
        amount: -100,
        categoryId: 'parent',
        splits: [
          { amount: -60, categoryId: 'food' },
          { amount: -40 }, // no category — skipped
        ],
      }),
    ];
    expect(spendingByCategory(txns, BASE, RATES)).toEqual([
      { categoryId: 'food', total: 60 },
    ]);
  });

  it('throws on a missing FX rate for a foreign expense', () => {
    const txns = [mkTx({ amount: -100, currency: 'GBP', categoryId: 'food' })];
    expect(() => spendingByCategory(txns, BASE, RATES)).toThrow(
      /Missing FX rate/,
    );
  });
});

describe('spendingByPayee', () => {
  it('returns an empty array when there are no transactions', () => {
    expect(spendingByPayee([], BASE, RATES)).toEqual([]);
  });

  it('groups outflows by payee as positive totals and excludes income', () => {
    const txns = [
      mkTx({ amount: -30, payee: 'Cafe', categoryId: 'food' }),
      mkTx({ amount: 1000, payee: 'Boss', categoryId: 'salary' }),
      mkTx({ amount: -20, payee: 'Cafe', categoryId: 'food' }),
      mkTx({ amount: -15, payee: 'Pump', categoryId: 'gas' }),
    ];
    expect(spendingByPayee(txns, BASE, RATES)).toEqual([
      { payee: 'Cafe', total: 50 },
      { payee: 'Pump', total: 15 },
    ]);
  });

  it('attributes each outflow split of a split transaction to the parent payee', () => {
    const txns = [
      mkTx({
        amount: -100,
        payee: 'Mart',
        splits: [
          { amount: -70, categoryId: 'food' },
          { amount: -30, categoryId: 'gas' },
        ],
      }),
    ];
    expect(spendingByPayee(txns, BASE, RATES)).toEqual([
      { payee: 'Mart', total: 100 },
    ]);
  });

  it('converts each amount from its own currency to the base currency', () => {
    const txns = [mkTx({ amount: -100, currency: 'EUR', payee: 'Cafe' })];
    const result = spendingByPayee(txns, BASE, RATES);
    expect(result).toHaveLength(1);
    expect(result[0].payee).toBe('Cafe');
    expect(result[0].total).toBeCloseTo(110, 10); // 100 EUR * 1.1
  });

  it('skips transactions with a blank payee', () => {
    const txns = [
      mkTx({ amount: -50, payee: '', categoryId: 'food' }),
      mkTx({ amount: -50, payee: '   ', categoryId: 'food' }),
      mkTx({ amount: -20, payee: 'Cafe', categoryId: 'food' }),
    ];
    expect(spendingByPayee(txns, BASE, RATES)).toEqual([
      { payee: 'Cafe', total: 20 },
    ]);
  });

  it('throws on a missing FX rate', () => {
    const txns = [mkTx({ amount: -100, currency: 'GBP', payee: 'Cafe' })];
    expect(() => spendingByPayee(txns, BASE, RATES)).toThrow(/Missing FX rate/);
  });
});

describe('incomeVsExpenses', () => {
  it('returns zeros for an empty set', () => {
    expect(incomeVsExpenses([], BASE, RATES)).toEqual({
      income: 0,
      expenses: 0,
      net: 0,
    });
  });

  it('sums positive converted amounts to income and |negative| to expenses', () => {
    const txns = [
      mkTx({ amount: 1000, categoryId: 'salary' }),
      mkTx({ amount: -250, categoryId: 'food' }),
      mkTx({ amount: -50, categoryId: 'gas' }),
    ];
    expect(incomeVsExpenses(txns, BASE, RATES)).toEqual({
      income: 1000,
      expenses: 300,
      net: 700,
    });
  });

  it('converts from each transaction own currency before bucketing', () => {
    const txns = [
      mkTx({ amount: 1000, currency: 'EUR', categoryId: 'salary' }), // 1100
      mkTx({ amount: -100, currency: 'EUR', categoryId: 'food' }), // 110
    ];
    const r = incomeVsExpenses(txns, BASE, RATES);
    expect(r.income).toBeCloseTo(1100, 10);
    expect(r.expenses).toBeCloseTo(110, 10);
    expect(r.net).toBeCloseTo(990, 10);
  });

  it('is split-aware: bucket each split converted amount', () => {
    // Parent +100 split into +150 income and -50 expense (mixed signs sum to
    // the parent). Split-aware bucketing: income += 150, expenses += 50.
    const txns = [
      mkTx({
        amount: 100,
        categoryId: 'mix',
        splits: [
          { amount: 150, categoryId: 'refund' },
          { amount: -50, categoryId: 'fee' },
        ],
      }),
    ];
    expect(incomeVsExpenses(txns, BASE, RATES)).toEqual({
      income: 150,
      expenses: 50,
      net: 100,
    });
  });

  it('matches parent-based bucketing when all splits share the parent sign', () => {
    const txns = [
      mkTx({
        amount: -100,
        categoryId: 'out',
        splits: [
          { amount: -60, categoryId: 'food' },
          { amount: -40, categoryId: 'gas' },
        ],
      }),
    ];
    expect(incomeVsExpenses(txns, BASE, RATES)).toEqual({
      income: 0,
      expenses: 100,
      net: -100,
    });
  });

  it('throws on a missing FX rate', () => {
    const txns = [mkTx({ amount: 100, currency: 'GBP' })];
    expect(() => incomeVsExpenses(txns, BASE, RATES)).toThrow(
      /Missing FX rate/,
    );
  });
});

describe('netWorth', () => {
  it('is zero with no accounts and no holdings', () => {
    expect(netWorth([], [], [], [], BASE, RATES)).toBe(0);
  });

  it('sums live account balances converted to base plus the portfolio value', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'USD', openingBalance: 100 }),
      mkAccount({ id: 'a2', currency: 'EUR', openingBalance: 200 }),
      mkAccount({
        id: 'a3',
        currency: 'USD',
        openingBalance: 999,
        archived: true,
      }),
    ];
    const txns = [
      mkTx({ amount: 50, accountId: 'a1' }),
      mkTx({ amount: -100, accountId: 'a2' }),
    ];
    const holdings: Holding[] = [
      { id: 'h1', accountId: 'inv', assetId: 'btc', units: 0.5 },
    ];
    const prices: PricePoint[] = [
      { id: 'p1', assetId: 'btc', date: '2026-01-01', price: 40000 },
    ];
    // a1: 100 + 50 = 150 USD. a2: 200 - 100 = 100 EUR * 1.1 = 110 USD.
    // a3 archived, excluded. portfolio: 0.5 * 40000 = 20000. Total = 20260.
    expect(netWorth(accounts, txns, holdings, prices, BASE, RATES)).toBeCloseTo(
      20260,
      6,
    );
  });

  it('excludes archived accounts (via netWorthInBase)', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'USD', openingBalance: 100 }),
      mkAccount({
        id: 'a2',
        currency: 'USD',
        openingBalance: 500,
        archived: true,
      }),
    ];
    expect(netWorth(accounts, [], [], [], BASE, RATES)).toBe(100);
  });

  it('throws on a missing FX rate for a live foreign account', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'GBP', openingBalance: 100 }),
    ];
    expect(() => netWorth(accounts, [], [], [], BASE, RATES)).toThrow(
      /Missing FX rate/,
    );
  });
});

describe('netWorthOverTime', () => {
  it('returns an empty array when there are no asOf dates', () => {
    expect(netWorthOverTime([], [], [], [], BASE, RATES, [])).toEqual([]);
  });

  it('scopes each point to transactions and prices dated <= asOf', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'USD', openingBalance: 0 }),
    ];
    const txns = [
      mkTx({ amount: 100, accountId: 'a1', date: '2026-01-10' }),
      mkTx({ amount: 200, accountId: 'a1', date: '2026-02-10' }),
      mkTx({ amount: -50, accountId: 'a1', date: '2026-03-10' }),
    ];
    const holdings: Holding[] = [
      { id: 'h1', accountId: 'inv', assetId: 'btc', units: 1 },
    ];
    const prices: PricePoint[] = [
      { id: 'p1', assetId: 'btc', date: '2026-01-15', price: 1000 },
      { id: 'p2', assetId: 'btc', date: '2026-02-15', price: 2000 },
    ];
    const series = netWorthOverTime(
      accounts,
      txns,
      holdings,
      prices,
      BASE,
      RATES,
      ['2026-01-01', '2026-01-31', '2026-02-28', '2026-03-31'],
    );
    // 2026-01-01: no txns, no prices -> 0.
    // 2026-01-31: txns <= 100; price 1000 (dated 01-15) -> 100 + 1000 = 1100.
    // 2026-02-28: txns 100+200=300; price 2000 -> 2300.
    // 2026-03-31: txns 100+200-50=250; price 2000 -> 2250.
    expect(series).toEqual([
      { date: '2026-01-01', value: 0 },
      { date: '2026-01-31', value: 1100 },
      { date: '2026-02-28', value: 2300 },
      { date: '2026-03-31', value: 2250 },
    ]);
  });

  it('holds all holdings constant; only their latest-known price changes over time', () => {
    const accounts: Account[] = [];
    const holdings: Holding[] = [
      { id: 'h1', accountId: 'inv', assetId: 'btc', units: 2 },
    ];
    const prices: PricePoint[] = [
      { id: 'p1', assetId: 'btc', date: '2026-01-10', price: 100 },
      { id: 'p2', assetId: 'btc', date: '2026-01-20', price: 250 },
    ];
    const series = netWorthOverTime(
      accounts,
      [],
      holdings,
      prices,
      BASE,
      RATES,
      ['2026-01-05', '2026-01-15', '2026-01-25'],
    );
    // Before any price: holding unpriced -> 0. After 2026-01-10: 2*100=200.
    // After 2026-01-20: latest price <= 2026-01-25 is 250 -> 2*250=500.
    expect(series).toEqual([
      { date: '2026-01-05', value: 0 },
      { date: '2026-01-15', value: 200 },
      { date: '2026-01-25', value: 500 },
    ]);
  });

  it('returns results in the order of asOfDates', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'USD', openingBalance: 10 }),
    ];
    const series = netWorthOverTime(accounts, [], [], [], BASE, RATES, [
      '2026-03-31',
      '2026-01-01',
      '2026-02-15',
    ]);
    expect(series.map((p) => p.date)).toEqual([
      '2026-03-31',
      '2026-01-01',
      '2026-02-15',
    ]);
    expect(series.map((p) => p.value)).toEqual([10, 10, 10]);
  });

  it('throws on a missing FX rate at any point', () => {
    const accounts = [
      mkAccount({ id: 'a1', currency: 'GBP', openingBalance: 100 }),
    ];
    expect(() =>
      netWorthOverTime(accounts, [], [], [], BASE, RATES, ['2026-01-01']),
    ).toThrow(/Missing FX rate/);
  });
});
