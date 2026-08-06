/**
 * Manual FX-rate editor (Settings → Currency). Lets the user set, update, and
 * delete manual rates for the foreign currencies they hold. Each row is
 * `currency → rate` where `rate` is base-currency units per 1 unit of the
 * currency. The base currency itself is never listed here (convertToBase is
 * identity for it).
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CurrencySelect } from './CurrencySelect';

export interface FxRateEditorProps {
  base: string;
  rates: Record<string, number>;
  onSetRate: (currency: string, rate: number) => Promise<void> | void;
}

export function FxRateEditor({ base, rates, onSetRate }: FxRateEditorProps) {
  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const foreignEntries = Object.entries(rates)
    .filter(([c]) => c !== base)
    .sort(([a], [b]) => a.localeCompare(b));

  const submit = async () => {
    if (!code) {
      setError('Choose a currency.');
      return;
    }
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) {
      setError('Rate must be a positive number.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSetRate(code, rate);
      setCode('');
      setValue('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-muted-foreground text-xs font-medium">
            Currency
          </label>
          <CurrencySelect
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Rate currency"
          />
        </div>
        <div className="flex-1">
          <label className="text-muted-foreground text-xs font-medium">
            Rate (1 {code || '?'} = ? {base})
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 1.1"
            aria-label="Rate value"
            className="border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
          />
        </div>
        <Button onClick={submit} disabled={busy} data-testid="fx-rate-set">
          {rates[code] !== undefined ? 'Update' : 'Add'}
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {foreignEntries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No manual FX rates set yet. Add one for any foreign currency you hold.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border">
          {foreignEntries.map(([c, r]) => (
            <li
              key={c}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <span data-testid={`fx-rate-row-${c}`}>
                <span className="font-medium">{c}</span>{' '}
                <span className="text-muted-foreground">
                  → {r} {base} per 1 {c}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
