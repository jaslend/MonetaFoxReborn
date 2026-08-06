/**
 * Transaction store — Phase 5a + 5b.
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
 * Phase 5b additions:
 * - `filter` / `search` hold the current discovery state; `setFilter` /
 *   `setSearch` / `clearFilter` mutate it. The DERIVED visible list is produced
 *   by the pure `selectFilteredTransactions` selector (filterTransactions ∘
 *   searchTransactions), which components subscribe to.
 * - Template quick-entry: `templates` is the in-memory projection of the
 *   encrypted `transactionTemplates` table (loaded on unlock and after every
 *   mutation). `saveAsTemplate(from)` materialises a template from a
 *   transaction, `applyTemplate(id)` returns one for the form to prefill, and
 *   `deleteTemplate(id)` removes it.
 *
 * Everything delegates to the encrypted `repositories.transactions` /
 * `transactionTemplates` tables; `items` and `templates` are transient
 * projections refreshed after every mutation and on unlock (see
 * `initializeStores`).
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type { Repositories, Transaction } from '@/lib/db';
import type { TransactionTemplate } from '@/lib/db/models';
import {
  filterTransactions,
  isSplitBalanced,
  searchTransactions,
  type TransactionFilter,
} from '@/lib/transactions';

export type { TransactionFilter } from '@/lib/transactions';

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
  // --- Phase 5b discovery (filters + search) ---
  /** Current filter predicate; `{}` matches everything. */
  filter: TransactionFilter;
  /** Current search query; empty/whitespace matches everything. */
  search: string;
  /** Merge a partial patch into `filter` (undefined fields clear that key). */
  setFilter: (patch: Partial<TransactionFilter>) => void;
  /** Replace the search query. */
  setSearch: (query: string) => void;
  /** Reset `filter` to `{}` and `search` to `''`. */
  clearFilter: () => void;
  // --- Phase 5b quick-entry templates ---
  /** In-memory projection of the encrypted `transactionTemplates` table. */
  templates: TransactionTemplate[];
  /** Re-read every template row into `templates`. */
  loadTemplates: () => Promise<void>;
  /** Persist a template derived from `from` and refresh `templates`. */
  saveAsTemplate: (
    from: Transaction,
    name?: string,
  ) => Promise<TransactionTemplate>;
  /** Return the template with `id` (for the form to prefill); undefined if absent. */
  applyTemplate: (templateId: string) => TransactionTemplate | undefined;
  /** Snapshot of `templates` (convenience for `listTemplates`). */
  listTemplates: () => TransactionTemplate[];
  /** Delete a template by id and refresh. */
  deleteTemplate: (id: string) => Promise<void>;
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

/**
 * Derived selector: the visible transactions are the `items` filtered by
 * `filter` and matched against `search`. Both layers are the pure Phase 5b
 * functions; search is applied first (a substring superset) then the filter.
 * Components should subscribe via `useTransactionStore(selectFilteredTransactions)`.
 */
export function selectFilteredTransactions(
  state: TransactionStoreState,
): Transaction[] {
  return filterTransactions(
    searchTransactions(state.items, state.search),
    state.filter,
  );
}

export const useTransactionStore = create<TransactionStoreState>(
  (set, get) => ({
    items: [],
    repos: null,

    initialize: async (repos) => {
      set({ repos });
      await Promise.all([get().load(), get().loadTemplates()]);
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

    reset: () =>
      set({ items: [], repos: null, filter: {}, search: '', templates: [] }),

    setCleared: async (id, cleared) => {
      await get().update(id, { cleared });
    },

    setReconciled: async (id, reconciled) => {
      await get().update(id, { reconciled });
    },

    filter: {},
    search: '',
    setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
    setSearch: (query) => set({ search: query }),
    clearFilter: () => set({ filter: {}, search: '' }),

    templates: [],
    loadTemplates: async () => {
      const { repos } = get();
      if (!repos) return;
      set({ templates: await repos.transactionTemplates.toArray() });
    },
    saveAsTemplate: async (from, name) => {
      const { repos } = get();
      if (!repos) throw notInit();
      const tpl: TransactionTemplate = {
        id: crypto.randomUUID(),
        name: (name && name.trim()) || from.payee || 'Template',
        accountId: from.accountId,
        payee: from.payee,
        amount: from.amount,
        currency: from.currency,
        categoryId: from.categoryId,
        notes: from.notes,
        tags: from.tags,
        splits: from.splits,
      };
      await repos.transactionTemplates.add(tpl);
      await get().loadTemplates();
      return tpl;
    },
    applyTemplate: (templateId) =>
      get().templates.find((t) => t.id === templateId),
    listTemplates: () => get().templates,
    deleteTemplate: async (id) => {
      const { repos } = get();
      if (!repos) throw notInit();
      await repos.transactionTemplates.delete(id);
      await get().loadTemplates();
    },
  }),
);
