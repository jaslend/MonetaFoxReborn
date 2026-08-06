/**
 * Internal factory for the domain (encrypted) Zustand stores.
 *
 * Each domain store holds a nullable `Repositories` reference, exposes
 * `initialize(repos)` (called once at unlock via `initializeStores`), an
 * in-memory `items` list, and async `load/add/update/remove` CRUD actions that
 * delegate to its `EncryptedTable` and refresh `items`.
 *
 * Domain data is NEVER persisted in plaintext: only `useUiStore` opts into the
 * `persist` middleware. These stores carry no persistence at all — their
 * source of truth is the encrypted IndexedDB tables, reloaded into `items`
 * after every mutation and on unlock.
 */

import { create } from 'zustand';
import type { EncryptedTable } from '@/lib/crypto';
import type { Repositories } from '@/lib/db';

export interface EntityStoreState<T> {
  /** In-memory projection of the encrypted table; empty until `initialize`. */
  items: T[];
  /** Injected at unlock; null before the user authenticates. */
  repos: Repositories | null;
  /** Bind the store to its repository and load the initial list. */
  initialize: (repos: Repositories) => Promise<void>;
  /** Re-read every row from the encrypted table into `items`. */
  load: () => Promise<void>;
  /** Add a new record (caller must set `id` to a fresh UUID). */
  add: (item: T) => Promise<void>;
  /** Merge a patch into the stored record and refresh. */
  update: (id: string, patch: Partial<T>) => Promise<void>;
  /** Delete a record by id and refresh. */
  remove: (id: string) => Promise<void>;
  /** Detach from the repository and clear the in-memory list (logout). */
  reset: () => void;
}

/**
 * Build a Zustand store bound to one `EncryptedTable` selected from the
 * `Repositories` injected at unlock.
 */
export function createEntityStore<
  T extends Record<string, unknown> & { id: string },
>(select: (repos: Repositories) => EncryptedTable<T>) {
  return create<EntityStoreState<T>>((set, get) => ({
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
      if (!repos)
        throw new Error(
          'store not initialized — call initializeStores(repos) at unlock',
        );
      await select(repos).add(item);
      await get().load();
    },
    update: async (id, patch) => {
      const { repos } = get();
      if (!repos)
        throw new Error(
          'store not initialized — call initializeStores(repos) at unlock',
        );
      const table = select(repos);
      const existing = await table.get(id);
      if (!existing) throw new Error(`record ${id} not found`);
      await table.put({ ...existing, ...patch, id });
      await get().load();
    },
    remove: async (id) => {
      const { repos } = get();
      if (!repos)
        throw new Error(
          'store not initialized — call initializeStores(repos) at unlock',
        );
      await select(repos).delete(id);
      await get().load();
    },
    reset: () => set({ items: [], repos: null }),
  }));
}
