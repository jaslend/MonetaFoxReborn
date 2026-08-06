/**
 * Split editor — Phase 5a.
 *
 * Renders one row per split leg (category + amount + optional notes) and a
 * running total vs the parent transaction's MAGNITUDE. The parent `amount`
 * (signed) is converted to a magnitude here so the user enters positive
 * allocation amounts regardless of income/expense direction; the form signs
 * the splits before persisting (see `TransactionForm`).
 *
 * Save is the parent form's responsibility; this component only reports the
 * current split lines and whether they balance against `targetMagnitude`.
 */
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/db';

/** A split leg in the form's INTERNAL (magnitude) representation. */
export interface SplitLine {
  categoryId?: string;
  /** Magnitude (non-negative) of the allocation; signed on save. */
  amount: string;
  notes?: string;
}

interface SplitEditorProps {
  lines: SplitLine[];
  onChange: (lines: SplitLine[]) => void;
  /** Parent transaction's MAGNITUDE (abs of the signed amount). */
  targetMagnitude: number;
  categories: Category[];
  direction: 'income' | 'expense';
}

const inputCls =
  'border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2';

export function SplitEditor({
  lines,
  onChange,
  targetMagnitude,
  categories,
  direction,
}: SplitEditorProps) {
  const total = lines.reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  const diff = total - targetMagnitude;
  const balanced = lines.length === 0 || Math.abs(diff) < 1e-6;

  const update = (idx: number, patch: Partial<SplitLine>) =>
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const remove = (idx: number) => onChange(lines.filter((_, i) => i !== idx));

  const add = () =>
    onChange([...lines, { categoryId: '', amount: '', notes: '' }]);

  const sign = direction === 'income' ? '+' : '−';

  return (
    <div className="flex flex-col gap-2" data-testid="split-editor">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">
          Splits
        </span>
        <span
          className={cn(
            'text-xs font-medium',
            balanced ? 'text-muted-foreground' : 'text-destructive',
          )}
          data-testid="split-total"
        >
          {sign}
          {total.toFixed(2)} / {sign}
          {targetMagnitude.toFixed(2)}
          {balanced ? '' : ` (off by ${Math.abs(diff).toFixed(2)})`}
        </span>
      </div>

      {lines.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No splits — the whole amount posts to the primary category.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map((line, idx) => (
            <li
              key={idx}
              className="flex flex-col gap-2 sm:flex-row sm:items-center"
              data-testid={`split-row-${idx}`}
            >
              <select
                className={cn(inputCls, 'sm:max-w-[40%]')}
                value={line.categoryId ?? ''}
                onChange={(e) => update(idx, { categoryId: e.target.value })}
                aria-label={`Split ${idx + 1} category`}
                data-testid={`split-category-${idx}`}
              >
                <option value="">(no category)</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                min="0"
                className={cn(inputCls, 'sm:w-28')}
                value={line.amount}
                onChange={(e) => update(idx, { amount: e.target.value })}
                aria-label={`Split ${idx + 1} amount`}
                data-testid={`split-amount-${idx}`}
              />
              <input
                className={cn(inputCls, 'sm:flex-1')}
                value={line.notes ?? ''}
                onChange={(e) => update(idx, { notes: e.target.value })}
                placeholder="notes (optional)"
                aria-label={`Split ${idx + 1} notes`}
                data-testid={`split-notes-${idx}`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove(idx)}
                aria-label={`Remove split ${idx + 1}`}
                data-testid={`split-remove-${idx}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={add}
          data-testid="split-add"
        >
          Add split
        </Button>
        {lines.length > 0 && !balanced ? (
          <span className="text-destructive text-xs" role="alert">
            Splits must sum to the transaction amount before saving.
          </span>
        ) : null}
      </div>
    </div>
  );
}
