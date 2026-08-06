#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 7a (import). Lean single-pass.

Verifies:
  1. An import module (parseQIF, parseCSV, detectCsvMapping, dedupeParsed, and
     an importTransactions service) exists; TransactionsPage exposes an import
     entry point and there is an import wizard component.
  2. A hidden contract test pins QIF/CSV parsing + dedupe against embedded
     samples; the Phase 5b/3a/1 contract tests still pass.
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
    ap.add_argument("--contract-7a", required=True)
    ap.add_argument("--contract-5b", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    imp_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "import" / "**" / "*.ts"), recursive=True))
    for sym in ["parseQIF", "parseCSV", "detectCsvMapping", "dedupeParsed", "importTransactions"]:
        if sym not in imp_blob:
            fail(f"src/lib/import does not export {sym}")

    page = read(src / "pages" / "TransactionsPage.tsx")
    if "import" not in page.lower():
        fail("TransactionsPage has no import entry point")
    if not glob.glob(str(src / "components" / "import" / "*.tsx")):
        fail("no import wizard component under src/components/import/")

    # --- 2. Contract tests (parse/dedupe core + regression) --------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_7a).resolve(), src / "lib" / "import" / "__phase7a_contract__.test.ts"),
            (Path(args.contract_5b).resolve(), src / "lib" / "transactions" / "__phase5b_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/import/__phase7a_contract__.test.ts",
                     "src/lib/transactions/__phase5b_contract__.test.ts",
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
        print(f"\nPhase 7a check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 7a check PASSED: QIF/CSV parsing + dedupe verified against samples, import wizard "
          "present, prior contract tests still green, typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
