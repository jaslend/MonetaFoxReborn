#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 9 (investments). Lean.

Verifies:
  1. An investments module (latestPrice, holdingValue, portfolioValue,
     priceHistory + a price-provider registry) exists; an investmentStore with
     asset/holding/price CRUD registered in initializeStores; InvestmentsPage
     shows holdings/values, manual price entry, and a price-history chart.
  2. A hidden contract test pins valuation + the provider registry; the Phase
     3a/1 contract tests still pass.
  3. typecheck + suite (once) + lint + build are green.

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
    ap.add_argument("--contract-9", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    inv_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "investments" / "*.ts")))
    for sym in ["latestPrice", "holdingValue", "portfolioValue", "priceHistory", "getPriceProvider", "registerPriceProvider"]:
        if sym not in inv_blob:
            fail(f"src/lib/investments does not export {sym}")

    store = read(src / "stores" / "investmentStore.ts")
    if not store:
        fail("missing src/stores/investmentStore.ts")
    else:
        slow = store.lower()
        for entity in ["asset", "holding", "price"]:
            if entity not in slow:
                fail(f"investmentStore does not manage {entity}s")
    if "investmentStore" not in read(src / "stores" / "index.ts"):
        fail("investmentStore is not registered in src/stores/index.ts (initializeStores)")

    page = read(src / "pages" / "InvestmentsPage.tsx")
    comp_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "investments" / "*.tsx")))
    plow = (page + comp_blob).lower()
    if "investmentstore" not in plow and "useinvestmentstore" not in plow:
        fail("InvestmentsPage is not wired to the investment store")
    if "price" not in plow:
        fail("InvestmentsPage has no price entry / valuation UI")
    # Price history must render a chart (spec: 'price history renders').
    if "recharts" not in (page + comp_blob).lower() and "chart" not in plow:
        fail("no price-history chart (Recharts) in the investments UI")

    # --- 2. Contract tests (valuation + registry + regression) -----------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_9).resolve(), src / "lib" / "investments" / "__phase9_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/investments/__phase9_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 400,
            )
        finally:
            for _, d in copies:
                d.unlink(missing_ok=True)
        run(p + ["run", "typecheck"], root, "typecheck", 300)
        run(p + ["run", "test"], root, "suite", 400)
        run(p + ["run", "lint"], root, "lint", 300)
        run(p + ["run", "build"], root, "build", 600)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 9 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 9 check PASSED: portfolio valuation + price-provider registry verified, investment "
          "store/page + price-history chart present, prior contract tests still green, "
          "typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
