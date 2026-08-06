/**
 * Transaction filter bar + search box — Phase 5b.
 *
 * Drives the `filter` / `search` state on the transaction store; the visible
 * list is derived elsewhere via `selectFilteredTransactions`. Every field is
 * optional and maps 1:1 onto `TransactionFilter`:
 *
 * - date range (`dateFrom` / `dateTo`) — inclusive ISO dates;
 * - account (exact `accountId`);
 * - category (matches `tx.categoryId` OR any split's `categoryId`);
 * - payee (case-insensitive substring);
 * - cleared / reconciled (Any / Yes / No — "Any" leaves the field unset so it
 *   does not constrain the list);
 * - a free-text search box (payee / notes / tags).
 *
 * "Clear" resets both filter and search.
 */
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Account, Category } from '@/lib/db';
import { useTransactionStore } from '@/stores/transactionStore';

interface TransactionFiltersProps {
  accounts: Account[];
  categories: Category[];
}

const inputCls =
  'border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2';

type TriState = '' | 'true' | 'false';

function toTriState(value: boolean | undefined): TriState {
  if (value === undefined) return '';
  return value ? 'true' : 'false';
}

function fromTriState(value: TriState): boolean | undefined {
  if (value === '') return undefined;
  return value === 'true';
}

export function TransactionFilters({
  accounts,
  categories,
}: TransactionFiltersProps) {
  const filter = useTransactionStore((s) => s.filter);
  const search = useTransactionStore((s) => s.search);
  const setFilter = useTransactionStore((s) => s.setFilter);
  const setSearch = useTransactionStore((s) => s.setSearch);
  const clearFilter = useTransactionStore((s) => s.clearFilter);

  const hasFilter =
    search.trim() !== '' ||
    Object.values(filter).some((v) =>
      Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '',
    );

  return (
    <div
      className="flex flex-col gap-3"
      data-testid="transaction-filters"
      aria-label="Transaction filters"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className={cn(inputCls, 'min-w-[12rem] flex-1')}
          placeholder="Search payee, notes, tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search transactions"
          data-testid="tx-search"
        />
        {hasFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilter}
            data-testid="tx-clear-filters"
          >
            Clear
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            From
          </label>
          <input
            type="date"
            className={inputCls}
            value={filter.dateFrom ?? ''}
            onChange={(e) =>
              setFilter({ dateFrom: e.target.value || undefined })
            }
            aria-label="Date from"
            data-testid="tx-filter-date-from"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            To
          </label>
          <input
            type="date"
            className={inputCls}
            value={filter.dateTo ?? ''}
            onChange={(e) => setFilter({ dateTo: e.target.value || undefined })}
            aria-label="Date to"
            data-testid="tx-filter-date-to"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Account
          </label>
          <select
            className={cn(inputCls)}
            value={filter.accountId ?? ''}
            onChange={(e) =>
              setFilter({ accountId: e.target.value || undefined })
            }
            aria-label="Filter by account"
            data-testid="tx-filter-account"
          >
            <option value="">(all accounts)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Category
          </label>
          <select
            className={cn(inputCls)}
            value={filter.categoryId ?? ''}
            onChange={(e) =>
              setFilter({ categoryId: e.target.value || undefined })
            }
            aria-label="Filter by category"
            data-testid="tx-filter-category"
          >
            <option value="">(all categories)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Payee
          </label>
          <input
            className={inputCls}
            value={filter.payee ?? ''}
            onChange={(e) => setFilter({ payee: e.target.value || undefined })}
            placeholder="substring"
            aria-label="Filter by payee"
            data-testid="tx-filter-payee"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs font-medium">
            Cleared
          </label>
          <select
            className={cn(inputCls)}
            value={toTriState(filter.cleared)}
            onChange={(e) =>
              setFilter({ cleared: fromTriState(e.target.value as TriState) })
            }
            aria-label="Filter by cleared status"
            data-testid="tx-filter-cleared"
          >
            <option value="">(any)</option>
            <option value="true">Cleared</option>
            <option value="false">Not cleared</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-muted-foreground text-xs font-medium">
          Reconciled
        </label>
        <select
          className={cn(inputCls, 'max-w-[10rem]')}
          value={toTriState(filter.reconciled)}
          onChange={(e) =>
            setFilter({ reconciled: fromTriState(e.target.value as TriState) })
          }
          aria-label="Filter by reconciled status"
          data-testid="tx-filter-reconciled"
        >
          <option value="">(any)</option>
          <option value="true">Reconciled</option>
          <option value="false">Not reconciled</option>
        </select>
      </div>
    </div>
  );
}
