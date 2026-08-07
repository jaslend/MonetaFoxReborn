/**
 * Create/edit asset form. Fields: symbol, name, type. Used in a modal overlay
 * on the Investments page. Calls `onSubmit` with the field values; the parent
 * decides create vs update.
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
import type { AssetType } from '@/lib/db';

export interface AssetFormValues {
  symbol: string;
  name: string;
  type: AssetType;
}

interface AssetFormProps {
  open: boolean;
  initial?: Partial<AssetFormValues> & { id?: string };
  onSubmit: (values: AssetFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual', label: 'Mutual fund' },
  { value: 'bond', label: 'Bond' },
  { value: 'commodity', label: 'Commodity' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'forex', label: 'Forex' },
  { value: 'other', label: 'Other' },
];

export function AssetForm({
  open,
  initial,
  onSubmit,
  onCancel,
}: AssetFormProps) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('crypto');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSymbol(initial?.symbol ?? '');
    setName(initial?.name ?? '');
    setType(initial?.type ?? 'crypto');
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = async () => {
    if (!symbol.trim()) {
      setError('Symbol is required.');
      return;
    }
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        symbol: symbol.trim(),
        name: name.trim(),
        type,
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
      aria-labelledby="asset-form-title"
      data-testid="asset-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="asset-form-title">
            {initial?.id ? 'Edit asset' : 'New asset'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Symbol
            </label>
            <input
              className={cn(inputCls)}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="BTC"
              aria-label="Asset symbol"
              data-testid="asset-symbol"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Name
            </label>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bitcoin"
              aria-label="Asset name"
              data-testid="asset-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Type
            </label>
            <select
              className={cn(inputCls)}
              value={type}
              onChange={(e) => setType(e.target.value as AssetType)}
              aria-label="Asset type"
              data-testid="asset-type"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
          <Button onClick={submit} disabled={busy} data-testid="asset-submit">
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
