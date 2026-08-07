/**
 * Create/edit scheduled-transaction form (Phase 8). Fields: account, amount
 * with income/expense direction, payee, category, recurrence freq + interval,
 * start/next date, auto|manual mode. Used in a modal overlay on the Scheduled
 * page. Calls `onSubmit` with the field values; the parent decides create vs
 * update.
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
import type { Account, Category, Recurrence } from '@/lib/db';

export interface ScheduledFormValues {
  accountId: string;
  amount: number;
  currency: string;
  payee: string;
  categoryId?: string;
  notes?: string;
  recurrence: Recurrence;
  nextDate: string;
  mode: 'auto' | 'manual';
  direction: 'income' | 'expense';
}

interface ScheduledFormProps {
  open: boolean;
  initial?: Partial<ScheduledFormValues> & { id?: string };
  accounts: Account[];
  categories: Category[];
  /** Default currency for new schedules (the base currency, when set). */
  defaultCurrency: string;
  onSubmit: (values: ScheduledFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const FREQS: { value: Recurrence['freq']; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ScheduledForm({
  open,
  initial,
  accounts,
  categories,
  defaultCurrency,
  onSubmit,
  onCancel,
}: ScheduledFormProps) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('0');
  const [direction, setDirection] = useState<'income' | 'expense'>('expense');
  const [payee, setPayee] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [freq, setFreq] = useState<Recurrence['freq']>('monthly');
  const [interval, setInterval] = useState('1');
  const [nextDate, setNextDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId(initial?.accountId ?? '');
    setAmount(String(Math.abs(initial?.amount ?? 0)));
    setDirection(
      initial?.direction ??
        (initial?.amount !== undefined && initial.amount >= 0
          ? 'income'
          : 'expense'),
    );
    setPayee(initial?.payee ?? '');
    setCategoryId(initial?.categoryId ?? '');
    setNotes(initial?.notes ?? '');
    setFreq(initial?.recurrence?.freq ?? 'monthly');
    setInterval(String(initial?.recurrence?.interval ?? 1));
    setNextDate(initial?.nextDate ?? todayIso());
    setEndDate(initial?.recurrence?.endDate ?? '');
    setMode(initial?.mode ?? 'auto');
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const expenseCategories = categories.filter((c) => c.kind === 'expense');
  const incomeCategories = categories.filter((c) => c.kind === 'income');

  const submit = async () => {
    if (!accountId) {
      setError('Account is required.');
      return;
    }
    if (!payee.trim()) {
      setError('Payee is required.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) {
      setError('Amount must be a non-negative number.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      setError('Next date must be in YYYY-MM-DD form.');
      return;
    }
    const iv = Number(interval);
    if (!Number.isFinite(iv) || iv < 1 || !Number.isInteger(iv)) {
      setError('Interval must be a positive whole number.');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      setError('End date must be in YYYY-MM-DD form.');
      return;
    }
    const acc = accounts.find((a) => a.id === accountId);
    const currency = acc?.currency ?? defaultCurrency ?? '';
    if (!currency) {
      setError('Account has no currency and no default currency is set.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const recurrence: Recurrence = { freq, interval: iv };
      if (endDate) recurrence.endDate = endDate;
      await onSubmit({
        accountId,
        amount: direction === 'income' ? amt : -amt,
        currency,
        payee: payee.trim(),
        categoryId: categoryId || undefined,
        notes: notes.trim() || undefined,
        recurrence,
        nextDate,
        mode,
        direction,
      });
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
      aria-labelledby="scheduled-form-title"
      data-testid="scheduled-form-dialog"
    >
      <Card className="max-h-[90vh] w-full max-w-lg overflow-auto">
        <CardHeader>
          <CardTitle id="scheduled-form-title">
            {initial?.id ? 'Edit schedule' : 'New schedule'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Account
            </label>
            <select
              className={cn(inputCls)}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Schedule account"
              data-testid="scheduled-account"
            >
              <option value="">Select an account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Payee
            </label>
            <input
              className={inputCls}
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. Landlord"
              aria-label="Schedule payee"
              data-testid="scheduled-payee"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Direction
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === 'expense' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDirection('expense')}
                data-testid="scheduled-direction-expense"
              >
                Expense
              </Button>
              <Button
                type="button"
                variant={direction === 'income' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDirection('income')}
                data-testid="scheduled-direction-income"
              >
                Income
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Amount
            </label>
            <input
              type="number"
              step="any"
              min="0"
              className={inputCls}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-label="Schedule amount"
              data-testid="scheduled-amount"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Category
            </label>
            <select
              className={cn(inputCls)}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Schedule category"
              data-testid="scheduled-category"
            >
              <option value="">None</option>
              {(direction === 'income'
                ? incomeCategories
                : expenseCategories
              ).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Notes
            </label>
            <input
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              aria-label="Schedule notes"
              data-testid="scheduled-notes"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Frequency
              </label>
              <select
                className={cn(inputCls)}
                value={freq}
                onChange={(e) => setFreq(e.target.value as Recurrence['freq'])}
                aria-label="Schedule frequency"
                data-testid="scheduled-freq"
              >
                {FREQS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Every
              </label>
              <input
                type="number"
                min="1"
                step="1"
                className={inputCls}
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                aria-label="Schedule interval"
                data-testid="scheduled-interval"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Next date (YYYY-MM-DD)
            </label>
            <input
              className={inputCls}
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              placeholder="2026-02-01"
              aria-label="Schedule next date"
              data-testid="scheduled-next-date"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              End date (optional, inclusive)
            </label>
            <input
              className={inputCls}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="YYYY-MM-DD"
              aria-label="Schedule end date"
              data-testid="scheduled-end-date"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Mode
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'auto' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('auto')}
                data-testid="scheduled-mode-auto"
              >
                Auto-post
              </Button>
              <Button
                type="button"
                variant={mode === 'manual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('manual')}
                data-testid="scheduled-mode-manual"
              >
                Manual
              </Button>
            </div>
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
          <Button
            onClick={submit}
            disabled={busy}
            data-testid="scheduled-submit"
          >
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
