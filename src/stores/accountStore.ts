/**
 * Account store — Phase 4.
 *
 * Preserves the Phase 3a entity-store CRUD interface (`initialize/load/add/
 * update/remove/reset`) so existing tests keep passing, and adds the Phase 4
 * account-management actions the Accounts page needs:
 *
 * - `createAccount({name, type, currency, openingBalance})` — assigns a fresh
 *   UUID + `createdAt`, defaults `openingBalance` to 0 and `archived` to false,
 *   and persists through the encrypted repository.
 * - `archive(id)` / `unarchive(id)` — convenience wrappers around `update`.
 *
 * Everything delegates to the encrypted `repositories.accounts` table; the
 * in-memory `items` projection is refreshed after every mutation.
 */
import { create } from 'zustand';

import type { EncryptedTable } from '@/lib/crypto';
import type { Account, AccountType, Repositories } from '@/lib/db';

export interface AccountStoreState {
  items: Account[];
  repos: Repositories | null;
  initialize: (repos: Repositories) => Promise<void>;
  load: () => Promise<void>;
  add: (item: Account) => Promise<void>;
  update: (id: string, patch: Partial<Account>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
  // --- Phase 4 extensions ---
  createAccount: (input: {
    name: string;
    type: AccountType;
    currency: string;
    openingBalance?: number;
  }) => Promise<Account>;
  archive: (id: string) => Promise<void>;
  unarchive: (id: string) => Promise<void>;
}

function select(repos: Repositories): EncryptedTable<Account> {
  return repos.accounts;
}

function notInit(): Error {
  return new Error(
    'account store not initialized — call initializeStores(repos) at unlock',
  );
}

export const useAccountStore = create<AccountStoreState>((set, get) => ({
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
    if (!existing) throw new Error(`account ${id} not found`);
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

  createAccount: async (input) => {
    const account: Account = {
      id: crypto.randomUUID(),
      name: input.name,
      type: input.type,
      currency: input.currency,
      openingBalance: input.openingBalance ?? 0,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    await get().add(account);
    return account;
  },

  archive: async (id) => {
    await get().update(id, { archived: true });
  },

  unarchive: async (id) => {
    await get().update(id, { archived: false });
  },
}));
