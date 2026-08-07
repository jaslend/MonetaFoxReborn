/**
 * Phase 7b — modular format registry.
 *
 * A tiny registry map so future formats (OFX, …) slot in via `register()`
 * without callers changing. Each format has an optional `import` (text →
 * `ParsedTransaction[]`) and/or `export` (Account + Transactions → string)
 * function. Built-ins (`qif`, `csv`) are registered at module load; the
 * Phase 7a import parsers are wrapped read-only (this module does NOT
 * reimplement parsing — it delegates to `parseQIF` / `parseCSV`).
 *
 * Public API (pinned by the Phase 7b contract):
 * - `getImporter(id)` / `getExporter(id)` — lookup, `undefined` if absent.
 * - `listImportFormats()` / `listExportFormats()` — registered ids.
 * - `register(format)` — extension seam.
 */
import type { Account, Transaction } from '@/lib/db';
import {
  parseQIF,
  parseCSV,
  detectCsvMapping,
  parseCsvText,
  type ParsedTransaction,
  type CsvMapping,
} from '@/lib/import';
import { exportQIF } from '@/lib/export';

/** A text → parsed-rows importer. Returns `[]` on empty/unparseable input. */
export type Importer = (text: string) => ParsedTransaction[];

/** An (account, transactions) → text exporter (e.g. QIF). */
export type Exporter = (
  account: Account,
  transactions: Transaction[],
) => string;

/** A registered format: an id plus optional importer/exporter functions. */
export interface Format {
  id: string;
  label?: string;
  import?: Importer;
  export?: Exporter;
}

const registry = new Map<string, Format>();

/**
 * Register (or replace) a format. Built-ins are registered below; external
 * callers use this seam to add OFX etc. without touching callers.
 */
export function register(format: Format): void {
  if (!format.id) throw new Error('Format id is required');
  registry.set(format.id, format);
}

/** Look up a format's importer by id (`undefined` if absent / no importer). */
export function getImporter(id: string): Importer | undefined {
  return registry.get(id)?.import;
}

/** Look up a format's exporter by id (`undefined` if absent / no exporter). */
export function getExporter(id: string): Exporter | undefined {
  return registry.get(id)?.export;
}

/** Ids of every format that has an importer, in registration order. */
export function listImportFormats(): string[] {
  const out: string[] = [];
  for (const f of registry.values()) {
    if (f.import) out.push(f.id);
  }
  return out;
}

/** Ids of every format that has an exporter, in registration order. */
export function listExportFormats(): string[] {
  const out: string[] = [];
  for (const f of registry.values()) {
    if (f.export) out.push(f.id);
  }
  return out;
}

/**
 * QIF importer: wrap `parseQIF` (which returns `{ type, transactions }`) and
 * surface just the parsed transaction rows.
 */
const qifImporter: Importer = (text) => parseQIF(text).transactions;

/**
 * CSV importer: detect the column mapping from the header row, then parse with
 * `parseCSV`. The default date format is day-first (DD/MM/YYYY) — callers that
 * need another format can call `parseCSV` directly with an explicit mapping.
 */
const csvImporter: Importer = (text) => {
  const rows = parseCsvText(text);
  if (rows.length === 0) return [];
  const detected = detectCsvMapping(rows[0]);
  const mapping: CsvMapping = {
    date: detected.date ?? 'Date',
    amount: detected.amount ?? 'Amount',
    payee: detected.payee,
    category: detected.category,
    memo: detected.memo,
    dateFormat: 'DD/MM/YYYY',
  };
  return parseCSV(text, mapping);
};

// --- Built-in registrations (module-load side effect) ---
register({
  id: 'qif',
  label: 'Quicken QIF',
  import: qifImporter,
  export: exportQIF,
});
register({ id: 'csv', label: 'CSV', import: csvImporter });
