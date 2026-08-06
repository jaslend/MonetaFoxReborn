/**
 * Template quick-entry — Phase 5b.
 *
 * Two affordances:
 * - a picker (`<select>` of saved templates + "New from template") that calls
 *   `applyTemplate` and notifies the page via `onApply(template)` so the entry
 *   form opens prefilled in create-mode;
 * - a "Save as template" button that calls `saveAsTemplate(from)` for the
 *   transaction currently being edited (passed in as `from`), prompting for a
 *   name. Shown only when `from` is provided.
 *
 * Templates are read from / persisted via the transaction store, which
 * delegates to the encrypted `transactionTemplates` repository.
 */
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/lib/db';
import type { TransactionTemplate } from '@/lib/db/models';
import { useTransactionStore } from '@/stores/transactionStore';

interface TemplatePickerProps {
  /** The transaction being edited, or undefined (hides "Save as template"). */
  from?: Transaction;
  /** Fired with the chosen template when the user picks "New from template". */
  onApply: (template: TransactionTemplate) => void;
}

const selectCls =
  'border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2';

export function TemplatePicker({ from, onApply }: TemplatePickerProps) {
  const templates = useTransactionStore((s) => s.templates);
  const saveAsTemplate = useTransactionStore((s) => s.saveAsTemplate);
  const [selected, setSelected] = useState('');

  const handleApply = () => {
    if (!selected) return;
    const tpl = useTransactionStore.getState().applyTemplate(selected);
    if (tpl) onApply(tpl);
  };

  const handleSave = async () => {
    if (!from) return;
    const name = window.prompt('Template name', from.payee || 'Template');
    if (name === null) return; // cancelled
    await saveAsTemplate(from, name);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="template-picker"
      aria-label="Transaction templates"
    >
      <select
        className={cn(selectCls, 'max-w-[16rem]')}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label="Templates"
        data-testid="template-select"
      >
        <option value="">Templates…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleApply}
        disabled={!selected}
        data-testid="template-apply"
      >
        New from template
      </Button>
      {from ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSave}
          data-testid="template-save"
        >
          Save as template
        </Button>
      ) : null}
    </div>
  );
}
