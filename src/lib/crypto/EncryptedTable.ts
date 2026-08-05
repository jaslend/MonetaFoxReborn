/**
 * Transparent encryption wrapper over a Dexie table.
 *
 * Each row is stored as `{ <primaryKey>: <id>, _enc: <ciphertext> }` — no
 * plaintext field value is ever persisted to IndexedDB. Reads transparently
 * decrypt `_enc` and merge the primary key back into the returned object so
 * callers see the original record shape.
 */

import type Dexie from 'dexie';
import { encrypt, decrypt } from './CryptoStore';

const ENC_FIELD = '_enc';

type Row = Record<string, unknown>;

export class EncryptedTable<T extends Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly table: Dexie.Table<any, any>;
  private readonly key: CryptoKey;
  private readonly keyPath: string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(table: Dexie.Table<any, any>, key: CryptoKey) {
    this.table = table;
    this.key = key;
    const primKey = table.schema.primKey.keyPath;
    this.keyPath = typeof primKey === 'string' ? primKey : undefined;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async add(item: T): Promise<any> {
    return this.write(item, 'add');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async put(item: T): Promise<any> {
    return this.write(item, 'put');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async write(item: T, op: 'add' | 'put'): Promise<any> {
    const serialized = JSON.stringify(item);
    const ciphertext = await encrypt(this.key, serialized);

    const row: Row = { [ENC_FIELD]: ciphertext };
    if (this.keyPath !== undefined) {
      const id = (item as Record<string, unknown>)[this.keyPath];
      if (id !== undefined) {
        row[this.keyPath] = id;
      }
    }

    return this.table[op](row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(id: any): Promise<T | undefined> {
    const row = (await this.table.get(id)) as Row | undefined;
    if (row === undefined) {
      return undefined;
    }
    return this.decryptRow(row);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async delete(id: any): Promise<void> {
    return this.table.delete(id);
  }

  async toArray(): Promise<T[]> {
    const rows = (await this.table.toArray()) as Row[];
    return Promise.all(rows.map((r) => this.decryptRow(r)));
  }

  private async decryptRow(row: Row): Promise<T> {
    const ciphertext = row[ENC_FIELD];
    if (typeof ciphertext !== 'string') {
      throw new Error(
        'EncryptedTable: row is missing the _enc ciphertext field',
      );
    }
    const plaintext = await decrypt(this.key, ciphertext);
    const decoded = JSON.parse(plaintext) as Record<string, unknown>;
    if (this.keyPath !== undefined) {
      const id = row[this.keyPath];
      if (id !== undefined) {
        decoded[this.keyPath] = id;
      }
    }
    return decoded as T;
  }
}
