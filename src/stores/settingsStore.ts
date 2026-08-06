/**
 * Settings store — Phase 4.
 *
 * Extends the Phase 3a entity-store CRUD interface (so existing tests keep
 * passing) with the Phase 4 currency actions:
 *
 * - `ensureSettings()` — guarantee the singleton Settings row exists (created
 *   with an empty `baseCurrency` and an empty `rates` map on first run).
 * - `setBaseCurrency(code)` — guarded: the base currency is fixed once any
 *   accounts or transactions exist, so this throws if either store is
 *   non-empty. While no accounts/transactions exist, the base currency may be
 *   chosen (first run) or changed.
 * - `setRate(currency, rate)` — set/update a manual FX rate in the singleton's
 *   `rates` map.
 *
 * The singleton is keyed by `SETTINGS_ID`. `getSettings()` returns the
 * singleton projection (or `undefined` if not yet created).
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type { EncryptionMode, Repositories, Settings } from '@/lib/db';

import { useAccountStore } from './accountStore';
import { useTransactionStore } from './transactionStore';

/** Fixed id of the single Settings row. */
export const SETTINGS_ID = 'singleton';

export interface SettingsStoreState {
  /** In-memory projection of the encrypted settings table (0 or 1 row). */
  items: Settings[];
  /** Injected at unlock; null before the user authenticates. */
  repos: Repositories | null;
  initialize: (repos: Repositories) => Promise<void>;
  load: () => Promise<void>;
  add: (item: Settings) => Promise<void>;
  update: (id: string, patch: Partial<Settings>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
  // --- Phase 4 extensions ---
  /** Return the singleton Settings row, or `undefined` if it does not exist. */
  getSettings: () => Settings | undefined;
  /** Guarantee the singleton exists (created empty on first run); return it. */
  ensureSettings: (mode?: EncryptionMode) => Promise<Settings>;
  /** Set/change the base currency; throws if accounts or transactions exist. */
  setBaseCurrency: (code: string) => Promise<void>;
  /** Set or update a single manual FX rate on the singleton. */
  setRate: (currency: string, rate: number) => Promise<void>;
}

function select(repos: Repositories): EncryptedTable<Settings> {
  return repos.settings;
}

function notInit(): Error {
  return new Error(
    'settings store not initialized — call initializeStores(repos) at unlock',
  );
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  items: [],
  repos: null,

  initialize: async (repos) => {
    set({ repos });
    await get().load();
  },

  load: async () => {
    const { repos } = get();
    if (!repos) return;
    set({ items: await select(repos).toArray() });
  },

  add: async (item) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await select(repos).add(item);
    await get().load();
  },

  update: async (id, patch) => {
    const { repos } = get();
    if (!repos) throw notInit();
    const table = select(repos);
    const existing = await table.get(id);
    if (!existing) throw new Error(`settings record ${id} not found`);
    await table.put({ ...existing, ...patch, id });
    await get().load();
  },

  remove: async (id) => {
    const { repos } = get();
    if (!repos) throw notInit();
    await select(repos).delete(id);
    await get().load();
  },

  reset: () => set({ items: [], repos: null }),

  getSettings: () => get().items.find((s) => s.id === SETTINGS_ID),

  ensureSettings: async (mode: EncryptionMode = 'basic') => {
    const existing = get().getSettings();
    if (existing) return existing;
    const fresh: Settings = {
      id: SETTINGS_ID,
      baseCurrency: '',
      encryptionMode: mode,
      rates: {},
    };
    await get().add(fresh);
    const created = get().getSettings();
    if (!created) throw new Error('failed to create settings singleton');
    return created;
  },

  setBaseCurrency: async (code: string) => {
    // The base currency is fixed once accounts or transactions exist.
    const accountCount = useAccountStore.getState().items.length;
    const txnCount = useTransactionStore.getState().items.length;
    if (accountCount > 0 || txnCount > 0) {
      throw new Error(
        'Base currency is fixed once accounts or transactions exist; remove them before changing it.',
      );
    }
    await get().ensureSettings();
    await get().update(SETTINGS_ID, { baseCurrency: code });
  },

  setRate: async (currency: string, rate: number) => {
    if (!currency) throw new Error('currency code is required to set a rate');
    if (!Number.isFinite(rate)) throw new Error('rate must be a finite number');
    await get().ensureSettings();
    const current = get().getSettings();
    const rates: Record<string, number> = { ...(current?.rates ?? {}) };
    rates[currency] = rate;
    await get().update(SETTINGS_ID, { rates });
  },
}));
