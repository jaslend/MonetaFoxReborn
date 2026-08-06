#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 3a (data foundation).

Verifies:
  1. Data layer exists (models, Dexie db, repositories, barrel) and the Zustand
     domain stores exist.
  2. The carried-over Phase 1 cleanup actually happened: globalPolyfill.ts is
     gone, CryptoStore no longer imports it, and src/test/setup.ts guards its
     DOM access.
  3. An orchestrator-owned data-layer contract test passes (encrypted DB
     round-trip, ciphertext-at-rest, wrong-key rejection) AND the Phase 1 crypto
     contract test STILL passes after the cleanup (regression guard).
  4. typecheck + suite + lint + build are green.

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
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True, help="Phase 1 crypto contract test (regression guard)")
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    db = root / "src" / "lib" / "db"
    stores = root / "src" / "stores"
    crypto = root / "src" / "lib" / "crypto"

    # --- 1. Data layer & stores present ----------------------------------
    for f in ["models.ts", "database.ts", "index.ts"]:
        if not (db / f).exists():
            fail(f"missing data-layer module: src/lib/db/{f}")
    db_blob = "\n".join(read(db / f) for f in ["database.ts", "index.ts", "repository.ts"] if (db / f).exists())
    if "extends Dexie" not in db_blob and "new Dexie" not in db_blob:
        fail("src/lib/db does not define a Dexie database")
    if "EncryptedTable" not in db_blob and "EncryptedTable" not in read(db / "index.ts"):
        fail("data layer does not use EncryptedTable (records must be encrypted at rest)")

    store_files = glob.glob(str(stores / "*.ts")) + glob.glob(str(stores / "*.tsx"))
    if not store_files:
        fail("no Zustand stores under src/stores/")
    else:
        store_blob = "\n".join(read(Path(f)) for f in store_files).lower()
        if "create" not in store_blob or "zustand" not in store_blob:
            fail("src/stores/* do not look like Zustand stores (no create()/zustand import)")
        for entity in ["account", "transaction", "category", "budget", "setting"]:
            if entity not in store_blob:
                fail(f"no store covering '{entity}' found under src/stores/")

    # --- 2. Carried-over Phase 1 cleanup ---------------------------------
    if (crypto / "globalPolyfill.ts").exists():
        fail("src/lib/crypto/globalPolyfill.ts still exists (Phase 1 cleanup not done)")
    if "globalPolyfill" in read(crypto / "CryptoStore.ts"):
        fail("CryptoStore.ts still imports globalPolyfill")
    setup = read(root / "src" / "test" / "setup.ts")
    if setup:
        # The DOM cleanup must be guarded (typeof checks) so node-env tests survive.
        if ("localStorage" in setup or "document" in setup) and "typeof" not in setup:
            fail("src/test/setup.ts touches localStorage/document without a typeof guard")

    # --- 3. Contract tests (data layer + Phase 1 regression) -------------
    p = pm()
    if p and not fails:
        copies: list[tuple[Path, Path]] = [
            (Path(args.contract_3a).resolve(), db / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), crypto / "__phase1_contract__.test.ts"),
        ]
        try:
            for src, dst in copies:
                if src.exists() and dst.parent.is_dir():
                    shutil.copyfile(src, dst)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 300,
            )
        finally:
            for _, dst in copies:
                dst.unlink(missing_ok=True)
        run(p + ["run", "typecheck"], root, "typecheck", 300)
        run(p + ["run", "test"], root, "worker-tests", 600)
        run(p + ["run", "lint"], root, "lint", 300)
        run(p + ["run", "build"], root, "build", 600)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 3a check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 3a check PASSED: encrypted Dexie data layer + Zustand stores verified, "
          "Phase 1 cleanup done and crypto still green, typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
