/**
 * Phase 7a — data IMPORT barrel.
 *
 * Public API (pinned by the Phase 7a contract):
 * - `ParsedTransaction`, `CsvMapping` — plain shapes produced/consumed here.
 * - `parseQIF(text)` — QIF → `{ type, transactions }`.
 * - `detectCsvMapping(headers)` / `parseCSV(text, mapping)` — CSV detection + parse.
 * - `dedupeParsed(parsed, existing)` — duplicate partition.
 * - `importTransactions(repositories, options)` — persistence seam.
 *
 * Export is intentionally NOT implemented here (that is Phase 7b).
 */
export type { ParsedTransaction, CsvMapping, CsvDateFormat } from './types';
export { parseQifDate, parseCsvDate, parseAmount } from './helpers';
export { parseQIF, type ParsedQif } from './qif';
export { detectCsvMapping, parseCSV, parseCsvText } from './csv';
export { dedupeParsed, type ExistingRow, type DedupeResult } from './dedupe';
export {
  importTransactions,
  type ImportTarget,
  type ImportOptions,
  type ImportResult,
} from './importService';
