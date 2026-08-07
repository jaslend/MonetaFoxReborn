#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 8 (scheduled transactions). Lean.

Verifies:
  1. A scheduling module (nextOccurrence, runDueSchedules, generateFromSchedule)
     exists; a scheduledStore with CRUD + due-processing; a ScheduledPage; a
     /scheduled route + nav link.
  2. A hidden contract test pins recurrence math + auto/manual due processing;
     the Phase 3b/5b/3a/1 contract tests still pass.
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
    ap.add_argument("--contract-8", required=True)
    ap.add_argument("--contract-3b", required=True)
    ap.add_argument("--contract-5b", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    sched_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "scheduling" / "*.ts")))
    for sym in ["nextOccurrence", "runDueSchedules", "generateFromSchedule"]:
        if sym not in sched_blob:
            fail(f"src/lib/scheduling does not export {sym}")

    store = read(src / "stores" / "scheduledStore.ts")
    if not store:
        fail("missing src/stores/scheduledStore.ts")
    else:
        slow = store.lower()
        if "add" not in slow or ("remove" not in slow and "delete" not in slow):
            fail("scheduledStore is missing CRUD actions")
        if "rundueschedules" not in slow and "due" not in slow:
            fail("scheduledStore has no due-processing action")

    if "scheduledStore" not in read(src / "stores" / "index.ts"):
        fail("scheduledStore is not registered in src/stores/index.ts (initializeStores)")

    if not (src / "pages" / "ScheduledPage.tsx").exists():
        fail("missing src/pages/ScheduledPage.tsx")

    routes = read(src / "routes.tsx")
    if "scheduled" not in routes.lower():
        fail("no /scheduled route registered in routes.tsx")
    if "scheduled" not in read(src / "components" / "Layout.tsx").lower():
        fail("no Scheduled nav link in Layout.tsx")

    # --- 2. Contract tests (scheduling core + regression) ----------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_8).resolve(), src / "lib" / "scheduling" / "__phase8_contract__.test.ts"),
            (Path(args.contract_3b).resolve(), src / "__phase3b_contract__.test.tsx"),
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
                     "src/lib/scheduling/__phase8_contract__.test.ts",
                     "src/__phase3b_contract__.test.tsx",
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
        print(f"\nPhase 8 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 8 check PASSED: recurrence math + auto/manual due processing verified, scheduled "
          "store/page/route present, prior contract tests still green, typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
