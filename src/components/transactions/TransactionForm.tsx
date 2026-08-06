/**
 * Transaction entry/edit form — Phase 5a.
 *
 * Fields: account (from accountStore), date, payee, amount with an
 * income/expense direction control (which produces the correct SIGN on
 * `Transaction.amount`), category (from categoryStore), notes, tags
 * (comma-separated), and a split editor.
 *
 * Sign convention (pinned by the contract): `Transaction.amount` is SIGNED
 * (inflow +, outflow −). The form keeps the amount as a MAGNITUDE and a
 * `direction` toggle; on submit it composes the signed `amount` and signs each
 * split the same way so that `splitSum(splits) === amount`. The store rejects
 * any transaction whose splits are unbalanced.
 */
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Account, Category, Transaction } from '@/lib/db';

import { SplitEditor, type SplitLine } from './SplitEditor';

export interface TransactionFormValues {
  id?: string;
  accountId: string;
  date: string;
  /** SIGNED amount: positive = income, negative = expense. */
  amount: number;
  currency: string;
  payee: string;
  categoryId?: string;
  notes?: string;
  tags?: string[];
  splits?: Transaction['splits'];
  type?: Transaction['type'];
  cleared?: boolean;
  reconciled?: boolean;
}

interface TransactionFormProps {
  open: boolean;
  accounts: Account[];
  categories: Category[];
  /** Existing transaction to edit, or undefined for create. */
  initial?: Transaction;
  /**
   * A partially-filled transaction to seed CREATE mode (Phase 5b template
   * quick-entry). Used only when `initial` is unset; the form stays in create
   * mode (no `id`), so submit adds a new transaction. Ignored once the user
   * starts editing.
   */
  prefill?: Transaction;
  onSubmit: (values: TransactionFormValues) => Promise<void> | void;
  onCancel: () => void;
}

type Direction = 'expense' | 'income';

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Convert a stored (signed) transaction into the form's magnitude/direction. */
function fromTransaction(tx: Transaction): {
  accountId: string;
  date: string;
  payee: string;
  direction: Direction;
  amount: string;
  categoryId: string;
  notes: string;
  tags: string;
  splits: SplitLine[];
} {
  const direction: Direction = tx.amount >= 0 ? 'income' : 'expense';
  const magnitude = String(Math.abs(tx.amount));
  const splits: SplitLine[] = (tx.splits ?? []).map((s) => ({
    categoryId: s.categoryId ?? '',
    amount: String(Math.abs(s.amount)),
    notes: s.notes ?? '',
  }));
  return {
    accountId: tx.accountId,
    date: tx.date,
    payee: tx.payee,
    direction,
    amount: magnitude,
    categoryId: tx.categoryId ?? '',
    notes: tx.notes ?? '',
    tags: (tx.tags ?? []).join(', '),
    splits,
  };
}

export function TransactionForm({
  open,
  accounts,
  categories,
  initial,
  prefill,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const firstAccount = accounts[0]?.id ?? '';
  const firstAccountCurrency = accounts[0]?.currency ?? '';

  const [accountId, setAccountId] = useState(firstAccount);
  const [date, setDate] = useState(todayISO());
  const [payee, setPayee] = useState('');
  const [direction, setDirection] = useState<Direction>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [splits, setSplits] = useState<SplitLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed fields whenever the dialog opens (or the target transaction changes).
  useEffect(() => {
    if (!open) return;
    if (initial) {
      const v = fromTransaction(initial);
      setAccountId(v.accountId);
      setDate(v.date);
      setPayee(v.payee);
      setDirection(v.direction);
      setAmount(v.amount);
      setCategoryId(v.categoryId);
      setNotes(v.notes);
      setTags(v.tags);
      setSplits(v.splits);
    } else if (prefill) {
      // Template quick-entry: seed from the prefilled transaction but stay in
      // create mode (no id) so submit adds a new row.
      const v = fromTransaction(prefill);
      setAccountId(v.accountId || firstAccount);
      setDate(v.date || todayISO());
      setPayee(v.payee);
      setDirection(v.direction);
      setAmount(v.amount);
      setCategoryId(v.categoryId);
      setNotes(v.notes);
      setTags(v.tags);
      setSplits(v.splits);
    } else {
      setAccountId(firstAccount);
      setDate(todayISO());
      setPayee('');
      setDirection('expense');
      setAmount('');
      setCategoryId('');
      setNotes('');
      setTags('');
      setSplits([]);
    }
    setError(null);
  }, [open, initial, prefill, firstAccount]);

  const accountCurrency = useMemo(() => {
    return (
      accounts.find((a) => a.id === accountId)?.currency ?? firstAccountCurrency
    );
  }, [accounts, accountId, firstAccountCurrency]);

  if (!open) return null;

  const magnitude = Number(amount);
  const hasSplits = splits.length > 0;
  const splitMagnitudeTotal = splits.reduce(
    (acc, l) => acc + (Number(l.amount) || 0),
    0,
  );
  const splitsBalanced =
    !hasSplits || Math.abs(splitMagnitudeTotal - Math.abs(magnitude)) < 1e-6;

  const submit = async () => {
    if (!accountId) {
      setError('Choose an account.');
      return;
    }
    if (!date) {
      setError('Date is required.');
      return;
    }
    if (!payee.trim()) {
      setError('Payee is required.');
      return;
    }
    if (!Number.isFinite(magnitude)) {
      setError('Amount must be a number.');
      return;
    }
    if (hasSplits && !splitsBalanced) {
      setError('Splits must sum to the transaction amount.');
      return;
    }
    const sign = direction === 'income' ? 1 : -1;
    const signedAmount = sign * Math.abs(magnitude);
    const signedSplits = hasSplits
      ? splits.map((l) => ({
          categoryId: l.categoryId ? l.categoryId : undefined,
          amount: sign * Math.abs(Number(l.amount) || 0),
          notes: l.notes ? l.notes : undefined,
        }))
      : undefined;
    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        id: initial?.id,
        accountId,
        date,
        amount: signedAmount,
        currency: accountCurrency,
        payee: payee.trim(),
        categoryId: categoryId ? categoryId : undefined,
        notes: notes ? notes : undefined,
        tags: tagList.length ? tagList : undefined,
        splits: signedSplits,
        type: direction,
        cleared: initial?.cleared ?? false,
        reconciled: initial?.reconciled ?? false,
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
      aria-labelledby="transaction-form-title"
      data-testid="transaction-form-dialog"
    >
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle id="transaction-form-title">
            {initial ? 'Edit transaction' : 'New transaction'}
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
              aria-label="Account"
              data-testid="tx-account"
            >
              {accounts.length === 0 ? (
                <option value="">(no accounts)</option>
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Date
              </label>
              <input
                type="date"
                className={inputCls}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
                data-testid="tx-date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Direction
              </label>
              <select
                className={cn(inputCls)}
                value={direction}
                onChange={(e) => setDirection(e.target.value as Direction)}
                aria-label="Direction"
                data-testid="tx-direction"
              >
                <option value="expense">Expense (−)</option>
                <option value="income">Income (+)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Amount ({accountCurrency || '?'})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                className={inputCls}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount"
                data-testid="tx-amount"
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
                aria-label="Category"
                data-testid="tx-category"
              >
                <option value="">(no category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Payee
            </label>
            <input
              className={inputCls}
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. ACME Corp"
              aria-label="Payee"
              data-testid="tx-payee"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Notes
            </label>
            <textarea
              className={cn(inputCls, 'min-h-16 py-2')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="Notes"
              data-testid="tx-notes"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Tags (comma-separated)
            </label>
            <input
              className={inputCls}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. reimbursable, travel"
              aria-label="Tags"
              data-testid="tx-tags"
            />
          </div>

          <SplitEditor
            lines={splits}
            onChange={setSplits}
            targetMagnitude={Math.abs(magnitude) || 0}
            categories={categories}
            direction={direction}
          />

          {error ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="tx-error"
            >
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
            disabled={busy || (hasSplits && !splitsBalanced)}
            data-testid="tx-submit"
          >
            {initial ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
