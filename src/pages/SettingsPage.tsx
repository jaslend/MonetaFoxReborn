/**
 * Settings page — Phase 4 currency section PLUS the Phase 2 Danger zone
 * (delete-account flow). The Danger zone is preserved unchanged; the new
 * Currency section is added above it.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { FxRateEditor } from '@/components/currency/FxRateEditor';
import { DataExportCard } from '@/components/export/DataExportCard';
import { useAccountStore } from '@/stores/accountStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useAuthStore } from '@/stores/authStore';

export function SettingsPage() {
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Currency section state.
  const settings = useSettingsStore((s) => s.items[0]);
  const ensureSettings = useSettingsStore((s) => s.ensureSettings);
  const setBaseCurrency = useSettingsStore((s) => s.setBaseCurrency);
  const setRate = useSettingsStore((s) => s.setRate);
  const accountCount = useAccountStore((s) => s.items.length);
  const txnCount = useTransactionStore((s) => s.items.length);
  const mode = useAuthStore((s) => s.mode);

  const baseCurrency = settings?.baseCurrency ?? '';
  const rates = settings?.rates ?? {};
  const locked = accountCount > 0 || txnCount > 0;

  const [pendingBase, setPendingBase] = useState(baseCurrency);
  const [baseError, setBaseError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) {
      ensureSettings(mode ?? 'basic').catch((e) => console.error(e));
    }
  }, [settings, mode, ensureSettings]);

  useEffect(() => {
    setPendingBase(baseCurrency);
  }, [baseCurrency]);

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

  const applyBaseCurrency = async () => {
    if (!pendingBase || pendingBase === baseCurrency) return;
    setBaseError(null);
    try {
      await setBaseCurrency(pendingBase);
    } catch (e) {
      setBaseError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
          <CardDescription>
            Your base currency is the single currency MonetaFox reports in.
            Foreign and crypto accounts are stored in their own currency and
            converted to your base currency for net worth and reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 sm:max-w-sm">
            <label className="text-muted-foreground text-xs font-medium">
              Base currency
            </label>
            <CurrencySelect
              value={pendingBase}
              onChange={(e) => setPendingBase(e.target.value)}
              disabled={locked}
              aria-label="Base currency"
              data-testid="settings-base-currency"
            />
            {locked ? (
              <p className="text-muted-foreground text-xs">
                Locked: base currency is fixed once accounts or transactions
                exist. Remove all accounts and transactions to change it.
              </p>
            ) : (
              <Button
                size="sm"
                onClick={applyBaseCurrency}
                disabled={!pendingBase || pendingBase === baseCurrency}
                className="sm:self-start"
                data-testid="settings-base-currency-apply"
              >
                {baseCurrency ? 'Change base currency' : 'Set base currency'}
              </Button>
            )}
            {baseError ? (
              <p className="text-destructive text-sm" role="alert">
                {baseError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-muted-foreground text-xs font-medium">
              Manual FX rates
            </label>
            {baseCurrency ? (
              <FxRateEditor
                base={baseCurrency}
                rates={rates}
                onSetRate={setRate}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Choose a base currency before managing FX rates.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <DataExportCard />

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
    </div>
  );
}
