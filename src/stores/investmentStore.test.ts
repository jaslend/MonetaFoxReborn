// @vitest-environment node

import 'fake-indexeddb/auto';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';
import { registerPriceProvider, type PriceProvider } from '@/lib/investments';

import { useInvestmentStore } from './investmentStore';
import { initializeStores, resetStores } from './index';

function uuid(): string {
  return crypto.randomUUID();
}

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB(
    'test-investment-store-' + Math.random().toString(36).slice(2),
  );
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

describe('useInvestmentStore', () => {
  it('CRUDs assets against the encrypted database', async () => {
    const a = await useInvestmentStore.getState().createAsset({
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
    });
    expect(useInvestmentStore.getState().assets.map((x) => x.id)).toContain(
      a.id,
    );

    await useInvestmentStore
      .getState()
      .updateAsset(a.id, { name: 'Bitcoin Core' });
    expect(
      useInvestmentStore.getState().assets.find((x) => x.id === a.id)?.name,
    ).toBe('Bitcoin Core');

    await useInvestmentStore.getState().removeAsset(a.id);
    expect(useInvestmentStore.getState().assets).toEqual([]);
  });

  it('CRUDs holdings against the encrypted database', async () => {
    const accId = uuid();
    const asset = await useInvestmentStore.getState().createAsset({
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'crypto',
    });
    const h = await useInvestmentStore.getState().createHolding({
      accountId: accId,
      assetId: asset.id,
      units: 3.5,
    });
    expect(useInvestmentStore.getState().holdings.length).toBe(1);
    expect(h.units).toBe(3.5);

    await useInvestmentStore.getState().updateHolding(h.id, { units: 10 });
    expect(
      useInvestmentStore.getState().holdings.find((x) => x.id === h.id)?.units,
    ).toBe(10);

    await useInvestmentStore.getState().removeHolding(h.id);
    expect(useInvestmentStore.getState().holdings).toEqual([]);
  });

  it('CRUDs price points against the encrypted database', async () => {
    const asset = await useInvestmentStore.getState().createAsset({
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
    });
    const pp = await useInvestmentStore.getState().recordPrice({
      assetId: asset.id,
      date: '2026-01-01',
      price: 100,
    });
    expect(useInvestmentStore.getState().prices.length).toBe(1);
    expect(pp.price).toBe(100);

    await useInvestmentStore.getState().updatePrice(pp.id, { price: 200 });
    expect(
      useInvestmentStore.getState().prices.find((x) => x.id === pp.id)?.price,
    ).toBe(200);

    await useInvestmentStore.getState().removePrice(pp.id);
    expect(useInvestmentStore.getState().prices).toEqual([]);
  });

  it('valuation selectors use latest prices and respect accountId', async () => {
    const acc1 = uuid();
    const acc2 = uuid();
    const btc = await useInvestmentStore.getState().createAsset({
      symbol: 'BTC',
      name: 'Bitcoin',
      type: 'crypto',
    });
    const eth = await useInvestmentStore.getState().createAsset({
      symbol: 'ETH',
      name: 'Ethereum',
      type: 'crypto',
    });
    await useInvestmentStore.getState().recordPrice({
      assetId: btc.id,
      date: '2026-01-01',
      price: 100,
    });
    await useInvestmentStore.getState().recordPrice({
      assetId: btc.id,
      date: '2026-02-01',
      price: 200,
    });
    await useInvestmentStore.getState().recordPrice({
      assetId: eth.id,
      date: '2026-01-01',
      price: 50,
    });

    const hBtc = await useInvestmentStore.getState().createHolding({
      accountId: acc1,
      assetId: btc.id,
      units: 2,
    });
    const hEth = await useInvestmentStore.getState().createHolding({
      accountId: acc2,
      assetId: eth.id,
      units: 4,
    });

    const values = useInvestmentStore.getState().holdingValues();
    expect(values[hBtc.id]).toBe(400); // 2 * 200 (latest)
    expect(values[hEth.id]).toBe(200); // 4 * 50

    expect(useInvestmentStore.getState().portfolioValueFor()).toBe(600);
    expect(useInvestmentStore.getState().portfolioValueFor(acc1)).toBe(400);
    expect(useInvestmentStore.getState().portfolioValueFor(acc2)).toBe(200);
  });

  it('updatePriceViaProvider records a price fetched by the provider', async () => {
    const asset = await useInvestmentStore.getState().createAsset({
      symbol: 'MOCK',
      name: 'Mock',
      type: 'crypto',
    });
    const mock: PriceProvider = {
      id: 'mock-for-store',
      label: 'Mock',
      fetchPrice: vi.fn(async () => 1234.5),
    };
    registerPriceProvider(mock);

    const pp = await useInvestmentStore
      .getState()
      .updatePriceViaProvider(asset.id, 'mock-for-store');

    expect(mock.fetchPrice).toHaveBeenCalledWith('MOCK');
    expect(pp.price).toBe(1234.5);
    expect(useInvestmentStore.getState().prices.length).toBe(1);
    expect(useInvestmentStore.getState().prices[0].assetId).toBe(asset.id);
  });

  it('updatePriceViaProvider throws for an unknown provider', async () => {
    const asset = await useInvestmentStore.getState().createAsset({
      symbol: 'X',
      name: 'X',
      type: 'crypto',
    });
    await expect(
      useInvestmentStore.getState().updatePriceViaProvider(asset.id, 'nope'),
    ).rejects.toBeInstanceOf(Error);
  });
});
