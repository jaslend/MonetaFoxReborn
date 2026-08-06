/**
 * Phase 7a — duplicate detection for import.
 *
 * A parsed row is a duplicate when an existing row has the SAME date, amount,
 * and payee. The rule is deliberately strict (exact date + exact amount +
 * exact payee) so a re-import of the same file produces no new rows, while a
 * genuinely new transaction with the same payee on the same day but a
 * different amount is still imported.
 */
import type { ParsedTransaction } from './types';

/** A minimal existing-row shape the deduper needs. */
export interface ExistingRow {
  date: string;
  amount: number;
  payee?: string;
}

export interface DedupeResult {
  toCreate: ParsedTransaction[];
  duplicates: ParsedTransaction[];
}

/**
 * Partition `parsed` into rows to create vs. duplicates of `existing`.
 * Comparison keys: exact `date` string, exact `amount` (===), and `payee`
 * (case-sensitive; undefined/empty payee on either side is treated as `''`).
 */
export function dedupeParsed(
  parsed: ParsedTransaction[],
  existing: ExistingRow[],
): DedupeResult {
  const toCreate: ParsedTransaction[] = [];
  const duplicates: ParsedTransaction[] = [];

  for (const p of parsed) {
    const pPayee = p.payee ?? '';
    const isDuplicate = existing.some(
      (e) =>
        e.date === p.date &&
        e.amount === p.amount &&
        (e.payee ?? '') === pPayee,
    );
    if (isDuplicate) {
      duplicates.push(p);
    } else {
      toCreate.push(p);
    }
  }

  return { toCreate, duplicates };
}
