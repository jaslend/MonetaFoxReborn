/**
 * Phase 7a — data IMPORT public types.
 *
 * These are the plain shapes the import parsers produce and the CSV mapping
 * wizard consumes. They are deliberately format-agnostic: a QIF row and a CSV
 * row both reduce to a `ParsedTransaction`, and `importTransactions` is the
 * single seam that turns a list of them into stored `Transaction` rows.
 *
 * Declared as `interface` (not `type`) to match the Phase 7a public-API
 * contract verbatim — these are not persisted through `EncryptedTable`, so the
 * `Record<string, unknown>` index-signature constraint that forces the DB
 * models to be `type` aliases does not apply here.
 */

/** A single transaction reduced from a QIF or CSV file, pre-persistence. */
export interface ParsedTransaction {
  /** ISO date string (YYYY-MM-DD); parsers normalise every format to this. */
  date: string;
  /** Signed amount: positive = inflow, negative = outflow. */
  amount: number;
  payee?: string;
  /** Category NAME (not a categoryId) — resolved by `importTransactions`. */
  category?: string;
  memo?: string;
  cleared?: boolean;
}

/**
 * Column-name mapping for CSV import. Each field is the verbatim header string
 * found in the file; `parseCSV` looks the column up by that header. `dateFormat`
 * is an option (not a column) controlling how `DD/MM/YYYY`-style dates are read.
 */
export interface CsvMapping {
  date: string;
  amount: string;
  payee?: string;
  category?: string;
  memo?: string;
  dateFormat?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
}

/** The date-format option type, reused internally by the parsers. */
export type CsvDateFormat = NonNullable<CsvMapping['dateFormat']>;
