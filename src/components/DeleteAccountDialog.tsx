/**
 * Delete-account confirmation dialog (Phase 2 settings Danger zone).
 *
 * Built from the existing Card + Button primitives — no new dialog dependency.
 * Calls `onConfirm` after the user types the confirm phrase, and `onCancel` to
 * dismiss. Renders nothing when `open` is false.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_PHRASE = 'DELETE';

export function DeleteAccountDialog({ open, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  if (!open) return null;

  const canConfirm = typed === CONFIRM_PHRASE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      data-testid="delete-account-dialog"
    >
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle id="delete-account-title">Delete account</CardTitle>
          <CardDescription>
            This permanently deletes your vault and ALL MonetaFox data on this
            device. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Type{' '}
            <span className="text-foreground font-semibold">
              {CONFIRM_PHRASE}
            </span>{' '}
            to confirm.
          </p>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label="Confirm deletion"
            data-testid="delete-account-confirm-input"
            className="border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2"
          />
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm}
            onClick={onConfirm}
            data-testid="delete-account-confirm"
          >
            Delete everything
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
