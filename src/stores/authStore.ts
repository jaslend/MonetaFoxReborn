/**
 * Auth store — Phase 2 local auth + session lifecycle.
 *
 * UNLOCK-ON-RELOAD MODEL (local-only, no server): "authentication" = derive the
 * encryption key from credentials and prove it against a stored verifier. The
 * derived `CryptoKey` lives in MEMORY ONLY (zustand state is never persisted —
 * this store does NOT use `persist`) and is NEVER written to localStorage /
 * sessionStorage / IndexedDB. After a reload the key is gone, so the user
 * re-enters their secret to UNLOCK (re-derive). The password/passphrase is
 * never stored.
 *
 * SINGLE ACTIVE SESSION: on setup/login we mint a `sessionId`, store it in
 * localStorage (non-sensitive), and broadcast it via a `BroadcastChannel` (plus
 * the `storage` event as a fallback). When another tab starts a NEW session,
 * this tab LOCKS (clears its in-memory key + detaches stores). Explicit logout
 * here does NOT lock other tabs (it doesn't post).
 *
 * INACTIVITY EXPIRY: after `INACTIVITY_TIMEOUT_MS` of no user activity, the
 * session locks. The timer resets on mouse/keyboard/touch/scroll activity.
 */
import { create } from 'zustand';

import type { MonetaFoxDB, Repositories } from '@/lib/db';
import {
  getVaultInfo,
  setupVault,
  authenticate,
  deleteVault,
  type SetupInput,
} from '@/lib/auth';
import { initializeStores, resetStores } from './index';

/** After this long without user activity, the session locks. */
export const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

/** localStorage key holding the current (non-sensitive) session id. */
const SESSION_STORAGE_KEY = 'monetafox-session';
/** BroadcastChannel name used to announce new sessions across tabs. */
const SESSION_CHANNEL_NAME = 'monetafox-session';

export type AuthStatus = 'setup' | 'locked' | 'unlocked';
export type AuthMode = 'basic' | 'advanced';

export interface AuthState {
  /** RequireAuth gate (kept settable so the Phase 3b shell test still works). */
  isAuthenticated: boolean;
  /** Drives the LoginPage form shape. */
  status: AuthStatus;
  email: string | null;
  mode: AuthMode | null;
  // --- IN-MEMORY ONLY (never persisted; cleared on logout/lock) ---
  key: CryptoKey | null;
  repositories: Repositories | null;
  db: MonetaFoxDB | null;
  sessionId: string | null;
  // --- actions ---
  bootstrap: () => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  login: (input: { email: string; secret: string }) => Promise<void>;
  logout: () => void;
  deleteAccount: () => Promise<void>;
  /** Compatibility setter (dev bypass / tests). */
  setAuthenticated: (value: boolean) => void;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Single-session + inactivity plumbing (browser-only; no-ops in node tests).
// ---------------------------------------------------------------------------

let channel: BroadcastChannel | null = null;
let channelBound = false;
let storageBound = false;
let activityBound = false;
let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

function getChannel(): BroadcastChannel | null {
  // Only meaningful in a browser-like env (cross-tab). In node tests there is
  // no window/tabs, so skip to avoid leaking an EventEmitter handle.
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined')
    return null;
  if (!channel) channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
  return channel;
}

/** Clear the inactivity timer (no-op if none). */
function clearInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

/** (Re)arm the inactivity timer; locks the session when it fires. */
function armInactivityTimer(): void {
  // Only in a browser-like env (needs document activity events). In node tests
  // there is no user activity, so arming would leave a 24h handle dangling.
  if (typeof document === 'undefined' || typeof setTimeout === 'undefined')
    return;
  clearInactivityTimer();
  inactivityTimer = setTimeout(() => {
    if (useAuthStore.getState().status === 'unlocked') {
      lockFromExternal();
    }
  }, INACTIVITY_TIMEOUT_MS);
}

/** User-activity handler that resets the inactivity timer. */
function onUserActivity(): void {
  if (useAuthStore.getState().status === 'unlocked') armInactivityTimer();
}

/** Attach document activity listeners once. */
function bindActivityListeners(): void {
  if (activityBound || typeof document === 'undefined') return;
  activityBound = true;
  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
  for (const ev of events)
    document.addEventListener(ev, onUserActivity, {
      passive: true,
    });
}

/** Attach cross-tab listeners once (BroadcastChannel + storage). */
function bindSessionListeners(): void {
  const ch = getChannel();
  if (ch && !channelBound) {
    channelBound = true;
    ch.onmessage = (e: MessageEvent) => {
      const incoming = (e.data as { sessionId?: string } | null)?.sessionId;
      const current = useAuthStore.getState().sessionId;
      if (incoming && current && incoming !== current) lockFromExternal();
    };
  }
  if (!storageBound && typeof window !== 'undefined') {
    storageBound = true;
    window.addEventListener('storage', (e: StorageEvent) => {
      if (e.key !== SESSION_STORAGE_KEY) return;
      const incoming = e.newValue;
      const current = useAuthStore.getState().sessionId;
      if (incoming && current && incoming !== current) lockFromExternal();
    });
  }
}

/** Announce a new session: persist id + broadcast + start listeners/timers. */
function activateSession(sessionId: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  const ch = getChannel();
  if (ch) ch.postMessage({ sessionId });
  bindSessionListeners();
  bindActivityListeners();
  armInactivityTimer();
}

/** Stop tracking this tab's session (explicit logout / delete). No broadcast. */
function deactivateSession(): void {
  clearInactivityTimer();
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

/** Another tab took over, or inactivity elapsed: lock this tab silently. */
function lockFromExternal(): void {
  resetStores();
  const { db } = useAuthStore.getState();
  if (db) {
    try {
      db.close();
    } catch {
      // ignore — already closing
    }
  }
  clearInactivityTimer();
  // Keep email/mode so the unlock form can prefill; drop the secret material.
  useAuthStore.setState({
    isAuthenticated: false,
    status: 'locked',
    key: null,
    repositories: null,
    db: null,
    sessionId: null,
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  status: 'setup',
  email: null,
  mode: null,
  key: null,
  repositories: null,
  db: null,
  sessionId: null,

  bootstrap: async () => {
    try {
      const info = await getVaultInfo();
      if (info.exists) {
        set({
          isAuthenticated: false,
          status: 'locked',
          email: info.email ?? null,
          mode: info.mode ?? null,
        });
      } else {
        set({
          isAuthenticated: false,
          status: 'setup',
          email: null,
          mode: null,
        });
      }
    } catch {
      // IndexedDB unavailable (e.g. jsdom without fake-indexeddb): default to
      // setup so the first-run form renders. Never throw from boot.
      set({ isAuthenticated: false, status: 'setup', email: null, mode: null });
    }
  },

  setup: async (input) => {
    const result = await setupVault(input);
    await initializeStores(result.repositories);
    set({
      isAuthenticated: true,
      status: 'unlocked',
      email: normalizeEmail(input.email),
      mode: input.mode,
      key: result.key,
      repositories: result.repositories,
      db: result.db,
      sessionId: result.sessionId,
    });
    activateSession(result.sessionId);
  },

  login: async (input) => {
    const result = await authenticate(input);
    await initializeStores(result.repositories);
    let mode = get().mode;
    if (!mode) {
      const info = await getVaultInfo();
      mode = info.mode ?? null;
    }
    set({
      isAuthenticated: true,
      status: 'unlocked',
      email: normalizeEmail(input.email),
      mode,
      key: result.key,
      repositories: result.repositories,
      db: result.db,
      sessionId: result.sessionId,
    });
    activateSession(result.sessionId);
  },

  logout: () => {
    resetStores();
    const { db } = get();
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    deactivateSession();
    set({
      isAuthenticated: false,
      status: 'locked',
      key: null,
      repositories: null,
      db: null,
      sessionId: null,
    });
  },

  deleteAccount: async () => {
    resetStores();
    const { db } = get();
    if (db) {
      try {
        await db.close();
      } catch {
        // ignore
      }
    }
    await deleteVault();
    deactivateSession();
    set({
      isAuthenticated: false,
      status: 'setup',
      email: null,
      mode: null,
      key: null,
      repositories: null,
      db: null,
      sessionId: null,
    });
  },

  setAuthenticated: (value) => set({ isAuthenticated: value }),
}));
