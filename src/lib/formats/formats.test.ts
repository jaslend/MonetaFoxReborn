import { describe, it, expect } from 'vitest';

import {
  register,
  getImporter,
  getExporter,
  listImportFormats,
  listExportFormats,
} from './index';
import { exportQIF } from '@/lib/export';
import { parseQIF } from '@/lib/import';
import type { Account, Transaction } from '@/lib/db';

describe('format registry', () => {
  it('registers the built-in qif + csv formats at module load', () => {
    expect(listImportFormats()).toEqual(expect.arrayContaining(['qif', 'csv']));
    expect(listExportFormats()).toContain('qif');
  });

  it('getImporter("qif") round-trips through parseQIF via the wrapper', () => {
    const importer = getImporter('qif');
    expect(importer).toBeDefined();
    const text = [
      '!Type:Bank',
      "D05/02'2026",
      'T-12.34',
      'PCoffee',
      'C*',
      '^',
    ].join('\n');
    const rows = importer!(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(-12.34);
    expect(rows[0].payee).toBe('Coffee');
    expect(rows[0].cleared).toBe(true);
    // Sanity: the wrapper is just parseQIF(...).transactions.
    expect(rows).toEqual(parseQIF(text).transactions);
  });

  it('getExporter("qif") is the exportQIF function and round-trips', () => {
    const exporter = getExporter('qif');
    expect(exporter).toBeDefined();
    const account: Account = {
      id: 'a1',
      name: 'Checking',
      type: 'checking',
      currency: 'GBP',
    };
    const transactions: Transaction[] = [
      {
        id: 't1',
        accountId: 'a1',
        date: '2026-02-05',
        amount: -5.25,
        currency: 'GBP',
        payee: 'Cafe',
        cleared: true,
      },
    ];
    const out = exporter!(account, transactions);
    expect(out.split('\n')[0]).toBe('!Type:Bank');
    // And the produced QIF parses back to the same row.
    const parsed = parseQIF(out).transactions;
    expect(parsed[0].date).toBe('2026-02-05');
    expect(parsed[0].amount).toBe(-5.25);
    expect(parsed[0].payee).toBe('Cafe');
    expect(parsed[0].cleared).toBe(true);
  });

  it('qif exporter is exactly the exportQIF reference', () => {
    expect(getExporter('qif')).toBe(exportQIF);
  });

  it('getImporter / getExporter return undefined for unknown ids', () => {
    expect(getImporter('ofx')).toBeUndefined();
    expect(getExporter('ofx')).toBeUndefined();
  });

  it('register() adds a new format so callers see it without code changes', () => {
    register({
      id: 'test-fmt',
      import: () => [],
      export: () => 'TEST',
    });
    expect(getImporter('test-fmt')).toBeDefined();
    expect(listImportFormats()).toContain('test-fmt');
    expect(getExporter('test-fmt')).toBeDefined();
    expect(listExportFormats()).toContain('test-fmt');
  });

  it('register() rejects an empty id', () => {
    expect(() => register({ id: '' } as never)).toThrow();
  });
});
