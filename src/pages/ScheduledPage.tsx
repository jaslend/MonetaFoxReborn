/**
 * Scheduled transactions page — Phase 8.
 *
 * Real scheduled-transactions view:
 * - Lists every schedule (payee, amount, account, recurrence summary, next
 *   date, mode).
 * - Create / edit / delete a schedule (account, amount with income/expense
 *   direction, payee, category, recurrence freq+interval, start/next date,
 *   auto|manual).
 * - "Post due now" action runs `processDue` and reports what was generated.
 * - A list of pending manual items (from the last `processDue` run) each with
 *   a "Post" button to materialise them on demand.
 *
 * Reuses the encrypted scheduled/transaction/account/category/settings stores;
 * no direct DB access from the page. Amounts are shown in the schedule's own
 * currency via `formatCurrency`.
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
import type { Account, Category, ScheduledTransaction } from '@/lib/db';

import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useScheduledStore } from '@/stores/scheduledStore';
import { useSettingsStore } from '@/stores/settingsStore';

import {
  ScheduledForm,
  type ScheduledFormValues,
} from '@/components/scheduled/ScheduledForm';
import { ConfirmDialog } from '@/components/accounts/ConfirmDialog';

function recurrenceSummary(r: ScheduledTransaction['recurrence']): string {
  const iv = r.interval ?? 1;
  const freqLabel: Record<ScheduledTransaction['recurrence']['freq'], string> =
    {
      daily: 'day',
      weekly: 'week',
      monthly: 'month',
      yearly: 'year',
    };
  const unit = freqLabel[r.freq];
  if (iv === 1) return `Every ${unit}`;
  return `Every ${iv} ${unit}s`;
}

export function ScheduledPage() {
  const schedules = useScheduledStore((s) => s.items);
  const pendingManual = useScheduledStore((s) => s.pendingManual);
  const lastGenerated = useScheduledStore((s) => s.lastGenerated);
  const addSchedule = useScheduledStore((s) => s.add);
  const updateSchedule = useScheduledStore((s) => s.update);
  const removeSchedule = useScheduledStore((s) => s.remove);
  const processDue = useScheduledStore((s) => s.processDue);
  const postManual = useScheduledStore((s) => s.postManual);

  const accounts = useAccountStore((s) => s.items);
  const categories = useCategoryStore((s) => s.items);
  const settings = useSettingsStore((s) => s.items[0]);
  const baseCurrency = settings?.baseCurrency ?? '';

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountById = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const display = (amount: number, currency: string): string =>
    currency ? formatCurrency(amount, currency) : String(amount);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: ScheduledTransaction) => {
    setEditing(s);
    setFormOpen(true);
  };

  const handleSubmit = async (values: ScheduledFormValues) => {
    const template: ScheduledTransaction['template'] = {
      accountId: values.accountId,
      amount: values.amount,
      currency: values.currency,
      payee: values.payee,
    };
    if (values.categoryId) template.categoryId = values.categoryId;
    if (values.notes) template.notes = values.notes;
    if (editing) {
      await updateSchedule(editing.id, {
        recurrence: values.recurrence,
        nextDate: values.nextDate,
        mode: values.mode,
        template,
      });
    } else {
      await addSchedule({
        id: crypto.randomUUID(),
        recurrence: values.recurrence,
        nextDate: values.nextDate,
        mode: values.mode,
        template,
      });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await removeSchedule(deletingId);
    setDeletingId(null);
  };

  const handlePostDue = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const { generated, pendingManual } = await processDue();
      const genCount = generated.length;
      const pendCount = pendingManual.length;
      if (genCount === 0 && pendCount === 0) {
        setFeedback('Nothing due right now.');
      } else {
        const parts: string[] = [];
        if (genCount > 0)
          parts.push(
            `posted ${genCount} auto transaction${genCount === 1 ? '' : 's'}`,
          );
        if (pendCount > 0)
          parts.push(
            `${pendCount} manual item${pendCount === 1 ? '' : 's'} pending`,
          );
        setFeedback(parts.join(' · '));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePostManual = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const tx = await postManual(id);
      if (tx) {
        setFeedback(
          `Posted manual transaction ${tx.payee} (${display(tx.amount, tx.currency)}).`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Scheduled</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePostDue}
            disabled={busy}
            data-testid="post-due-now"
          >
            Post due now
          </Button>
          <Button onClick={openCreate} data-testid="add-schedule">
            Add schedule
          </Button>
        </div>
      </div>

      {feedback || error ? (
        <Card>
          <CardContent className="py-4">
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
            {feedback ? (
              <p className="text-sm" data-testid="scheduled-feedback">
                {feedback}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {lastGenerated.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Last generated</CardTitle>
            <CardDescription>
              Transactions materialised by the most recent "Post due now" run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {lastGenerated.map((g) => (
                <li
                  key={g.transaction.id}
                  className="text-sm"
                  data-testid={`last-generated-${g.transaction.id}`}
                >
                  {g.transaction.payee} —{' '}
                  {display(g.transaction.amount, g.transaction.currency)} on{' '}
                  {g.transaction.date}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {pendingManual.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Pending manual</h2>
          <ul className="flex flex-col gap-3">
            {pendingManual.map((s) => (
              <PendingRow
                key={s.id}
                schedule={s}
                accountName={
                  accountById.get(s.template.accountId)?.name ?? '(deleted)'
                }
                categoryName={
                  s.template.categoryId
                    ? (categoryById.get(s.template.categoryId)?.name ??
                      '(deleted)')
                    : ''
                }
                display={display}
                onPost={() => handlePostManual(s.id)}
                disabled={busy}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              No schedules yet. Click <strong>Add schedule</strong> to create
              one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Schedules</h2>
          <ul className="flex flex-col gap-3">
            {schedules.map((s) => (
              <ScheduleRow
                key={s.id}
                schedule={s}
                accountName={
                  accountById.get(s.template.accountId)?.name ?? '(deleted)'
                }
                accountCurrency={
                  accountById.get(s.template.accountId)?.currency ?? ''
                }
                categoryName={
                  s.template.categoryId
                    ? (categoryById.get(s.template.categoryId)?.name ??
                      '(deleted)')
                    : ''
                }
                display={display}
                onEdit={() => openEdit(s)}
                onDelete={() => setDeletingId(s.id)}
              />
            ))}
          </ul>
        </section>
      )}

      <ScheduledForm
        open={formOpen}
        accounts={accounts}
        categories={categories}
        defaultCurrency={baseCurrency}
        initial={
          editing
            ? {
                id: editing.id,
                accountId: editing.template.accountId,
                amount: editing.template.amount,
                currency: editing.template.currency,
                payee: editing.template.payee,
                categoryId: editing.template.categoryId,
                notes: editing.template.notes,
                recurrence: editing.recurrence,
                nextDate: editing.nextDate,
                mode: editing.mode,
                direction: editing.template.amount >= 0 ? 'income' : 'expense',
              }
            : undefined
        }
        onSubmit={handleSubmit}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete schedule?"
        description="This removes the recurring schedule. Already-generated transactions remain."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

interface ScheduleRowProps {
  schedule: ScheduledTransaction;
  accountName: string;
  accountCurrency: string;
  categoryName: string;
  display: (amount: number, currency: string) => string;
  onEdit: () => void;
  onDelete: () => void;
}

function ScheduleRow({
  schedule,
  accountName,
  accountCurrency,
  categoryName,
  display,
  onEdit,
  onDelete,
}: ScheduleRowProps) {
  const { template, recurrence, nextDate, mode } = schedule;
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span
              className="font-medium"
              data-testid={`schedule-payee-${schedule.id}`}
            >
              {template.payee}
            </span>
            <span className="text-muted-foreground text-xs">
              {accountName}
              {categoryName ? ` · ${categoryName}` : ''}
              {' · '}
              <span data-testid={`schedule-recurrence-${schedule.id}`}>
                {recurrenceSummary(recurrence)}
              </span>
              {recurrence.endDate ? ` until ${recurrence.endDate}` : ''}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span
              className={cn(
                'font-semibold',
                template.amount < 0 ? 'text-destructive' : 'text-primary',
              )}
              data-testid={`schedule-amount-${schedule.id}`}
            >
              {display(template.amount, accountCurrency || template.currency)}
            </span>
            <span className="text-muted-foreground text-xs">
              next:{' '}
              <span data-testid={`schedule-next-${schedule.id}`}>
                {nextDate}
              </span>{' '}
              · <span data-testid={`schedule-mode-${schedule.id}`}>{mode}</span>
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              data-testid={`schedule-delete-${schedule.id}`}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

interface PendingRowProps {
  schedule: ScheduledTransaction;
  accountName: string;
  categoryName: string;
  display: (amount: number, currency: string) => string;
  onPost: () => void;
  disabled?: boolean;
}

function PendingRow({
  schedule,
  accountName,
  categoryName,
  display,
  onPost,
  disabled,
}: PendingRowProps) {
  const { template, nextDate } = schedule;
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span
              className="font-medium"
              data-testid={`pending-payee-${schedule.id}`}
            >
              {template.payee}
            </span>
            <span className="text-muted-foreground text-xs">
              {accountName}
              {categoryName ? ` · ${categoryName}` : ''} · due {nextDate}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-semibold',
                template.amount < 0 ? 'text-destructive' : 'text-primary',
              )}
              data-testid={`pending-amount-${schedule.id}`}
            >
              {display(template.amount, template.currency)}
            </span>
            <Button
              size="sm"
              onClick={onPost}
              disabled={disabled}
              data-testid={`pending-post-${schedule.id}`}
            >
              Post
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
