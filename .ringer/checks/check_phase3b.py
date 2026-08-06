#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 3b (app shell).

Verifies:
  1. react-router-dom is installed and the shell files exist (routes, layout,
     RequireAuth guard, auth store, per-section pages).
  2. The Phase 0 demo counter is gone (src/lib/store.ts removed / unreferenced).
  3. An orchestrator-owned routing contract test passes (protected-route
     redirect, authed nav + section pages, 404) AND the Phase 1 + 3a contract
     tests STILL pass (regression guard).
  4. typecheck + suite + lint + build are green.

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


def read(p: Path) -> str:
    try:
        return p.read_text(errors="ignore")
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    ap.add_argument("--contract-3b", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Router dep + shell files -------------------------------------
    try:
        pkg = json.loads((root / "package.json").read_text())
    except Exception as e:  # noqa: BLE001
        pkg = {}
        fail(f"cannot read package.json: {e}")
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    if "react-router-dom" not in deps and "react-router" not in deps:
        fail("react-router-dom not in dependencies")

    routes_file = None
    for cand in ["routes.tsx", "routes.ts", "routes/index.tsx", "App.tsx"]:
        if (src / cand).exists() and "AppRoutes" in read(src / cand):
            routes_file = cand
            break
    if routes_file is None:
        fail("no module under src/ exports `AppRoutes` (routes.tsx expected)")

    if not (src / "stores" / "authStore.ts").exists():
        fail("missing src/stores/authStore.ts (auth seam for Phase 2)")
    elif "useAuthStore" not in read(src / "stores" / "authStore.ts"):
        fail("authStore.ts does not export useAuthStore")

    all_src = "\n".join(read(Path(f)) for f in glob.glob(str(src / "**" / "*.tsx"), recursive=True))
    if "RequireAuth" not in all_src and "Navigate" not in all_src:
        fail("no protected-route guard found (RequireAuth / <Navigate> redirect)")

    # A layout/nav must exist (a <nav> or a Layout component with links).
    if "Layout" not in all_src and "<nav" not in all_src.lower():
        fail("no Layout / <nav> shell found")

    # --- 2. Demo counter removed -----------------------------------------
    if (src / "lib" / "store.ts").exists():
        # Allowed only if nothing imports it any more.
        if "lib/store" in all_src or "from './store'" in read(src / "App.tsx"):
            fail("Phase 0 demo store (src/lib/store.ts) is still referenced")

    # --- 3. Contract tests (routing + regression guards) -----------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_3b).resolve(), src / "__phase3b_contract__.test.tsx"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/__phase3b_contract__.test.tsx",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 400,
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
        print(f"\nPhase 3b check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 3b check PASSED: protected router shell verified (redirect, authed nav + "
          "section pages, 404), demo removed, prior contract tests still green, "
          "typecheck/suite/lint/build all pass.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
