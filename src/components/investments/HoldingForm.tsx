/**
 * Create/edit holding form. Fields: asset (from the loaded assets), units.
 * The account is chosen by the parent (the investments page scopes to one
 * investment account), so it is not part of this form.
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
import type { Asset } from '@/lib/db';

export interface HoldingFormValues {
  assetId: string;
  units: number;
}

interface HoldingFormProps {
  open: boolean;
  initial?: Partial<HoldingFormValues> & { id?: string };
  assets: Asset[];
  onSubmit: (values: HoldingFormValues) => Promise<void> | void;
  onCancel: () => void;
}

export function HoldingForm({
  open,
  initial,
  assets,
  onSubmit,
  onCancel,
}: HoldingFormProps) {
  const [assetId, setAssetId] = useState('');
  const [units, setUnits] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAssetId(initial?.assetId ?? '');
    setUnits(String(initial?.units ?? 0));
    setError(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = async () => {
    if (!assetId) {
      setError('Asset is required.');
      return;
    }
    const u = Number(units);
    if (!Number.isFinite(u) || u < 0) {
      setError('Units must be a non-negative number.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({ assetId, units: u });
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
      aria-labelledby="holding-form-title"
      data-testid="holding-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="holding-form-title">
            {initial?.id ? 'Edit holding' : 'New holding'}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Asset
            </label>
            <select
              className={cn(inputCls)}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              aria-label="Holding asset"
              data-testid="holding-asset"
            >
              <option value="">Select an asset…</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.symbol} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Units
            </label>
            <input
              type="number"
              step="any"
              min="0"
              className={inputCls}
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              aria-label="Holding units"
              data-testid="holding-units"
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
          <Button onClick={submit} disabled={busy} data-testid="holding-submit">
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
