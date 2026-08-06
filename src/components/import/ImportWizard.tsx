/**
 * Phase 7a — multi-step import wizard.
 *
 * Steps:
 *  1. Select files (QIF and/or CSV; multiple QIF files become separate
 *     accounts). Each file is parsed immediately by extension.
 *  2. Configure: per QIF file set the new account's name/type/currency; per CSV
 *     file confirm/adjust the auto-detected column mapping, date format, and
 *     target account (new or existing).
 *  3. Preview parsed rows with duplicate flags (vs. the target account's
 *     existing transactions).
 *  4. Run `importTransactions` for each file.
 *  5. Summary of created / skipped / accounts / categories.
 *
 * The wizard receives the encrypted `Repositories` (from useAuthStore) and the
 * current account/transaction lists (for the existing-account picker and the
 * duplicate preview); the authoritative dedupe happens inside
 * `importTransactions` against the live DB. `onImported` is called once a batch
 * succeeds so the parent page can refresh the stores.
 */
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CurrencySelect } from '@/components/currency/CurrencySelect';
import { cn } from '@/lib/utils';
import type { Account, AccountType, Repositories, Transaction } from '@/lib/db';
import {
  detectCsvMapping,
  importTransactions,
  parseCSV,
  parseCsvText,
  parseQIF,
  type ImportResult,
} from '@/lib/import';
import type { CsvMapping, ParsedTransaction } from '@/lib/import/types';

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' },
  { value: 'loan', label: 'Loan' },
];

const DATE_FORMATS: CsvMapping['dateFormat'][] = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
];

type Step = 'select' | 'configure' | 'preview' | 'importing' | 'summary';

type JobFormat = 'qif' | 'csv';

interface BaseJob {
  id: string;
  fileName: string;
  format: JobFormat;
  raw: string;
  parsed: ParsedTransaction[];
}

interface QifJob extends BaseJob {
  format: 'qif';
  qifType?: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
}

interface CsvJob extends BaseJob {
  format: 'csv';
  headers: string[];
  mapping: CsvMapping;
  targetMode: 'new' | 'existing';
  newAccountName: string;
  newAccountType: AccountType;
  currency: string;
  existingAccountId: string;
}

type Job = QifJob | CsvJob;

interface JobResult {
  fileName: string;
  result: ImportResult;
  error?: string;
}

export interface ImportWizardProps {
  open: boolean;
  repositories: Repositories | null;
  baseCurrency: string;
  accounts: Account[];
  transactions: Transaction[];
  onImported: () => void | Promise<void>;
  onClose: () => void;
}

const inputCls =
  'border-border bg-background ring-offset-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border px-3 py-1 text-sm outline-none focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-2';

function detectFormat(fileName: string): JobFormat {
  return fileName.toLowerCase().endsWith('.qif') ? 'qif' : 'csv';
}

function newJobId(): string {
  return crypto.randomUUID();
}

async function buildJob(file: File, baseCurrency: string): Promise<Job> {
  const raw = await file.text();
  const format = detectFormat(file.name);
  if (format === 'qif') {
    const { type, transactions } = parseQIF(raw);
    const base = file.name.replace(/\.qif$/i, '');
    const job: QifJob = {
      id: newJobId(),
      fileName: file.name,
      format: 'qif',
      raw,
      parsed: transactions,
      qifType: type,
      accountName: base,
      accountType: type?.toLowerCase().includes('cash') ? 'cash' : 'checking',
      currency: baseCurrency,
    };
    return job;
  }
  // csv
  const rows = parseCsvText(raw);
  const headers = rows[0] ?? [];
  const detected = detectCsvMapping(headers);
  const mapping: CsvMapping = {
    date: detected.date ?? headers[0] ?? '',
    amount: detected.amount ?? headers[1] ?? '',
    payee: detected.payee,
    category: detected.category,
    memo: detected.memo,
    dateFormat: 'DD/MM/YYYY',
  };
  const parsed = parseCSV(raw, mapping);
  const job: CsvJob = {
    id: newJobId(),
    fileName: file.name,
    format: 'csv',
    raw,
    parsed,
    headers,
    mapping,
    targetMode: 'new',
    newAccountName: file.name.replace(/\.csv$/i, ''),
    newAccountType: 'checking',
    currency: baseCurrency,
    existingAccountId: '',
  };
  return job;
}

export function ImportWizard({
  open,
  repositories,
  baseCurrency,
  accounts,
  transactions,
  onImported,
  onClose,
}: ImportWizardProps) {
  const [step, setStep] = useState<Step>('select');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [results, setResults] = useState<JobResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = () => {
    setJobs([]);
    setResults([]);
    setStep('select');
    setError(null);
    setParseError(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleFiles = async (fileList: FileList) => {
    setParseError(null);
    try {
      const built: Job[] = [];
      for (const file of Array.from(fileList)) {
        built.push(await buildJob(file, baseCurrency));
      }
      setJobs(built);
      if (built.length > 0) setStep('configure');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  };

  const reparseCsv = (job: CsvJob): CsvJob => ({
    ...job,
    parsed: parseCSV(job.raw, job.mapping),
  });

  const updateJob = (id: string, patch: Partial<Job>) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id !== id) return j;
        const merged = { ...j, ...patch } as Job;
        if (merged.format === 'csv') return reparseCsv(merged as CsvJob);
        return merged;
      }),
    );
  };

  const duplicateIndex = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const job of jobs) {
      const targetId =
        job.format === 'qif'
          ? null
          : job.targetMode === 'existing'
            ? job.existingAccountId
            : null;
      const dupes = new Set<number>();
      if (targetId) {
        const existing = transactions
          .filter((t) => t.accountId === targetId)
          .map((t) => ({ date: t.date, amount: t.amount, payee: t.payee }));
        job.parsed.forEach((p, i) => {
          if (
            existing.some(
              (e) =>
                e.date === p.date &&
                e.amount === p.amount &&
                (e.payee ?? '') === (p.payee ?? ''),
            )
          ) {
            dupes.add(i);
          }
        });
      }
      map.set(job.id, dupes);
    }
    return map;
  }, [jobs, transactions]);

  const totalRows = jobs.reduce((n, j) => n + j.parsed.length, 0);

  const runImport = async () => {
    if (!repositories) {
      setError('Not unlocked — no repository available.');
      return;
    }
    setStep('importing');
    setBusy(true);
    setError(null);
    const out: JobResult[] = [];
    try {
      for (const job of jobs) {
        try {
          const target =
            job.format === 'qif'
              ? {
                  mode: 'new' as const,
                  name: job.accountName.trim() || job.fileName,
                  type: job.accountType,
                  currency: job.currency,
                }
              : job.targetMode === 'new'
                ? {
                    mode: 'new' as const,
                    name: job.newAccountName.trim() || job.fileName,
                    type: job.newAccountType,
                    currency: job.currency,
                  }
                : {
                    mode: 'existing' as const,
                    accountId: job.existingAccountId,
                  };
          const result = await importTransactions(repositories, {
            parsed: job.parsed,
            target,
            autoCreateCategories: true,
          });
          out.push({ fileName: job.fileName, result });
        } catch (e) {
          out.push({
            fileName: job.fileName,
            result: {
              accountId: '',
              created: 0,
              skipped: 0,
              accountsCreated: 0,
              categoriesCreated: 0,
            },
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      setResults(out);
      const anyOk = out.some((r) => !r.error);
      if (anyOk) {
        await onImported();
      }
      setStep('summary');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-wizard-title"
      data-testid="import-wizard-dialog"
    >
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden">
        <CardHeader>
          <CardTitle id="import-wizard-title">Import transactions</CardTitle>
          <p
            className="text-muted-foreground text-sm"
            data-testid="import-step"
          >
            Step {stepLabel(step)} · {jobs.length} file(s) · {totalRows} row(s)
          </p>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto">
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}

          {step === 'select' ? (
            <SelectStep onFiles={handleFiles} parseError={parseError} />
          ) : null}

          {step === 'configure' ? (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <JobConfig
                  key={job.id}
                  job={job}
                  accounts={accounts}
                  onChange={(patch) => updateJob(job.id, patch)}
                />
              ))}
            </div>
          ) : null}

          {step === 'preview' ? (
            <div className="flex flex-col gap-4">
              {jobs.map((job) => (
                <PreviewJob
                  key={job.id}
                  job={job}
                  dupes={duplicateIndex.get(job.id) ?? new Set<number>()}
                  accounts={accounts}
                />
              ))}
            </div>
          ) : null}

          {step === 'importing' ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Importing…
            </p>
          ) : null}

          {step === 'summary' ? <SummaryStep results={results} /> : null}
        </CardContent>

        <CardFooter className="flex justify-between gap-2">
          <Button variant="ghost" onClick={close} disabled={busy}>
            {step === 'summary' ? 'Done' : 'Cancel'}
          </Button>
          <div className="flex gap-2">
            {step === 'configure' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('select')}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('preview')}
                  disabled={busy || totalRows === 0}
                  data-testid="import-preview"
                >
                  Preview
                </Button>
              </>
            ) : null}
            {step === 'preview' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep('configure')}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  onClick={runImport}
                  disabled={busy || !repositories}
                  data-testid="import-run"
                >
                  Import
                </Button>
              </>
            ) : null}
            {step === 'summary' ? (
              <Button onClick={close} data-testid="import-close">
                Close
              </Button>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'select':
      return '1 — Choose files';
    case 'configure':
      return '2 — Configure';
    case 'preview':
      return '3 — Preview';
    case 'importing':
      return '4 — Import';
    case 'summary':
      return '5 — Summary';
  }
}

function SelectStep({
  onFiles,
  parseError,
}: {
  onFiles: (files: FileList) => void;
  parseError: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        Choose one or more <code>.qif</code> and/or <code>.csv</code> files.
        Multiple QIF files are imported as separate accounts.
      </p>
      <input
        type="file"
        multiple
        accept=".qif,.csv,text/csv,application/vnd.ms-excel"
        className="text-sm"
        data-testid="import-file-input"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onFiles(e.target.files);
          }
        }}
      />
      {parseError ? (
        <p className="text-destructive text-sm" role="alert">
          {parseError}
        </p>
      ) : null}
    </div>
  );
}

function JobConfig({
  job,
  accounts,
  onChange,
}: {
  job: Job;
  accounts: Account[];
  onChange: (patch: Partial<Job>) => void;
}) {
  if (job.format === 'qif') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {job.fileName}{' '}
            <span className="text-muted-foreground text-xs font-normal">
              QIF{job.qifType ? ` · !Type:${job.qifType}` : ''} ·{' '}
              {job.parsed.length} rows
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabelledInput
            label="Account name"
            value={job.accountName}
            onChange={(v) => onChange({ accountName: v } as Partial<QifJob>)}
            testId="qif-account-name"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Account type
            </label>
            <select
              className={inputCls}
              value={job.accountType}
              onChange={(e) =>
                onChange({
                  accountType: e.target.value as AccountType,
                } as Partial<QifJob>)
              }
              data-testid="qif-account-type"
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Currency
            </label>
            <CurrencySelect
              value={job.currency}
              onChange={(e) =>
                onChange({ currency: e.target.value } as Partial<QifJob>)
              }
              data-testid="qif-account-currency"
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  // CSV job
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {job.fileName}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            CSV · {job.parsed.length} rows
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeaderSelect
            label="Date"
            headers={job.headers}
            value={job.mapping.date}
            onChange={(v) =>
              onChange({
                mapping: { ...job.mapping, date: v },
              } as Partial<CsvJob>)
            }
          />
          <HeaderSelect
            label="Amount"
            headers={job.headers}
            value={job.mapping.amount}
            onChange={(v) =>
              onChange({
                mapping: { ...job.mapping, amount: v },
              } as Partial<CsvJob>)
            }
          />
          <HeaderSelect
            label="Payee"
            headers={job.headers}
            value={job.mapping.payee ?? ''}
            allowEmpty
            onChange={(v) =>
              onChange({
                mapping: {
                  ...job.mapping,
                  payee: v === '' ? undefined : v,
                },
              } as Partial<CsvJob>)
            }
          />
          <HeaderSelect
            label="Category"
            headers={job.headers}
            value={job.mapping.category ?? ''}
            allowEmpty
            onChange={(v) =>
              onChange({
                mapping: {
                  ...job.mapping,
                  category: v === '' ? undefined : v,
                },
              } as Partial<CsvJob>)
            }
          />
          <HeaderSelect
            label="Memo"
            headers={job.headers}
            value={job.mapping.memo ?? ''}
            allowEmpty
            onChange={(v) =>
              onChange({
                mapping: {
                  ...job.mapping,
                  memo: v === '' ? undefined : v,
                },
              } as Partial<CsvJob>)
            }
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              Date format
            </label>
            <select
              className={inputCls}
              value={job.mapping.dateFormat ?? 'DD/MM/YYYY'}
              onChange={(e) =>
                onChange({
                  mapping: {
                    ...job.mapping,
                    dateFormat: e.target.value as CsvMapping['dateFormat'],
                  },
                } as Partial<CsvJob>)
              }
              data-testid="csv-date-format"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-border border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Target account
          </p>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`target-${job.id}`}
                checked={job.targetMode === 'new'}
                onChange={() =>
                  onChange({ targetMode: 'new' } as Partial<CsvJob>)
                }
              />
              New account
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`target-${job.id}`}
                checked={job.targetMode === 'existing'}
                onChange={() =>
                  onChange({ targetMode: 'existing' } as Partial<CsvJob>)
                }
              />
              Existing account
            </label>
          </div>
          {job.targetMode === 'new' ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <LabelledInput
                label="Account name"
                value={job.newAccountName}
                onChange={(v) =>
                  onChange({ newAccountName: v } as Partial<CsvJob>)
                }
                testId="csv-account-name"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs font-medium">
                  Account type
                </label>
                <select
                  className={inputCls}
                  value={job.newAccountType}
                  onChange={(e) =>
                    onChange({
                      newAccountType: e.target.value as AccountType,
                    } as Partial<CsvJob>)
                  }
                  data-testid="csv-account-type"
                >
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground text-xs font-medium">
                  Currency
                </label>
                <CurrencySelect
                  value={job.currency}
                  onChange={(e) =>
                    onChange({ currency: e.target.value } as Partial<CsvJob>)
                  }
                  data-testid="csv-account-currency"
                />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium">
                Account
              </label>
              <select
                className={inputCls}
                value={job.existingAccountId}
                onChange={(e) =>
                  onChange({
                    existingAccountId: e.target.value,
                  } as Partial<CsvJob>)
                }
                data-testid="csv-existing-account"
              >
                <option value="" disabled>
                  Select an account…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HeaderSelect({
  label,
  headers,
  value,
  allowEmpty,
  onChange,
}: {
  label: string;
  headers: string[];
  value: string;
  allowEmpty?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-muted-foreground text-xs font-medium">
        {label}
      </label>
      <select
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty ? <option value="">— none —</option> : null}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewJob({
  job,
  dupes,
  accounts,
}: {
  job: Job;
  dupes: Set<number>;
  accounts: Account[];
}) {
  const targetLabel =
    job.format === 'qif'
      ? `new account “${job.accountName}”`
      : job.targetMode === 'new'
        ? `new account “${job.newAccountName}”`
        : `existing “${accounts.find((a) => a.id === job.existingAccountId)?.name ?? '?'}”`;
  const dupeCount = dupes.size;
  const show = job.parsed.slice(0, 50);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {job.fileName}{' '}
          <span className="text-muted-foreground text-xs font-normal">
            → {targetLabel} · {job.parsed.length} rows
            {dupeCount > 0 ? ` · ${dupeCount} duplicate(s)` : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 pr-2">Date</th>
              <th className="py-1 pr-2">Payee</th>
              <th className="py-1 pr-2">Amount</th>
              <th className="py-1 pr-2">Category</th>
              <th className="py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {show.map((p, i) => (
              <tr key={i} className="border-border border-t">
                <td className="py-1 pr-2">{p.date}</td>
                <td className="py-1 pr-2">{p.payee ?? ''}</td>
                <td className="py-1 pr-2 tabular-nums">
                  {p.amount.toFixed(2)}
                </td>
                <td className="py-1 pr-2">{p.category ?? ''}</td>
                <td className="py-1 pr-2">
                  {dupes.has(i) ? (
                    <span className="text-muted-foreground text-xs">
                      duplicate
                    </span>
                  ) : (
                    <span className="text-xs">new</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {job.parsed.length > show.length ? (
          <p className="text-muted-foreground mt-2 text-xs">
            …and {job.parsed.length - show.length} more
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SummaryStep({ results }: { results: JobResult[] }) {
  const totals = results.reduce(
    (acc, r) => {
      acc.created += r.result.created;
      acc.skipped += r.result.skipped;
      acc.accountsCreated += r.result.accountsCreated;
      acc.categoriesCreated += r.result.categoriesCreated;
      return acc;
    },
    { created: 0, skipped: 0, accountsCreated: 0, categoriesCreated: 0 },
  );
  return (
    <div className="flex flex-col gap-3" data-testid="import-summary">
      <Card>
        <CardContent className="py-4">
          <p className="text-muted-foreground text-sm">Totals</p>
          <p className="text-lg font-semibold">
            {totals.created} created · {totals.skipped} skipped ·{' '}
            {totals.accountsCreated} account(s) · {totals.categoriesCreated}{' '}
            categor(y/ies)
          </p>
        </CardContent>
      </Card>
      {results.map((r, i) => (
        <Card key={i}>
          <CardContent className="py-3">
            <p className="text-sm font-medium">{r.fileName}</p>
            {r.error ? (
              <p className="text-destructive text-xs">Error: {r.error}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {r.result.created} created · {r.result.skipped} skipped ·{' '}
                {r.result.accountsCreated} account(s) ·{' '}
                {r.result.categoriesCreated} categor(y/ies)
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Labelled text-input component. */
function LabelledInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-muted-foreground text-xs font-medium">
        {label}
      </label>
      <input
        className={cn(inputCls)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}
