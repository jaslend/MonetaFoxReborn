/**
 * Investment store — Phase 9.
 *
 * Real CRUD over the encrypted `assets` / `holdings` / `prices` repositories,
 * plus valuation selectors built on the pure `src/lib/investments` helpers
 * and an `updatePriceViaProvider` action that drives the provider registry.
 *
 * - `initialize(repos)` / `load` / `add*` / `update*` / `remove*` / `reset`
 *   mirror the other domain stores (encrypted table, in-memory `items`
 *   projections refreshed after every mutation).
 * - `createAsset`, `createHolding`, `recordPrice` assign fresh UUIDs and
 *   persist; `updatePriceViaProvider(assetId, providerId)` calls the named
 *   provider's `fetchPrice(asset.symbol)` and writes a PricePoint dated today.
 * - Valuation selectors (`holdingValues`, `portfolioValueFor`) delegate to the
 *   pure functions so they stay trivially testable and decoupled from
 *   persistence.
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type {
  Asset,
  AssetType,
  Holding,
  PricePoint,
  Repositories,
} from '@/lib/db';
import {
  holdingValue,
  portfolioValue,
  getPriceProvider,
} from '@/lib/investments';

export interface InvestmentStoreState {
  /** In-memory projections of the encrypted tables; empty until `initialize`. */
  assets: Asset[];
  holdings: Holding[];
  prices: PricePoint[];
  /** Injected at unlock; null before the user authenticates. */
  repos: Repositories | null;
  initialize: (repos: Repositories) => Promise<void>;
  load: () => Promise<void>;
  reset: () => void;
  // --- assets ---
  addAsset: (item: Asset) => Promise<void>;
  updateAsset: (id: string, patch: Partial<Asset>) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  createAsset: (input: {
    symbol: string;
    name: string;
    type: AssetType;
  }) => Promise<Asset>;
  // --- holdings ---
  addHolding: (item: Holding) => Promise<void>;
  updateHolding: (id: string, patch: Partial<Holding>) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  createHolding: (input: {
    accountId: string;
    assetId: string;
    units: number;
  }) => Promise<Holding>;
  // --- prices ---
  addPrice: (item: PricePoint) => Promise<void>;
  updatePrice: (id: string, patch: Partial<PricePoint>) => Promise<void>;
  removePrice: (id: string) => Promise<void>;
  recordPrice: (input: {
    assetId: string;
    date: string;
    price: number;
  }) => Promise<PricePoint>;
  /** Fetch the live price via the named provider and record a PricePoint. */
  updatePriceViaProvider: (
    assetId: string,
    providerId: string,
  ) => Promise<PricePoint>;
  // --- valuation selectors ---
  /** Map of holdingId → value (0 when unpriced). */
  holdingValues: () => Record<string, number>;
  /** Portfolio value, optionally filtered by accountId. */
  portfolioValueFor: (accountId?: string) => number;
}

function notInit(): Error {
  return new Error(
    'investment store not initialized — call initializeStores(repos) at unlock',
  );
}

function assetTable(repos: Repositories): EncryptedTable<Asset> {
  return repos.assets;
}
function holdingTable(repos: Repositories): EncryptedTable<Holding> {
  return repos.holdings;
}
function priceTable(repos: Repositories): EncryptedTable<PricePoint> {
  return repos.prices;
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export const useInvestmentStore = create<InvestmentStoreState>((set, get) => ({
  assets: [],
  holdings: [],
  prices: [],
  repos: null,

  initialize: async (repos) => {
    set({ repos });
    await get().load();
  },

  load: async () => {
    const { repos } = get();
    if (!repos) return;
    const [assets, holdings, prices] = await Promise.all([
      assetTable(repos).toArray(),
      holdingTable(repos).toArray(),
      priceTable(repos).toArray(),
    ]);
    set({ assets, holdings, prices });
  },

  reset: () => set({ assets: [], holdings: [], prices: [], repos: null }),

  // --- assets ---
  addAsset: async (item) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await assetTable(repos).add(item);
    await get().load();
  },
  updateAsset: async (id, patch) => {
    const { repos } = get();
    if (!repos) throw notInit();
    const table = assetTable(repos);
    const existing = await table.get(id);
    if (!existing) throw new Error(`asset ${id} not found`);
    await table.put({ ...existing, ...patch, id });
    await get().load();
  },
  removeAsset: async (id) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await assetTable(repos).delete(id);
    await get().load();
  },
  createAsset: async (input) => {
    const asset: Asset = {
      id: crypto.randomUUID(),
      symbol: input.symbol,
      name: input.name,
      type: input.type,
    };
    await get().addAsset(asset);
    return asset;
  },

  // --- holdings ---
  addHolding: async (item) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await holdingTable(repos).add(item);
    await get().load();
  },
  updateHolding: async (id, patch) => {
    const { repos } = get();
    if (!repos) throw notInit();
    const table = holdingTable(repos);
    const existing = await table.get(id);
    if (!existing) throw new Error(`holding ${id} not found`);
    await table.put({ ...existing, ...patch, id });
    await get().load();
  },
  removeHolding: async (id) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await holdingTable(repos).delete(id);
    await get().load();
  },
  createHolding: async (input) => {
    const holding: Holding = {
      id: crypto.randomUUID(),
      accountId: input.accountId,
      assetId: input.assetId,
      units: input.units,
    };
    await get().addHolding(holding);
    return holding;
  },

  // --- prices ---
  addPrice: async (item) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await priceTable(repos).add(item);
    await get().load();
  },
  updatePrice: async (id, patch) => {
    const { repos } = get();
    if (!repos) throw notInit();
    const table = priceTable(repos);
    const existing = await table.get(id);
    if (!existing) throw new Error(`price ${id} not found`);
    await table.put({ ...existing, ...patch, id });
    await get().load();
  },
  removePrice: async (id) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await priceTable(repos).delete(id);
    await get().load();
  },
  recordPrice: async (input) => {
    if (!Number.isFinite(input.price)) {
      throw new Error('price must be a finite number');
    }
    const pp: PricePoint = {
      id: crypto.randomUUID(),
      assetId: input.assetId,
      date: input.date,
      price: input.price,
    };
    await get().addPrice(pp);
    return pp;
  },
  updatePriceViaProvider: async (assetId, providerId) => {
    const { assets, repos } = get();
    if (!repos) throw notInit();
    const asset = assets.find((a) => a.id === assetId);
    if (!asset) throw new Error(`asset ${assetId} not found`);
    const provider = getPriceProvider(providerId);
    if (!provider) throw new Error(`unknown price provider ${providerId}`);
    const fetched = await provider.fetchPrice(asset.symbol);
    return get().recordPrice({ assetId, date: todayISO(), price: fetched });
  },

  // --- valuation selectors ---
  holdingValues: () => {
    const { holdings, prices } = get();
    const map: Record<string, number> = {};
    for (const h of holdings) {
      map[h.id] = holdingValue(h, prices);
    }
    return map;
  },
  portfolioValueFor: (accountId) => {
    const { holdings, prices } = get();
    return portfolioValue(holdings, prices, accountId);
  },
}));
