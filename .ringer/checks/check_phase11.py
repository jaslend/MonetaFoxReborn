#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 11 (cloud sync). LEAN (< 60s).

ringer.py kills every check at CHECK_TIMEOUT_S = 60s, so this runs contract
tests + typecheck + suite + lint only; `build` is verified by CI (no 60s cap).

Verifies:
  1. A sync module (CloudStorageProvider, MemoryProvider, register/get/list
     providers, syncUp, syncDown) exists; Google Drive + OneDrive providers are
     present; a syncStore registered in initializeStores; SettingsPage has a
     sync section (provider choice, manual up/down, status).
  2. A hidden contract test pins the encrypted round-trip + registry (via the
     in-memory provider); the Phase 7b/3a/1 contract tests still pass.
  3. typecheck + suite + lint are green.

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
    ap.add_argument("--contract-11", required=True)
    ap.add_argument("--contract-7b", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    sync_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "sync" / "**" / "*.ts"), recursive=True))
    for sym in ["CloudStorageProvider", "MemoryProvider", "registerCloudProvider", "getCloudProvider", "listCloudProviders", "syncUp", "syncDown"]:
        if sym not in sync_blob:
            fail(f"src/lib/sync does not define {sym}")
    low = sync_blob.lower()
    if "drive" not in low:
        fail("no Google Drive provider in src/lib/sync")
    if "onedrive" not in low.replace(" ", "") and "one drive" not in low:
        fail("no OneDrive provider in src/lib/sync")
    # Encrypted payload only: sync must go through the crypto/export layer, not raw JSON.
    if "exportEncrypted" not in sync_blob and "encrypt" not in sync_blob:
        fail("sync does not encrypt the payload (must upload ciphertext only)")

    if not (src / "stores" / "syncStore.ts").exists():
        fail("missing src/stores/syncStore.ts")
    if "syncStore" not in read(src / "stores" / "index.ts"):
        fail("syncStore not registered in src/stores/index.ts")

    settings = read(src / "pages" / "SettingsPage.tsx")
    sblob = settings + "\n" + "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "sync" / "*.tsx")))
    slow = sblob.lower()
    if "sync" not in slow:
        fail("SettingsPage has no sync section")
    if "upload" not in slow and "download" not in slow and "full sync" not in slow:
        fail("sync UI has no manual upload/download controls")

    # --- 2. Contract tests (round-trip + registry + regression) ----------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_11).resolve(), src / "lib" / "sync" / "__phase11_contract__.test.ts"),
            (Path(args.contract_7b).resolve(), src / "lib" / "export" / "__phase7b_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/sync/__phase11_contract__.test.ts",
                     "src/lib/export/__phase7b_contract__.test.ts",
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
        print(f"\nPhase 11 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 11 check PASSED: encrypted sync round-trip + provider registry verified (memory "
          "provider), Drive/OneDrive providers + syncStore + sync UI present, prior contract tests "
          "still green, typecheck + suite + lint pass (build verified in CI).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
