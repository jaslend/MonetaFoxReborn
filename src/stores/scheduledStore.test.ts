// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { deriveKey } from '@/lib/crypto';
import { MonetaFoxDB, createRepositories, type Repositories } from '@/lib/db';

import {
  useScheduledStore,
  useTransactionStore,
  initializeStores,
  resetStores,
} from './index';

function uuid(): string {
  return crypto.randomUUID();
}

let key: CryptoKey;
beforeAll(async () => {
  key = await deriveKey({ mode: 'advanced', passphrase: 'pp', salt: 's' });
});

let db: MonetaFoxDB;
let repos: Repositories;

beforeEach(async () => {
  db = new MonetaFoxDB(
    'test-sched-store-' + Math.random().toString(36).slice(2),
  );
  repos = createRepositories(db, key);
  resetStores();
  await initializeStores(repos);
});

afterEach(async () => {
  resetStores();
  await db.delete();
});

function auto(
  over: Partial<
    ReturnType<typeof useScheduledStore.getState>['items'][number]
  > & {
    nextDate: string;
  },
) {
  return {
    id: over.id ?? uuid(),
    recurrence: over.recurrence ?? { freq: 'monthly' as const },
    nextDate: over.nextDate,
    mode: 'auto' as const,
    template: over.template ?? {
      accountId: over.id ?? 'acc1',
      amount: -100,
      currency: 'USD',
      payee: 'Landlord',
    },
  };
}

function manual(
  over: Partial<
    ReturnType<typeof useScheduledStore.getState>['items'][number]
  > & {
    nextDate: string;
  },
) {
  return {
    id: over.id ?? uuid(),
    recurrence: over.recurrence ?? { freq: 'monthly' as const },
    nextDate: over.nextDate,
    mode: 'manual' as const,
    template: over.template ?? {
      accountId: over.id ?? 'acc1',
      amount: -50,
      currency: 'USD',
      payee: 'Manual bill',
    },
  };
}

describe('useScheduledStore', () => {
  it('CRUDs schedules against the encrypted database', async () => {
    const store = useScheduledStore;
    expect(store.getState().items).toEqual([]);
    expect(store.getState().repos).toBe(repos);

    const s = auto({ nextDate: '2026-01-15' });
    await store.getState().add(s);
    expect(store.getState().items.map((x) => x.id)).toEqual([s.id]);

    await store.getState().update(s.id, { nextDate: '2026-02-01' });
    expect(store.getState().items[0].nextDate).toBe('2026-02-01');

    await store.getState().remove(s.id);
    expect(store.getState().items).toEqual([]);
    expect(await repos.scheduledTransactions.get(s.id)).toBeUndefined();
  });

  it('persists at-rest ciphertext only', async () => {
    const s = auto({ nextDate: '2026-01-15' });
    s.template.payee = 'SensitivePayee';
    await useScheduledStore.getState().add(s);
    const raw = await db.scheduledTransactions.get(s.id);
    expect(JSON.stringify(raw)).not.toContain('SensitivePayee');
  });

  it('processDue generates exactly one AUTO transaction, advances the schedule, and persists both', async () => {
    const acc = uuid();
    // A transaction store requires a valid account? No — it stores any tx.
    // But to mirror real use we just persist the schedule; the tx store
    // accepts the generated transaction as-is.
    const s = auto({
      nextDate: '2026-01-15',
      template: {
        accountId: acc,
        amount: -200,
        currency: 'USD',
        payee: 'Rent',
      },
    });
    await useScheduledStore.getState().add(s);

    const { generated, pendingManual } = await useScheduledStore
      .getState()
      .processDue('2026-02-01');

    expect(generated).toHaveLength(1);
    expect(generated[0].scheduleId).toBe(s.id);
    expect(generated[0].transaction.date).toBe('2026-01-15');
    expect(generated[0].transaction.amount).toBe(-200);
    expect(generated[0].transaction.payee).toBe('Rent');

    // The generated transaction is persisted in the transactions table.
    const txns = useTransactionStore.getState().items;
    expect(txns).toHaveLength(1);
    expect(txns[0].id).toBe(generated[0].transaction.id);

    // The schedule is advanced by one month.
    expect(useScheduledStore.getState().items[0].nextDate).toBe('2026-02-15');
    expect(useScheduledStore.getState().pendingManual).toEqual([]);
    expect(pendingManual).toEqual([]);
  });

  it('processDue surfaces due MANUAL schedules as pending and does NOT advance or generate', async () => {
    const m = manual({ nextDate: '2026-01-15' });
    await useScheduledStore.getState().add(m);

    const { generated, pendingManual } = await useScheduledStore
      .getState()
      .processDue('2026-02-01');

    expect(generated).toEqual([]);
    expect(pendingManual.map((p) => p.id)).toEqual([m.id]);
    expect(useScheduledStore.getState().pendingManual.map((p) => p.id)).toEqual(
      [m.id],
    );
    // Manual schedule is NOT advanced.
    expect(useScheduledStore.getState().items[0].nextDate).toBe('2026-01-15');
    // No transaction generated.
    expect(useTransactionStore.getState().items).toEqual([]);
  });

  it('processDue leaves non-due schedules untouched', async () => {
    const s = auto({ nextDate: '2026-03-15' });
    await useScheduledStore.getState().add(s);

    const { generated, pendingManual } = await useScheduledStore
      .getState()
      .processDue('2026-02-01');

    expect(generated).toEqual([]);
    expect(pendingManual).toEqual([]);
    expect(useScheduledStore.getState().items[0].nextDate).toBe('2026-03-15');
  });

  it('postManual generates + advances a single pending MANUAL schedule', async () => {
    const m = manual({
      id: uuid(),
      nextDate: '2026-01-15',
      template: {
        accountId: 'acc1',
        amount: -75,
        currency: 'USD',
        payee: 'Gas bill',
      },
    });
    await useScheduledStore.getState().add(m);
    await useScheduledStore.getState().processDue('2026-02-01');
    expect(useScheduledStore.getState().pendingManual.map((p) => p.id)).toEqual(
      [m.id],
    );

    const tx = await useScheduledStore.getState().postManual(m.id);
    expect(tx).toBeDefined();
    expect(tx!.date).toBe('2026-01-15');
    expect(tx!.amount).toBe(-75);

    // Transaction persisted.
    expect(useTransactionStore.getState().items).toHaveLength(1);
    expect(useTransactionStore.getState().items[0].id).toBe(tx!.id);

    // Schedule advanced and dropped from pendingManual.
    expect(useScheduledStore.getState().items[0].nextDate).toBe('2026-02-15');
    expect(useScheduledStore.getState().pendingManual).toEqual([]);
  });

  it('postManual returns undefined for an unknown id', async () => {
    const tx = await useScheduledStore.getState().postManual('nope');
    expect(tx).toBeUndefined();
  });

  it('reset detaches and clears in-memory state', async () => {
    const s = auto({ nextDate: '2026-01-15' });
    await useScheduledStore.getState().add(s);
    resetStores();
    expect(useScheduledStore.getState().items).toEqual([]);
    expect(useScheduledStore.getState().repos).toBeNull();
    expect(useScheduledStore.getState().pendingManual).toEqual([]);
    // Encrypted row persists.
    expect((await repos.scheduledTransactions.get(s.id))?.id).toBe(s.id);
  });
});
