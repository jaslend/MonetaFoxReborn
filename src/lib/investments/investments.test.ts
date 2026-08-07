// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';

import type { Holding, PricePoint } from '@/lib/db/models';

import {
  latestPrice,
  holdingValue,
  portfolioValue,
  priceHistory,
  registerPriceProvider,
  getPriceProvider,
  listPriceProviders,
} from './index';

function price(
  partial: Partial<PricePoint> & Pick<PricePoint, 'id' | 'assetId' | 'date'>,
): PricePoint {
  return { price: 100, ...partial };
}

function holding(
  partial: Partial<Holding> & Pick<Holding, 'id' | 'assetId' | 'accountId'>,
): Holding {
  return { units: 1, ...partial };
}

describe('latestPrice', () => {
  it('picks the most recent date by ISO string compare', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'a', date: '2026-01-05', price: 10 }),
      price({ id: 'p2', assetId: 'a', date: '2026-03-01', price: 30 }),
      price({ id: 'p3', assetId: 'a', date: '2026-02-10', price: 20 }),
    ];
    expect(latestPrice('a', prices)).toBe(30);
  });

  it('returns undefined when the asset has no price points', () => {
    expect(latestPrice('missing', [])).toBeUndefined();
    expect(
      latestPrice('a', [
        price({ id: 'x', assetId: 'other', date: '2026-01-01' }),
      ]),
    ).toBeUndefined();
  });

  it('ignores other assets', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'a', date: '2026-01-01', price: 11 }),
      price({ id: 'p2', assetId: 'b', date: '2026-09-01', price: 99 }),
    ];
    expect(latestPrice('a', prices)).toBe(11);
  });
});

describe('holdingValue', () => {
  it('multiplies units by the latest price', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'a', date: '2026-01-01', price: 50 }),
      price({ id: 'p2', assetId: 'a', date: '2026-02-01', price: 100 }),
    ];
    const h = holding({ id: 'h1', assetId: 'a', accountId: 'ac1', units: 2.5 });
    expect(holdingValue(h, prices)).toBe(250);
  });

  it('is 0 when no price is known', () => {
    const h = holding({ id: 'h1', assetId: 'a', accountId: 'ac1', units: 7 });
    expect(holdingValue(h, [])).toBe(0);
  });
});

describe('portfolioValue', () => {
  it('sums holding values across all holdings', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'btc', date: '2026-01-01', price: 100 }),
      price({ id: 'p2', assetId: 'eth', date: '2026-01-01', price: 50 }),
    ];
    const holdings: Holding[] = [
      holding({ id: 'h1', assetId: 'btc', accountId: 'ac1', units: 2 }),
      holding({ id: 'h2', assetId: 'eth', accountId: 'ac2', units: 3 }),
    ];
    expect(portfolioValue(holdings, prices)).toBe(200 + 150);
  });

  it('filters by accountId when provided', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'btc', date: '2026-01-01', price: 100 }),
      price({ id: 'p2', assetId: 'eth', date: '2026-01-01', price: 50 }),
    ];
    const holdings: Holding[] = [
      holding({ id: 'h1', assetId: 'btc', accountId: 'ac1', units: 2 }),
      holding({ id: 'h2', assetId: 'eth', accountId: 'ac2', units: 3 }),
    ];
    expect(portfolioValue(holdings, prices, 'ac1')).toBe(200);
  });

  it('treats unpriced holdings as 0', () => {
    const holdings: Holding[] = [
      holding({ id: 'h1', assetId: 'btc', accountId: 'ac1', units: 5 }),
    ];
    expect(portfolioValue(holdings, [])).toBe(0);
  });
});

describe('priceHistory', () => {
  it('returns the asset points sorted ascending by date', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'a', date: '2026-03-01', price: 30 }),
      price({ id: 'p2', assetId: 'a', date: '2026-01-01', price: 10 }),
      price({ id: 'p3', assetId: 'b', date: '2026-02-01', price: 999 }),
      price({ id: 'p4', assetId: 'a', date: '2026-02-01', price: 20 }),
    ];
    const hist = priceHistory('a', prices);
    expect(hist.map((p) => p.date)).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
    expect(hist.map((p) => p.price)).toEqual([10, 20, 30]);
  });

  it('does not mutate the input array', () => {
    const prices: PricePoint[] = [
      price({ id: 'p1', assetId: 'a', date: '2026-02-01', price: 20 }),
      price({ id: 'p2', assetId: 'a', date: '2026-01-01', price: 10 }),
    ];
    const snapshot = prices.map((p) => p.date);
    priceHistory('a', prices);
    expect(prices.map((p) => p.date)).toEqual(snapshot);
  });

  it('returns an empty array for an unknown asset', () => {
    expect(priceHistory('missing', [])).toEqual([]);
  });
});

describe('price-provider registry', () => {
  // Built-ins are registered at module load; tests add their own on top.
  beforeEach(() => {
    registerPriceProvider({
      id: 'test-mock',
      label: 'Mock',
      fetchPrice: async () => 42,
    });
  });

  it('registers built-in manual + coinbase providers', () => {
    expect(listPriceProviders()).toContain('manual');
    expect(listPriceProviders()).toContain('coinbase');
  });

  it('retrieves a registered provider', () => {
    const p = getPriceProvider('test-mock');
    expect(p?.id).toBe('test-mock');
    expect(p?.label).toBe('Mock');
  });

  it('returns undefined for an unknown provider', () => {
    expect(getPriceProvider('does-not-exist')).toBeUndefined();
  });

  it('overwrites when re-registered with the same id', () => {
    registerPriceProvider({
      id: 'test-mock',
      label: 'Replaced',
      fetchPrice: async () => 1,
    });
    expect(getPriceProvider('test-mock')?.label).toBe('Replaced');
  });

  it('the manual provider rejects fetchPrice (no network)', async () => {
    const manual = getPriceProvider('manual');
    expect(manual).toBeDefined();
    await expect(manual!.fetchPrice('BTC')).rejects.toBeInstanceOf(Error);
  });
});
