// @vitest-environment node
//
// ORCHESTRATOR-OWNED CONTRACT TEST — MonetaFox Reborn, Phase 5b
// (filters / search / templates). Copied into src/lib/transactions/ by the
// Ringer check, run against the real modules, then removed. It pins the
// deterministic query core AND a round-trip through the new (migrated)
// transactionTemplates table to prove the Dexie v2 migration + repo wiring.

import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

import { filterTransactions, searchTransactions, categoryTotals } from './index';
import { MonetaFoxDB, createRepositories } from '@/lib/db';
import { deriveKey } from '@/lib/crypto';

const txns = [
  { id: 't1', accountId: 'a1', date: '2026-01-05', payee: 'Tesco', categoryId: 'food', amount: -20, currency: 'GBP', cleared: true },
  { id: 't2', accountId: 'a1', date: '2026-02-10', payee: 'Amazon', categoryId: 'shop', amount: -50, currency: 'GBP', cleared: false,
    splits: [{ categoryId: 'shop', amount: -30 }, { categoryId: 'gifts', amount: -20 }] },
  { id: 't3', accountId: 'a2', date: '2026-03-01', payee: 'Salary Inc', amount: 2000, currency: 'GBP', cleared: true },
] as never[];

const ids = (r: { id: string }[]) => r.map((t) => t.id).sort();

describe('Phase 5b contract: filtering', () => {
  it('filters by an inclusive date range', () => {
    expect(ids(filterTransactions(txns, { dateFrom: '2026-02-01', dateTo: '2026-02-28' }))).toEqual(['t2']);
  });
  it('filters by category, matching split categories too', () => {
    expect(ids(filterTransactions(txns, { categoryId: 'gifts' }))).toEqual(['t2']); // via a split line
    expect(ids(filterTransactions(txns, { categoryId: 'food' }))).toEqual(['t1']);
  });
  it('filters by payee (case-insensitive substring)', () => {
    expect(ids(filterTransactions(txns, { payee: 'tesc' }))).toEqual(['t1']);
  });
  it('filters by cleared status', () => {
    expect(ids(filterTransactions(txns, { cleared: true }))).toEqual(['t1', 't3']);
  });
  it('an empty filter returns everything', () => {
    expect(filterTransactions(txns, {}).length).toBe(3);
  });
});

describe('Phase 5b contract: search', () => {
  it('matches payee case-insensitively', () => {
    expect(ids(searchTransactions(txns, 'salary'))).toEqual(['t3']);
  });
  it('an empty query returns everything', () => {
    expect(searchTransactions(txns, '').length).toBe(3);
  });
});

describe('Phase 5b contract: category totals (respecting splits)', () => {
  it('allocates split lines to their categories and non-split amounts to theirs', () => {
    const totals = categoryTotals(txns);
    expect(totals.food).toBe(-20); // t1, non-split
    expect(totals.shop).toBe(-30); // t2 split line only (NOT the -50 parent)
    expect(totals.gifts).toBe(-20); // t2 split line
    // The salary (t3) has no category, so it should not create a bogus bucket.
    expect(totals[''] ?? 0).toBe(0);
  });
});

describe('Phase 5b contract: transactionTemplates table (Dexie v2)', () => {
  it('stores a template encrypted and reads it back', async () => {
    const db = new MonetaFoxDB('phase5b-contract');
    const key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
    const repos = createRepositories(db, key);
    expect(repos.transactionTemplates, 'repositories.transactionTemplates must exist').toBeDefined();

    const id = crypto.randomUUID();
    await repos.transactionTemplates.add({ id, name: 'Monthly Rent', amount: -1000, currency: 'GBP', payee: 'Landlord' } as never);

    const raw = await db.transactionTemplates.get(id);
    expect(JSON.stringify(raw)).not.toContain('Landlord');

    const got = await repos.transactionTemplates.get(id);
    expect((got as { name: string }).name).toBe('Monthly Rent');

    await db.delete();
  });
});
