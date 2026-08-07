/**
 * Phase 12 — keyboard-shortcut registry + matcher.
 *
 * The registry is PURE DATA (`{ id; keys; label }`) so it can be pinned by a
 * contract test and rendered in a help overlay without pulling React or
 * react-router into the lib layer. The React provider/handler lives in
 * `src/components/shortcuts/` and maps each shortcut `id` to an action
 * (navigate, focus the search box, open the help overlay, …).
 *
 * Key model (Gmail-style single chords, no ctrl/cmd combos that fight the
 * browser): each `keys` is the canonical lowercase form of the key the user
 * presses when NOT focused in a text input. The matcher normalises a
 * `KeyboardEvent` to the same canonical form (`event.key.toLowerCase()`,
 * with `Escape` → `escape`) and returns the matching shortcut, if any. The
 * provider ignores events originating from text inputs (so these chords
 * never type into a payee field) via `isEditableTarget`.
 *
 * Every `id` and every `keys` is unique (asserted by the contract test).
 */
export interface Shortcut {
  /** Stable identifier the provider maps to an action (e.g. 'go-dashboard'). */
  id: string;
  /** Canonical key chord the matcher compares against (e.g. 't', '?', '/'). */
  keys: string;
  /** Human-readable label for the help overlay. */
  label: string;
}

/**
 * The shortcut set. Single chords only; the provider ignores events from
 * text inputs so these never type into a field.
 */
export const SHORTCUTS: Shortcut[] = [
  { id: 'new-transaction', keys: 'n', label: 'New transaction' },
  { id: 'go-dashboard', keys: 'h', label: 'Go to Dashboard' },
  { id: 'go-transactions', keys: 't', label: 'Go to Transactions' },
  { id: 'go-reports', keys: 'r', label: 'Go to Reports' },
  { id: 'go-budgets', keys: 'b', label: 'Go to Budgets' },
  { id: 'go-accounts', keys: 'a', label: 'Go to Accounts' },
  { id: 'go-settings', keys: 's', label: 'Go to Settings' },
  { id: 'focus-search', keys: '/', label: 'Focus search' },
  { id: 'show-help', keys: '?', label: 'Show keyboard shortcuts' },
];

/** Look up a shortcut by id. */
export function getShortcutById(id: string): Shortcut | undefined {
  return SHORTCUTS.find((s) => s.id === id);
}

/**
 * Normalise a `KeyboardEvent` to the canonical key form used in the
 * registry: `event.key` lowercased, with `Escape` mapped to `escape`. We use
 * `key` (not `code`) so produced characters like `?` (Shift+/) match by the
 * visible glyph, and so `Enter`/`Escape` read as words.
 */
export function canonicalKey(event: KeyboardEvent): string {
  const k = event.key;
  if (k === 'Escape') return 'escape';
  return k.toLowerCase();
}

/**
 * Return the shortcut matching `event`, if any. Pure — no side effects. The
 * provider decides whether to ignore text-input origins and whether to
 * actually run the action.
 */
export function matchShortcut(event: KeyboardEvent): Shortcut | undefined {
  const key = canonicalKey(event);
  return SHORTCUTS.find((s) => s.keys === key);
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * True when `target` is an editable element (form control, contenteditable,
 * or a text field). The provider ignores shortcut events from these so the
 * chords never type into a payee/notes/search field.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  // A role that presents as a text field (e.g. combobox) — treat as editable.
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox' || role === 'searchbox') {
    return true;
  }
  return false;
}
