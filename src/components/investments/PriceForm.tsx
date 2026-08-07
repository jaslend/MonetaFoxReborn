/**
 * Manual price-entry form. Fields: date (YYYY-MM-DD), price. Used to record a
 * dated PricePoint for a given asset; the parent passes the asset's symbol
 * for display and decides persistence via `onSubmit`.
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

export interface PriceFormValues {
  date: string;
  price: number;
}

interface PriceFormProps {
  open: boolean;
  /** Symbol shown in the form title (e.g. "BTC"). */
  symbol: string;
  initial?: Partial<PriceFormValues>;
  onSubmit: (values: PriceFormValues) => Promise<void> | void;
  onCancel: () => void;
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function PriceForm({
  open,
  symbol,
  initial,
  onSubmit,
  onCancel,
}: PriceFormProps) {
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(initial?.date ?? todayISO());
    setPrice(String(initial?.price ?? 0));
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Date must be in YYYY-MM-DD form.');
      return;
    }
    const p = Number(price);
    if (!Number.isFinite(p) || p < 0) {
      setError('Price must be a non-negative number.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ date, price: p });
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
      aria-labelledby="price-form-title"
      data-testid="price-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="price-form-title">
            {symbol ? `${symbol} — ` : ''}Record price
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Date (YYYY-MM-DD)
            </label>
            <input
              className={cn(inputCls)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="2026-01-01"
              aria-label="Price date"
              data-testid="price-date"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Price
            </label>
            <input
              type="number"
              step="any"
              min="0"
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-label="Price value"
              data-testid="price-value"
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
          <Button onClick={submit} disabled={busy} data-testid="price-submit">
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
