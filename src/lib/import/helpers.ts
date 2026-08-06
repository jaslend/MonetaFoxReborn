/**
 * Phase 7a — shared parsing helpers for QIF + CSV.
 *
 * Two pure, side-effect-free transforms every format parser reuses:
 *
 * - Date normalisation → ISO `YYYY-MM-DD`. Microsoft Money writes QIF dates as
 *   `DD/MM'YYYY` (an apostrophe separates the year); we also accept 2-digit
 *   years (assumed 20xx) and the plain `DD/MM/YYYY` / ISO forms as fallbacks.
 * - Amount parsing → a signed number, with thousands comma-separators stripped
 *   (per spec: `T-1,234.56` → `-1234.56`) and currency symbols / parentheses
 *   negatives handled.
 */
import type { CsvDateFormat } from './types';

/** Left-pad a numeric string fragment to two digits (`5` → `05`). */
function pad2(n: string): string {
  return n.length < 2 ? '0'.repeat(2 - n.length) + n : n;
}

/** Expand a 2-digit year to 4 digits by prefixing `20` (assume 20xx). */
function expandYear(y: string): string {
  const trimmed = y.replace(/^0+/, '');
  if (trimmed.length <= 2) {
    return '20' + pad2(trimmed.length === 0 ? '0' : trimmed);
  }
  return y;
}

/**
 * Parse a QIF date string to ISO `YYYY-MM-DD`.
 *
 * Supported (in priority order):
 * 1. Microsoft Money `DD/MM'YY(YY)` — e.g. `05/02'2026` → `2026-02-05`,
 *    `05/02'26` → `2026-02-05`.
 * 2. ISO `YYYY-MM-DD` (normalised, returned as-is when already padded).
 * 3. Day-first slash `DD/MM/YYYY` / `DD/MM/YY` (consistent with MS Money's
 *    day-first convention).
 *
 * Unrecognised non-empty input is returned verbatim so the caller can decide
 * whether to keep or reject the row.
 */
export function parseQifDate(raw: string): string {
  const s = raw.trim();
  if (s === '') return s;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  }

  const money = /^(\d{1,2})\/(\d{1,2})'(\d{2,4})$/.exec(s);
  if (money) {
    return `${expandYear(money[3])}-${pad2(money[2])}-${pad2(money[1])}`;
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (slash) {
    return `${expandYear(slash[3])}-${pad2(slash[2])}-${pad2(slash[1])}`;
  }

  return s;
}

/**
 * Parse a CSV date string to ISO `YYYY-MM-DD` according to `format`
 * (default `DD/MM/YYYY`). ISO `YYYY-MM-DD` input is always accepted regardless
 * of `format`. Dot/dash separators (`DD.MM.YYYY`, `DD-MM-YYYY`) are treated the
 * same as slashes. Unrecognised input is returned verbatim.
 */
export function parseCsvDate(
  raw: string,
  format: CsvDateFormat = 'DD/MM/YYYY',
): string {
  const s = raw.trim();
  if (s === '') return s;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  }

  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (parts) {
    const a = parts[1];
    const b = parts[2];
    const year = expandYear(parts[3]);
    const day = format === 'MM/DD/YYYY' ? b : a;
    const month = format === 'MM/DD/YYYY' ? a : b;
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  return s;
}

/**
 * Parse a signed decimal amount, STRIPPING thousands comma-separators and any
 * surrounding currency symbols / whitespace. Parentheses negatives
 * (`(123.45)`) are honoured. Returns 0 for unparseable / empty input.
 *
 * Per the Phase 7a contract: `1,234.56` → `1234.56`, `-1,234.56` → `-1234.56`.
 */
export function parseAmount(raw: string | undefined | null): number {
  if (raw === undefined || raw === null) return 0;
  let s = String(raw).trim();
  if (s === '') return 0;

  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1];
  }

  // Strip thousands commas, then everything that is not a digit, '.', '-' or '+'.
  s = s.replace(/,/g, '').replace(/[^0-9.+-]/g, '');
  if (s === '' || s === '-' || s === '+' || s === '.') return 0;

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

/**
 * QIF cleared-status flag (`C` line). Per spec: `C*`, `Ccleared`, `CX`, `CR`
 * → `true`; anything else (blank, `!`, etc.) → `false`.
 */
export function isClearedFlag(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === '*' || v === 'cleared' || v === 'x' || v === 'r';
}
