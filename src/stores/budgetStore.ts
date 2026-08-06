/**
 * Budget store — Phase 6.
 *
 * Preserves the Phase 3a entity-store CRUD interface (`initialize/load/add/
 * update/remove/reset`) so the existing store suite keeps passing, and adds
 * the Phase 6 helpers the Budgets page needs:
 *
 * - `createBudget({categoryId, month, limit})` — assigns a fresh UUID and
 *   persists through the encrypted repository.
 * - `statusesForMonth(month, transactions)` — selects the loaded budgets for
 *   `month` and maps them to `BudgetStatus[]` via the pure
 *   `src/lib/budgets#budgetStatuses` helper. The page passes in the loaded
 *   transactions; the store itself does not pull from `useTransactionStore`
 *   (keeping domain stores decoupled and the helper trivially testable).
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type { Budget, Repositories, Transaction } from '@/lib/db';
import { budgetStatuses, type BudgetStatus } from '@/lib/budgets';

export interface BudgetStoreState {
  items: Budget[];
  repos: Repositories | null;
  initialize: (repos: Repositories) => Promise<void>;
  load: () => Promise<void>;
  add: (item: Budget) => Promise<void>;
  update: (id: string, patch: Partial<Budget>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
  // --- Phase 6 extensions ---
  createBudget: (input: {
    categoryId: string;
    month: string;
    limit: number;
  }) => Promise<Budget>;
  statusesForMonth: (
    month: string,
    transactions: Transaction[],
  ) => BudgetStatus[];
}

function select(repos: Repositories): EncryptedTable<Budget> {
  return repos.budgets;
}

function notInit(): Error {
  return new Error(
    'budget store not initialized — call initializeStores(repos) at unlock',
  );
}

export const useBudgetStore = create<BudgetStoreState>((set, get) => ({
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
    if (!existing) throw new Error(`budget ${id} not found`);
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

  createBudget: async (input) => {
    const budget: Budget = {
      id: crypto.randomUUID(),
      categoryId: input.categoryId,
      month: input.month,
      limit: input.limit,
    };
    await get().add(budget);
    return budget;
  },

  statusesForMonth: (month, transactions) => {
    const budgets = get().items.filter((b) => b.month === month);
    return budgetStatuses(budgets, transactions);
  },
}));
