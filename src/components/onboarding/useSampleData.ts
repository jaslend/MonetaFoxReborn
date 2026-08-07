/**
 * Phase 12 — `useSampleData` hook: the orchestration glue between the pure
 * sample loaders (`loadSampleData` / `clearSampleData` over the session
 * repositories) and the Zustand domain stores that must re-read the encrypted
 * tables after a load/clear. Used by the Dashboard onboarding card and the
 * Settings page "Sample data" controls so the write+refresh logic is not
 * duplicated.
 *
 * The repositories come from `useAuthStore` (set at unlock by `setup`/`login`);
 * if they are null (locked) the actions reject safely. After writing, the
 * hook re-runs every affected store's `load()` so the in-memory projections
 * reflect the new/removed rows.
 */
import { useCallback, useState } from 'react';

import { loadSampleData, clearSampleData } from '@/lib/sample';
import type { Repositories } from '@/lib/db';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useInvestmentStore } from '@/stores/investmentStore';
import { useScheduledStore } from '@/stores/scheduledStore';
import { useTransactionStore } from '@/stores/transactionStore';

/** Refresh every domain store that sample data touches. */
async function refreshAllStores(): Promise<void> {
  await Promise.all([
    useAccountStore.getState().load(),
    useTransactionStore.getState().load(),
    useCategoryStore.getState().load(),
    useBudgetStore.getState().load(),
    useScheduledStore.getState().load(),
    useInvestmentStore.getState().load(),
  ]);
}

export interface UseSampleDataResult {
  /** True while a load or clear is in flight. */
  loading: boolean;
  /** Error message from the last failed action, or null. */
  error: string | null;
  /** Write the deterministic sample dataset through the session repositories
   *  and refresh the domain stores. Idempotent (uses `put`). */
  loadSample: () => Promise<void>;
  /** Remove only the 'sample'-marked records and refresh the domain stores. */
  clearSample: () => Promise<void>;
}

export function useSampleData(): UseSampleDataResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (work: (repos: Repositories) => Promise<void>): Promise<void> => {
      const repos = useAuthStore.getState().repositories;
      if (!repos) {
        setError('Vault is locked — unlock to manage sample data.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await work(repos);
        await refreshAllStores();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const loadSample = useCallback(
    () => run((repos) => loadSampleData(repos)),
    [run],
  );

  const clearSample = useCallback(
    () => run((repos) => clearSampleData(repos)),
    [run],
  );

  return { loading, error, loadSample, clearSample };
}
