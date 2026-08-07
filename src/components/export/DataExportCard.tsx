/**
 * Phase 7b — Data export / backup / restore card.
 *
 * Three actions, all client-side (no server):
 *  - Export a chosen account to a QIF file (download via Blob + object URL).
 *  - Export a full ENCRYPTED backup: passphrase prompt → exportEncrypted →
 *    download the blob.
 *  - RESTORE from an encrypted backup: upload blob + passphrase →
 *    importEncrypted → write each restored row through `repositories` from
 *    `useAuthStore`, then refresh the domain stores.
 *
 * Reuses the Phase 1 crypto layer (via `@/lib/export`) and the domain stores.
 * No new dependencies.
 */
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { exportEncrypted, importEncrypted, exportQIF } from '@/lib/export';
import { getExporter } from '@/lib/formats';
import type { Account, Transaction } from '@/lib/db';
import { useAccountStore } from '@/stores/accountStore';
import { useTransactionStore } from '@/stores/transactionStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useAuthStore } from '@/stores/authStore';

/** Trigger a browser download of `text` as `filename`. */
function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Read a File (or user-picked file) as text. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

function qifFilename(account: Account): string {
  const safe =
    account.name.replace(/[^a-z0-9-]+/gi, '_').toLowerCase() || 'account';
  return `${safe}.qif`;
}

export function DataExportCard() {
  const accounts = useAccountStore((s) => s.items);
  const transactions = useTransactionStore((s) => s.items);
  const categories = useCategoryStore((s) => s.items);
  const budgets = useBudgetStore((s) => s.items);
  const repositories = useAuthStore((s) => s.repositories);

  const loadAccounts = useAccountStore((s) => s.load);
  const loadTransactions = useTransactionStore((s) => s.load);
  const loadCategories = useCategoryStore((s) => s.load);
  const loadBudgets = useBudgetStore((s) => s.load);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [status, setStatus] = useState<{
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [restoreBlob, setRestoreBlob] = useState<string | null>(null);

  const account = accounts.find((a) => a.id === selectedAccountId) ?? null;

  const handleExportQif = async () => {
    setStatus(null);
    if (!account) {
      setStatus({ kind: 'err', msg: 'Choose an account first.' });
      return;
    }
    const exporter = getExporter('qif') ?? exportQIF;
    const accountTxns: Transaction[] = transactions.filter(
      (t) => t.accountId === account.id,
    );
    const text = exporter(account, accountTxns);
    downloadText(qifFilename(account), text, 'application/qif');
    setStatus({
      kind: 'ok',
      msg: `Exported ${accountTxns.length} transaction(s) to ${qifFilename(account)}.`,
    });
  };

  const handleBackup = async () => {
    setStatus(null);
    if (!backupPassphrase) {
      setStatus({ kind: 'err', msg: 'Enter a passphrase for the backup.' });
      return;
    }
    setBusy(true);
    try {
      const data = {
        version: 1,
        accounts,
        transactions,
        categories,
        budgets,
      };
      const blob = await exportEncrypted(data, backupPassphrase);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(`monetafox-backup-${stamp}.mfb`, blob, 'application/json');
      setStatus({ kind: 'ok', msg: 'Encrypted backup downloaded.' });
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setStatus(null);
    if (!restoreBlob) {
      setStatus({ kind: 'err', msg: 'Choose a backup file first.' });
      return;
    }
    if (!restorePassphrase) {
      setStatus({ kind: 'err', msg: 'Enter the backup passphrase.' });
      return;
    }
    if (!repositories) {
      setStatus({ kind: 'err', msg: 'Vault is not unlocked.' });
      return;
    }
    setBusy(true);
    try {
      const data = await importEncrypted(restoreBlob, restorePassphrase);

      // Write each restored row through the encrypted repositories, then
      // refresh the in-memory store projections.
      const writes: Promise<unknown>[] = [];
      for (const a of data.accounts) {
        writes.push(repositories.accounts.put(a as Account));
      }
      for (const t of data.transactions) {
        writes.push(repositories.transactions.put(t as Transaction));
      }
      for (const c of data.categories) {
        writes.push(repositories.categories.put(c as never));
      }
      for (const b of data.budgets) {
        writes.push(repositories.budgets.put(b as never));
      }
      await Promise.all(writes);

      await Promise.all([
        loadAccounts(),
        loadTransactions(),
        loadCategories(),
        loadBudgets(),
      ]);

      setStatus({
        kind: 'ok',
        msg: `Restored ${data.accounts.length} account(s), ${data.transactions.length} transaction(s).`,
      });
      setRestoreBlob(null);
      setRestorePassphrase('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setRestoreBlob(text);
      setStatus(null);
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data</CardTitle>
        <CardDescription>
          Export an account to QIF, or create and restore an encrypted backup of
          all your accounts, transactions, categories, and budgets.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        {/* QIF export */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Export account to QIF</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="rounded border bg-background px-2 py-1 text-sm"
              data-testid="export-account-select"
              aria-label="Account to export"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={handleExportQif}
              disabled={!account}
              data-testid="export-qif-button"
            >
              Download QIF
            </Button>
          </div>
        </section>

        {/* Encrypted backup */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Encrypted backup</h3>
          <p className="text-muted-foreground text-xs">
            A passphrase-protected JSON file. Keep the passphrase safe — it
            cannot be recovered.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={backupPassphrase}
              onChange={(e) => setBackupPassphrase(e.target.value)}
              placeholder="Backup passphrase"
              className="rounded border bg-background px-2 py-1 text-sm"
              aria-label="Backup passphrase"
              data-testid="backup-passphrase"
            />
            <Button
              size="sm"
              onClick={handleBackup}
              disabled={busy || !backupPassphrase}
              data-testid="backup-button"
            >
              Download encrypted backup
            </Button>
          </div>
        </section>

        {/* Restore */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Restore from backup</h3>
          <p className="text-muted-foreground text-xs">
            Restoring writes the backup's rows back into your vault (overwriting
            same-id rows) and refreshes the stores.
          </p>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".mfb,.json,application/json,text/plain"
              onChange={(e) => onFilePicked(e.target.files?.[0])}
              className="text-sm"
              data-testid="restore-file-input"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                value={restorePassphrase}
                onChange={(e) => setRestorePassphrase(e.target.value)}
                placeholder="Backup passphrase"
                className="rounded border bg-background px-2 py-1 text-sm"
                aria-label="Restore passphrase"
                data-testid="restore-passphrase"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleRestore}
                disabled={busy || !restoreBlob || !restorePassphrase}
                data-testid="restore-button"
              >
                Restore
              </Button>
            </div>
          </div>
        </section>

        {status ? (
          <p
            role={status.kind === 'err' ? 'alert' : 'status'}
            className={
              status.kind === 'err'
                ? 'text-destructive text-sm'
                : 'text-muted-foreground text-sm'
            }
            data-testid="data-export-status"
          >
            {status.msg}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
