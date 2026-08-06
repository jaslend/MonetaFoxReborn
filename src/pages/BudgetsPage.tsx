/**
 * Budgets page — Phase 6.
 *
 * Real budgets view:
 * - A month selector (defaults to the current month).
 * - A list of budgets for that month showing category name, limit, spent,
 *   remaining, a progress bar, and an over-budget indicator.
 * - Create / edit / delete a budget (category dropdown from categoryStore,
 *   month, limit).
 *
 * Reuses the encrypted budget/category/transaction stores; spend is computed
 * via the pure `useBudgetStore.statusesForMonth` helper, which delegates to
 * `src/lib/budgets#budgetStatuses`. Amounts are shown in the base currency;
 * when no base currency is configured we fall back to the raw limit figure.
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/currency';
import type { Budget, Category } from '@/lib/db';

import { useBudgetStore } from '@/stores/budgetStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useSettingsStore } from '@/stores/settingsStore';

import {
  BudgetForm,
  type BudgetFormValues,
} from '@/components/budgets/BudgetForm';
import { ConfirmDialog } from '@/components/accounts/ConfirmDialog';

function currentMonth(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}

export function BudgetsPage() {
  const budgets = useBudgetStore((s) => s.items);
  const createBudget = useBudgetStore((s) => s.createBudget);
  const updateBudget = useBudgetStore((s) => s.update);
  const removeBudget = useBudgetStore((s) => s.remove);
  const statusesForMonth = useBudgetStore((s) => s.statusesForMonth);

  const categories = useCategoryStore((s) => s.items);
  const transactions = useTransactionStore((s) => s.items);
  const settings = useSettingsStore((s) => s.items[0]);
  const baseCurrency = settings?.baseCurrency ?? '';

  const [month, setMonth] = useState(currentMonth());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const statuses = useMemo(
    () => statusesForMonth(month, transactions),
    [statusesForMonth, month, transactions],
  );

  const monthBudgets = useMemo(
    () => budgets.filter((b) => b.month === month),
    [budgets, month],
  );

  // Lookup a budget for the form's edit target by categoryId (since statuses
  // carry categoryId but not budget id).
  const budgetByCategory = useMemo(() => {
    const map = new Map<string, Budget>();
    for (const b of monthBudgets) map.set(b.categoryId, b);
    return map;
  }, [monthBudgets]);

  const display = (amount: number): string =>
    baseCurrency ? formatCurrency(amount, baseCurrency) : String(amount);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (categoryId: string) => {
    const b = budgetByCategory.get(categoryId);
    if (!b) return;
    setEditing(b);
    setFormOpen(true);
  };

  const handleSubmit = async (values: BudgetFormValues) => {
    if (editing) {
      await updateBudget(editing.id, {
        categoryId: values.categoryId,
        month: values.month,
        limit: values.limit,
      });
    } else {
      await createBudget({
        categoryId: values.categoryId,
        month: values.month,
        limit: values.limit,
      });
    }
    setFormOpen(false);
    setEditing(null);
    setMonth(values.month);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await removeBudget(deletingId);
    setDeletingId(null);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
        <Button onClick={openCreate} data-testid="add-budget">
          Add budget
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Month</CardTitle>
          <CardDescription>
            Monthly per-category limits tracked against actuals.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            data-testid="budget-prev-month"
          >
            ‹
          </Button>
          <input
            className="border-border bg-background ring-offset-background h-9 rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Budget month"
            data-testid="budget-month-input"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            data-testid="budget-next-month"
          >
            ›
          </Button>
        </CardContent>
      </Card>

      {statuses.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              No budgets for {month} yet. Click <strong>Add budget</strong> to
              create one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {statuses.map((s) => (
            <BudgetRow
              key={s.categoryId}
              categoryId={s.categoryId}
              categoryName={categoryById.get(s.categoryId)?.name ?? '(deleted)'}
              limit={s.limit}
              spent={s.spent}
              remaining={s.remaining}
              percentUsed={s.percentUsed}
              overBudget={s.overBudget}
              display={display}
              onEdit={() => openEdit(s.categoryId)}
              onDelete={() => {
                const b = budgetByCategory.get(s.categoryId);
                if (b) setDeletingId(b.id);
              }}
            />
          ))}
        </ul>
      )}

      <BudgetForm
        open={formOpen}
        categories={categories}
        initial={
          editing
            ? {
                id: editing.id,
                categoryId: editing.categoryId,
                month: editing.month,
                limit: editing.limit,
              }
            : { month }
        }
        onSubmit={handleSubmit}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete budget?"
        description="This removes the budget for the month."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

interface BudgetRowProps {
  categoryId: string;
  categoryName: string;
  limit: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  overBudget: boolean;
  display: (amount: number) => string;
  onEdit: () => void;
  onDelete: () => void;
}

function BudgetRow({
  categoryId,
  categoryName,
  limit,
  spent,
  remaining,
  percentUsed,
  overBudget,
  display,
  onEdit,
  onDelete,
}: BudgetRowProps) {
  const pct = Math.max(0, Math.min(100, percentUsed));
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span
              className="font-medium"
              data-testid={`budget-name-${categoryId}`}
            >
              {categoryName}
            </span>
            {overBudget ? (
              <span
                className="text-destructive text-xs font-semibold"
                data-testid={`budget-over-${categoryId}`}
              >
                Over budget
              </span>
            ) : null}
          </div>
          <div
            className="bg-secondary h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={Math.round(percentUsed)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full rounded-full transition-all',
                overBudget ? 'bg-destructive' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
              data-testid={`budget-bar-${categoryId}`}
            />
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Spent{' '}
              <strong data-testid={`budget-spent-${categoryId}`}>
                {display(spent)}
              </strong>
            </span>
            <span>
              Limit{' '}
              <strong data-testid={`budget-limit-${categoryId}`}>
                {display(limit)}
              </strong>
            </span>
            <span>
              Remaining{' '}
              <strong data-testid={`budget-remaining-${categoryId}`}>
                {display(remaining)}
              </strong>
            </span>
            <span>{Math.round(percentUsed)}%</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              data-testid={`budget-delete-${categoryId}`}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
