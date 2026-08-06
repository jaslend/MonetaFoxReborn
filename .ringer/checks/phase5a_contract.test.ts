// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 5a (transactions).
// Copied into src/lib/transactions/ by the Ringer check, run against the real
// modules, then removed. It pins the deterministic core of transaction entry:
// split arithmetic (a split must sum to its parent amount) and the fact that an
// account balance is driven by the PARENT signed amount, not the split lines.
// Conventions carried from Phase 4: amount is SIGNED (inflow +, outflow -).

import { describe, it, expect } from 'vitest';

import { splitSum, isSplitBalanced } from './index';
import { accountBalance } from '@/lib/accounts';

describe('Phase 5a contract: split arithmetic', () => {
  it('sums split line amounts', () => {
    expect(splitSum([{ amount: 30 }, { amount: 70 }] as never)).toBe(100);
    expect(splitSum([] as never)).toBe(0);
  });

  it('a transaction with no splits is balanced', () => {
    expect(isSplitBalanced({ id: 't', accountId: 'a', date: '2026-01-01', amount: 50, currency: 'GBP', payee: 'x' } as never)).toBe(true);
  });

  it('splits that sum to the parent amount are balanced', () => {
    const tx = { id: 't', accountId: 'a', date: '2026-01-01', amount: -100, currency: 'GBP', payee: 'Shop',
      splits: [{ categoryId: 'c1', amount: -60 }, { categoryId: 'c2', amount: -40 }] };
    expect(isSplitBalanced(tx as never)).toBe(true);
  });

  it('splits that do NOT sum to the parent amount are unbalanced', () => {
    const tx = { id: 't', accountId: 'a', date: '2026-01-01', amount: -100, currency: 'GBP', payee: 'Shop',
      splits: [{ categoryId: 'c1', amount: -60 }, { categoryId: 'c2', amount: -30 }] };
    expect(isSplitBalanced(tx as never)).toBe(false);
  });
});

describe('Phase 5a contract: balance is driven by the parent amount', () => {
  it('a split transaction affects the account balance by its parent amount only', () => {
    const account = { id: 'a', name: 'Card', type: 'credit', currency: 'GBP', openingBalance: 0 };
    const txns = [
      { id: 't1', accountId: 'a', date: '2026-01-01', amount: -100, currency: 'GBP', payee: 'Shop',
        splits: [{ categoryId: 'c1', amount: -60 }, { categoryId: 'c2', amount: -40 }] },
      { id: 't2', accountId: 'a', date: '2026-01-02', amount: 250, currency: 'GBP', payee: 'Refund' },
    ];
    // 0 + (-100) + 250 = 150 — splits do not double-count.
    expect(accountBalance(account as never, txns as never)).toBe(150);
  });
});
