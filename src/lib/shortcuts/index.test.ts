import { describe, it, expect } from 'vitest';

import {
  SHORTCUTS,
  canonicalKey,
  getShortcutById,
  isEditableTarget,
  matchShortcut,
  type Shortcut,
} from '@/lib/shortcuts';

describe('SHORTCUTS registry', () => {
  it('is a non-empty array of {id, keys, label}', () => {
    expect(Array.isArray(SHORTCUTS)).toBe(true);
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(3);
    for (const s of SHORTCUTS) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.keys).toBe('string');
      expect(typeof s.label).toBe('string');
    }
  });

  it('has unique ids and unique keys', () => {
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.keys)).size).toBe(SHORTCUTS.length);
  });

  it('includes the core shortcuts the spec calls for', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id));
    expect(ids.has('new-transaction')).toBe(true);
    expect(ids.has('go-dashboard')).toBe(true);
    expect(ids.has('focus-search')).toBe(true);
    expect(ids.has('show-help')).toBe(true);
  });
});

describe('getShortcutById', () => {
  it('returns the shortcut with the given id', () => {
    const s = getShortcutById('new-transaction') as Shortcut | undefined;
    expect(s).toBeDefined();
    expect(s?.keys).toBe('n');
  });
  it('returns undefined for an unknown id', () => {
    expect(getShortcutById('nope')).toBeUndefined();
  });
});

describe('canonicalKey', () => {
  it('lowercases the event key', () => {
    expect(canonicalKey({ key: 'T' } as KeyboardEvent)).toBe('t');
    expect(canonicalKey({ key: 'n' } as KeyboardEvent)).toBe('n');
  });
  it('maps Escape to escape', () => {
    expect(canonicalKey({ key: 'Escape' } as KeyboardEvent)).toBe('escape');
  });
  it('preserves produced glyphs like ?', () => {
    expect(canonicalKey({ key: '?' } as KeyboardEvent)).toBe('?');
  });
});

describe('matchShortcut', () => {
  it('matches a registered chord', () => {
    const e = { key: 't' } as KeyboardEvent;
    expect(matchShortcut(e)?.id).toBe('go-transactions');
  });
  it('matches case-insensitively', () => {
    expect(matchShortcut({ key: 'H' } as KeyboardEvent)?.id).toBe(
      'go-dashboard',
    );
  });
  it('matches the ? help chord', () => {
    expect(matchShortcut({ key: '?' } as KeyboardEvent)?.id).toBe('show-help');
  });
  it('returns undefined for an unregistered chord', () => {
    expect(matchShortcut({ key: 'z' } as KeyboardEvent)).toBeUndefined();
  });
});

describe('isEditableTarget', () => {
  function target(
    tag: string,
    opts: { editable?: boolean; role?: string } = {},
  ): HTMLElement {
    const el = document.createElement(tag);
    if (opts.editable) {
      Object.defineProperty(el, 'isContentEditable', {
        configurable: true,
        get: () => true,
      });
    }
    if (opts.role) el.setAttribute('role', opts.role);
    return el;
  }
  it('true for input/textarea/select', () => {
    expect(isEditableTarget(target('input'))).toBe(true);
    expect(isEditableTarget(target('textarea'))).toBe(true);
    expect(isEditableTarget(target('select'))).toBe(true);
  });
  it('true for contenteditable', () => {
    expect(isEditableTarget(target('div', { editable: true }))).toBe(true);
  });
  it('true for textbox/searchbox/combobox roles', () => {
    expect(isEditableTarget(target('div', { role: 'textbox' }))).toBe(true);
    expect(isEditableTarget(target('div', { role: 'searchbox' }))).toBe(true);
    expect(isEditableTarget(target('div', { role: 'combobox' }))).toBe(true);
  });
  it('false for a plain div/button', () => {
    expect(isEditableTarget(target('div'))).toBe(false);
    expect(isEditableTarget(target('button'))).toBe(false);
  });
  it('false for non-HTMLElement / null', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
});
