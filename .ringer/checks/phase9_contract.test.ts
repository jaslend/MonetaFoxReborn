// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 9 (investments).
// Copied into src/lib/investments/ by the Ringer check, run against the real
// module, then removed. Pins portfolio valuation (holding value = units ×
// latest price), latest-price selection, price-history ordering, and the
// pluggable price-provider registry (the seam for automatic updates).

import { describe, it, expect } from 'vitest';

import {
  latestPrice,
  holdingValue,
  portfolioValue,
  priceHistory,
  registerPriceProvider,
  getPriceProvider,
  listPriceProviders,
} from './index';

const prices = [
  { id: 'p1', assetId: 'btc', date: '2026-01-01', price: 40000 },
  { id: 'p2', assetId: 'btc', date: '2026-02-01', price: 50000 },
  { id: 'p3', assetId: 'eth', date: '2026-02-01', price: 3000 },
] as never[];

describe('Phase 9 contract: valuation', () => {
  it('takes the most recent price for an asset', () => {
    expect(latestPrice('btc', prices)).toBe(50000);
    expect(latestPrice('eth', prices)).toBe(3000);
    expect(latestPrice('doge', prices)).toBeUndefined();
  });

  it('values a holding as units × latest price (0 when no price is known)', () => {
    expect(holdingValue({ id: 'h1', accountId: 'inv', assetId: 'btc', units: 0.5 } as never, prices)).toBe(25000);
    expect(holdingValue({ id: 'h2', accountId: 'inv', assetId: 'doge', units: 100 } as never, prices)).toBe(0);
  });

  it('sums a portfolio, optionally filtered by account', () => {
    const holdings = [
      { id: 'h1', accountId: 'inv', assetId: 'btc', units: 0.5 },
      { id: 'h2', accountId: 'inv', assetId: 'eth', units: 2 },
      { id: 'h3', accountId: 'other', assetId: 'btc', units: 1 },
    ] as never[];
    expect(portfolioValue(holdings, prices, 'inv')).toBe(31000); // 25000 + 6000
    expect(portfolioValue(holdings, prices)).toBe(81000); // + the 'other' btc @ 50000
  });

  it('returns price history sorted ascending by date', () => {
    const hist = priceHistory('btc', prices);
    expect(hist.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01']);
  });
});

describe('Phase 9 contract: price-provider registry (automatic-update seam)', () => {
  it('registers and resolves a provider', async () => {
    registerPriceProvider({ id: 'mock', label: 'Mock', fetchPrice: async () => 123 });
    const p = getPriceProvider('mock');
    expect(p).toBeDefined();
    expect(await p!.fetchPrice('BTC')).toBe(123);
    expect(listPriceProviders()).toContain('mock');
  });
});
