/**
 * Phase 11 — Cloud sync store.
 *
 * Owns the ONE active cloud destination and the sync lifecycle. The store
 * holds:
 *  - the active provider id + the constructed provider instance + a
 *    `connected` flag (set by `connect(providerId, tokenGetter)`, which builds
 *    the Drive/OneDrive provider with the UI-injected token getter),
 *  - an in-memory sync passphrase (set once via `setSyncPassphrase`; NEVER
 *    persisted — it lives only for the session, like the auth `CryptoKey`),
 *  - `lastSyncAt` + `syncStatus` for the UI status indicator,
 *  - the trigger mode (`manual | scheduled | on-change`) + schedule interval.
 *
 * Payloads are ENCRYPTED ONLY: `uploadNow`/`downloadNow`/`fullSync` reuse
 * `syncUp`/`syncDown` from `@/lib/sync`, which reuse `exportEncrypted`/
 * `importEncrypted` from `@/lib/export`. A wrong passphrase REJECTS there and
 * propagates here (caught → `syncStatus = 'error'`).
 *
 * Serialization mirrors the existing backup/restore path in `DataExportCard`:
 * `serializeBackupData()` gathers accounts/transactions/categories/budgets
 * from the domain stores into a `BackupData`; `applyBackupData(data)` writes
 * each row back through the encrypted `repositories` (overwriting same-id
 * rows) and refreshes the in-memory store projections. `fullSync` pulls the
 * remote backup (applying it if present) and then pushes the local state, so
 * both sides converge. Merge is last-write-wins (v1); future versions can add
 * per-row merging.
 *
 * Auto triggers (scheduled + on-change) only fire while a passphrase is
 * loaded, so they never prompt. The store is registered in
 * `initializeStores`/`resetStores` like the other domain stores.
 */
import { create } from 'zustand';

import type { Account, Repositories, Transaction } from '@/lib/db';
import {
  syncUp,
  syncDown,
  GoogleDriveProvider,
  OneDriveProvider,
  MemoryProvider,
  getCloudProvider,
  DEFAULT_SYNC_KEY,
  type CloudStorageProvider,
  type AccessTokenGetter,
} from '@/lib/sync';
import { BACKUP_VERSION, type BackupData } from '@/lib/export';

import { useAccountStore } from './accountStore';
import { useTransactionStore } from './transactionStore';
import { useCategoryStore } from './categoryStore';
import { useBudgetStore } from './budgetStore';

export type SyncTrigger = 'manual' | 'scheduled' | 'on-change';
export type SyncStatus = 'idle' | 'syncing' | 'error';

/** Default scheduled interval (15 min) when `trigger === 'scheduled'`. */
export const DEFAULT_SCHEDULE_INTERVAL_MS = 15 * 60 * 1000;
/** Debounce window for the on-change trigger. */
const ON_CHANGE_DEBOUNCE_MS = 2000;

export interface SyncStoreState {
  /** The ONE active destination id (`'google-drive' | 'one-drive' | ...`). */
  activeProviderId: string | null;
  /** The constructed provider instance; null until connected. */
  provider: CloudStorageProvider | null;
  /** Auth/connection status for the active provider. */
  connected: boolean;
  /** Epoch ms of the last successful sync, or null. */
  lastSyncAt: number | null;
  /** Coarse status for the UI indicator. */
  syncStatus: SyncStatus;
  /** Last error message (cleared on a successful action). */
  lastError: string | null;
  /** Trigger mode. */
  trigger: SyncTrigger;
  /** Scheduled interval in ms (used when trigger === 'scheduled'). */
  scheduleIntervalMs: number;
  /** In-memory only — the sync passphrase; never persisted. */
  syncPassphrase: string | null;
  /** Repositories ref (set at unlock; null before). */
  repos: Repositories | null;
  // --- actions ---
  initialize: (repos: Repositories) => Promise<void>;
  reset: () => void;
  setActiveProvider: (id: string | null) => void;
  setTrigger: (trigger: SyncTrigger) => void;
  setScheduleInterval: (ms: number) => void;
  setSyncPassphrase: (passphrase: string | null) => void;
  connect: (providerId: string, tokenGetter: AccessTokenGetter) => void;
  disconnect: () => void;
  serializeBackupData: () => BackupData;
  applyBackupData: (data: BackupData) => Promise<void>;
  uploadNow: (passphrase?: string) => Promise<void>;
  downloadNow: (passphrase?: string) => Promise<void>;
  fullSync: (passphrase?: string) => Promise<void>;
}

// Module-level handles for the auto triggers (intervals/subscriptions). Kept
// out of state so they don't serialize and so reset() can tear them down.
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
let changeUnsub: (() => void) | null = null;
let changeDebounce: ReturnType<typeof setTimeout> | null = null;

function clearScheduleTimer(): void {
  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }
}

function clearChangeSubscription(): void {
  if (changeUnsub) {
    changeUnsub();
    changeUnsub = null;
  }
  if (changeDebounce) {
    clearTimeout(changeDebounce);
    changeDebounce = null;
  }
}

/** Build a provider instance for `id`, using `tokenGetter` for OAuth backends. */
function buildProvider(
  id: string,
  tokenGetter: AccessTokenGetter,
): CloudStorageProvider {
  if (id === 'google-drive') return new GoogleDriveProvider(tokenGetter);
  if (id === 'one-drive') return new OneDriveProvider(tokenGetter);
  if (id === 'memory') return new MemoryProvider();
  const reg = getCloudProvider(id);
  if (!reg) throw new Error(`Unknown cloud provider: ${id}`);
  return reg;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  activeProviderId: null,
  provider: null,
  connected: false,
  lastSyncAt: null,
  syncStatus: 'idle',
  lastError: null,
  trigger: 'manual',
  scheduleIntervalMs: DEFAULT_SCHEDULE_INTERVAL_MS,
  syncPassphrase: null,
  repos: null,

  initialize: async (repos) => {
    set({ repos });
  },

  reset: () => {
    clearScheduleTimer();
    clearChangeSubscription();
    set({
      activeProviderId: null,
      provider: null,
      connected: false,
      lastSyncAt: null,
      syncStatus: 'idle',
      lastError: null,
      syncPassphrase: null,
      repos: null,
    });
  },

  setActiveProvider: (id) => {
    // Switching the ONE active destination is a config change; disconnect any
    // current provider so the user reconnects with the new one's token flow.
    clearScheduleTimer();
    clearChangeSubscription();
    set({
      activeProviderId: id,
      provider: null,
      connected: false,
      syncStatus: 'idle',
      lastError: null,
    });
  },

  setTrigger: (trigger) => {
    clearScheduleTimer();
    clearChangeSubscription();
    set({ trigger });
    armAutoTriggers(get);
  },

  setScheduleInterval: (ms) => {
    set({ scheduleIntervalMs: ms });
    if (get().trigger === 'scheduled') armAutoTriggers(get);
  },

  setSyncPassphrase: (passphrase) => {
    set({ syncPassphrase: passphrase });
    armAutoTriggers(get);
  },

  connect: (providerId, tokenGetter) => {
    const provider = buildProvider(providerId, tokenGetter);
    set({
      activeProviderId: providerId,
      provider,
      connected: true,
      syncStatus: 'idle',
      lastError: null,
    });
    armAutoTriggers(get);
  },

  disconnect: () => {
    clearScheduleTimer();
    clearChangeSubscription();
    set({ provider: null, connected: false, syncStatus: 'idle' });
  },

  serializeBackupData: () => {
    const accounts = useAccountStore.getState().items;
    const transactions = useTransactionStore.getState().items;
    const categories = useCategoryStore.getState().items;
    const budgets = useBudgetStore.getState().items;
    return {
      version: BACKUP_VERSION,
      accounts,
      transactions,
      categories,
      budgets,
    };
  },

  applyBackupData: async (data) => {
    const { repos } = get();
    if (!repos)
      throw new Error(
        'sync store not initialized — call initializeStores(repos) at unlock',
      );
    const writes: Promise<unknown>[] = [];
    for (const a of data.accounts)
      writes.push(repos.accounts.put(a as Account));
    for (const t of data.transactions)
      writes.push(repos.transactions.put(t as Transaction));
    for (const c of data.categories)
      writes.push(repos.categories.put(c as never));
    for (const b of data.budgets) writes.push(repos.budgets.put(b as never));
    await Promise.all(writes);
    await Promise.all([
      useAccountStore.getState().load(),
      useTransactionStore.getState().load(),
      useCategoryStore.getState().load(),
      useBudgetStore.getState().load(),
    ]);
  },

  uploadNow: async (passphrase) => {
    const state = get();
    const pp = passphrase ?? state.syncPassphrase;
    if (!state.provider) throw new Error('No cloud provider connected');
    if (!pp) throw new Error('No sync passphrase set');
    set({ syncStatus: 'syncing', lastError: null });
    try {
      await syncUp(state.provider, state.serializeBackupData(), pp);
      set({ syncStatus: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      set({
        syncStatus: 'error',
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },

  downloadNow: async (passphrase) => {
    const state = get();
    const pp = passphrase ?? state.syncPassphrase;
    if (!state.provider) throw new Error('No cloud provider connected');
    if (!pp) throw new Error('No sync passphrase set');
    set({ syncStatus: 'syncing', lastError: null });
    try {
      const data = await syncDown(state.provider, pp, DEFAULT_SYNC_KEY);
      if (data) await state.applyBackupData(data);
      set({ syncStatus: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      set({
        syncStatus: 'error',
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },

  fullSync: async (passphrase) => {
    const state = get();
    const pp = passphrase ?? state.syncPassphrase;
    if (!state.provider) throw new Error('No cloud provider connected');
    if (!pp) throw new Error('No sync passphrase set');
    set({ syncStatus: 'syncing', lastError: null });
    try {
      // Pull: apply remote if present, so local reflects the cloud state.
      const remote = await syncDown(state.provider, pp, DEFAULT_SYNC_KEY);
      if (remote) await state.applyBackupData(remote);
      // Push: upload the (now merged) local state.
      await syncUp(state.provider, state.serializeBackupData(), pp);
      set({ syncStatus: 'idle', lastSyncAt: Date.now() });
    } catch (e) {
      set({
        syncStatus: 'error',
        lastError: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
  },
}));

/**
 * Arm the auto triggers for the current trigger mode. Scheduled arms a
 * repeating `setTimeout` that calls `uploadNow`; on-change subscribes to the
 * domain stores and debounces `uploadNow`. Both no-op until a provider is
 * connected AND a passphrase is loaded (so they never prompt the user).
 */
function armAutoTriggers(get: () => SyncStoreState): void {
  clearScheduleTimer();
  clearChangeSubscription();
  const { trigger, provider, syncPassphrase } = get();
  if (!provider || !syncPassphrase) return;

  if (trigger === 'scheduled') {
    const tick = () => {
      get()
        .uploadNow()
        .catch(() => {
          // uploadNow already set syncStatus='error'; swallow to keep ticking.
        })
        .finally(() => {
          if (get().trigger === 'scheduled')
            scheduleTimer = setTimeout(tick, get().scheduleIntervalMs);
        });
    };
    scheduleTimer = setTimeout(tick, get().scheduleIntervalMs);
  }

  if (trigger === 'on-change') {
    let armed = false;
    const fire = () => {
      if (armed) return;
      armed = true;
      changeDebounce = setTimeout(() => {
        armed = false;
        get()
          .uploadNow()
          .catch(() => {
            // error status already recorded
          });
      }, ON_CHANGE_DEBOUNCE_MS);
    };
    // Subscribe to each domain store. The domain stores replace the `items`
    // array reference on every mutation/load (they `set({ items })`), so a
    // cheap reference-compare detects real changes without needing the
    // subscribeWithSelector middleware on stores we don't own.
    const subs = [
      useAccountStore.subscribe((s, p) => {
        if (s.items !== p.items) fire();
      }),
      useTransactionStore.subscribe((s, p) => {
        if (s.items !== p.items) fire();
      }),
      useCategoryStore.subscribe((s, p) => {
        if (s.items !== p.items) fire();
      }),
      useBudgetStore.subscribe((s, p) => {
        if (s.items !== p.items) fire();
      }),
    ];
    changeUnsub = () => {
      for (const u of subs) u();
    };
  }
}
