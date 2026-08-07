/**
 * Phase 12 — PWA new-version reload prompt (vite-plugin-pwa, registerType
 * 'prompt').
 *
 * Per spec §"Error Handling & Updates": "New versions prompt user to reload
 * (not silent update)." This renders a NON-BLOCKING prompt whenever the
 * service worker reports a new version is ready to activate (`needRefresh`):
 * a small fixed banner with a "Reload" button that calls
 * `updateServiceWorker(true)` (reload the window once the new SW takes
 * control). There is NO auto-reload — the user must confirm.
 *
 * The `useRegisterSW` hook comes from vite-plugin-pwa's virtual module
 * `virtual:pwa-register/react`; the triple-slash reference below loads its
 * ambient type declaration without touching tsconfig / vite-env.d.ts (which
 * are outside this phase's ownership).
 */
/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';

import { Button } from '@/components/ui/button';

/** Dismissed-while-this-tab-is-alive state (in-memory; not persisted). */
let dismissed = false;

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, _reg) {
      // No-op: the default registration already handles update checks. We do
      // NOT auto-activate — the spec requires a user-confirmed reload.
    },
    onRegisterError(error) {
      console.error('SW registration failed', error);
    },
  });

  if (!needRefresh || dismissed) return null;

  const handleReload = () => {
    void updateServiceWorker(true);
  };

  const handleDismiss = () => {
    dismissed = true;
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:left-auto sm:w-96 sm:rounded-lg sm:border"
      data-testid="pwa-update-prompt"
    >
      <span className="text-sm">A new version is available.</span>
      <span className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={handleDismiss}>
          Later
        </Button>
        <Button size="sm" onClick={handleReload} data-testid="pwa-reload">
          Reload
        </Button>
      </span>
    </div>
  );
}
