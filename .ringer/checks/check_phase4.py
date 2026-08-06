#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 4 (accounts & currency).

Verifies:
  1. A currency module (convertToBase) and an accounts module (accountBalance,
     netWorthInBase) exist; AccountsPage has real create/edit/archive CRUD wired
     to the account store; base-currency + FX-rate management is surfaced.
  2. A hidden contract test pins the deterministic core (FX conversion +
     balance/net-worth math), and the Phase 3a/2/1 contract tests still pass.
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
    ap.add_argument("--contract-4", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-2", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Modules & UI --------------------------------------------------
    currency_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "currency" / "*.ts")))
    if "convertToBase" not in currency_blob:
        fail("src/lib/currency does not export convertToBase")
    accounts_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "accounts" / "*.ts")))
    for sym in ["accountBalance", "netWorthInBase"]:
        if sym not in accounts_blob:
            fail(f"src/lib/accounts does not export {sym}")

    page = read(src / "pages" / "AccountsPage.tsx")
    low = page.lower()
    if "accountstore" not in low and "useaccountstore" not in low:
        fail("AccountsPage is not wired to the account store")
    for verb in ["add", "archiv"]:  # create/add + archive
        if verb not in low:
            fail(f"AccountsPage does not surface account '{verb}' actions")
    if "edit" not in low and "update" not in low:
        fail("AccountsPage does not surface account edit/update")

    settings = read(src / "pages" / "SettingsPage.tsx")
    settings_low = settings + "\n" + "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "*.tsx")))
    if "currency" not in settings_low.lower():
        fail("no base-currency / FX-rate management surfaced (Settings or a component)")

    # Account model must carry an opening balance / currency to compute balances.
    models = read(src / "lib" / "db" / "models.ts")
    if "openingBalance" not in models:
        fail("Account model has no openingBalance field (needed for balances)")

    # --- 2. Contract tests (currency core + regression) ------------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_4).resolve(), src / "lib" / "currency" / "__phase4_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_2).resolve(), src / "lib" / "auth" / "__phase2_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/currency/__phase4_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/auth/__phase2_contract__.test.ts",
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
        print(f"\nPhase 4 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 4 check PASSED: FX conversion + balance/net-worth math verified, account CRUD "
          "and base-currency/FX management present, prior contract tests still green, "
          "typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
