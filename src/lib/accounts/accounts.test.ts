import { describe, it, expect } from 'vitest';

import type { Account, Transaction } from '@/lib/db';

import { accountBalance, netWorthInBase } from './index';

function account(
  partial: Partial<Account> & Pick<Account, 'id' | 'currency'>,
): Account {
  return {
    name: 'A',
    type: 'checking',
    archived: false,
    openingBalance: 0,
    ...partial,
  };
}

function tx(
  partial: Partial<Transaction> &
    Pick<Transaction, 'id' | 'accountId' | 'amount'>,
): Transaction {
  return {
    date: '2026-01-15',
    currency: 'USD',
    payee: '',
    ...partial,
  };
}

describe('accountBalance', () => {
  it('is openingBalance + sum of signed amounts for that account', () => {
    const acc = account({ id: 'a1', currency: 'USD', openingBalance: 100 });
    const txns: Transaction[] = [
      tx({ id: 't1', accountId: 'a1', amount: 50 }), // inflow
      tx({ id: 't2', accountId: 'a1', amount: -30 }), // outflow
      tx({ id: 't3', accountId: 'other', amount: 1000 }), // not this account
    ];
    expect(accountBalance(acc, txns)).toBe(120);
  });

  it('defaults openingBalance to 0 when unset', () => {
    const acc: Account = {
      id: 'a1',
      name: 'A',
      type: 'checking',
      currency: 'USD',
    };
    expect(
      accountBalance(acc, [tx({ id: 't1', accountId: 'a1', amount: -25 })]),
    ).toBe(-25);
  });

  it('ignores transactions belonging to other accounts', () => {
    const acc = account({ id: 'a1', currency: 'USD', openingBalance: 0 });
    const txns: Transaction[] = [
      tx({ id: 't1', accountId: 'a2', amount: 9999 }),
      tx({ id: 't2', accountId: 'a1', amount: 10 }),
    ];
    expect(accountBalance(acc, txns)).toBe(10);
  });

  it('returns openingBalance when there are no transactions', () => {
    const acc = account({ id: 'a1', currency: 'USD', openingBalance: 500 });
    expect(accountBalance(acc, [])).toBe(500);
  });
});

describe('netWorthInBase', () => {
  it('sums convertToBase(accountBalance) over all non-archived accounts', () => {
    const accounts: Account[] = [
      account({ id: 'usd', currency: 'USD', openingBalance: 100 }),
      account({ id: 'eur', currency: 'EUR', openingBalance: 200 }),
      account({
        id: 'archived',
        currency: 'USD',
        openingBalance: 9999,
        archived: true,
      }),
    ];
    const txns: Transaction[] = [
      tx({ id: 't1', accountId: 'usd', amount: -40 }),
      tx({ id: 't2', accountId: 'eur', amount: 50 }),
      tx({ id: 't3', accountId: 'archived', amount: 1_000_000 }),
    ];
    // base USD; 1 EUR = 1.1 USD
    // usd: 100 - 40 = 60 USD
    // eur: 200 + 50 = 250 EUR -> 275 USD
    // archived excluded
    // total = 60 + 275 = 335
    expect(netWorthInBase(accounts, txns, 'USD', { EUR: 1.1 })).toBeCloseTo(
      335,
    );
  });

  it('excludes archived accounts entirely', () => {
    const accounts: Account[] = [
      account({ id: 'live', currency: 'USD', openingBalance: 10 }),
      account({
        id: 'closed',
        currency: 'USD',
        openingBalance: 9999,
        archived: true,
      }),
    ];
    expect(netWorthInBase(accounts, [], 'USD', {})).toBe(10);
  });

  it('throws if a live foreign account has no rate', () => {
    const accounts: Account[] = [
      account({ id: 'eur', currency: 'EUR', openingBalance: 100 }),
    ];
    expect(() => netWorthInBase(accounts, [], 'USD', {})).toThrow(
      /Missing FX rate for EUR/,
    );
  });

  it('base-currency accounts need no rates', () => {
    const accounts: Account[] = [
      account({ id: 'usd', currency: 'USD', openingBalance: 250 }),
    ];
    expect(netWorthInBase(accounts, [], 'USD', {})).toBe(250);
  });
});
