/**
 * Store barrel + the single unlock seam.
 *
 * `initializeStores(repos)` is the ONLY call site Phase 2 auth makes after
 * deriving the `CryptoKey` and building `Repositories` via
 * `createRepositories(db, key)`. It binds every domain store to its encrypted
 * repository and loads the initial in-memory lists. The UI store is
 * independent (persisted, no domain data) and is NOT touched here.
 *
 * Domain data lives only in the encrypted IndexedDB tables; the in-memory
 * `items` arrays are a transient projection refreshed after each mutation and
 * on unlock. Nothing domain-related is ever persisted in plaintext.
 */

import type { Repositories } from '@/lib/db';

import { useAccountStore } from './accountStore';
import { useTransactionStore } from './transactionStore';
import { useCategoryStore } from './categoryStore';
import { useBudgetStore } from './budgetStore';
import { useSettingsStore } from './settingsStore';
import { useScheduledStore } from './scheduledStore';
import { useInvestmentStore } from './investmentStore';
import { useSyncStore } from './syncStore';

export { useAccountStore } from './accountStore';
export { useTransactionStore } from './transactionStore';
export { useCategoryStore } from './categoryStore';
export { useBudgetStore } from './budgetStore';
export { useSettingsStore } from './settingsStore';
export { useScheduledStore } from './scheduledStore';
export { useInvestmentStore } from './investmentStore';
export { useUiStore } from './uiStore';
export { useAuthStore } from './authStore';
export { useSyncStore } from './syncStore';
export type { SyncTrigger, SyncStatus, SyncStoreState } from './syncStore';
export type { AuthState } from './authStore';
export type { Theme, ModalState, UiState } from './uiStore';

/** Bind every domain store to its repository and load initial data. */
export async function initializeStores(repos: Repositories): Promise<void> {
  await Promise.all([
    useAccountStore.getState().initialize(repos),
    useTransactionStore.getState().initialize(repos),
    useCategoryStore.getState().initialize(repos),
    useBudgetStore.getState().initialize(repos),
    useSettingsStore.getState().initialize(repos),
    useScheduledStore.getState().initialize(repos),
    useInvestmentStore.getState().initialize(repos),
    useSyncStore.getState().initialize(repos),
  ]);
}

/** Detach every domain store from its repository (logout / lock). */
export function resetStores(): void {
  useAccountStore.getState().reset();
  useTransactionStore.getState().reset();
  useCategoryStore.getState().reset();
  useBudgetStore.getState().reset();
  useSettingsStore.getState().reset();
  useScheduledStore.getState().reset();
  useInvestmentStore.getState().reset();
  useSyncStore.getState().reset();
}
