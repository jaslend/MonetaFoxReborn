import { describe, it, expect } from 'vitest';

import {
  parseQIF,
  parseCSV,
  detectCsvMapping,
  dedupeParsed,
  parseQifDate,
  parseCsvDate,
  parseAmount,
  type CsvMapping,
} from './index';

describe('parseQIF', () => {
  it('reads the !Type header and parses a Microsoft Money QIF block', () => {
    const text = [
      '!Type:Bank',
      "D05/02'2026",
      'T-1,234.56',
      'PTesco, Ltd',
      'LGroceries',
      'MWeekly shop',
      'C*',
      '^',
      "D06/02'2026",
      'T2,500.00',
      'PSalary',
      'LIncome:Salary',
      'Ccleared',
      '^',
    ].join('\n');

    const { type, transactions } = parseQIF(text);

    expect(type).toBe('Bank');
    expect(transactions).toEqual([
      {
        date: '2026-02-05',
        amount: -1234.56,
        payee: 'Tesco, Ltd',
        category: 'Groceries',
        memo: 'Weekly shop',
        cleared: true,
      },
      {
        date: '2026-02-06',
        amount: 2500,
        payee: 'Salary',
        category: 'Income:Salary',
        memo: undefined,
        cleared: true,
      },
    ]);
  });

  it('expands 2-digit MS Money years to 20xx', () => {
    const text = '!Type:Bank\nD7/1/25\nT-10.00\nPCoffee\n^\n';
    // `7/1/25` is day-first DD/MM/YY (no apostrophe) → 2025-01-07.
    const { transactions } = parseQIF(text);
    expect(transactions[0].date).toBe('2025-01-07');
    expect(transactions[0].amount).toBe(-10);
  });

  it('strips thousands commas from amounts and handles cleared variants', () => {
    const text = [
      '!Type:Bank',
      "D05/02'2026",
      'T-1,234.56',
      'PRent',
      'CX',
      '^',
      "D05/02'2026",
      'T1,000.00',
      'PGift',
      'CR',
      '^',
      "D05/02'2026",
      'T50.00',
      'PCash',
      'C',
      '^',
    ].join('\n');
    const { transactions } = parseQIF(text);
    expect(transactions[0].amount).toBe(-1234.56);
    expect(transactions[0].cleared).toBe(true);
    expect(transactions[1].cleared).toBe(true);
    expect(transactions[2].cleared).toBe(false);
  });

  it('ignores unknown field codes and !Option lines', () => {
    const text = [
      '!Type:Cash',
      '!Option:AutoSwitch',
      'N1234',
      "D05/02'2026",
      'T-9.99',
      'PABC',
      'A1 Main St',
      '^',
    ].join('\n');
    const { type, transactions } = parseQIF(text);
    expect(type).toBe('Cash');
    expect(transactions).toHaveLength(1);
    expect(transactions[0].payee).toBe('ABC');
    expect(transactions[0].amount).toBe(-9.99);
  });

  it('flushes a trailing entry without a closing caret', () => {
    const text = "!Type:Bank\nD05/02'2026\nT-5.00\nPBurger";
    const { transactions } = parseQIF(text);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual({
      date: '2026-02-05',
      amount: -5,
      payee: 'Burger',
      category: undefined,
      memo: undefined,
      cleared: undefined,
    });
  });

  it('normalises ISO and day-first slash dates', () => {
    expect(parseQifDate('2026-02-05')).toBe('2026-02-05');
    expect(parseQifDate('05/02/2026')).toBe('2026-02-05');
    expect(parseQifDate("05/02'2026")).toBe('2026-02-05');
    expect(parseQifDate("5/2'26")).toBe('2026-02-05');
  });
});

describe('parseAmount', () => {
  it('strips thousands commas and currency symbols', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-1,234.56')).toBe(-1234.56);
    expect(parseAmount('£1,234.56')).toBe(1234.56);
    expect(parseAmount('-£1,234.56')).toBe(-1234.56);
    expect(parseAmount('(123.45)')).toBe(-123.45);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
  });
});

describe('detectCsvMapping', () => {
  it('maps standard headers case-insensitively', () => {
    const m = detectCsvMapping([
      'Date',
      'Amount',
      'Description',
      'Category',
      'Notes',
    ]);
    expect(m).toEqual({
      date: 'Date',
      amount: 'Amount',
      payee: 'Description',
      category: 'Category',
      memo: 'Notes',
    });
  });

  it('maps headers regardless of case and surrounding whitespace', () => {
    const m = detectCsvMapping(['  DATE ', 'amount ', '  Payee ']);
    expect(m.date).toBe('  DATE ');
    expect(m.amount).toBe('amount ');
    expect(m.payee).toBe('  Payee ');
  });

  it('leaves unmapped fields absent', () => {
    const m = detectCsvMapping(['Date', 'Amount']);
    expect(m.date).toBe('Date');
    expect(m.amount).toBe('Amount');
    expect(m.payee).toBeUndefined();
    expect(m.category).toBeUndefined();
    expect(m.memo).toBeUndefined();
  });

  it('fuzzy-matches via substring for non-exact headers', () => {
    const m = detectCsvMapping([
      'Transaction Date',
      'Amount (GBP)',
      'Merchant Name',
    ]);
    expect(m.date).toBe('Transaction Date');
    expect(m.amount).toBe('Amount (GBP)');
    expect(m.payee).toBe('Merchant Name');
  });

  it('does not assign the same header to two fields', () => {
    const m = detectCsvMapping(['Date', 'Amount']);
    const values = [m.date, m.amount, m.payee, m.category, m.memo].filter(
      (v) => v !== undefined,
    );
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('parseCSV', () => {
  const mapping: CsvMapping = {
    date: 'Date',
    amount: 'Amount',
    payee: 'Payee',
    category: 'Category',
    memo: 'Notes',
    dateFormat: 'DD/MM/YYYY',
  };

  it('parses rows including quoted fields with embedded commas', () => {
    const text = [
      'Date,Amount,Payee,Category,Notes',
      '05/02/2026,-12.34,"Tesco, Ltd",Groceries,"Weekly shop"',
      '06/02/2026,2500.00,Salary,Income,',
    ].join('\n');

    const rows = parseCSV(text, mapping);
    expect(rows).toEqual([
      {
        date: '2026-02-05',
        amount: -12.34,
        payee: 'Tesco, Ltd',
        category: 'Groceries',
        memo: 'Weekly shop',
      },
      {
        date: '2026-02-06',
        amount: 2500,
        payee: 'Salary',
        category: 'Income',
        memo: undefined,
      },
    ]);
  });

  it('respects dateFormat MM/DD/YYYY', () => {
    const text = 'Date,Amount\n05/02/2026,10.00\n';
    const rows = parseCSV(text, { ...mapping, dateFormat: 'MM/DD/YYYY' });
    // MM/DD → month=05, day=02 → 2026-05-02 (differs from DD/MM's 2026-02-05).
    expect(rows[0].date).toBe('2026-05-02');
  });

  it('accepts ISO dates regardless of dateFormat', () => {
    const text = 'Date,Amount\n2026-02-05,10.00\n';
    const rows = parseCSV(text, { ...mapping, dateFormat: 'DD/MM/YYYY' });
    expect(rows[0].date).toBe('2026-02-05');
  });

  it('handles doubled-quote escapes inside quoted fields', () => {
    const text = 'Date,Amount,Payee\n05/02/2026,1.00,"Say ""hi"""\n';
    const rows = parseCSV(text, mapping);
    expect(rows[0].payee).toBe('Say "hi"');
  });

  it('skips fully blank rows', () => {
    const text = 'Date,Amount\n05/02/2026,1.00\n\n06/02/2026,2.00\n';
    const rows = parseCSV(text, mapping);
    expect(rows).toHaveLength(2);
  });

  it('parseCsvDate default format is DD/MM/YYYY', () => {
    expect(parseCsvDate('05/02/2026')).toBe('2026-02-05');
    expect(parseCsvDate('05/02/2026', 'MM/DD/YYYY')).toBe('2026-05-02');
    expect(parseCsvDate('2026-02-05', 'DD/MM/YYYY')).toBe('2026-02-05');
  });

  it('uses the detected mapping end-to-end', () => {
    const text = [
      'Transaction Date,Amount,Description,Notes',
      '05/02/2026,-9.99,Coffee,Latte',
    ].join('\n');
    const detected = detectCsvMapping([
      'Transaction Date',
      'Amount',
      'Description',
      'Notes',
    ]);
    const rows = parseCSV(text, {
      date: detected.date!,
      amount: detected.amount!,
      payee: detected.payee!,
      memo: detected.memo!,
      dateFormat: 'DD/MM/YYYY',
    });
    expect(rows[0]).toEqual({
      date: '2026-02-05',
      amount: -9.99,
      payee: 'Coffee',
      category: undefined,
      memo: 'Latte',
    });
  });
});

describe('dedupeParsed', () => {
  const parsed = [
    { date: '2026-02-05', amount: -10, payee: 'A' },
    { date: '2026-02-05', amount: -10, payee: 'A' }, // dup of the first
    { date: '2026-02-05', amount: -10, payee: 'B' }, // different payee
    { date: '2026-02-05', amount: 10, payee: 'A' }, // different amount (sign)
    { date: '2026-02-06', amount: -10, payee: 'A' }, // different date
  ];

  it('flags rows matching an existing row on date+amount+payee', () => {
    const existing = [{ date: '2026-02-05', amount: -10, payee: 'A' }];
    const { toCreate, duplicates } = dedupeParsed(parsed, existing);
    // Both identical 'A' rows match the existing one (dedupe is vs existing only).
    expect(duplicates).toHaveLength(2);
    expect(duplicates.every((d) => d.payee === 'A')).toBe(true);
    expect(toCreate).toHaveLength(3);
  });

  it('treats undefined payee as empty string for matching', () => {
    const { toCreate } = dedupeParsed(
      [{ date: '2026-01-01', amount: 5 }],
      [{ date: '2026-01-01', amount: 5, payee: '' }],
    );
    expect(toCreate).toHaveLength(0);
  });

  it('returns all rows when there is no existing history', () => {
    const { toCreate, duplicates } = dedupeParsed(parsed, []);
    expect(toCreate).toHaveLength(5);
    expect(duplicates).toHaveLength(0);
  });
});
