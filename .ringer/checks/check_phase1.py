#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 1 (Crypto & encrypted storage).

The check is the product. It does four things the worker cannot game:
  1. Confirms the crypto modules exist and carry the right primitives.
  2. Runs an ORCHESTRATOR-OWNED contract test (copied in, run, removed) that
     exercises real WebCrypto round-trips, wrong-key/tamper rejection, the two
     derivation modes, and ciphertext-at-rest through EncryptedTable/Dexie.
  3. Typechecks and runs the worker's own suite.
  4. Enforces the carried-over Husky hook fix (no bare `pnpm`).

Every failure prints WHY. Exit 0 only if all pass.
"""
from __future__ import annotations

import argparse
import glob
import json
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--contract", required=True, help="path to the orchestrator-owned contract test")
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    crypto = root / "src" / "lib" / "crypto"

    # --- 1. Modules present ------------------------------------------------
    required = ["keyDerivation.ts", "CryptoStore.ts", "EncryptedTable.ts", "index.ts"]
    for f in required:
        if not (crypto / f).exists():
            fail(f"missing crypto module: src/lib/crypto/{f}")

    worker_tests = [
        p for p in glob.glob(str(crypto / "*.test.ts")) + glob.glob(str(crypto / "**/*.test.ts"), recursive=True)
    ]
    if not worker_tests:
        fail("worker wrote no crypto tests under src/lib/crypto/")

    # --- 2. Correctness signals in source ---------------------------------
    src_blob = "\n".join(
        (crypto / f).read_text(errors="ignore") for f in required if (crypto / f).exists()
    )
    lo = src_blob.lower()
    if "pbkdf2" not in lo:
        fail("keyDerivation does not use PBKDF2")
    if "aes-gcm" not in lo:
        fail("CryptoStore does not use AES-GCM")
    if "getrandomvalues" not in lo:
        fail("no crypto.getRandomValues — IV/entropy must be randomly generated, not fixed")

    # --- 3. fake-indexeddb available for the EncryptedTable test -----------
    pkg = {}
    try:
        pkg = json.loads((root / "package.json").read_text())
    except Exception as e:  # noqa: BLE001
        fail(f"cannot read package.json: {e}")
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    if "fake-indexeddb" not in deps:
        fail("fake-indexeddb missing from devDependencies (needed to test EncryptedTable)")

    # --- 4. Husky hook carried-over fix -----------------------------------
    hook = root / ".husky" / "pre-commit"
    if hook.exists():
        h = hook.read_text(errors="ignore")
        if "pnpm" in h and "corepack pnpm" not in h and "npx" not in h:
            fail(".husky/pre-commit still calls bare `pnpm` (fails on corepack-only hosts); use `corepack pnpm` or `npx`")

    # --- 5. Run the orchestrator-owned contract test ----------------------
    p = pm()
    contract_src = Path(args.contract).expanduser().resolve()
    contract_dst = crypto / "__phase1_contract__.test.ts"
    if p and not fails and contract_src.exists() and crypto.is_dir():
        try:
            shutil.copyfile(contract_src, contract_dst)
            run(
                p + ["exec", "vitest", "run", "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-test", 300,
            )
        finally:
            contract_dst.unlink(missing_ok=True)
        # Worker's own suite + typecheck (only worth running if structure is sane).
        run(p + ["run", "typecheck"], root, "typecheck", 300)
        run(p + ["run", "test"], root, "worker-tests", 600)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 1 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 1 check PASSED: two-mode key derivation, AES-GCM round-trip/tamper, "
          "and ciphertext-at-rest via EncryptedTable all verified; typecheck + suite green.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
