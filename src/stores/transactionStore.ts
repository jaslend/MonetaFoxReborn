/**
 * Transaction store — Phase 5a.
 *
 * Real CRUD over the encrypted transactions repository, plus the Phase 5a
 * split-validation and reconciliation rules:
 *
 * - `add`/`update` REJECT any transaction whose splits are unbalanced
 *   (`isSplitBalanced`), surfacing a `SplitUnbalancedError`. A transaction with
 *   no splits is trivially balanced. Splits MUST sum to the parent `amount`
 *   (signed); the balance layer only ever reads the parent `amount`, so splits
 *   are never double-counted.
 * - `setCleared` / `setReconciled` toggle the reconciliation flags on a stored
 *   transaction and refresh the in-memory list.
 *
 * Everything delegates to the encrypted `repositories.transactions` table;
 * `items` is a transient projection refreshed after every mutation and on
 * unlock (see `initializeStores`).
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type { Repositories, Transaction } from '@/lib/db';
import { isSplitBalanced } from '@/lib/transactions';

/** Error thrown when a mutation would persist an unbalanced split. */
export class SplitUnbalancedError extends Error {
  constructor(message = 'transaction splits must sum to the parent amount') {
    super(message);
    this.name = 'SplitUnbalancedError';
  }
}

export interface TransactionStoreState {
  /** In-memory projection of the encrypted table; empty until `initialize`. */
  items: Transaction[];
  /** Injected at unlock; null before the user authenticates. */
  repos: Repositories | null;
  /** Bind the store to its repository and load the initial list. */
  initialize: (repos: Repositories) => Promise<void>;
  /** Re-read every row from the encrypted table into `items`. */
  load: () => Promise<void>;
  /**
   * Add a new transaction (caller sets `id` to a fresh UUID). Rejects with
   * `SplitUnbalancedError` if `splits` are present and do not sum to `amount`.
   */
  add: (item: Transaction) => Promise<void>;
  /**
   * Merge a patch into the stored record and refresh. The merged record is
   * validated for split balance before it is persisted; an unbalanced result
   * rejects with `SplitUnbalancedError` and leaves the stored row untouched.
   */
  update: (id: string, patch: Partial<Transaction>) => Promise<void>;
  /** Delete a transaction by id and refresh. */
  remove: (id: string) => Promise<void>;
  /** Detach from the repository and clear the in-memory list (logout). */
  reset: () => void;
  // --- Phase 5a reconciliation helpers ---
  /** Set the `cleared` flag on a stored transaction. */
  setCleared: (id: string, cleared: boolean) => Promise<void>;
  /** Set the `reconciled` flag on a stored transaction. */
  setReconciled: (id: string, reconciled: boolean) => Promise<void>;
}

function select(repos: Repositories): EncryptedTable<Transaction> {
  return repos.transactions;
}

function notInit(): Error {
  return new Error(
    'transaction store not initialized — call initializeStores(repos) at unlock',
  );
}

/** Validate split balance for a record about to be persisted. */
function assertBalanced(item: Transaction): void {
  if (!isSplitBalanced(item)) {
    throw new SplitUnbalancedError();
  }
}

export const useTransactionStore = create<TransactionStoreState>(
  (set, get) => ({
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
      assertBalanced(item);
      await select(repos).add(item);
      await get().load();
    },

    update: async (id, patch) => {
      const { repos } = get();
      if (!repos) throw notInit();
      const table = select(repos);
      const existing = await table.get(id);
      if (!existing) throw new Error(`transaction ${id} not found`);
      const merged: Transaction = { ...existing, ...patch, id };
      assertBalanced(merged);
      await table.put(merged);
      await get().load();
    },

    remove: async (id) => {
      const { repos } = get();
      if (!repos) throw notInit();
      await select(repos).delete(id);
      await get().load();
    },

    reset: () => set({ items: [], repos: null }),

    setCleared: async (id, cleared) => {
      await get().update(id, { cleared });
    },

    setReconciled: async (id, reconciled) => {
      await get().update(id, { reconciled });
    },
  }),
);
