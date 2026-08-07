/**
 * Phase 11 — Cloud Sync settings card.
 *
 * Lets the user pick the ONE active cloud destination (Google Drive or
 * OneDrive), Connect it (invokes the provider's OAuth token getter — a
 * best-effort browser flow wired here), and run manual Upload / Download /
 * Full Sync. Shows a connection + last-sync status indicator and the trigger
 * settings (manual / scheduled / on-change).
 *
 * The OAuth acquisition lives in the UI seam: `connectProvider` resolves to a
 * `getAccessToken` callback that this card builds from a browser popup flow.
 * In this sandbox there is no real OAuth, so `bestEffortOAuth` is a stub that
 * documents the seam — a real build replaces it with the provider's SDK. The
 * sync store + providers never open a popup themselves.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSyncStore, type SyncTrigger } from '@/stores/syncStore';
import type { AccessTokenGetter } from '@/lib/sync';

const PROVIDER_OPTIONS: { id: string; label: string }[] = [
  { id: 'google-drive', label: 'Google Drive' },
  { id: 'one-drive', label: 'OneDrive' },
];

/**
 * Best-effort OAuth token getter. In a real browser build this opens the
 * provider's OAuth popup/redirect and resolves to the access token; here it
 * is a stub that surfaces the seam. The providers consume the returned token
 * via the injected `getAccessToken` callback.
 */
async function bestEffortOAuth(providerId: string): Promise<AccessTokenGetter> {
  // Browser-only seam: a real implementation would use Google/MS identity SDK
  // here. We return a getter that throws a clear message so the wiring is
  // visible without a live OAuth config in this sandbox.
  return async () => {
    throw new Error(
      `OAuth for ${providerId} is not configured in this build (browser-only seam).`,
    );
  };
}

function formatLastSync(at: number | null): string {
  if (!at) return 'Never';
  return new Date(at).toLocaleString();
}

export function SyncSettingsCard() {
  const activeProviderId = useSyncStore((s) => s.activeProviderId);
  const connected = useSyncStore((s) => s.connected);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const syncStatus = useSyncStore((s) => s.syncStatus);
  const lastError = useSyncStore((s) => s.lastError);
  const trigger = useSyncStore((s) => s.trigger);
  const scheduleIntervalMs = useSyncStore((s) => s.scheduleIntervalMs);

  const setActiveProvider = useSyncStore((s) => s.setActiveProvider);
  const setTrigger = useSyncStore((s) => s.setTrigger);
  const setScheduleInterval = useSyncStore((s) => s.setScheduleInterval);
  const setSyncPassphrase = useSyncStore((s) => s.setSyncPassphrase);
  const connect = useSyncStore((s) => s.connect);
  const disconnect = useSyncStore((s) => s.disconnect);
  const uploadNow = useSyncStore((s) => s.uploadNow);
  const downloadNow = useSyncStore((s) => s.downloadNow);
  const fullSync = useSyncStore((s) => s.fullSync);

  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<{
    kind: 'ok' | 'err';
    msg: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const busySync = syncStatus === 'syncing';

  const handleConnect = async () => {
    if (!activeProviderId) return;
    try {
      const tokenGetter = await bestEffortOAuth(activeProviderId);
      connect(activeProviderId, tokenGetter);
      setStatus({ kind: 'ok', msg: `Connected to ${activeProviderId}.` });
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const ensurePassphrase = (): string | null => {
    if (!passphrase) {
      setStatus({ kind: 'err', msg: 'Enter your sync passphrase first.' });
      return null;
    }
    setSyncPassphrase(passphrase);
    return passphrase;
  };

  const run = async (fn: (pp: string) => Promise<void>, label: string) => {
    const pp = ensurePassphrase();
    if (!pp) return;
    setBusy(true);
    setStatus(null);
    try {
      await fn(pp);
      setStatus({ kind: 'ok', msg: `${label} complete.` });
    } catch (e) {
      setStatus({
        kind: 'err',
        msg: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud sync</CardTitle>
        <CardDescription>
          Sync an ENCRYPTED backup of your vault to one active cloud destination
          at a time. Payloads are encrypted with your sync passphrase before
          they ever leave this device.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Active destination + connection */}
        <section className="flex flex-col gap-2">
          <label className="text-muted-foreground text-xs font-medium">
            Active destination
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={activeProviderId ?? ''}
              onChange={(e) => setActiveProvider(e.target.value || null)}
              className="rounded border bg-background px-2 py-1 text-sm"
              aria-label="Active cloud destination"
              data-testid="sync-provider-select"
            >
              <option value="">None</option>
              {PROVIDER_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {connected ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  disconnect();
                  setStatus({ kind: 'ok', msg: 'Disconnected.' });
                }}
                data-testid="sync-disconnect-button"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={!activeProviderId}
                data-testid="sync-connect-button"
              >
                Connect
              </Button>
            )}
            <span
              className="text-xs"
              data-testid="sync-connection-status"
              aria-label="Connection status"
            >
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
        </section>

        {/* Sync passphrase (in-memory only) */}
        <section className="flex flex-col gap-2">
          <label className="text-muted-foreground text-xs font-medium">
            Sync passphrase
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Sync passphrase"
            className="rounded border bg-background px-2 py-1 text-sm sm:max-w-sm"
            aria-label="Sync passphrase"
            data-testid="sync-passphrase"
          />
          <p className="text-muted-foreground text-xs">
            Used to encrypt uploads and decrypt downloads. Kept in memory only
            for this session.
          </p>
        </section>

        {/* Manual actions */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Manual sync</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => run((pp) => uploadNow(pp), 'Upload')}
              disabled={busy || busySync || !connected || !passphrase}
              data-testid="sync-upload-button"
            >
              Upload
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run((pp) => downloadNow(pp), 'Download')}
              disabled={busy || busySync || !connected || !passphrase}
              data-testid="sync-download-button"
            >
              Download
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => run((pp) => fullSync(pp), 'Full sync')}
              disabled={busy || busySync || !connected || !passphrase}
              data-testid="sync-fullsync-button"
            >
              Full sync
            </Button>
          </div>
        </section>

        {/* Trigger settings */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Trigger</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as SyncTrigger)}
              className="rounded border bg-background px-2 py-1 text-sm"
              aria-label="Sync trigger"
              data-testid="sync-trigger-select"
            >
              <option value="manual">Manual</option>
              <option value="scheduled">Scheduled</option>
              <option value="on-change">On data change</option>
            </select>
            {trigger === 'scheduled' ? (
              <select
                value={scheduleIntervalMs}
                onChange={(e) => setScheduleInterval(Number(e.target.value))}
                className="rounded border bg-background px-2 py-1 text-sm"
                aria-label="Schedule interval"
                data-testid="sync-schedule-interval"
              >
                <option value={5 * 60 * 1000}>Every 5 min</option>
                <option value={15 * 60 * 1000}>Every 15 min</option>
                <option value={60 * 60 * 1000}>Every hour</option>
              </select>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            Scheduled and on-change triggers only run while a passphrase is
            loaded, so they never prompt you.
          </p>
        </section>

        {/* Status indicator */}
        <section className="flex flex-col gap-1 text-sm">
          <div className="flex items-center gap-2">
            <span
              data-testid="sync-status"
              className={
                syncStatus === 'error'
                  ? 'text-destructive'
                  : syncStatus === 'syncing'
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground'
              }
            >
              {syncStatus === 'error'
                ? 'Sync error'
                : syncStatus === 'syncing'
                  ? 'Syncing…'
                  : 'Idle'}
            </span>
            <span className="text-muted-foreground" data-testid="sync-last">
              Last sync: {formatLastSync(lastSyncAt)}
            </span>
          </div>
          {lastError ? (
            <p
              className="text-destructive text-sm"
              role="alert"
              data-testid="sync-error"
            >
              {lastError}
            </p>
          ) : null}
          {status ? (
            <p
              role={status.kind === 'err' ? 'alert' : 'status'}
              className={
                status.kind === 'err'
                  ? 'text-destructive text-sm'
                  : 'text-muted-foreground text-sm'
              }
              data-testid="sync-action-status"
            >
              {status.msg}
            </p>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
