/**
 * Settings page — Phase 3b placeholder PLUS the Phase 2 Danger zone
 * (delete-account flow). The rest of the page is unchanged.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PagePlaceholder } from './PagePlaceholder';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import { useAuthStore } from '@/stores';

export function SettingsPage() {
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await deleteAccount();
    } finally {
      setBusy(false);
      navigate('/login', { replace: true });
    }
  };

  return (
    <PagePlaceholder
      title="Settings"
      description="App preferences, base currency, and account management."
    >
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete your vault and all MonetaFox data on this device.
            This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={busy}
            data-testid="delete-account-button"
          >
            Delete account
          </Button>
        </CardContent>
      </Card>
      <DeleteAccountDialog
        open={confirmOpen}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </PagePlaceholder>
  );
}
