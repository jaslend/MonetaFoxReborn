/**
 * Phase 7a — QIF parser.
 *
 * Hand-written (no dependencies). Reads the `!Type:<X>` header, then parses
 * entry blocks delimited by `^`, where each line's first character is a field
 * code:
 *
 *   D = date, T = amount, P = payee, L = category, M = memo, C = cleared status
 *
 * Dates are normalised to ISO `YYYY-MM-DD` (Microsoft Money `DD/MM'YYYY` is the
 * headline format — see `parseQifDate`). Amounts are signed decimals with
 * thousands commas stripped (see `parseAmount`). Unknown field codes are
 * ignored so real-world QIF exports (which carry `N`, `A`, `S`, `E`, …) still
 * parse.
 */
import type { ParsedTransaction } from './types';
import { isClearedFlag, parseAmount, parseQifDate } from './helpers';

/** Result of parsing a QIF document. */
export interface ParsedQif {
  type?: string;
  transactions: ParsedTransaction[];
}

/**
 * Parse a QIF document into `{ type, transactions }`. `type` is the value after
 * `!Type:` (e.g. `'Bank'`); transactions preserve their file order.
 */
export function parseQIF(text: string): ParsedQif {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let type: string | undefined;
  const transactions: ParsedTransaction[] = [];

  type Cur = Partial<ParsedTransaction>;
  let current: Cur | null = null;

  const flush = () => {
    if (!current) return;
    if (
      current.date !== undefined ||
      current.amount !== undefined ||
      current.payee !== undefined ||
      current.memo !== undefined ||
      current.category !== undefined
    ) {
      transactions.push({
        date: current.date ?? '',
        amount: typeof current.amount === 'number' ? current.amount : 0,
        payee: current.payee,
        category: current.category,
        memo: current.memo,
        cleared: current.cleared,
      });
    }
    current = null;
  };

  for (const line of lines) {
    // Blank lines are just separators; do not end an entry.
    if (line === '') continue;

    // Header / option lines: `!Type:Bank`, `!Account`, `!Option:AutoSwitch`, …
    if (line.startsWith('!')) {
      const m = /^!Type:\s*(.*)$/i.exec(line);
      if (m) type = m[1].trim();
      continue;
    }

    // `^` terminates the current entry.
    if (line === '^') {
      flush();
      continue;
    }

    const code = line.charAt(0);
    const value = line.slice(1);

    if (current === null) current = {};
    switch (code) {
      case 'D':
        current.date = parseQifDate(value);
        break;
      case 'T':
        current.amount = parseAmount(value);
        break;
      case 'P':
        current.payee = value.trim();
        break;
      case 'L':
        current.category = value.trim();
        break;
      case 'M':
        current.memo = value.trim();
        break;
      case 'C':
        current.cleared = isClearedFlag(value);
        break;
      default:
        // Unknown field code (N, A, S, E, …) — ignore but keep the entry alive.
        break;
    }
  }

  // Flush a trailing entry that had no closing `^`.
  flush();

  return { type, transactions };
}
