// @vitest-environment node

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { deriveKey } from './keyDerivation';
import { EncryptedTable } from './EncryptedTable';

type Item = { id: string; title: string; amount: number };

let db: Dexie;
let table: EncryptedTable<Item>;

beforeEach(async () => {
  db = new Dexie('test-' + Math.random().toString(36).slice(2));
  db.version(1).stores({ items: 'id' });
  await db.open();
  const key = await deriveKey({ mode: 'advanced', passphrase: 'p', salt: 's' });
  table = new EncryptedTable(db.table('items'), key);
});

describe('EncryptedTable', () => {
  it('round-trips add then get', async () => {
    const id = await table.add({ id: 'a', title: 'Rent', amount: 1200 });
    expect(id).toBe('a');
    const got = await table.get('a');
    expect(got).toEqual({ id: 'a', title: 'Rent', amount: 1200 });
  });

  it('stores ciphertext at rest (no plaintext field values in IndexedDB)', async () => {
    await table.add({ id: 'b', title: 'SecretPayee', amount: 42 });
    const raw = await db.table('items').get('b');
    expect(raw).toBeDefined();
    const storedKeys = Object.keys(raw as Record<string, unknown>);
    expect(storedKeys).toContain('_enc');
    expect(storedKeys).toContain('id');
    // No plaintext record value should leak. "SecretPayee" is long enough
    // that it cannot appear by chance in base64 ciphertext, so the string
    // check is a sound leak detector. The numeric amount "42", however, is
    // a short substring that random base64 ciphertext can contain by
    // coincidence (the encryption is sound — this is a false positive), so
    // verify the amount is not stored as a plaintext field value instead of
    // grepping the ciphertext string.
    const blob = JSON.stringify(raw);
    expect(blob).not.toContain('SecretPayee');
    expect((raw as Record<string, unknown>).amount).toBeUndefined();
    expect((raw as Record<string, unknown>).title).toBeUndefined();
    // id is the primary key and may be plaintext; the rest must not.
    expect(storedKeys.filter((k) => k !== '_enc' && k !== 'id')).toEqual([]);
  });

  it('toArray decrypts all rows with primary keys merged back', async () => {
    await table.add({ id: 'x', title: 'first', amount: 1 });
    await table.add({ id: 'y', title: 'second', amount: 2 });
    const all = await table.toArray();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === 'x')).toEqual({
      id: 'x',
      title: 'first',
      amount: 1,
    });
    expect(all.find((r) => r.id === 'y')).toEqual({
      id: 'y',
      title: 'second',
      amount: 2,
    });
  });

  it('put replaces an existing record', async () => {
    await table.add({ id: 'z', title: 'orig', amount: 5 });
    await table.put({ id: 'z', title: 'updated', amount: 6 });
    const got = await table.get('z');
    expect(got).toEqual({ id: 'z', title: 'updated', amount: 6 });
  });

  it('delete removes a record', async () => {
    await table.add({ id: 'd', title: 'doomed', amount: 0 });
    await table.delete('d');
    expect(await table.get('d')).toBeUndefined();
  });

  it('returns undefined for missing ids', async () => {
    expect(await table.get('nope')).toBeUndefined();
  });

  it('wrong key cannot decrypt the stored rows', async () => {
    await table.add({ id: 'k', title: 'locked', amount: 99 });
    const wrongKey = await deriveKey({
      mode: 'advanced',
      passphrase: 'wrong',
      salt: 's',
    });
    const wrongTable = new EncryptedTable(db.table('items'), wrongKey);
    await expect(wrongTable.get('k')).rejects.toThrow();
  });
});
