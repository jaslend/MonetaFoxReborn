#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 5b (filters / search / templates).

Verifies:
  1. filterTransactions / searchTransactions / categoryTotals exist; the
     transactionTemplates table (Dexie v2) + TransactionTemplate model + repo
     wiring exist; TransactionsPage has filter+search UI and template quick-entry;
     AccountsPage now feeds transactions into balances (carried follow-up).
  2. A hidden contract test pins the query core + a templates round-trip
     (proving the migration), and the Phase 5a/4/3a/1 contract tests still pass.
  3. The (now-deterministic) suite is run TWICE — no order-dependent flakiness.
  4. typecheck + lint + build are green.

Every failure prints WHY. Exit 0 only if all pass.
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

fails: list[str] = []


def fail(msg: str) -> None:
    fails.append(msg)


def pm() -> list[str]:
    if shutil.which("pnpm"):
        return ["pnpm"]
    if shutil.which("corepack"):
        return ["corepack", "pnpm"]
    fail("no pnpm and no corepack on PATH")
    return []


def run(cmd: list[str], cwd: Path, label: str, timeout: int):
    env = dict(os.environ)
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["CI"] = "1"
    try:
        return subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"{label}: `{' '.join(cmd)}` timed out after {timeout}s")
        return None
    except FileNotFoundError as e:
        fail(f"{label}: command not found: {e}")
        return None


def expect0(r, label: str) -> None:
    if r is None:
        return
    if r.returncode != 0:
        tail = (r.stdout + "\n" + r.stderr).strip().splitlines()[-25:]
        fail(f"{label}: exited {r.returncode}:\n    " + "\n    ".join(tail))


def read(p: Path) -> str:
    try:
        return p.read_text(errors="ignore")
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--contract-5b", required=True)
    ap.add_argument("--contract-5a", required=True)
    ap.add_argument("--contract-4", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    tx_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "transactions" / "*.ts")))
    for sym in ["filterTransactions", "searchTransactions", "categoryTotals"]:
        if sym not in tx_blob:
            fail(f"src/lib/transactions does not export {sym}")

    models = read(src / "lib" / "db" / "models.ts")
    if "TransactionTemplate" not in models:
        fail("no TransactionTemplate model")
    database = read(src / "lib" / "db" / "database.ts")
    if "transactionTemplates" not in database:
        fail("database.ts has no transactionTemplates table")
    if "version(2" not in database.replace(" ", ""):
        fail("database.ts did not add a version(2) migration for the new table")
    if "transactionTemplates" not in read(src / "lib" / "db" / "repository.ts"):
        fail("repository.ts does not wire a transactionTemplates repository")

    page = read(src / "pages" / "TransactionsPage.tsx")
    plow = page.lower()
    if "filter" not in plow:
        fail("TransactionsPage has no filter UI")
    if "search" not in plow:
        fail("TransactionsPage has no search UI")
    if "template" not in plow:
        fail("TransactionsPage has no template quick-entry UI")

    # Carried follow-up: AccountsPage must now feed transactions into balances.
    accounts_page = read(src / "pages" / "AccountsPage.tsx")
    if "transaction" not in accounts_page.lower():
        fail("AccountsPage still does not use transactions in balance display (carried 5a follow-up)")

    # --- 2. Contract tests (query core + templates + regression) ---------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_5b).resolve(), src / "lib" / "transactions" / "__phase5b_contract__.test.ts"),
            (Path(args.contract_5a).resolve(), src / "lib" / "transactions" / "__phase5a_contract__.test.ts"),
            (Path(args.contract_4).resolve(), src / "lib" / "currency" / "__phase4_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            expect0(run(
                p + ["exec", "vitest", "run",
                     "src/lib/transactions/__phase5b_contract__.test.ts",
                     "src/lib/transactions/__phase5a_contract__.test.ts",
                     "src/lib/currency/__phase4_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 500), "contract-tests")
        finally:
            for _, d in copies:
                d.unlink(missing_ok=True)

        expect0(run(p + ["run", "typecheck"], root, "typecheck", 300), "typecheck")

        # Suite twice — determinism guard (the suite was made order-independent).
        for i in (1, 2):
            r = run(p + ["run", "test"], root, f"suite-{i}", 400)
            if r is not None and (r.returncode != 0 or re.search(r"\bTests\b[^\n]*\bfailed\b", r.stdout + r.stderr)):
                tail = (r.stdout + "\n" + r.stderr).strip().splitlines()[-20:]
                fail(f"suite run {i}/2 not green:\n    " + "\n    ".join(tail))
                break

        expect0(run(p + ["run", "lint"], root, "lint", 300), "lint")
        expect0(run(p + ["run", "build"], root, "build", 600), "build")
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 5b check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 5b check PASSED: filter/search/category-totals + templates migration verified, "
          "prior contract tests still green, suite deterministic (2/2), typecheck/lint/build clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
