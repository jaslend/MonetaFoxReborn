/**
 * Accounts page — Phase 4.
 *
 * Real accounts view:
 * - If no base currency is set yet (first run), prompt the user to choose one
 *   before any account can be created (spec: single base currency, fixed at
 *   setup).
 * - Lists every account with its balance in its OWN currency AND the
 *   base-converted value, plus a total net worth in the base currency.
 * - Create / edit / archive / unarchive / delete (with confirm).
 *
 * Reuses the encrypted account/transaction/settings stores; no direct DB access
 * from the page. Amounts are stored in the original currency and only
 * converted here for display.
 */
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Account } from '@/lib/db';
import { formatCurrency } from '@/lib/currency';
import { accountBalance, netWorthInBase } from '@/lib/accounts';

import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useAuthStore } from '@/stores/authStore';

import { CurrencySetup } from '@/components/currency/CurrencySetup';
import {
  AccountForm,
  type AccountFormValues,
} from '@/components/accounts/AccountForm';
import { ConfirmDialog } from '@/components/accounts/ConfirmDialog';

const TYPE_LABELS: Record<Account['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit: 'Credit',
  cash: 'Cash',
  investment: 'Investment',
  loan: 'Loan',
};

export function AccountsPage() {
  const accounts = useAccountStore((s) => s.items);
  const transactions = useTransactionStore((s) => s.items);
  const settings = useSettingsStore((s) => s.items[0]);

  const createAccount = useAccountStore((s) => s.createAccount);
  const updateAccount = useAccountStore((s) => s.update);
  const archiveAccount = useAccountStore((s) => s.archive);
  const unarchiveAccount = useAccountStore((s) => s.unarchive);
  const removeAccount = useAccountStore((s) => s.remove);

  const ensureSettings = useSettingsStore((s) => s.ensureSettings);
  const setBaseCurrency = useSettingsStore((s) => s.setBaseCurrency);

  const mode = useAuthStore((s) => s.mode);

  const baseCurrency = settings?.baseCurrency ?? '';
  const rates = useMemo(() => settings?.rates ?? {}, [settings]);

  // Guarantee the singleton settings row exists on first run.
  useEffect(() => {
    if (!settings) {
      ensureSettings(mode ?? 'basic').catch((e) => {
        // Surface but don't crash the page; the user can retry via Settings.
        console.error('ensureSettings failed:', e);
      });
    }
  }, [settings, mode, ensureSettings]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Net worth in base currency; a missing rate surfaces as an inline warning
  // rather than crashing the page (convertToBase throws on missing rates).
  const { netWorth, conversionError } = useMemo(() => {
    if (!baseCurrency) return { netWorth: 0, conversionError: null };
    try {
      return {
        netWorth: netWorthInBase(accounts, transactions, baseCurrency, rates),
        conversionError: null,
      };
    } catch (e) {
      return {
        netWorth: NaN,
        conversionError: e instanceof Error ? e.message : String(e),
      };
    }
  }, [accounts, transactions, baseCurrency, rates]);

  // Per-account base-converted value (same missing-rate handling).
  const baseConverted = useMemo(() => {
    const map = new Map<string, number>();
    if (!baseCurrency) return map;
    for (const a of accounts) {
      try {
        const bal = accountBalance(a, transactions);
        if (a.currency === baseCurrency) {
          map.set(a.id, bal);
        } else {
          const r = rates[a.currency];
          if (r === undefined || r === null || Number.isNaN(r)) {
            map.set(a.id, NaN);
          } else {
            map.set(a.id, bal * r);
          }
        }
      } catch {
        map.set(a.id, NaN);
      }
    }
    return map;
  }, [accounts, transactions, baseCurrency, rates]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (acc: Account) => {
    setEditing(acc);
    setFormOpen(true);
  };

  const handleSubmit = async (values: AccountFormValues) => {
    if (editing) {
      await updateAccount(editing.id, {
        name: values.name,
        type: values.type,
        currency: values.currency,
        openingBalance: values.openingBalance,
      });
    } else {
      await createAccount({
        name: values.name,
        type: values.type,
        currency: values.currency,
        openingBalance: values.openingBalance,
      });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await removeAccount(deletingId);
    setDeletingId(null);
  };

  const live = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  // First run: no base currency chosen yet.
  if (!baseCurrency) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <CurrencySetup
          onChoose={async (code) => {
            await setBaseCurrency(code);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
        <Button onClick={openCreate} data-testid="add-account">
          Add account
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Net worth</CardTitle>
          <CardDescription>
            Total of all live account balances, in your base currency (
            {baseCurrency}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {conversionError ? (
            <p className="text-destructive text-sm" role="alert">
              {conversionError} — set the missing rate on the Settings page.
            </p>
          ) : (
            <p className="text-2xl font-semibold" data-testid="net-worth">
              {formatCurrency(netWorth, baseCurrency)}
            </p>
          )}
        </CardContent>
      </Card>

      {live.length === 0 && archived.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              No accounts yet. Click <strong>Add account</strong> to create one.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {live.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Active</h2>
          <ul className="flex flex-col gap-3">
            {live.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                balance={accountBalance(a, transactions)}
                baseValue={baseConverted.get(a.id) ?? NaN}
                baseCurrency={baseCurrency}
                onEdit={() => openEdit(a)}
                onArchive={() => archiveAccount(a.id)}
                onDelete={() => setDeletingId(a.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {archived.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-lg font-semibold">
            Archived
          </h2>
          <ul className="flex flex-col gap-3">
            {archived.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                balance={accountBalance(a, transactions)}
                baseValue={baseConverted.get(a.id) ?? NaN}
                baseCurrency={baseCurrency}
                archived
                onEdit={() => openEdit(a)}
                onUnarchive={() => unarchiveAccount(a.id)}
                onDelete={() => setDeletingId(a.id)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <AccountForm
        open={formOpen}
        baseCurrency={baseCurrency}
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                type: editing.type,
                currency: editing.currency,
                openingBalance: editing.openingBalance,
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
        title="Delete account?"
        description="This permanently removes the account. Its transactions remain unless you delete them separately."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

interface AccountRowProps {
  account: Account;
  balance: number;
  baseValue: number;
  baseCurrency: string;
  archived?: boolean;
  onEdit: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}

function AccountRow({
  account,
  balance,
  baseValue,
  baseCurrency,
  archived,
  onEdit,
  onArchive,
  onUnarchive,
  onDelete,
}: AccountRowProps) {
  const foreign = account.currency !== baseCurrency;
  const missingRate = foreign && Number.isNaN(baseValue);
  return (
    <li>
      <Card className={cn(archived && 'opacity-60')}>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <span className="font-medium" data-testid="account-name-display">
              {account.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {TYPE_LABELS[account.type]} · {account.currency}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <span
              className="font-semibold"
              data-testid={`account-balance-${account.id}`}
            >
              {formatCurrency(balance, account.currency)}
            </span>
            {foreign ? (
              missingRate ? (
                <span className="text-destructive text-xs">
                  No FX rate for {account.currency} → {baseCurrency}
                </span>
              ) : (
                <span
                  className="text-muted-foreground text-xs"
                  data-testid={`account-base-value-${account.id}`}
                >
                  {formatCurrency(baseValue, baseCurrency)} ({baseCurrency})
                </span>
              )
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            {archived ? (
              <Button variant="ghost" size="sm" onClick={onUnarchive}>
                Unarchive
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={onArchive}>
                Archive
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={onDelete}
              data-testid={`account-delete-${account.id}`}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
