/**
 * Auth store — STUB for the Phase 3b app shell.
 *
 * This is deliberately NOT real authentication. Phase 2 replaces it with the
 * real session logic (email/password login, single-active-session, login
 * history, deletion flow) wired through the crypto + data layer. The shell
 * only needs a boolean seam so `RequireAuth` can decide whether to render
 * protected content or redirect to `/login`.
 *
 * The seam Phase 2 implements against:
 *   - `isAuthenticated: boolean` — read by `RequireAuth`.
 *   - `setAuthenticated(v)` — called by the (future) real login/logout flows
 *     and, for now, by the dev-only "Sign in" button on the Login page.
 *   - `login()` / `logout()` — thin convenience wrappers, safe to keep when
 *     the real flow lands (login becomes `setAuthenticated(true)`, logout
 *     also calls `resetStores()` to detach domain data).
 */

import { create } from 'zustand';

export interface AuthState {
  isAuthenticated: boolean;
  setAuthenticated: (value: boolean) => void;
  login: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false }),
}));
