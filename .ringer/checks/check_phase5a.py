#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 5a (transactions: entry/splits/reconcile).

Verifies:
  1. A transactions module (splitSum, isSplitBalanced) exists; the Transaction
     model gained splits/TransactionSplit; the transaction store has real CRUD;
     TransactionsPage surfaces entry/edit, a split editor, and Cleared/Reconciled.
  2. A hidden contract test pins split arithmetic + balance-by-parent; the Phase
     4/3a/1 contract tests still pass (regression).
  3. typecheck + suite + lint + build are green.

Every failure prints WHY. Exit 0 only if all pass.
"""
from __future__ import annotations

import argparse
import glob
import os
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


def run(cmd: list[str], cwd: Path, label: str, timeout: int) -> bool:
    env = dict(os.environ)
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["CI"] = "1"
    try:
        r = subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"{label}: `{' '.join(cmd)}` timed out after {timeout}s")
        return False
    except FileNotFoundError as e:
        fail(f"{label}: command not found: {e}")
        return False
    if r.returncode != 0:
        tail = (r.stdout + "\n" + r.stderr).strip().splitlines()[-30:]
        fail(f"{label}: exited {r.returncode}:\n    " + "\n    ".join(tail))
        return False
    return True


def read(p: Path) -> str:
    try:
        return p.read_text(errors="ignore")
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--contract-5a", required=True)
    ap.add_argument("--contract-4", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Modules, model, store, UI ------------------------------------
    tx_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "transactions" / "*.ts")))
    for sym in ["splitSum", "isSplitBalanced"]:
        if sym not in tx_blob:
            fail(f"src/lib/transactions does not export {sym}")

    models = read(src / "lib" / "db" / "models.ts")
    if "splits" not in models or "TransactionSplit" not in models:
        fail("Transaction model has no splits / TransactionSplit type")

    store = read(src / "stores" / "transactionStore.ts")
    slow = store.lower()
    if "add" not in slow or ("update" not in slow and "put" not in slow) or ("remove" not in slow and "delete" not in slow):
        fail("transactionStore is missing real CRUD actions (add/update/remove)")

    page = read(src / "pages" / "TransactionsPage.tsx")
    plow = page.lower()
    if "transactionstore" not in plow and "usetransactionstore" not in plow:
        fail("TransactionsPage is not wired to the transaction store")
    if "split" not in plow:
        fail("TransactionsPage has no split editor")
    if "cleared" not in plow or "reconcil" not in plow:
        fail("TransactionsPage does not surface Cleared/Reconciled reconciliation")

    # --- 2. Contract tests (split core + regression) ---------------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_5a).resolve(), src / "lib" / "transactions" / "__phase5a_contract__.test.ts"),
            (Path(args.contract_4).resolve(), src / "lib" / "currency" / "__phase4_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/transactions/__phase5a_contract__.test.ts",
                     "src/lib/currency/__phase4_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 500,
            )
        finally:
            for _, d in copies:
                d.unlink(missing_ok=True)
        run(p + ["run", "typecheck"], root, "typecheck", 300)
        run(p + ["run", "test"], root, "worker-tests", 600)
        run(p + ["run", "lint"], root, "lint", 300)
        run(p + ["run", "build"], root, "build", 600)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 5a check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 5a check PASSED: split arithmetic + balance-by-parent verified, transaction CRUD "
          "with split editor and reconciliation present, prior contract tests still green, "
          "typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
