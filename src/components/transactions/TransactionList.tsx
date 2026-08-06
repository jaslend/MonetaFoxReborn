/**
 * Transactions list — Phase 5a.
 *
 * A compact table (date, payee, category, amount, status) with inline
 * Cleared / Reconciled toggles and a delete control. Most-recent first.
 * Amounts are formatted in the transaction's OWN currency via `formatCurrency`
 * and coloured by sign (inflow +, outflow −). Split transactions show a small
 * badge and the parent amount only — splits are never added to the balance.
 */
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Account, Category, Transaction } from '@/lib/db';
import { formatCurrency } from '@/lib/currency';

interface TransactionListProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onToggleCleared: (tx: Transaction) => void;
  onToggleReconciled: (tx: Transaction) => void;
}

function categoryName(categories: Category[], id?: string): string {
  if (!id) return '—';
  return categories.find((c) => c.id === id)?.name ?? '—';
}

function accountCurrency(accounts: Account[], tx: Transaction): string {
  return accounts.find((a) => a.id === tx.accountId)?.currency ?? tx.currency;
}

export function TransactionList({
  transactions,
  accounts,
  categories,
  onEdit,
  onDelete,
  onToggleCleared,
  onToggleReconciled,
}: TransactionListProps) {
  // Most-recent first: descending by date, then by id for a stable order.
  const sorted = [...transactions].sort((a, b) => {
    if (a.date < b.date) return 1;
    if (a.date > b.date) return -1;
    return a.id < b.id ? 1 : -1;
  });

  if (sorted.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="empty-transactions"
      >
        No transactions yet. Click <strong>Add transaction</strong> to create
        one.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="transaction-list">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            <th className="px-2 py-2 font-medium">Date</th>
            <th className="px-2 py-2 font-medium">Payee</th>
            <th className="px-2 py-2 font-medium">Category</th>
            <th className="px-2 py-2 text-right font-medium">Amount</th>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tx) => {
            const currency = accountCurrency(accounts, tx);
            const inflow = tx.amount >= 0;
            return (
              <tr
                key={tx.id}
                className="border-b last:border-0"
                data-testid={`transaction-row-${tx.id}`}
              >
                <td className="px-2 py-2 whitespace-nowrap">{tx.date}</td>
                <td className="px-2 py-2">
                  <div className="flex flex-col">
                    <span>{tx.payee || '—'}</span>
                    {tx.tags && tx.tags.length > 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {tx.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-col">
                    <span>{categoryName(categories, tx.categoryId)}</span>
                    {tx.splits && tx.splits.length > 0 ? (
                      <span
                        className="text-muted-foreground text-xs"
                        data-testid={`tx-splits-${tx.id}`}
                      >
                        split: {tx.splits.length} lines
                      </span>
                    ) : null}
                  </div>
                </td>
                <td
                  className={cn(
                    'px-2 py-2 text-right font-medium whitespace-nowrap',
                    inflow ? 'text-emerald-600 dark:text-emerald-400' : '',
                  )}
                  data-testid={`tx-amount-${tx.id}`}
                >
                  {formatCurrency(tx.amount, currency)}
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-6 items-center rounded border px-2 text-xs',
                        tx.cleared
                          ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                          : 'border-border text-muted-foreground',
                      )}
                      onClick={() => onToggleCleared(tx)}
                      aria-pressed={!!tx.cleared}
                      aria-label="Toggle cleared"
                      data-testid={`tx-cleared-${tx.id}`}
                    >
                      {tx.cleared ? 'Cleared' : '—'}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-6 items-center rounded border px-2 text-xs',
                        tx.reconciled
                          ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                          : 'border-border text-muted-foreground',
                      )}
                      onClick={() => onToggleReconciled(tx)}
                      aria-pressed={!!tx.reconciled}
                      aria-label="Toggle reconciled"
                      data-testid={`tx-reconciled-${tx.id}`}
                    >
                      {tx.reconciled ? 'Reconciled' : '—'}
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(tx)}
                    data-testid={`tx-edit-${tx.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => onDelete(tx)}
                    data-testid={`tx-delete-${tx.id}`}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
