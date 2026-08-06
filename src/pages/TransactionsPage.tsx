/**
 * Transactions page — Phase 5a + 5b.
 *
 * Real transactions view:
 * - list/table of transactions (date, payee, category, amount, Cleared /
 *   Reconciled status), most-recent first;
 * - entry/edit form: account, date, payee, amount with an income/expense
 *   direction control (produces the correct signed `amount`), category,
 *   notes, tags (multi-value);
 * - a SPLIT editor: add/remove split lines and block save until the splits
 *   sum to the parent amount;
 * - inline reconciliation toggles (Cleared / Reconciled);
 * - delete with confirm.
 *
 * Phase 5b additions:
 * - a filter bar (date range, account, category, payee, cleared/reconciled)
 *   and a search box that drive the visible list via the store's pure
 *   `filterTransactions` / `searchTransactions` (composed in
 *   `selectFilteredTransactions`);
 * - template quick-entry: a picker to start a new entry from a saved template
 *   (prefills the create-mode form), and "Save as template" for the
 *   transaction currently being edited.
 *
 * Reuses the encrypted transaction store (with split validation + templates),
 * the account store (for the account picker + currency), the category store
 * (for the category pickers), and the generic confirm dialog. No direct DB
 * access.
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import type { Transaction } from '@/lib/db';
import type { TransactionTemplate } from '@/lib/db/models';
import { formatCurrency } from '@/lib/currency';

import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  useTransactionStore,
  selectFilteredTransactions,
} from '@/stores/transactionStore';

import { ConfirmDialog } from '@/components/accounts/ConfirmDialog';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/transactions/TransactionForm';
import { TransactionList } from '@/components/transactions/TransactionList';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { TemplatePicker } from '@/components/transactions/TemplatePicker';

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function TransactionsPage() {
  const accounts = useAccountStore((s) => s.items);
  const categories = useCategoryStore((s) => s.items);
  const visible = useTransactionStore(useShallow(selectFilteredTransactions));
  const settings = useSettingsStore((s) => s.items[0]);

  const addTx = useTransactionStore((s) => s.add);
  const updateTx = useTransactionStore((s) => s.update);
  const removeTx = useTransactionStore((s) => s.remove);
  const setCleared = useTransactionStore((s) => s.setCleared);
  const setReconciled = useTransactionStore((s) => s.setReconciled);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [prefill, setPrefill] = useState<Transaction | undefined>(undefined);
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const openCreate = () => {
    setEditing(null);
    setPrefill(undefined);
    setFormOpen(true);
  };
  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setPrefill(undefined);
    setFormOpen(true);
  };

  const handleApplyTemplate = (tpl: TransactionTemplate) => {
    // Build a Transaction-shaped prefill so the form can seed from it while
    // staying in create mode (no `initial`). Today's date fills in for the
    // template's dateless shape.
    const pre: Transaction = {
      id: `template-${tpl.id}`,
      accountId: tpl.accountId ?? '',
      date: todayISO(),
      amount: tpl.amount ?? 0,
      currency: tpl.currency ?? '',
      payee: tpl.payee ?? '',
      categoryId: tpl.categoryId,
      notes: tpl.notes,
      tags: tpl.tags,
      splits: tpl.splits,
    };
    setEditing(null);
    setPrefill(pre);
    setFormOpen(true);
  };

  const handleSubmit = async (values: TransactionFormValues) => {
    if (values.id) {
      await updateTx(values.id, {
        accountId: values.accountId,
        date: values.date,
        amount: values.amount,
        currency: values.currency,
        payee: values.payee,
        categoryId: values.categoryId,
        notes: values.notes,
        tags: values.tags,
        splits: values.splits,
        type: values.type,
      });
    } else {
      await addTx({
        id: crypto.randomUUID(),
        accountId: values.accountId,
        date: values.date,
        amount: values.amount,
        currency: values.currency,
        payee: values.payee,
        categoryId: values.categoryId,
        notes: values.notes,
        tags: values.tags,
        splits: values.splits,
        type: values.type,
        cleared: values.cleared ?? false,
        reconciled: values.reconciled ?? false,
      });
    }
    setFormOpen(false);
    setEditing(null);
    setPrefill(undefined);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await removeTx(deleting.id);
    setDeleting(null);
  };

  const handleToggleCleared = (tx: Transaction) =>
    setCleared(tx.id, !tx.cleared);
  const handleToggleReconciled = (tx: Transaction) =>
    setReconciled(tx.id, !tx.reconciled);

  const baseCurrency = settings?.baseCurrency ?? '';

  // A small summary in the base currency over the VISIBLE (filtered) set, when
  // a base currency is set. Errors (missing FX rate) are swallowed here so the
  // page never crashes; the Accounts page surfaces the missing-rate warning.
  const summary = (() => {
    if (!baseCurrency) return null;
    let net = 0;
    for (const t of visible) {
      if (t.currency === baseCurrency) net += t.amount;
      else {
        const r = settings?.rates?.[t.currency];
        if (typeof r === 'number' && Number.isFinite(r)) net += t.amount * r;
      }
    }
    return net;
  })();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <Button onClick={openCreate} data-testid="add-transaction">
          Add transaction
        </Button>
      </div>

      <TemplatePicker
        from={editing ?? undefined}
        onApply={handleApplyTemplate}
      />

      {summary !== null ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground text-sm">
              Net activity in base currency ({baseCurrency})
            </p>
            <p className="text-2xl font-semibold" data-testid="tx-net">
              {formatCurrency(summary, baseCurrency)}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              Create an account on the Accounts page before adding transactions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 py-4">
            <TransactionFilters accounts={accounts} categories={categories} />
            <TransactionList
              transactions={visible}
              accounts={accounts}
              categories={categories}
              onEdit={openEdit}
              onDelete={setDeleting}
              onToggleCleared={handleToggleCleared}
              onToggleReconciled={handleToggleReconciled}
            />
          </CardContent>
        </Card>
      )}

      <TransactionForm
        open={formOpen}
        accounts={accounts}
        categories={categories}
        initial={editing ?? undefined}
        prefill={prefill}
        onSubmit={handleSubmit}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
          setPrefill(undefined);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete transaction?"
        description="This permanently removes the transaction."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
