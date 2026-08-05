# Microsoft Money Replacement App Specification

## General Overview
- The application is a Progressive Web Application (PWA) designed to replace Microsoft Money.
- It supports full offline functionality, with data syncing when online.
- Installable with an icon and standalone window behavior.

## User Accounts & Security
- Authentication is via email and password.
- Client-side encryption is mandatory with two modes:
- - Basic: derives key from credentials (with optional entropy via mouse movement).
- - Advanced: user-defined passphrase.
- Single active session at a time.
- MFA and screen reader support planned for future versions.
- Login history and last sync time are logged.
- Users can delete their account and associated data.

## Data Storage & Sync
- Encrypted client-side.
- Supports syncing to one active cloud storage destination: Google Drive or OneDrive.
- Built with an interface architecture for adding future destinations like S3 or Dropbox.
- Sync can be manual, scheduled, or triggered by data changes.

## Currency & Account Support
- Supports single base currency (fixed at setup).
- Foreign and crypto currencies stored in original currency, converted for reporting.
- Investment accounts support multiple assets (e.g., BTC, ETH).
- Historical price tracking for units/shares with manual and automatic updates.

## Import & Export
- Supports importing multiple QIF files as separate accounts.
- Auto-creates accounts from QIF, user can rename/type them.
- Categories imported from QIF and user-expandable.
- Data can be exported as unencrypted QIF.
- Future formats supported via modular import system.
- Supports importing updates into existing accounts.

## Transactions & Budgeting
- Users can add notes/comments to transactions.
- Supports tagging, category assignment, and transaction splitting.
- Transaction filters: date, category, payee.
- Transaction search: category, payee.
- Scheduled transactions supported: auto or manual entry.
- Reconciliation via Cleared and Reconciled statuses.
- Supports transaction templates for quick entry.
- Budget tracking with monthly category limits.

## Reports & Dashboard
- Dashboard includes: recent transactions, upcoming bills, account balances.
- Reports include: Net Worth, Net Worth Over Time, Spending by Category, Spending by Payee, Income vs Expenses.
- All values reported in base currency with exchange conversion.

## UI & UX
- Responsive design for desktop, tablet, and mobile.
- Flexible theming architecture, dark mode support in future.
- Keyboard shortcuts supported in initial version.
- No drag-and-drop or customizable layout initially.

## Error Handling & Updates
- No analytics or telemetry in initial version.
- New versions prompt user to reload (not silent update).
- No versioning or audit logs of transaction changes.

## Future Features (Not in Initial Version)
- Screen reader compatibility.
- Multi-format import/export (CSV, OFX, encrypted).
- Onboarding/tutorial flow.
- Account merging.
- Custom rules and automations.
- Sample/demo data.
- In-app support/help section.
- Multi-currency per account beyond investments.
