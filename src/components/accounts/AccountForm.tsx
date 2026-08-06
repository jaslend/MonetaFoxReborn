/**
 * Create/edit account form. Fields: type (AccountType union), name, currency,
 * openingBalance. Used in a modal overlay on the Accounts page. Calls
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
import type { AccountType } from '@/lib/db';
import { CurrencySelect } from '@/components/currency/CurrencySelect';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
];

export interface AccountFormValues {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
}

interface AccountFormProps {
  open: boolean;
  initial?: Partial<AccountFormValues> & { id?: string };
  baseCurrency: string;
  onSubmit: (values: AccountFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const EMPTY: AccountFormValues = {
  name: '',
  type: 'checking',
  currency: '',
  openingBalance: 0,
};

export function AccountForm({
  open,
  initial,
  baseCurrency,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  const [name, setName] = useState(EMPTY.name);
  const [type, setType] = useState<AccountType>(EMPTY.type);
  const [currency, setCurrency] = useState(EMPTY.currency);
  const [opening, setOpening] = useState(String(EMPTY.openingBalance));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset/seed fields whenever the dialog opens (or the target changes).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? EMPTY.name);
    setType(initial?.type ?? EMPTY.type);
    setCurrency(initial?.currency ?? baseCurrency ?? EMPTY.currency);
    setOpening(String(initial?.openingBalance ?? EMPTY.openingBalance));
    setError(null);
  }, [open, initial, baseCurrency]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!currency) {
      setError('Currency is required.');
      return;
    }
    const ob = Number(opening);
    if (!Number.isFinite(ob)) {
      setError('Opening balance must be a number.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        type,
        currency,
        openingBalance: ob,
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
      aria-labelledby="account-form-title"
      data-testid="account-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="account-form-title">
            {initial?.id ? 'Edit account' : 'New account'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Name
            </label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main checking"
              aria-label="Account name"
              data-testid="account-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Type
            </label>
            <select
              className={cn(inputCls)}
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              aria-label="Account type"
              data-testid="account-type"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Currency
            </label>
            <CurrencySelect
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Account currency"
              data-testid="account-currency"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Opening balance (in the account currency)
            </label>
            <input
              type="number"
              step="any"
              className={inputCls}
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              aria-label="Opening balance"
              data-testid="account-opening-balance"
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
          <Button onClick={submit} disabled={busy} data-testid="account-submit">
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
