import { describe, it, expect } from 'vitest';

import {
  CURRENCIES,
  convertToBase,
  formatCurrency,
  getCurrency,
} from './index';

describe('CURRENCIES', () => {
  it('includes major fiat plus BTC and ETH', () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(codes).toContain('USD');
    expect(codes).toContain('EUR');
    expect(codes).toContain('GBP');
    expect(codes).toContain('BTC');
    expect(codes).toContain('ETH');
  });

  it('every entry has a code, symbol and name', () => {
    for (const c of CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.name).toBeTruthy();
    }
  });

  it('getCurrency looks up by code', () => {
    expect(getCurrency('GBP')?.symbol).toBe('£');
    expect(getCurrency('NOPE')).toBeUndefined();
  });
});

describe('convertToBase', () => {
  it('is the identity when from === base', () => {
    expect(convertToBase(100, 'USD', 'USD', {})).toBe(100);
    expect(convertToBase(-42.5, 'GBP', 'GBP', { GBP: 2 })).toBe(-42.5);
  });

  it('multiplies by rates[from] (rate = base units per 1 unit of from)', () => {
    // 1 EUR = 1.1 USD, base USD → 100 EUR converts to 110 USD.
    expect(convertToBase(100, 'EUR', 'USD', { EUR: 1.1 })).toBeCloseTo(110);
    // 1 GBP = 1.25 EUR, base EUR → 50 GBP converts to 62.5 EUR.
    expect(convertToBase(50, 'GBP', 'EUR', { GBP: 1.25 })).toBeCloseTo(62.5);
  });

  it('preserves sign (outflows stay negative)', () => {
    expect(convertToBase(-100, 'EUR', 'USD', { EUR: 1.1 })).toBeCloseTo(-110);
  });

  it('throws when a foreign rate is missing rather than guessing', () => {
    expect(() => convertToBase(100, 'EUR', 'USD', {})).toThrow(
      /Missing FX rate for EUR/,
    );
    expect(() => convertToBase(100, 'EUR', 'USD', { GBP: 1.2 })).toThrow(
      /Missing FX rate for EUR/,
    );
  });

  it('does not require a rate entry for the base currency', () => {
    expect(convertToBase(7, 'USD', 'USD', {})).toBe(7);
  });
});

describe('formatCurrency', () => {
  it('formats a fiat amount with a currency symbol', () => {
    const out = formatCurrency(1234.5, 'USD');
    expect(out).toContain('1,234.50');
  });

  it('falls back to <symbol><amount> for crypto codes Intl does not recognise', () => {
    const out = formatCurrency(0.5, 'BTC');
    expect(out).toContain('0.5');
    expect(out).toContain('₿');
  });
});
