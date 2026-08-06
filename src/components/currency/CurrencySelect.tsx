/**
 * A reusable <select> listing every supported currency (Phase 4). Used by the
 * account form, the base-currency picker, and the FX-rate editor.
 */
import { CURRENCIES } from '@/lib/currency';
import { cn } from '@/lib/utils';

interface CurrencySelectProps extends Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'value'
> {
  value: string;
  includeBase?: string;
}

export function CurrencySelect({
  value,
  className,
  disabled,
  ...props
}: CurrencySelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      className={cn(
        'border-border bg-background ring-offset-background flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <option value="" disabled>
        Select a currency…
      </option>
      {CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.code} — {c.name} ({c.symbol})
        </option>
      ))}
    </select>
  );
}
