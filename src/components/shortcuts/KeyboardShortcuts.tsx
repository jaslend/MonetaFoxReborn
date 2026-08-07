/**
 * Phase 12 — keyboard-shortcuts provider/handler + help overlay.
 *
 * `<KeyboardShortcuts />` is mounted INSIDE the Router (see App.tsx) so it
 * can navigate via `useNavigate`. It binds a single `keydown` listener on
 * `window`, ignores events from editable targets (form fields, contenteditable,
 * search boxes) via `isEditableTarget`, matches the event against the
 * `SHORTCUTS` registry, and runs the mapped action.
 *
 * The `?` (show-help) shortcut toggles a modal help overlay listing every
 * shortcut; `Escape` closes it. The overlay is rendered in a portal-like fixed
 * container (no new dependency) and traps focus loosely — it is a small,
 * dismissible list.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  SHORTCUTS,
  isEditableTarget,
  matchShortcut,
  type Shortcut,
} from '@/lib/shortcuts';
import { Button } from '@/components/ui/button';

/** Route each shortcut id maps to (navigation shortcuts). */
const ROUTE_BY_ID: Record<string, string> = {
  'go-dashboard': '/',
  'go-transactions': '/transactions',
  'go-reports': '/reports',
  'go-budgets': '/budgets',
  'go-accounts': '/accounts',
  'go-settings': '/settings',
};

export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  const runAction = useCallback(
    (shortcut: Shortcut): void => {
      switch (shortcut.id) {
        case 'show-help':
          setHelpOpen((o) => !o);
          break;
        case 'focus-search':
          focusSearch();
          break;
        case 'new-transaction':
          // Surface the global add-transaction intent via a CustomEvent the
          // Transactions page / Layout can listen for; navigate there too so
          // the form is reachable from any section.
          navigate('/transactions');
          window.dispatchEvent(
            new CustomEvent('monetafox:new-transaction', { bubbles: true }),
          );
          break;
        default: {
          const route = ROUTE_BY_ID[shortcut.id];
          if (route) navigate(route);
        }
      }
    },
    [navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape closes the help overlay regardless of focus.
      if (e.key === 'Escape' && helpOpen) {
        e.preventDefault();
        setHelpOpen(false);
        return;
      }
      // Ignore events from text inputs so chords never type into fields.
      if (isEditableTarget(e.target)) return;
      // Ignore plain modifier key presses (Shift, Control, Alt, Meta) — they
      // are modifiers, not shortcuts of their own.
      const mod = e.key;
      if (
        mod === 'Shift' ||
        mod === 'Control' ||
        mod === 'Alt' ||
        mod === 'Meta'
      ) {
        return;
      }
      const shortcut = matchShortcut(e);
      if (!shortcut) return;
      e.preventDefault();
      runAction(shortcut);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen, runAction]);

  return helpOpen ? (
    <ShortcutsHelpOverlay
      shortcuts={SHORTCUTS}
      onClose={() => setHelpOpen(false)}
    />
  ) : null;
}

/**
 * Focus the first search input on the page (data-testid='tx-search' on the
 * Transactions filter bar, or any `type="search"` / `role="searchbox"`). Falls
 * back to a no-op if nothing matches.
 */
function focusSearch(): void {
  if (typeof document === 'undefined') return;
  const el =
    document.querySelector<HTMLElement>('[data-testid="tx-search"]') ??
    document.querySelector<HTMLInputElement>('input[type="search"]') ??
    document.querySelector<HTMLElement>('[role="searchbox"]');
  el?.focus();
}

/** The '?' help overlay — a dismissible list of every shortcut. */
function ShortcutsHelpOverlay({
  shortcuts,
  onClose,
}: {
  shortcuts: Shortcut[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border-border w-full max-w-md rounded-lg border shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            Esc
          </Button>
        </div>
        <ul className="flex flex-col gap-1 p-4">
          {shortcuts.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between py-1 text-sm"
            >
              <span className="text-muted-foreground">{s.label}</span>
              <kbd className="bg-muted text-muted-foreground rounded border border-border px-2 py-0.5 font-mono text-xs">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { ShortcutsHelpOverlay };
