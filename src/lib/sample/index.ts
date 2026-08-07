/**
 * Phase 12 — loadable sample / demo dataset.
 *
 * `buildSampleData()` returns a well-formed, internally consistent
 * `BackupData` (the same shape Phase 7b's encrypted export / Phase 11's cloud
 * sync use) describing a couple of months of realistic household finances:
 * two bank accounts + an investment account holding BTC, a handful of
 * categories, ~15 transactions (income + expenses, including one split), a
 * budget or two, a scheduled rent payment, and a BTC price point.
 *
 * Conventions (pinned by the Phase 12 contract test):
 * - DETERMINISTIC. Every id is a fixed string (no `crypto.randomUUID()`, no
 *   `Date.now()`), so two calls return byte-identical data. Dates are fixed
 *   ISO strings in Jan–Feb 2026.
 * - 'sample'-marked. Every sample id carries the literal `sample` so a
 *   "clear sample data" action can target these records without ever touching
 *   a user's real data. Real records never contain that marker (they are
 *   random UUIDs from `crypto.randomUUID()`).
 * - Referentially consistent. Every `transaction.accountId` /
 *   `categoryId` (and split `categoryId`) references an existing entity, and
 *   the split sums to its parent amount. Both income (+) and expense (-) are
 *   present so the reports look alive.
 *
 * `loadSampleData(repositories)` writes the sample entities through the
 *   encrypted repositories (using `put`, so re-loading is idempotent), and
 *   `clearSampleData(repositories)` removes ONLY the 'sample'-marked records
 *   (it reads every table, filters ids containing 'sample', and deletes
 *   those rows). Both leave the caller to refresh the domain stores.
 */
import type {
  Account,
  Asset,
  Budget,
  Category,
  Holding,
  PricePoint,
  Repositories,
  ScheduledTransaction,
  Transaction,
} from '@/lib/db';
import { BACKUP_VERSION, type BackupData } from '@/lib/export';

/** Every sample id carries this marker so it can be separated from real data. */
export const SAMPLE_MARKER = 'sample';

// ---------------------------------------------------------------------------
// ids — fixed strings so the dataset is deterministic across calls.
// ---------------------------------------------------------------------------

const ID = {
  // accounts
  checking: 'acc-sample-checking',
  savings: 'acc-sample-savings',
  broker: 'acc-sample-broker',
  // categories
  salary: 'cat-sample-salary',
  groceries: 'cat-sample-groceries',
  rent: 'cat-sample-rent',
  utilities: 'cat-sample-utilities',
  dining: 'cat-sample-dining',
  transport: 'cat-sample-transport',
  shopping: 'cat-sample-shopping',
  // transactions (txn-sample-<seq>)
  // budgets
  budgetGroceries: 'bud-sample-groceries',
  budgetDining: 'bud-sample-dining',
  // scheduled
  scheduledRent: 'sch-sample-rent',
  // investments
  btc: 'asset-sample-btc',
  btcHolding: 'hld-sample-btc',
  btcPrice: 'price-sample-btc-1',
} as const;

// ---------------------------------------------------------------------------
// buildSampleData — pure, deterministic.
// ---------------------------------------------------------------------------

const ACCOUNTS: Account[] = [
  {
    id: ID.checking,
    name: 'Everyday Checking',
    type: 'checking',
    currency: 'GBP',
    openingBalance: 1200,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: ID.savings,
    name: 'Rainy Day Savings',
    type: 'savings',
    currency: 'GBP',
    openingBalance: 8000,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: ID.broker,
    name: 'Brokerage',
    type: 'investment',
    currency: 'GBP',
    openingBalance: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const CATEGORIES: Category[] = [
  { id: ID.salary, name: 'Salary', kind: 'income' },
  { id: ID.groceries, name: 'Groceries', kind: 'expense' },
  { id: ID.rent, name: 'Rent', kind: 'expense' },
  { id: ID.utilities, name: 'Utilities', kind: 'expense' },
  { id: ID.dining, name: 'Dining Out', kind: 'expense' },
  { id: ID.transport, name: 'Transport', kind: 'expense' },
  { id: ID.shopping, name: 'Shopping', kind: 'expense' },
];

/**
 * Transactions spanning Jan–Feb 2026. Income is POSITIVE, expenses NEGATIVE
 * (the signed convention pinned by the Phase 5a contract). One transaction
 * (`txn-sample-07`) is a split: a 100.00 grocery shop split into Groceries
 * 60.00 + Dining Out 40.00 — the split legs carry the SAME (negative) sign as
 * the parent and sum exactly to the parent amount.
 */
const TRANSACTIONS: Transaction[] = [
  // January income
  {
    id: 'txn-sample-01',
    accountId: ID.checking,
    date: '2026-01-03',
    amount: 2400.0,
    currency: 'GBP',
    payee: 'Acme Payroll',
    categoryId: ID.salary,
    type: 'income',
    cleared: true,
    reconciled: true,
  },
  // January expenses
  {
    id: 'txn-sample-02',
    accountId: ID.checking,
    date: '2026-01-05',
    amount: -950.0,
    currency: 'GBP',
    payee: 'Maple Lettings',
    categoryId: ID.rent,
    type: 'expense',
    cleared: true,
  },
  {
    id: 'txn-sample-03',
    accountId: ID.checking,
    date: '2026-01-08',
    amount: -64.2,
    currency: 'GBP',
    payee: "Sainsbury's",
    categoryId: ID.groceries,
    type: 'expense',
    tags: ['weekly'],
  },
  {
    id: 'txn-sample-04',
    accountId: ID.checking,
    date: '2026-01-10',
    amount: -42.5,
    currency: 'GBP',
    payee: 'TfL',
    categoryId: ID.transport,
    type: 'expense',
  },
  {
    id: 'txn-sample-05',
    accountId: ID.checking,
    date: '2026-01-14',
    amount: -78.3,
    currency: 'GBP',
    payee: 'British Gas',
    categoryId: ID.utilities,
    type: 'expense',
    cleared: true,
  },
  // Split: 100.00 shop across Groceries (60) + Dining Out (40).
  {
    id: 'txn-sample-07',
    accountId: ID.checking,
    date: '2026-01-20',
    amount: -100.0,
    currency: 'GBP',
    payee: 'Whole Foods',
    type: 'expense',
    splits: [
      { categoryId: ID.groceries, amount: -60.0, notes: 'Pantry staples' },
      { categoryId: ID.dining, amount: -40.0, notes: 'Hot counter' },
    ],
  },
  {
    id: 'txn-sample-08',
    accountId: ID.savings,
    date: '2026-01-25',
    amount: -500.0,
    currency: 'GBP',
    payee: 'Transfer to Savings',
    type: 'transfer',
  },
  // February income
  {
    id: 'txn-sample-09',
    accountId: ID.checking,
    date: '2026-02-03',
    amount: 2400.0,
    currency: 'GBP',
    payee: 'Acme Payroll',
    categoryId: ID.salary,
    type: 'income',
    cleared: true,
  },
  // February expenses
  {
    id: 'txn-sample-10',
    accountId: ID.checking,
    date: '2026-02-05',
    amount: -950.0,
    currency: 'GBP',
    payee: 'Maple Lettings',
    categoryId: ID.rent,
    type: 'expense',
    cleared: true,
  },
  {
    id: 'txn-sample-11',
    accountId: ID.checking,
    date: '2026-02-09',
    amount: -52.15,
    currency: 'GBP',
    payee: "Sainsbury's",
    categoryId: ID.groceries,
    type: 'expense',
  },
  {
    id: 'txn-sample-12',
    accountId: ID.checking,
    date: '2026-02-12',
    amount: -120.0,
    currency: 'GBP',
    payee: 'Argos',
    categoryId: ID.shopping,
    type: 'expense',
  },
  {
    id: 'txn-sample-13',
    accountId: ID.checking,
    date: '2026-02-16',
    amount: -36.9,
    currency: 'GBP',
    payee: 'Uber',
    categoryId: ID.transport,
    type: 'expense',
    tags: ['ride'],
  },
  {
    id: 'txn-sample-14',
    accountId: ID.checking,
    date: '2026-02-22',
    amount: -88.4,
    currency: 'GBP',
    payee: 'Octopus Energy',
    categoryId: ID.utilities,
    type: 'expense',
  },
];

const BUDGETS: Budget[] = [
  {
    id: ID.budgetGroceries,
    categoryId: ID.groceries,
    month: '2026-01',
    limit: 400,
  },
  { id: ID.budgetDining, categoryId: ID.dining, month: '2026-01', limit: 150 },
];

/** A monthly manual rent schedule due on the 5th — the dashboard's "upcoming bill". */
const SCHEDULED: ScheduledTransaction[] = [
  {
    id: ID.scheduledRent,
    recurrence: { freq: 'monthly' },
    nextDate: '2026-03-05',
    mode: 'manual',
    template: {
      accountId: ID.checking,
      amount: -950.0,
      currency: 'GBP',
      payee: 'Maple Lettings',
      categoryId: ID.rent,
      type: 'expense',
    },
  },
];

const ASSETS: Asset[] = [
  { id: ID.btc, symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
];

const HOLDINGS: Holding[] = [
  { id: ID.btcHolding, accountId: ID.broker, assetId: ID.btc, units: 0.25 },
];

const PRICES: PricePoint[] = [
  { id: ID.btcPrice, assetId: ID.btc, date: '2026-01-15', price: 42000 },
];

/**
 * Build the deterministic sample dataset. Pure (no I/O, no randomness, no
 * clock) — safe to call in a contract test. Returns a `BackupData` so it can
 * be written with the same `applyBackupData`-style loop the sync layer uses.
 */
export function buildSampleData(): BackupData {
  return {
    version: BACKUP_VERSION,
    accounts: ACCOUNTS.map((a) => ({ ...a })),
    transactions: TRANSACTIONS.map((t) => ({ ...t })),
    categories: CATEGORIES.map((c) => ({ ...c })),
    budgets: BUDGETS.map((b) => ({ ...b })),
    // Extra entity types ride along via the BackupData index signature; the
    // loaders below write them through their own repositories.
    scheduledTransactions: SCHEDULED.map((s) => ({ ...s })),
    assets: ASSETS.map((a) => ({ ...a })),
    holdings: HOLDINGS.map((h) => ({ ...h })),
    prices: PRICES.map((p) => ({ ...p })),
  };
}

// ---------------------------------------------------------------------------
// loadSampleData — write every sample entity through the repositories.
// ---------------------------------------------------------------------------

/** True if `id` is a sample-record id (carries the 'sample' marker). */
export function isSampleId(id: string): boolean {
  return typeof id === 'string' && id.includes(SAMPLE_MARKER);
}

/**
 * Write every sample entity through the encrypted repositories. Uses `put`
 * (upsert) so re-loading is idempotent — it will not duplicate rows on a
 * second call. Does NOT refresh the domain stores; the caller does that
 * (e.g. SettingsPage calls the relevant `store.load()` actions afterwards).
 */
export async function loadSampleData(repos: Repositories): Promise<void> {
  const data = buildSampleData();
  const writes: Promise<unknown>[] = [];
  for (const a of data.accounts) writes.push(repos.accounts.put(a));
  for (const t of data.transactions) writes.push(repos.transactions.put(t));
  for (const c of data.categories)
    writes.push(repos.categories.put(c as never));
  for (const b of data.budgets) writes.push(repos.budgets.put(b as never));
  for (const s of data.scheduledTransactions as ScheduledTransaction[])
    writes.push(repos.scheduledTransactions.put(s));
  for (const a of data.assets as Asset[]) writes.push(repos.assets.put(a));
  for (const h of data.holdings as Holding[])
    writes.push(repos.holdings.put(h));
  for (const p of data.prices as PricePoint[]) writes.push(repos.prices.put(p));
  await Promise.all(writes);
}

// ---------------------------------------------------------------------------
// clearSampleData — remove ONLY the 'sample'-marked records from every table.
// ---------------------------------------------------------------------------

/**
 * Remove every record whose id carries the 'sample' marker, across ALL
 * entity tables — accounts, transactions, categories, budgets, scheduled
 * transactions, assets, holdings, and prices. Real (non-sample) records are
 * left untouched. Does NOT refresh the domain stores; the caller does that.
 */
export async function clearSampleData(repos: Repositories): Promise<void> {
  const deletes: Promise<unknown>[] = [];

  const accounts = await repos.accounts.toArray();
  for (const a of accounts)
    if (isSampleId(a.id)) deletes.push(repos.accounts.delete(a.id));

  const transactions = await repos.transactions.toArray();
  for (const t of transactions)
    if (isSampleId(t.id)) deletes.push(repos.transactions.delete(t.id));

  const categories = await repos.categories.toArray();
  for (const c of categories)
    if (isSampleId(c.id)) deletes.push(repos.categories.delete(c.id));

  const budgets = await repos.budgets.toArray();
  for (const b of budgets)
    if (isSampleId(b.id)) deletes.push(repos.budgets.delete(b.id));

  const scheduled = await repos.scheduledTransactions.toArray();
  for (const s of scheduled)
    if (isSampleId(s.id))
      deletes.push(repos.scheduledTransactions.delete(s.id));

  const assets = await repos.assets.toArray();
  for (const a of assets)
    if (isSampleId(a.id)) deletes.push(repos.assets.delete(a.id));

  const holdings = await repos.holdings.toArray();
  for (const h of holdings)
    if (isSampleId(h.id)) deletes.push(repos.holdings.delete(h.id));

  const prices = await repos.prices.toArray();
  for (const p of prices)
    if (isSampleId(p.id)) deletes.push(repos.prices.delete(p.id));

  await Promise.all(deletes);
}
