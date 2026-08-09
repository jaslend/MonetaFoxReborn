/**
 * Create/edit category form. Fields: name, kind (income/expense) and an
 * optional parent (a top-level category of the SAME kind). Modeled on
 * `AccountForm`: a modal overlay that calls `onSubmit` with the field values;
 * the parent page decides create vs update. Renders nothing when `open` is
 * false.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/db';

const KINDS: { value: Category['kind']; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

export interface CategoryFormValues {
  name: string;
  kind: Category['kind'];
  parentId?: string;
}

interface CategoryFormProps {
  open: boolean;
  initial?: Partial<CategoryFormValues> & { id?: string };
  /** All existing categories, used to populate the parent selector. */
  categories: Category[];
  onSubmit: (values: CategoryFormValues) => Promise<void> | void;
  onCancel: () => void;
}

const EMPTY: CategoryFormValues = {
  name: '',
  kind: 'expense',
  parentId: undefined,
};

export function CategoryForm({
  open,
  initial,
  categories,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(EMPTY.name);
  const [kind, setKind] = useState<Category['kind']>(EMPTY.kind);
  const [parentId, setParentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset/seed fields whenever the dialog opens (or the target changes).
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? EMPTY.name);
    setKind(initial?.kind ?? EMPTY.kind);
    setParentId(initial?.parentId ?? '');
    setError(null);
  }, [open, initial]);

  // Valid parents: top-level categories of the same kind, never the category
  // being edited (a category can't be its own parent).
  const parentOptions = useMemo(
    () =>
      categories.filter(
        (c) => c.kind === kind && !c.parentId && c.id !== initial?.id,
      ),
    [categories, kind, initial?.id],
  );

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        parentId: parentId || undefined,
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
      aria-labelledby="category-form-title"
      data-testid="category-form-dialog"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="category-form-title">
            {initial?.id ? 'Edit category' : 'New category'}
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
              placeholder="e.g. Groceries"
              aria-label="Category name"
              data-testid="category-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Kind
            </label>
            <select
              className={cn(inputCls)}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as Category['kind']);
                // Parent must share the new kind; drop a now-invalid selection.
                setParentId('');
              }}
              aria-label="Category kind"
              data-testid="category-kind"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Parent (optional)
            </label>
            <select
              className={cn(inputCls)}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              aria-label="Parent category"
              data-testid="category-parent"
            >
              <option value="">None (top level)</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          <Button
            onClick={submit}
            disabled={busy}
            data-testid="category-submit"
          >
            {initial?.id ? 'Save' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
