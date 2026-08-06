/**
 * Currency support for MonetaFox Reborn (Phase 4).
 *
 * Conventions (pinned by the Phase 4 contract):
 * - There is a SINGLE base currency, fixed at setup and stored on the Settings
 *   record (`Settings.baseCurrency`).
 * - Foreign/crypto amounts are stored in their ORIGINAL currency and only
 *   converted for reporting (net worth, reports, dashboard).
 * - The FX rates map is `rates[currency] = <base-currency units> per 1 unit of
 *   <currency>`. To convert an amount in `currency` to the base currency you
 *   multiply by `rates[currency]`. Converting the base currency to itself is the
 *   identity (no rate entry needed). A MISSING rate must THROW — we never guess.
 */

/** A tradeable / holdable currency definition. */
export type Currency = {
  /** ISO 4217 code (e.g. 'USD') or a crypto ticker ('BTC', 'ETH'). */
  code: string;
  /** Display symbol (e.g. '$', '€', '₿'). */
  symbol: string;
  /** Human-readable name. */
  name: string;
};

/**
 * A reasonable starter set: the major ISO fiat currencies plus the two crypto
 * currencies the spec calls out by name (BTC, ETH). Phase 9 (investments) will
 * extend this with more assets; Phase 4 just needs the list for pickers.
 */
export const CURRENCIES: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BTC', symbol: '₿', name: 'Bitcoin' },
  { code: 'ETH', symbol: 'Ξ', name: 'Ethereum' },
];

/** Look up a currency definition by code; returns `undefined` if unknown. */
export function getCurrency(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

/** Codes that are NOT ISO 4217 and so cannot use `Intl.NumberFormat` currency. */
const CRYPTO_CODES = new Set(['BTC', 'ETH']);

/** True for crypto tickers that need manual symbol formatting. */
export function isCrypto(code: string): boolean {
  return CRYPTO_CODES.has(code);
}

/**
 * Convert an `amount` in currency `from` to the base currency.
 *
 * `rates` maps `currency => <base units> per 1 unit of <currency>`, so the
 * converted value is `amount * rates[from]`. When `from === base` the result is
 * the amount unchanged (identity) — no rate entry is required for the base
 * currency. If `from !== base` and `rates[from]` is missing, this THROWS rather
 * than silently guessing an exchange rate.
 */
export function convertToBase(
  amount: number,
  from: string,
  base: string,
  rates: Record<string, number>,
): number {
  if (from === base) return amount;
  const rate = rates[from];
  if (rate === undefined || rate === null || Number.isNaN(rate)) {
    throw new Error(
      `Missing FX rate for ${from} (base ${base}); a rate must be set before converting`,
    );
  }
  return amount * rate;
}

/**
 * Format a monetary `amount` in the given `code` for display.
 *
 * For ISO 4217 fiat codes this uses the host `Intl.NumberFormat` currency
 * formatter. For crypto tickers (and any code `Intl` does not recognise) it
 * falls back to `<symbol><amount>` with up to 8 decimal places, since
 * `Intl.NumberFormat` only accepts ISO 4217 codes and would otherwise throw.
 */
export function formatCurrency(amount: number, code: string): string {
  const known = getCurrency(code);
  const symbol = known?.symbol ?? code;
  // Crypto tickers are not ISO 4217; format them directly as <symbol><amount>
  // with up to 8 decimals. (Some hosts' Intl DOES recognise 'BTC', but the
  // output prefix is then 'BTC' rather than the symbol — we want the symbol.)
  if (isCrypto(code)) {
    return `${symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).format(amount);
  } catch {
    return `${symbol}${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8,
    })}`;
  }
}
