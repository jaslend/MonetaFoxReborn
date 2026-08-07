#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 10b (dashboard).

IMPORTANT: ringer.py kills every check at CHECK_TIMEOUT_S = 60s
(ringer.py: asyncio.wait_for(proc.communicate(), timeout=60)). So this check is
LEAN by design: contract tests + typecheck + suite + lint only. `build` is NOT
run here — it exceeds the 60s budget when combined with the rest — and is
instead verified by GitHub Actions CI on every push (no 60s cap there). Keep
future phase checks under 60s the same way.

Verifies:
  1. A dashboard module (recentTransactions, upcomingScheduled) exists;
     DashboardPage surfaces recent transactions, upcoming bills, and account
     balances / net worth, wired to the stores.
  2. A hidden contract test pins the two selectors; the Phase 10a/3a/1 contract
     tests still pass.
  3. typecheck + suite + lint are green (build is left to CI).

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


def run(cmd: list[str], cwd: Path, label: str, timeout: int) -> None:
    env = dict(os.environ)
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["CI"] = "1"
    try:
        r = subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        fail(f"{label}: `{' '.join(cmd)}` timed out after {timeout}s")
        return
    except FileNotFoundError as e:
        fail(f"{label}: command not found: {e}")
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
    ap.add_argument("--contract-10b", required=True)
    ap.add_argument("--contract-10a", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    dash_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "dashboard" / "*.ts")))
    for sym in ["recentTransactions", "upcomingScheduled"]:
        if sym not in dash_blob:
            fail(f"src/lib/dashboard does not export {sym}")

    page = read(src / "pages" / "DashboardPage.tsx")
    comp_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "dashboard" / "*.tsx")))
    plow = (page + comp_blob).lower()
    if "store" not in plow:
        fail("DashboardPage is not wired to the data stores")
    for widget in ["recent", "upcoming", "balance"]:
        if widget not in plow:
            fail(f"DashboardPage does not surface the '{widget}' widget")
    if "networth" not in plow.replace(" ", "") and "net worth" not in page.lower():
        fail("DashboardPage does not show net worth / account balances")

    # --- 2. Contract tests (selectors + regression), then types/suite/lint --
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_10b).resolve(), src / "lib" / "dashboard" / "__phase10b_contract__.test.ts"),
            (Path(args.contract_10a).resolve(), src / "lib" / "reports" / "__phase10a_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/dashboard/__phase10b_contract__.test.ts",
                     "src/lib/reports/__phase10a_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 55,
            )
        finally:
            for _, d in copies:
                d.unlink(missing_ok=True)
        run(p + ["run", "typecheck"], root, "typecheck", 55)
        run(p + ["run", "test"], root, "suite", 55)
        run(p + ["run", "lint"], root, "lint", 55)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 10b check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 10b check PASSED: recent-transactions + upcoming-scheduled selectors verified, "
          "Dashboard with recent/upcoming/balances present, prior contract tests still green, "
          "typecheck + suite + lint pass (build verified in CI).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
