// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 7b (export).
// Copied into src/lib/export/ by the Ringer check, run against the real
// modules, then removed. Pins: (1) QIF export round-trips through the Phase 7a
// parser; (2) the encrypted backup is ciphertext at rest, decrypts back with
// the right passphrase, and rejects a wrong one; (3) the format registry
// resolves importers/exporters.

import { describe, it, expect } from 'vitest';

import { exportQIF, exportEncrypted, importEncrypted } from './index';
import { parseQIF } from '@/lib/import';
import { getExporter, getImporter, listExportFormats } from '@/lib/formats';

const account = { id: 'a1', name: 'Current', type: 'checking', currency: 'GBP', openingBalance: 0 } as never;
const txns = [
  { id: 't1', accountId: 'a1', date: '2026-02-05', amount: -50, currency: 'GBP', payee: 'Tesco', categoryId: 'Groceries', cleared: true },
  { id: 't2', accountId: 'a1', date: '2026-02-14', amount: 2000, currency: 'GBP', payee: 'Salary Inc', categoryId: 'Income' },
] as never[];

describe('Phase 7b contract: QIF export round-trips through the parser', () => {
  it('produces QIF that Phase 7a parseQIF reads back to the same transactions', () => {
    const qif = exportQIF(account, txns);
    const parsed = parseQIF(qif);
    expect(parsed.transactions.length).toBe(2);
    expect(parsed.transactions[0].date).toBe('2026-02-05');
    expect(parsed.transactions[0].amount).toBe(-50);
    expect(parsed.transactions[0].payee).toBe('Tesco');
    expect(parsed.transactions[0].cleared).toBe(true);
    expect(parsed.transactions[1].amount).toBe(2000);
    expect(parsed.transactions[1].payee).toBe('Salary Inc');
  });
});

describe('Phase 7b contract: encrypted backup', () => {
  const backup = {
    version: 1,
    accounts: [account],
    transactions: [{ id: 'x', accountId: 'a1', date: '2026-02-05', amount: -99, currency: 'GBP', payee: 'SecretPayee' }],
    categories: [],
    budgets: [],
  };

  it('is ciphertext at rest and decrypts back with the right passphrase', async () => {
    const blob = await exportEncrypted(backup as never, 'correct horse battery staple');
    expect(blob).not.toContain('SecretPayee'); // encrypted, not plaintext
    const restored = await importEncrypted(blob, 'correct horse battery staple');
    expect((restored as { transactions: { payee: string }[] }).transactions[0].payee).toBe('SecretPayee');
  });

  it('rejects a wrong passphrase', async () => {
    const blob = await exportEncrypted(backup as never, 'right');
    await expect(importEncrypted(blob, 'wrong')).rejects.toBeDefined();
  });
});

describe('Phase 7b contract: format registry', () => {
  it('resolves a QIF exporter and QIF/CSV importers, and lists export formats', () => {
    expect(typeof getExporter('qif')).toBe('function');
    expect(getImporter('qif')).toBeDefined();
    expect(getImporter('csv')).toBeDefined();
    expect(listExportFormats()).toContain('qif');
  });
});
