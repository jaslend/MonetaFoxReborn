/**
 * Phase 7a — import service.
 *
 * `importTransactions` is the single persistence seam: it turns a list of
 * `ParsedTransaction`s into stored `Transaction` rows against a target account,
 * creating the account (for a `new` target) and auto-creating any referenced
 * categories (when `autoCreateCategories`) as needed, then deduping against the
 * target account's existing transactions so a re-import is idempotent.
 *
 * Reuses the existing encrypted `Repositories` (Phase 3a) and the pure
 * `dedupeParsed` helper. No direct DB access, no new deps.
 */
import type {
  Account,
  AccountType,
  Category,
  Repositories,
  Transaction,
} from '@/lib/db';

import type { ParsedTransaction } from './types';
import { dedupeParsed } from './dedupe';

/** Where the parsed rows should land. */
export type ImportTarget =
  | { mode: 'new'; name: string; type: AccountType; currency: string }
  | { mode: 'existing'; accountId: string };

export interface ImportOptions {
  parsed: ParsedTransaction[];
  target: ImportTarget;
  /** When true, categories referenced by name that do not exist are created. */
  autoCreateCategories?: boolean;
}

export interface ImportResult {
  accountId: string;
  created: number;
  skipped: number;
  accountsCreated: number;
  categoriesCreated: number;
}

/**
 * Import `parsed` transactions into a target account.
 *
 * - For a `new` target: creates the account (id from `crypto.randomUUID()`)
 *   with the given name/type/currency and a 0 opening balance.
 * - Resolves each parsed `category` NAME to an existing category by
 *   case-insensitive name; when `autoCreateCategories` is set, missing ones are
 *   created (kind inferred from the first referencing transaction's sign:
 *   positive → income, negative → expense).
 * - Dedupes the parsed rows against the target account's existing transactions
 *   (same date + amount + payee) via `dedupeParsed` and inserts only the new
 *   ones, each as a `Transaction` with `accountId` set, `currency` = the
 *   account currency, and no splits.
 *
 * Returns counts: `created` (inserted), `skipped` (duplicates),
 * `accountsCreated` (0 or 1), `categoriesCreated`.
 */
export async function importTransactions(
  repositories: Repositories,
  options: ImportOptions,
): Promise<ImportResult> {
  const { parsed } = options;

  // --- 1. Resolve / create the target account. ---
  let accountId: string;
  let currency: string;
  let accountsCreated = 0;

  if (options.target.mode === 'new') {
    accountId = crypto.randomUUID();
    currency = options.target.currency;
    accountsCreated = 1;
    const account: Account = {
      id: accountId,
      name: options.target.name,
      type: options.target.type,
      currency,
      openingBalance: 0,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    await repositories.accounts.add(account);
  } else {
    accountId = options.target.accountId;
    const existingAccount = await repositories.accounts.get(accountId);
    if (!existingAccount) {
      throw new Error(`import target account ${accountId} not found`);
    }
    currency = existingAccount.currency;
  }

  // --- 2. Resolve category names → ids (creating as needed). ---
  const existingCategories = await repositories.categories.toArray();
  const nameToId = new Map<string, string>();
  for (const c of existingCategories) {
    const key = c.name.toLowerCase();
    if (!nameToId.has(key)) nameToId.set(key, c.id);
  }
  let categoriesCreated = 0;

  const resolveCategory = async (
    name: string,
    amount: number,
  ): Promise<string | undefined> => {
    const key = name.toLowerCase();
    const existing = nameToId.get(key);
    if (existing) return existing;
    if (!options.autoCreateCategories) return undefined;
    const id = crypto.randomUUID();
    const kind: Category['kind'] = amount >= 0 ? 'income' : 'expense';
    await repositories.categories.add({ id, name, kind });
    nameToId.set(key, id);
    categoriesCreated += 1;
    return id;
  };

  // --- 3. Dedupe against existing transactions on this account. ---
  const allTransactions = await repositories.transactions.toArray();
  const existingForAccount = allTransactions
    .filter((t) => t.accountId === accountId)
    .map((t) => ({ date: t.date, amount: t.amount, payee: t.payee }));
  const { toCreate, duplicates } = dedupeParsed(parsed, existingForAccount);

  // --- 4. Insert the new transactions. ---
  for (const p of toCreate) {
    const categoryId = p.category
      ? await resolveCategory(p.category, p.amount)
      : undefined;
    const tx: Transaction = {
      id: crypto.randomUUID(),
      accountId,
      date: p.date,
      amount: p.amount,
      currency,
      payee: p.payee ?? '',
      categoryId,
      notes: p.memo,
      cleared: p.cleared,
    };
    await repositories.transactions.add(tx);
  }

  return {
    accountId,
    created: toCreate.length,
    skipped: duplicates.length,
    accountsCreated,
    categoriesCreated,
  };
}
