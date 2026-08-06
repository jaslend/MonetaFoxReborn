// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 4 (accounts & currency).
// Copied into src/lib/currency/ by the Ringer check, run against the worker's
// real modules, then removed. It pins the deterministic financial core of the
// phase: FX conversion into the base currency and account-balance arithmetic.
// Conventions:
//   - transaction.amount is SIGNED (positive inflow, negative outflow).
//   - balance = openingBalance + Σ signed amounts for that account.
//   - rates[currency] = base-currency units per 1 unit of `currency`.

import { describe, it, expect } from 'vitest';

import { convertToBase } from './index';
import { accountBalance, netWorthInBase } from '@/lib/accounts';

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe('Phase 4 contract: currency conversion', () => {
  it('is the identity when the currency is already the base', () => {
    expect(convertToBase(100, 'GBP', 'GBP', {})).toBe(100);
  });

  it('converts a foreign amount into the base currency using the rate', () => {
    // 1 USD = 0.79 GBP → $100 = £79.
    near(convertToBase(100, 'USD', 'GBP', { USD: 0.79 }), 79);
  });

  it('converts crypto the same way (rate = base units per 1 unit)', () => {
    near(convertToBase(0.5, 'BTC', 'GBP', { BTC: 50000 }), 25000);
  });

  it('throws on a missing rate rather than silently guessing', () => {
    expect(() => convertToBase(1, 'JPY', 'GBP', {})).toThrow();
  });
});

describe('Phase 4 contract: account balances', () => {
  const usd = { id: 'a1', name: 'US Checking', type: 'checking', currency: 'USD', openingBalance: 50 };

  it('sums the opening balance and signed transactions in the account currency', () => {
    const txns = [
      { id: 't1', accountId: 'a1', date: '2026-01-01', amount: 100, currency: 'USD', payee: 'Salary' },
      { id: 't2', accountId: 'a1', date: '2026-01-02', amount: -30, currency: 'USD', payee: 'Groceries' },
      { id: 't3', accountId: 'other', date: '2026-01-03', amount: 999, currency: 'USD', payee: 'Not mine' },
    ];
    // 50 + 100 - 30 = 120 (the foreign 'other' account txn is excluded).
    expect(accountBalance(usd as never, txns as never)).toBe(120);
  });

  it('is just the opening balance when there are no transactions', () => {
    expect(accountBalance(usd as never, [])).toBe(50);
  });

  it('aggregates net worth across accounts, converted into base currency', () => {
    const gbp = { id: 'a2', name: 'UK Savings', type: 'savings', currency: 'GBP', openingBalance: 200 };
    const accounts = [usd, gbp];
    const txns = [{ id: 't1', accountId: 'a1', date: '2026-01-01', amount: 100, currency: 'USD', payee: 'x' }];
    // USD balance 150 → £118.5 ; GBP balance 200 → £200 ; total £318.5
    near(netWorthInBase(accounts as never, txns as never, 'GBP', { USD: 0.79 }), 318.5);
  });
});
