// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { parseQIF } from '@/lib/import';
import {
  exportQIF,
  formatQifDate,
  accountTypeToQifType,
  exportEncrypted,
  importEncrypted,
  type BackupData,
} from './index';
import type { Account, Transaction } from '@/lib/db';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Checking',
    type: 'checking',
    currency: 'GBP',
    ...overrides,
  };
}

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    date: '2026-02-05',
    amount: -1234.56,
    currency: 'GBP',
    payee: 'Tesco, Ltd',
    ...overrides,
  };
}

describe('exportQIF', () => {
  it('emits a !Type header mapped from the account type', () => {
    const out = exportQIF(account({ type: 'cash' }), []);
    expect(out.split('\n')[0]).toBe('!Type:Cash');
  });

  it('round-trips through parseQIF preserving date/amount/payee/cleared', () => {
    const transactions: Transaction[] = [
      tx({
        id: 'tx-1',
        date: '2026-02-05',
        amount: -1234.56,
        payee: 'Tesco, Ltd',
        categoryId: 'cat-1',
        notes: 'Weekly shop',
        cleared: true,
      }),
      tx({
        id: 'tx-2',
        date: '2026-02-06',
        amount: 2500,
        payee: 'Salary',
        cleared: false,
      }),
    ];

    const qif = exportQIF(account(), transactions);
    const { type, transactions: parsed } = parseQIF(qif);

    expect(type).toBe('Bank');
    expect(parsed).toHaveLength(2);
    // Round-trip contract: date, amount, payee, cleared preserved.
    expect(parsed[0].date).toBe('2026-02-05');
    expect(parsed[0].amount).toBe(-1234.56);
    expect(parsed[0].payee).toBe('Tesco, Ltd');
    expect(parsed[0].cleared).toBe(true);
    expect(parsed[1].date).toBe('2026-02-06');
    expect(parsed[1].amount).toBe(2500);
    expect(parsed[1].payee).toBe('Salary');
    // Uncleared round-trips as falsy (parseQIF leaves cleared undefined when
    // no C line is present — see import/qif.ts; the cleared *status* is
    // preserved: cleared stays cleared, uncleared stays uncleared).
    expect(parsed[1].cleared).toBeFalsy();
  });

  it('formats amounts with exactly two decimals', () => {
    const out = exportQIF(account(), [tx({ amount: 5 })]);
    const tLine = out.split('\n').find((l) => l.startsWith('T'))!;
    expect(tLine).toBe('T5.00');
  });

  it('emits C* only when cleared, M only with notes, L only with categoryId', () => {
    const cleared = exportQIF(account(), [
      tx({ cleared: true, notes: 'n', categoryId: 'c' }),
    ]);
    expect(cleared).toContain('C*');
    expect(cleared).toContain('Mn');
    expect(cleared).toContain('Lc');

    const uncleared = exportQIF(account(), [
      tx({ cleared: false, notes: undefined, categoryId: undefined }),
    ]);
    expect(uncleared).not.toContain('C*');
    expect(uncleared.split('\n').some((l) => l.startsWith('M'))).toBe(false);
    expect(uncleared.split('\n').some((l) => l.startsWith('L'))).toBe(false);
  });

  it('terminates each entry with ^', () => {
    const out = exportQIF(account(), [tx(), tx({ id: 'tx-2' })]);
    const carets = out.split('\n').filter((l) => l === '^');
    expect(carets).toHaveLength(2);
  });

  it("formatQifDate converts ISO to DD/MM'YYYY", () => {
    expect(formatQifDate('2026-02-05')).toBe("05/02'2026");
    expect(formatQifDate('not-a-date')).toBe('not-a-date');
  });

  it('maps every account type', () => {
    expect(accountTypeToQifType('checking')).toBe('Bank');
    expect(accountTypeToQifType('savings')).toBe('Bank');
    expect(accountTypeToQifType('credit')).toBe('CCard');
    expect(accountTypeToQifType('cash')).toBe('Cash');
    expect(accountTypeToQifType('investment')).toBe('Invst');
    expect(accountTypeToQifType('loan')).toBe('Bank');
  });
});

describe('encrypted backup round-trip', () => {
  const passphrase = 'correct horse battery staple';

  function sampleData(): BackupData {
    return {
      version: 1,
      accounts: [account({ name: 'My Checking' })],
      transactions: [
        tx({ payee: 'Tesco, Ltd', notes: 'secret' }),
        tx({ id: 'tx-2', payee: 'Acme Corp', amount: 99.95 }),
      ],
      categories: [{ id: 'cat-1', name: 'Groceries' }],
      budgets: [
        { id: 'b-1', categoryId: 'cat-1', month: '2026-02', limit: 200 },
      ],
    };
  }

  it('round-trips exportEncrypted -> importEncrypted to the same data', async () => {
    const blob = await exportEncrypted(sampleData(), passphrase);
    const restored = await importEncrypted(blob, passphrase);
    expect(restored.version).toBe(1);
    expect(restored.accounts).toHaveLength(1);
    expect(restored.accounts[0].name).toBe('My Checking');
    expect(restored.transactions).toHaveLength(2);
    expect(restored.transactions[0].payee).toBe('Tesco, Ltd');
    expect(restored.transactions[0].notes).toBe('secret');
    expect(restored.categories).toHaveLength(1);
    expect(restored.budgets).toHaveLength(1);
  });

  it('output is ciphertext — plaintext payees do NOT appear in the blob', async () => {
    const data = sampleData();
    const blob = await exportEncrypted(data, passphrase);
    // The envelope JSON itself must not leak any payee.
    expect(blob).not.toContain('Tesco, Ltd');
    expect(blob).not.toContain('Acme Corp');
    expect(blob).not.toContain('secret');
    expect(blob).not.toContain('My Checking');
  });

  it('a WRONG passphrase REJECTS (AES-GCM auth), not garbage', async () => {
    const blob = await exportEncrypted(sampleData(), passphrase);
    await expect(importEncrypted(blob, 'wrong passphrase')).rejects.toThrow();
  });

  it('each backup uses a fresh salt → different ciphertext for same data', async () => {
    const data = sampleData();
    const a = await exportEncrypted(data, passphrase);
    const b = await exportEncrypted(data, passphrase);
    expect(a).not.toBe(b);
    // ...but both still decrypt to the same data.
    expect((await importEncrypted(a, passphrase)).transactions).toEqual(
      (await importEncrypted(b, passphrase)).transactions,
    );
  });

  it('rejects a malformed envelope', async () => {
    await expect(importEncrypted('not json', passphrase)).rejects.toThrow();
    await expect(importEncrypted('{"v":1}', passphrase)).rejects.toThrow();
  });
});
