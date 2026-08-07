#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 7b (export). Lean single-pass.

Verifies:
  1. An export module (exportQIF, exportEncrypted, importEncrypted) and a
     format registry (getExporter, getImporter, listExportFormats) exist;
     SettingsPage surfaces export/backup/restore.
  2. A hidden contract test pins the QIF export round-trip (through the 7a
     parser), the encrypted-backup round-trip (ciphertext-at-rest + wrong-pass
     rejection), and the registry; the Phase 7a/3a/1 contract tests still pass.
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
    ap.add_argument("--contract-7b", required=True)
    ap.add_argument("--contract-7a", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    exp_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "export" / "**" / "*.ts"), recursive=True))
    for sym in ["exportQIF", "exportEncrypted", "importEncrypted"]:
        if sym not in exp_blob:
            fail(f"src/lib/export does not export {sym}")

    fmt_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "formats" / "**" / "*.ts"), recursive=True))
    for sym in ["getExporter", "getImporter", "listExportFormats"]:
        if sym not in fmt_blob:
            fail(f"src/lib/formats registry does not export {sym}")

    settings = read(src / "pages" / "SettingsPage.tsx")
    slow = settings + "\n" + "\n".join(
        read(Path(f)) for f in glob.glob(str(src / "components" / "**" / "*.tsx"), recursive=True)
        if "export" in read(Path(f)).lower() or "backup" in read(Path(f)).lower()
    )
    if "export" not in slow.lower() or "backup" not in slow.lower():
        fail("SettingsPage does not surface export / encrypted backup (and restore)")

    # --- 2. Contract tests (export round-trips + registry + regression) --
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_7b).resolve(), src / "lib" / "export" / "__phase7b_contract__.test.ts"),
            (Path(args.contract_7a).resolve(), src / "lib" / "import" / "__phase7a_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/export/__phase7b_contract__.test.ts",
                     "src/lib/import/__phase7a_contract__.test.ts",
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
        print(f"\nPhase 7b check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 7b check PASSED: QIF export round-trip + encrypted-backup round-trip (ciphertext, "
          "wrong-pass reject) + format registry verified, prior contract tests still green, "
          "typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
