// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 7a (import).
// Copied into src/lib/import/ by the Ringer check, run against the real
// modules, then removed. Pins the deterministic import core against embedded
// real-world samples: QIF parsing (incl. Microsoft Money DD/MM'YYYY dates and
// comma-grouped amounts), CSV parsing with a field mapping + quoted fields, a
// header auto-detector, and duplicate detection against existing rows.

import { describe, it, expect } from 'vitest';

import { parseQIF, parseCSV, detectCsvMapping, dedupeParsed } from './index';

const QIF = `!Type:Bank
D05/02'2026
T-50.00
PTesco
LGroceries
MWeekly shop
C*
^
D14/02'2026
T2000.00
PSalary Inc
LIncome:Salary
^
D20/02'2026
T-1,234.56
PLandlord
LHousing
^`;

describe('Phase 7a contract: QIF parsing', () => {
  it('parses the account type and each transaction, normalizing MS Money dates', () => {
    const result = parseQIF(QIF);
    expect(result.type).toBe('Bank');
    expect(result.transactions.length).toBe(3);

    const [a, b, c] = result.transactions;
    expect(a.date).toBe('2026-02-05'); // DD/MM'YYYY -> ISO
    expect(a.amount).toBe(-50);
    expect(a.payee).toBe('Tesco');
    expect(a.category).toBe('Groceries');
    expect(a.memo).toBe('Weekly shop');
    expect(a.cleared).toBe(true); // C*

    expect(b.date).toBe('2026-02-14');
    expect(b.amount).toBe(2000);
    expect(b.category).toBe('Income:Salary');

    expect(c.amount).toBe(-1234.56); // comma-grouped amount
    expect(c.date).toBe('2026-02-20');
  });
});

describe('Phase 7a contract: CSV parsing', () => {
  const CSV = 'Date,Amount,Payee,Category\n05/02/2026,-50.00,"Tesco, Ltd",Groceries\n06/02/2026,12.50,Cafe,Eating Out';

  it('auto-detects a column mapping from headers', () => {
    const m = detectCsvMapping(['Date', 'Amount', 'Payee', 'Category']);
    expect(m.date).toBe('Date');
    expect(m.amount).toBe('Amount');
    expect(m.payee).toBe('Payee');
    expect(m.category).toBe('Category');
  });

  it('parses rows with a mapping and handles quoted fields + date format', () => {
    const rows = parseCSV(CSV, {
      date: 'Date',
      amount: 'Amount',
      payee: 'Payee',
      category: 'Category',
      dateFormat: 'DD/MM/YYYY',
    });
    expect(rows.length).toBe(2);
    expect(rows[0].date).toBe('2026-02-05');
    expect(rows[0].amount).toBe(-50);
    expect(rows[0].payee).toBe('Tesco, Ltd'); // quoted comma preserved
    expect(rows[1].amount).toBe(12.5);
  });
});

describe('Phase 7a contract: duplicate detection', () => {
  it('separates new parsed transactions from ones already present', () => {
    const existing = [{ date: '2026-02-05', amount: -50, payee: 'Tesco' }];
    const parsed = [
      { date: '2026-02-05', amount: -50, payee: 'Tesco' },
      { date: '2026-02-06', amount: -20, payee: 'Cafe' },
    ] as never[];
    const { toCreate, duplicates } = dedupeParsed(parsed, existing as never[]);
    expect(toCreate.length).toBe(1);
    expect(toCreate[0].payee).toBe('Cafe');
    expect(duplicates.length).toBe(1);
  });
});
