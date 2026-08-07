/**
 * Phase 11 — Cloud sync core.
 *
 * Encrypted-only cloud sync behind a storage-provider INTERFACE so future
 * backends (S3/Dropbox) slot in without touching the sync logic. Exactly ONE
 * active destination is used at a time (Google Drive _or_ OneDrive); switching
 * is a config change, not a rewrite — the caller just selects a different
 * provider id from the registry.
 *
 * The deterministic core (interface + registry + encrypted round-trip) is
 * fully testable with `MemoryProvider` and never touches the network. The
 * `GoogleDriveProvider` / `OneDriveProvider` are real REST implementations
 * built on `fetch` + a bearer access token. OAuth token ACQUISITION is a
 * browser-only seam: each provider is constructed with a `getAccessToken`
 * callback injected by the UI (the UI runs the popup/redirect flow and hands
 * the resulting token here). This module never opens a popup, stores a
 * refresh token, or otherwise touches OAuth itself.
 *
 * Payloads are ENCRYPTED ONLY: `syncUp` runs the store through
 * `exportEncrypted(data, passphrase)` (reused from `@/lib/export`) and uploads
 * the resulting ciphertext; `syncDown` downloads the blob and runs it through
 * `importEncrypted(blob, passphrase)`. A wrong passphrase REJECTS (AES-GCM
 * auth failure re-thrown by `importEncrypted`). Plaintext never leaves this
 * device.
 *
 * No new dependencies: `fetch` is global, crypto comes from `@/lib/crypto`
 * via `@/lib/export`.
 */
import {
  exportEncrypted,
  importEncrypted,
  BACKUP_VERSION,
  type BackupData,
} from '@/lib/export';

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * A cloud storage destination. Implementations address a single blob by `key`
 * (a path-like string, e.g. `monetafox/backup.enc`). `download` returns `null`
 * when nothing is stored at `key` (first-run / deleted), so the caller can
 * distinguish "no remote backup" from a real error (which throws).
 */
export interface CloudStorageProvider {
  /** Stable registry id, e.g. `'memory' | 'google-drive' | 'one-drive'`. */
  id: string;
  /** Human label for the UI dropdown. */
  label: string;
  /** Upload `contents` (ciphertext) to `key`, creating or overwriting it. */
  upload(key: string, contents: string): Promise<void>;
  /** Download the blob at `key`, or `null` if nothing is stored there. */
  download(key: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// MemoryProvider — in-memory Map-backed (local + tests; never network)
// ---------------------------------------------------------------------------

/**
 * In-memory provider: a `Map<key, contents>` scoped to this instance. Used by
 * tests and as a local no-op sink; deliberately NOT registered by default so
 * production code opts into exactly the providers it wants.
 */
export class MemoryProvider implements CloudStorageProvider {
  readonly id = 'memory';
  readonly label = 'Local memory (test only)';
  private readonly store = new Map<string, string>();

  async upload(key: string, contents: string): Promise<void> {
    this.store.set(key, contents);
  }

  async download(key: string): Promise<string | null> {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry = new Map<string, CloudStorageProvider>();

/** Register a provider by its `id`. Re-registering replaces the entry. */
export function registerCloudProvider(p: CloudStorageProvider): void {
  registry.set(p.id, p);
}

/** Resolve a registered provider by id, or `undefined` if not registered. */
export function getCloudProvider(id: string): CloudStorageProvider | undefined {
  return registry.get(id);
}

/** List the ids of all registered providers. */
export function listCloudProviders(): string[] {
  return [...registry.keys()];
}

// ---------------------------------------------------------------------------
// syncUp / syncDown — the encrypted round-trip
// ---------------------------------------------------------------------------

/** Default remote key (path) for the encrypted backup blob. */
export const DEFAULT_SYNC_KEY = 'monetafox/backup.enc';

/**
 * Encrypt `data` with `passphrase` (via `exportEncrypted`) and upload the
 * ciphertext to `provider` at `key`. Returns the key used and the uploaded
 * size in bytes (the ciphertext length, UTF-8 — close enough for the UI's
 * "uploaded N bytes" affordance without re-encoding).
 */
export async function syncUp(
  provider: CloudStorageProvider,
  data: BackupData,
  passphrase: string,
  key: string = DEFAULT_SYNC_KEY,
): Promise<{ key: string; bytes: number }> {
  const blob = await exportEncrypted(data, passphrase);
  await provider.upload(key, blob);
  return { key, bytes: blob.length };
}

/**
 * Download the ciphertext at `key` from `provider` and decrypt it with
 * `passphrase` (via `importEncrypted`). Returns `null` when nothing is stored
 * at `key` (first run). A wrong passphrase REJECTS — `importEncrypted` throws
 * on AES-GCM auth failure, which propagates to the caller.
 */
export async function syncDown(
  provider: CloudStorageProvider,
  passphrase: string,
  key: string = DEFAULT_SYNC_KEY,
): Promise<BackupData | null> {
  const blob = await provider.download(key);
  if (blob === null || blob === undefined) return null;
  return importEncrypted(blob, passphrase);
}

// ---------------------------------------------------------------------------
// GoogleDriveProvider — real REST (Google Drive API v3), bearer-token seam
// ---------------------------------------------------------------------------

/** Injected by the UI: returns a fresh OAuth access token (browser-only). */
export type AccessTokenGetter = () => Promise<string>;

/**
 * Google Drive provider. Drive is id-keyed, not path-keyed, so we resolve the
 * human `key` to a file id via a `list?q=name='<key>'` call, then upload
 * (create-then-update-media) or download (`alt=media`) by id. All requests
 * carry the bearer token from `getAccessToken`.
 *
 * The OAuth flow itself (popup/redirect + refresh) is wired by the UI; this
 * class only consumes the resulting token, so it stays deterministic-test-free
 * (no network in the sandbox) and never stores secrets.
 */
export class GoogleDriveProvider implements CloudStorageProvider {
  readonly id = 'google-drive';
  readonly label = 'Google Drive';
  private readonly getAccessToken: AccessTokenGetter;

  constructor(getAccessToken: AccessTokenGetter) {
    this.getAccessToken = getAccessToken;
  }

  private async authHeaders(): Promise<HeadersInit> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    };
  }

  /** Find the file id of the first file named `key`, or null if none. */
  private async findFileId(key: string): Promise<string | null> {
    const headers = await this.authHeaders();
    const escaped = encodeURIComponent(key);
    const url =
      `https://www.googleapis.com/drive/v3/files` +
      `?q=${encodeURIComponent(`name='${escaped}' and trashed=false`)}` +
      `&fields=files(id,name)&pageSize=1`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status}`);
    const json = (await res.json()) as { files?: { id: string }[] };
    return json.files?.[0]?.id ?? null;
  }

  async upload(key: string, contents: string): Promise<void> {
    const headers = await this.authHeaders();
    const existingId = await this.findFileId(key);
    if (existingId) {
      // Update content of the existing file (media upload endpoint).
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
        { method: 'PATCH', headers, body: contents },
      );
      if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
      return;
    }
    // Create the file (metadata), then upload its content.
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: key, mimeType: 'application/octet-stream' }),
    });
    if (!createRes.ok)
      throw new Error(`Drive create failed: ${createRes.status}`);
    const created = (await createRes.json()) as { id: string };
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`,
      { method: 'PATCH', headers, body: contents },
    );
    if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  }

  async download(key: string): Promise<string | null> {
    const id = await this.findFileId(key);
    if (!id) return null;
    const headers = await this.authHeaders();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
      { headers },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);
    return res.text();
  }
}

// ---------------------------------------------------------------------------
// OneDriveProvider — real REST (Microsoft Graph), bearer-token seam
// ---------------------------------------------------------------------------

/**
 * OneDrive / Graph provider. Graph is path-keyed, which maps cleanly to the
 * `key` argument: `PUT /me/drive/root:/<key>:/content` creates/overwrites, and
 * `GET /me/drive/root:/<key>:/content` returns the bytes (404 → null). As with
 * Drive, the OAuth flow is the UI's job; this class only consumes the token.
 */
export class OneDriveProvider implements CloudStorageProvider {
  readonly id = 'one-drive';
  readonly label = 'OneDrive';
  private readonly getAccessToken: AccessTokenGetter;

  constructor(getAccessToken: AccessTokenGetter) {
    this.getAccessToken = getAccessToken;
  }

  private async authHeaders(
    contentType = 'application/octet-stream',
  ): Promise<HeadersInit> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    };
  }

  async upload(key: string, contents: string): Promise<void> {
    const headers = await this.authHeaders();
    const path = encodeURIComponent(key);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`,
      { method: 'PUT', headers, body: contents },
    );
    if (!res.ok) throw new Error(`OneDrive upload failed: ${res.status}`);
  }

  async download(key: string): Promise<string | null> {
    const headers = await this.authHeaders();
    const path = encodeURIComponent(key);
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`,
      { headers },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneDrive download failed: ${res.status}`);
    return res.text();
  }
}

// Re-export the BackupData shape + version so callers can build payloads
// without importing from two places.
export { BACKUP_VERSION };
export type { BackupData };
