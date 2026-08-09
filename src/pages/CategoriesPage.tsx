/**
 * Categories page.
 *
 * Real categories view (previously a stub placeholder):
 * - Lists categories grouped by kind (Expense / Income), with children nested
 *   under their parent.
 * - Create / edit / delete (with confirm). Deleting a parent orphans its
 *   children to the top level rather than leaving a dangling `parentId`.
 *
 * Delegates to the encrypted `useCategoryStore`; no direct DB access. Ids are
 * assigned here via `crypto.randomUUID()` (the generic entity store's `add`
 * expects a fully-formed record).
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/db';

import { useCategoryStore } from '@/stores/categoryStore';

import {
  CategoryForm,
  type CategoryFormValues,
} from '@/components/categories/CategoryForm';
import { ConfirmDialog } from '@/components/accounts/ConfirmDialog';

const KIND_LABELS: Record<Category['kind'], string> = {
  expense: 'Expense',
  income: 'Income',
};

export function CategoriesPage() {
  const categories = useCategoryStore((s) => s.items);
  const addCategory = useCategoryStore((s) => s.add);
  const updateCategory = useCategoryStore((s) => s.update);
  const removeCategory = useCategoryStore((s) => s.remove);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

  // Group top-level categories by kind, each with its ordered children.
  const grouped = useMemo(() => {
    const byKind: Record<
      Category['kind'],
      { parent: Category; children: Category[] }[]
    > = {
      expense: [],
      income: [],
    };
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    const childrenOf = (id: string) => sorted.filter((c) => c.parentId === id);
    for (const c of sorted) {
      if (c.parentId) continue;
      byKind[c.kind].push({ parent: c, children: childrenOf(c.id) });
    }
    return byKind;
  }, [categories]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (cat: Category) => {
    setEditing(cat);
    setFormOpen(true);
  };

  const handleSubmit = async (values: CategoryFormValues) => {
    if (editing) {
      await updateCategory(editing.id, {
        name: values.name,
        kind: values.kind,
        parentId: values.parentId,
      });
    } else {
      await addCategory({
        id: crypto.randomUUID(),
        name: values.name,
        kind: values.kind,
        parentId: values.parentId,
      });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    // Orphan any children to the top level before removing the parent, so no
    // category is left pointing at a deleted parent.
    for (const child of categories.filter((c) => c.parentId === deleting.id)) {
      await updateCategory(child.id, { parentId: undefined });
    }
    await removeCategory(deleting.id);
    setDeleting(null);
  };

  const kinds: Category['kind'][] = ['expense', 'income'];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        <Button onClick={openCreate} data-testid="add-category">
          Add category
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-sm">
              No categories yet. Click <strong>Add category</strong> to create
              one.
            </p>
          </CardContent>
        </Card>
      ) : (
        kinds.map((kind) => {
          const groups = grouped[kind];
          if (groups.length === 0) return null;
          return (
            <section key={kind} className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{KIND_LABELS[kind]}</h2>
              <ul className="flex flex-col gap-2">
                {groups.map(({ parent, children }) => (
                  <li key={parent.id} className="flex flex-col gap-2">
                    <CategoryRow
                      category={parent}
                      onEdit={() => openEdit(parent)}
                      onDelete={() => setDeleting(parent)}
                    />
                    {children.length > 0 ? (
                      <ul className="ml-6 flex flex-col gap-2">
                        {children.map((child) => (
                          <li key={child.id}>
                            <CategoryRow
                              category={child}
                              nested
                              onEdit={() => openEdit(child)}
                              onDelete={() => setDeleting(child)}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <CategoryForm
        open={formOpen}
        categories={categories}
        initial={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                kind: editing.kind,
                parentId: editing.parentId,
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
        open={deleting !== null}
        title="Delete category?"
        description="This permanently removes the category. Any sub-categories are moved to the top level; transactions keep their reference but will show no category."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

interface CategoryRowProps {
  category: Category;
  nested?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CategoryRow({ category, nested, onEdit, onDelete }: CategoryRowProps) {
  return (
    <Card className={cn(nested && 'bg-muted/30')}>
      <CardContent className="flex items-center justify-between p-4">
        <span className="font-medium" data-testid="category-name-display">
          {category.name}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            data-testid={`category-delete-${category.id}`}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
