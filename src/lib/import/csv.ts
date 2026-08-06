/**
 * Phase 7a — CSV parser.
 *
 * Hand-written (no `csv` dependency). Three exports:
 *
 * - `parseCsvText` — an RFC-4180-style tokenizer that handles QUOTED fields
 *   (a quoted value may contain commas, newlines, or doubled `""` escapes).
 *   Used internally by `parseCSV`.
 * - `detectCsvMapping(headers)` — fuzzy-matches common header names
 *   (case-insensitive) to the `CsvMapping` fields.
 * - `parseCSV(text, mapping)` — maps each row per `mapping`, normalising dates
 *   to ISO and parsing signed amounts (commas stripped).
 */
import type { CsvMapping, ParsedTransaction } from './types';
import { parseAmount, parseCsvDate } from './helpers';

/**
 * Tokenise a CSV document into rows of string fields. Quoted fields may span
 * newlines and contain commas; a doubled `""` inside quotes is a literal `"`.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i += text.charAt(i + 1) === '\n' ? 2 : 1;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Flush a trailing field/row when the document did not end with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The fields we attempt to auto-detect, in priority order. */
type DetectableField = 'date' | 'amount' | 'payee' | 'category' | 'memo';

const FIELD_ORDER: DetectableField[] = [
  'date',
  'amount',
  'payee',
  'category',
  'memo',
];

/** Exact (case-insensitive, whitespace-collapsed) synonyms per field. */
const FIELD_SYNONYMS: Record<DetectableField, string[]> = {
  date: [
    'date',
    'transaction date',
    'trans date',
    'post date',
    'posted date',
    'value date',
  ],
  amount: ['amount', 'transaction amount', 'value'],
  payee: ['payee', 'description', 'name', 'merchant', 'details', 'narrative'],
  category: ['category', 'categories', 'cat'],
  memo: [
    'memo',
    'memos',
    'notes',
    'note',
    'comments',
    'comment',
    'reference',
    'ref',
  ],
};

/** Substring keywords used for the fuzzy (second) pass. */
const FIELD_KEYWORDS: Record<DetectableField, string[]> = {
  date: ['date'],
  amount: ['amount'],
  payee: ['payee', 'description', 'merchant'],
  category: ['categ'],
  memo: ['memo', 'note', 'reference'],
};

function normalizeHeader(h: string): string {
  return (h ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Fuzzy-match common header names to `CsvMapping` fields. Matching is
 * case-insensitive and whitespace-insensitive; exact synonym matches win, then
 * substring keyword matches fill remaining fields. Each header maps to at most
 * one field, and each field takes the first matching header. Returns only the
 * fields it could detect.
 */
export function detectCsvMapping(headers: string[]): Partial<CsvMapping> {
  const mapping: Partial<CsvMapping> = {};
  const norm = headers.map(normalizeHeader);
  const taken = new Set<number>();

  // Pass 1: exact synonym match.
  for (const field of FIELD_ORDER) {
    for (let h = 0; h < norm.length; h++) {
      if (taken.has(h)) continue;
      if (FIELD_SYNONYMS[field].includes(norm[h])) {
        mapping[field] = headers[h];
        taken.add(h);
        break;
      }
    }
  }

  // Pass 2: substring keyword match for fields not yet assigned.
  for (const field of FIELD_ORDER) {
    if (mapping[field] !== undefined) continue;
    for (let h = 0; h < norm.length; h++) {
      if (taken.has(h)) continue;
      if (FIELD_KEYWORDS[field].some((k) => norm[h].includes(k))) {
        mapping[field] = headers[h];
        taken.add(h);
        break;
      }
    }
  }

  return mapping;
}

function indexOfHeader(headers: string[], header: string | undefined): number {
  if (header === undefined) return -1;
  const idx = headers.indexOf(header);
  return idx;
}

/**
 * Parse a CSV document into `ParsedTransaction[]` using `mapping` to locate the
 * columns. The first row is treated as the header row. Dates are normalised to
 * ISO per `mapping.dateFormat` (default `DD/MM/YYYY`); amounts are parsed as
 * signed numbers with thousands commas stripped. Empty trailing rows are
 * skipped.
 */
export function parseCSV(
  text: string,
  mapping: CsvMapping,
): ParsedTransaction[] {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const headers = rows[0];

  const dateIdx = indexOfHeader(headers, mapping.date);
  const amountIdx = indexOfHeader(headers, mapping.amount);
  const payeeIdx = indexOfHeader(headers, mapping.payee);
  const categoryIdx = indexOfHeader(headers, mapping.category);
  const memoIdx = indexOfHeader(headers, mapping.memo);
  const fmt = mapping.dateFormat ?? 'DD/MM/YYYY';

  const out: ParsedTransaction[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    // Skip rows that are entirely empty (blank trailing lines, etc.).
    if (row.length === 0 || (row.length === 1 && row[0].trim() === ''))
      continue;

    const date = dateIdx >= 0 ? parseCsvDate(row[dateIdx] ?? '', fmt) : '';
    const amount = amountIdx >= 0 ? parseAmount(row[amountIdx] ?? '') : 0;
    const payeeRaw = payeeIdx >= 0 ? (row[payeeIdx] ?? '').trim() : '';
    const categoryRaw = categoryIdx >= 0 ? (row[categoryIdx] ?? '').trim() : '';
    const memoRaw = memoIdx >= 0 ? (row[memoIdx] ?? '').trim() : '';

    out.push({
      date,
      amount,
      payee: payeeRaw !== '' ? payeeRaw : undefined,
      category: categoryRaw !== '' ? categoryRaw : undefined,
      memo: memoRaw !== '' ? memoRaw : undefined,
    });
  }
  return out;
}
