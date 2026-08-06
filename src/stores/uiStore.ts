/**
 * UI-only Zustand store (sidebar / modal / theme).
 *
 * This is the ONLY store that opts into `persist` — its state is pure
 * presentation and carries no domain data, so persisting it to localStorage
 * in plaintext is safe. Domain stores are NEVER persisted: their source of
 * truth is the encrypted IndexedDB tables.
 */

import { create } from 'zustand';
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

/**
 * Returns real `localStorage` in a DOM, or an in-memory stand-in elsewhere
 * (e.g. under `@vitest-environment node`, where the store is imported
 * transitively by `initializeStores` but there is no `localStorage`). The
 * fallback never persists across reloads — that's fine, it only exists so
 * importing the store never throws outside a browser.
 */
function safeStorage(): StateStorage {
  if (typeof localStorage !== 'undefined') return localStorage;
  const mem = new Map<string, string>();
  return {
    getItem: (name) => mem.get(name) ?? null,
    setItem: (name, value) => void mem.set(name, value),
    removeItem: (name) => void mem.delete(name),
  };
}

export interface ModalState {
  /** The currently-open modal id, or `null` when none. */
  active: string | null;
  /** Free-form payload (e.g. the id of the entity being edited). */
  payload: unknown;
}

export interface UiState {
  sidebarOpen: boolean;
  theme: Theme;
  modal: ModalState;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  openModal: (active: string, payload?: unknown) => void;
  closeModal: () => void;
  reset: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      theme: 'system',
      modal: { active: null, payload: null },
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setTheme: (theme) => set({ theme }),
      openModal: (active, payload) => set({ modal: { active, payload } }),
      closeModal: () => set({ modal: { active: null, payload: null } }),
      reset: () =>
        set({
          sidebarOpen: true,
          theme: 'system',
          modal: { active: null, payload: null },
        }),
    }),
    {
      name: 'monetafox-ui',
      storage: createJSONStorage(safeStorage),
      partialize: (s) => ({ sidebarOpen: s.sidebarOpen, theme: s.theme }),
    },
  ),
);
