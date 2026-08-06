# MonetaFox Reborn — Implementation Plan

> **Provenance.** This plan supersedes `prompt_plan.md` and `todo.md`, whose
> "✅ COMPLETED" status was a prior attempt's self-report with **no code behind
> it** (this directory holds only markdown). Treat those two files as historical.
> **`spec.md` is the single source of truth for requirements.**

## Scope decision

- **Target:** the MVP defined in `spec.md`, **plus four deferred extras** pulled
  forward: **dark mode**, **CSV import**, **encrypted export**, and
  **onboarding + sample/demo data**.
- **Explicitly parked** (spec's "Future Features", do NOT build in v1, but leave
  clean architectural seams so they slot in later): screen-reader / full WCAG-AA
  program, **OFX** import, account merging, custom rules/automations, in-app help,
  **multi-currency per account** beyond investments, **MFA**, analytics/telemetry,
  transaction audit logs.
- **Cut entirely** (imaginary complexity from the old plan — does not fit a
  client-side IndexedDB PWA): DB "connection pooling", "self-optimizing pool size",
  LRU cache layer, battery optimization, elaborate late-fee/notification-scheduler
  engines. Reintroduce only if a real, measured need appears.

## Tech stack (modernized)

| Concern              | Choice                                  |
| -------------------- | --------------------------------------- |
| Framework            | React 19 + TypeScript + Vite            |
| Styling              | Tailwind CSS + shadcn/ui (light + dark) |
| State                | Zustand                                 |
| Local DB             | IndexedDB via Dexie.js                  |
| Crypto               | WebCrypto (AES-GCM + PBKDF2)            |
| Charts               | Recharts                                |
| PWA                  | vite-plugin-pwa                         |
| Unit/component tests | Vitest + React Testing Library          |
| E2E                  | Playwright                              |
| Package manager      | pnpm                                    |
| CI/CD                | GitHub Actions → static hosting (SPA)   |

## Phased plan

Each phase is independently shippable and ends with an **executable check** (the
thing a Ringer worker's task would be verified against — build passes, tests pass,
a validator asserts the feature is real).

### Phase 0 — Foundation

Scaffold Vite+React+TS; Tailwind + shadcn/ui; ESLint+Prettier+Husky; Vitest + RTL;
Playwright harness; vite-plugin-pwa shell (manifest, service worker, installable);
GitHub Actions CI. **Check:** `pnpm build` + `pnpm test` green in CI; PWA installable.

### Phase 1 — Crypto & encrypted storage

Implement the spec's **two encryption modes**:

- **Basic** — key derived from email+password via PBKDF2 (≥100k iters), with
  _optional_ mouse-movement entropy mixed in at setup.
- **Advanced** — key derived from a user passphrase.
  AES-GCM `CryptoStore`; `EncryptedTable` wrapper giving transparent encrypt/decrypt
  over Dexie. **Check:** round-trip encrypt→decrypt tests for both modes; stored bytes
  are ciphertext (grep proves no plaintext at rest).

### Phase 2 — Auth & session

Email/password login (React Hook Form); **single active session**; login-history and
last-sync-time logging; account+data deletion flow. **Check:** session-enforcement and
deletion tests; second login invalidates the first.

### Phase 3 — Data model & app shell

Dexie schema + TS interfaces: accounts, transactions, categories, budgets, scheduled
transactions, assets/holdings, price history, settings. Zustand stores; React Router
protected routes; core component library; **light/dark theming**. **Check:** schema
migration test; store CRUD tests; theme toggle persists.

- **Carried-over cleanup (from Phase 1): DONE in Phase 3a.** `src/test/setup.ts` now
  guards `localStorage`/`document`; `globalPolyfill.ts` deleted and its imports removed
  from `CryptoStore.ts` and the crypto tests; Phase 1 contract test still passes.

**Phase 3 is split into two sequential rounds:** 3a (data foundation — DONE) and
3b (app shell: react-router, layout/nav, route stubs, protected-route seam, expanded
components, remove the Phase 0 demo counter).

### Phase 4 — Accounts & currency

Account types; **single base currency fixed at setup**; foreign/crypto amounts stored
in original currency with FX-conversion layer for reporting; balances. **Check:** a
foreign-currency transaction reports correctly converted into base currency.

### Phase 5 — Transactions

Entry/edit; notes/comments; tagging; category assignment; **splitting**; filters
(date, category, payee); search (category, payee); reconciliation via **Cleared /
Reconciled** statuses; transaction **templates**. **Check:** split sums to parent;
filter/search return expected sets; reconcile status persists.

### Phase 6 — Budgets

Monthly per-category limits with real-time tracking vs actuals. **Check:** spend
against a budgeted category updates remaining correctly.

### Phase 7 — Import / export

**QIF** multi-file import as separate accounts (auto-create accounts + categories,
user rename/type); import updates into **existing** accounts; Microsoft Money date
format (`DD/MM'YYYY`); **CSV import (extra)** with field mapping; **unencrypted QIF
export** plus **encrypted export (extra)** — a passphrase-protected backup written
through the Phase 1 crypto layer. Modular importer/exporter interface for future
formats (OFX slots in here later). **Check:** sample QIF/CSV imports produce the
expected accounts/transactions; unencrypted export→re-import round-trips; encrypted
export→decrypt→re-import round-trips and the file is ciphertext at rest.

### Phase 8 — Scheduled transactions

Recurrence patterns; **auto or manual** entry on due date. **Check:** a due scheduled
item generates exactly one transaction; manual mode does not auto-post.

### Phase 9 — Investments

Investment accounts with **multiple assets** (e.g. BTC, ETH); historical price
tracking for units/shares, **manual + automatic** updates. **Check:** holding value =
units × latest price; price history renders.

### Phase 10 — Reports & dashboard

Dashboard: recent transactions, upcoming bills, account balances. Reports: **Net
Worth, Net Worth Over Time, Spending by Category, Spending by Payee, Income vs
Expenses**, all in base currency (FX-converted), Recharts visuals. **Check:** each
report computes correct totals against a seeded dataset.

### Phase 11 — Cloud sync

**One active destination** (Google Drive _or_ OneDrive) behind a storage interface
built for future backends (S3/Dropbox). Triggers: manual, scheduled, on-change.
Encrypted payloads only. **Check:** upload→download round-trip restores an identical
encrypted store; switching provider is a config change, not a rewrite.

### Phase 12 — UX polish, onboarding & update flow

Responsive desktop/tablet/mobile; **keyboard shortcuts** (v1 requirement); new-version
**reload prompt** (no silent update); **onboarding flow (extra)** for first-run setup
(base currency, encryption mode); **loadable sample/demo dataset (extra)** for
evaluation, clearly separated from real data. **Check:** shortcut map works; SW update
surfaces a reload prompt; onboarding completes a fresh setup; sample data loads and can
be cleared without touching a real store.

### Phase 13 — Testing & deployment

Coverage targets; Playwright e2e for core flows (login→import→report→sync); production
build + static hosting + PWA update mechanism. **Check:** e2e suite green; deployed
build installs and runs offline.

## Success criteria (from spec)

Offline-first with data persistence; MS-Money-class feature coverage per spec; secure
client-side encryption (both modes); responsive; QIF import/export compatibility;
single-destination cloud sync; installable PWA.

## How this gets built (delegation note)

Planning is done in-context (this file). **The build itself is a Ringer job:** each
phase → a manifest of worktree tasks over the real repo, workers editing directly,
every task verified by the phase's executable **Check** above (build + tests + a
validator), retried once on failure. Phases with disjoint file ownership fan out in
parallel; sequential dependencies (0→1→2→3) gate the rest.
