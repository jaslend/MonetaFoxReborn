// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 12 (UX/onboarding).
// Copied into src/lib/ by the Ringer check, run against the real modules, then
// removed. Pins the two deterministic pieces of this UI-heavy phase: the
// sample/demo dataset (well-formed, referentially consistent, clearly marked so
// it can be separated from real data) and the keyboard-shortcut registry.

import { describe, it, expect } from 'vitest';

import { buildSampleData } from '@/lib/sample';
import { SHORTCUTS } from '@/lib/shortcuts';

describe('Phase 12 contract: sample/demo dataset', () => {
  it('is non-trivial and internally consistent', () => {
    const d = buildSampleData();
    expect(d.accounts.length).toBeGreaterThanOrEqual(2);
    expect(d.transactions.length).toBeGreaterThanOrEqual(10);
    expect(d.categories.length).toBeGreaterThanOrEqual(2);

    const accountIds = new Set(d.accounts.map((a: { id: string }) => a.id));
    const categoryIds = new Set(d.categories.map((c: { id: string }) => c.id));

    for (const t of d.transactions as { accountId: string; categoryId?: string; amount: number; splits?: { categoryId?: string; amount: number }[] }[]) {
      expect(accountIds.has(t.accountId), `txn references unknown account ${t.accountId}`).toBe(true);
      if (t.categoryId) expect(categoryIds.has(t.categoryId), `txn references unknown category ${t.categoryId}`).toBe(true);
      if (t.splits && t.splits.length) {
        for (const s of t.splits) if (s.categoryId) expect(categoryIds.has(s.categoryId)).toBe(true);
        const sum = t.splits.reduce((acc, s) => acc + s.amount, 0);
        expect(Math.abs(sum - t.amount)).toBeLessThan(1e-6);
      }
    }

    // Has both income and expenses so the reports look alive.
    expect(d.transactions.some((t: { amount: number }) => t.amount > 0)).toBe(true);
    expect(d.transactions.some((t: { amount: number }) => t.amount < 0)).toBe(true);
  });

  it('is clearly marked as sample data so it can be separated from real data', () => {
    const d = buildSampleData();
    // Every sample id carries a recognizable marker (so a "clear sample data"
    // action can target them without touching a user's real records).
    expect(d.accounts.every((a: { id: string }) => a.id.includes('sample'))).toBe(true);
  });

  it('is deterministic (same ids across calls)', () => {
    expect(buildSampleData().accounts.map((a: { id: string }) => a.id))
      .toEqual(buildSampleData().accounts.map((a: { id: string }) => a.id));
  });
});

describe('Phase 12 contract: keyboard shortcuts', () => {
  it('defines a non-empty registry with unique ids and keys', () => {
    expect(Array.isArray(SHORTCUTS)).toBe(true);
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(3);
    for (const s of SHORTCUTS) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.keys).toBe('string');
      expect(typeof s.label).toBe('string');
    }
    expect(new Set(SHORTCUTS.map((s) => s.id)).size).toBe(SHORTCUTS.length);
    expect(new Set(SHORTCUTS.map((s) => s.keys)).size).toBe(SHORTCUTS.length);
  });
});
