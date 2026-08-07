/**
 * Investment valuation + price-provider registry (Phase 9).
 *
 * Pure, side-effect-free valuation helpers over the in-memory price list, plus
 * a small pluggable registry of `PriceProvider`s used for automatic price
 * updates. The store (`src/stores/investmentStore`) and UI compose these; the
 * data layer (`src/lib/db`) owns persistence.
 *
 * Conventions (pinned by the Phase 9 contract):
 * - `latestPrice(assetId, prices)` picks the PricePoint with the MOST RECENT
 *   `date` (ISO string compare) for that asset, or `undefined` when none exists.
 * - `holdingValue = holding.units × latestPrice(assetId)`; it is `0` when no
 *   price is known for the holding's asset.
 * - `portfolioValue` sums `holdingValue` across holdings, optionally filtered
 *   to a single `accountId`.
 * - `priceHistory(assetId, prices)` returns that asset's points sorted
 *   ASCENDING by date.
 * - Prices are plain numbers in the base currency (`PricePoint` has no
 *   currency field), so valuation never converts currency.
 * - Automatic price updates go through a pluggable provider registry; any
 *   network access lives strictly inside a provider's `fetchPrice`.
 */

import type { Holding, PricePoint } from '@/lib/db/models';

/** A tradeable-asset price source (manual or automatic). */
export interface PriceProvider {
  /** Stable registry id, e.g. 'manual' or 'coingecko'. */
  id: string;
  /** Human-readable label for the UI. */
  label: string;
  /**
   * Fetch the current price (a plain number in the base currency) for `symbol`.
   * Any network access must live inside this method. Best-effort: callers
   * should catch and surface failures without crashing the app.
   */
  fetchPrice(symbol: string): Promise<number>;
}

/** Registry of providers keyed by `id`; insertion-ordered for `listPriceProviders`. */
const PROVIDERS = new Map<string, PriceProvider>();

/**
 * Register or replace a price provider. Idempotent for the same `id` (a later
 * registration with the same id overwrites the earlier one).
 */
export function registerPriceProvider(p: PriceProvider): void {
  PROVIDERS.set(p.id, p);
}

/** Look up a registered provider by id, or `undefined` if none is registered. */
export function getPriceProvider(id: string): PriceProvider | undefined {
  return PROVIDERS.get(id);
}

/** List every registered provider id in insertion order. */
export function listPriceProviders(): string[] {
  return [...PROVIDERS.keys()];
}

/**
 * The built-in 'manual' provider. It has no network and rejects on use: a
 * manual price entry is provided directly by the user via the UI form, so
 * there is nothing to fetch. The UI calls the automatic provider for the
 * "update price" button; selecting 'manual' there is a no-op.
 */
export const MANUAL_PROVIDER: PriceProvider = {
  id: 'manual',
  label: 'Manual',
  fetchPrice() {
    return Promise.reject(
      new Error(
        'The manual provider does not fetch prices; enter a price directly.',
      ),
    );
  },
};

/**
 * Built-in automatic crypto provider using the Coinbase public spot-price API.
 * `GET https://api.coinbase.com/v2/prices/{SYMBOL}-USD/spot` returns
 * `{ data: { base, currency, amount } }` where `amount` is the USD spot price.
 * Prices are returned as plain numbers; the base currency is assumed USD for
 * crypto spot quotes. All network access is confined to `fetchPrice`; failures
 * reject so the caller can surface them.
 */
export const COINBASE_PROVIDER: PriceProvider = {
  id: 'coinbase',
  label: 'Coinbase (crypto spot)',
  async fetchPrice(symbol: string): Promise<number> {
    const sym = symbol.trim().toUpperCase();
    if (!sym) throw new Error('symbol is required');
    const url = `https://api.coinbase.com/v2/prices/${encodeURIComponent(
      sym,
    )}-USD/spot`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Coinbase spot request failed: ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as {
      data?: { amount?: string };
    };
    const amount = json?.data?.amount;
    if (amount === undefined || amount === null) {
      throw new Error('Coinbase spot response had no amount');
    }
    const price = Number(amount);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Coinbase returned a non-finite price: ${amount}`);
    }
    return price;
  },
};

// Register the built-in providers at module load. Tests register their own
// mock providers on top of these; the registry is module-level state shared
// across importers within the same Vitest worker, but built-ins are
// deterministic (no network at module load — only when fetchPrice is called).
registerPriceProvider(MANUAL_PROVIDER);
registerPriceProvider(COINBASE_PROVIDER);

/**
 * Pick the most recent PricePoint for `assetId` (ISO date string compare) and
 * return its price, or `undefined` when the asset has no price points.
 */
export function latestPrice(
  assetId: string,
  prices: PricePoint[],
): number | undefined {
  let best: PricePoint | undefined;
  for (const p of prices) {
    if (p.assetId !== assetId) continue;
    if (best === undefined || p.date > best.date) {
      best = p;
    }
  }
  return best?.price;
}

/**
 * Value a single holding: `units × latestPrice(assetId)`. Returns `0` when no
 * price is known for the holding's asset (per the contract).
 */
export function holdingValue(holding: Holding, prices: PricePoint[]): number {
  const price = latestPrice(holding.assetId, prices);
  if (price === undefined) return 0;
  return holding.units * price;
}

/**
 * Sum holding values, optionally filtered to a single `accountId`. Unpriced
 * holdings contribute `0` (via `holdingValue`).
 */
export function portfolioValue(
  holdings: Holding[],
  prices: PricePoint[],
  accountId?: string,
): number {
  let total = 0;
  for (const h of holdings) {
    if (accountId !== undefined && h.accountId !== accountId) continue;
    total += holdingValue(h, prices);
  }
  return total;
}

/**
 * Return `assetId`'s price points sorted ASCENDING by date (ISO string compare).
 * Returns an empty array when the asset has no price points.
 */
export function priceHistory(
  assetId: string,
  prices: PricePoint[],
): PricePoint[] {
  return prices
    .filter((p) => p.assetId === assetId)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
