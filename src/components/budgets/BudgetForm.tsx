/**
 * Create/edit budget form. Fields: category (from categoryStore), month
 * ('YYYY-MM'), limit. Used in a modal overlay on the Budgets page. Calls
 * `onSubmit` with the field values; the parent decides create vs update.
 */
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/db';

export interface BudgetFormValues {
  categoryId: string;
  month: string;
  limit: number;
}

interface BudgetFormProps {
  open: boolean;
  initial?: Partial<BudgetFormValues> & { id?: string };
  categories: Category[];
  onSubmit: (values: BudgetFormValues) => Promise<void> | void;
  onCancel: () => void;
}

function currentMonth(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

export function BudgetForm({
  open,
  initial,
  categories,
  onSubmit,
  onCancel,
}: BudgetFormProps) {
  const [categoryId, setCategoryId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [limit, setLimit] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCategoryId(initial?.categoryId ?? '');
    setMonth(initial?.month ?? currentMonth());
    setLimit(String(initial?.limit ?? 0));
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const expenseCategories = categories.filter((c) => c.kind === 'expense');

  const submit = async () => {
    if (!categoryId) {
      setError('Category is required.');
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setError('Month must be in YYYY-MM form.');
      return;
    }
    const lim = Number(limit);
    if (!Number.isFinite(lim) || lim < 0) {
      setError('Limit must be a non-negative number.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ categoryId, month, limit: lim });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="budget-form-title"
      data-testid="budget-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="budget-form-title">
            {initial?.id ? 'Edit budget' : 'New budget'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Category
            </label>
            <select
              className={cn(inputCls)}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Budget category"
              data-testid="budget-category"
            >
              <option value="">Select a category…</option>
              {expenseCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Month (YYYY-MM)
            </label>
            <input
              className={inputCls}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              placeholder="2026-02"
              aria-label="Budget month"
              data-testid="budget-month"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Limit
            </label>
            <input
              type="number"
              step="any"
              min="0"
              className={inputCls}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-label="Budget limit"
              data-testid="budget-limit"
            />
          </div>
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} data-testid="budget-submit">
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
