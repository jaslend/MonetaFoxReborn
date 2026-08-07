#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 12 (UX/onboarding). LEAN (<60s).

ringer.py kills every check at CHECK_TIMEOUT_S = 60s. As the project suite has
grown (340+ tests) even a suite+typecheck+lint check flirts with 60s, so this
check runs the injected CONTRACT tests (the pinned behaviours + prior-phase
regressions) + typecheck + lint only. The full project suite AND build are
verified by GitHub Actions CI (no 60s cap) and by the orchestrator's manual
review. This keeps the graded check fast and removes any incentive to rewrite
it — the orchestrator authors checks, never the worker.

Verifies:
  1. sample + shortcuts modules exist; App mounts the shortcuts handler + a PWA
     update prompt; SettingsPage can load sample data; Dashboard has onboarding.
  2. A hidden contract test pins sample-data integrity + the shortcut registry;
     the Phase 10b/3a/1 contract tests still pass.
  3. typecheck + lint are green.

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
    ap.add_argument("--contract-12", required=True)
    ap.add_argument("--contract-10b", required=True)
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. Structure -----------------------------------------------------
    sample_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "sample" / "*.ts")))
    if "buildSampleData" not in sample_blob:
        fail("src/lib/sample does not export buildSampleData")
    if "loadSample" not in sample_blob and "load" not in sample_blob.lower():
        fail("src/lib/sample has no loader for the sample data")

    shortcuts_blob = "\n".join(read(Path(f)) for f in glob.glob(str(src / "lib" / "shortcuts" / "*.ts")) + glob.glob(str(src / "lib" / "shortcuts" / "*.tsx")))
    if "SHORTCUTS" not in shortcuts_blob:
        fail("src/lib/shortcuts does not export SHORTCUTS")

    app = read(src / "App.tsx")
    app_and_comps = app + "\n" + "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "**" / "*.tsx"), recursive=True))
    aclow = app_and_comps.lower()
    if "registersw" not in aclow and "virtual:pwa-register" not in aclow and "needrefresh" not in aclow and "updateserviceworker" not in aclow:
        fail("no PWA update prompt (virtual:pwa-register / needRefresh / updateServiceWorker)")
    if "shortcut" not in aclow:
        fail("keyboard shortcuts are not mounted (no shortcut handler/provider referenced)")

    settings = read(src / "pages" / "SettingsPage.tsx")
    if "sample" not in settings.lower() and "sample" not in "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "**" / "*.tsx"), recursive=True)).lower():
        fail("SettingsPage has no 'load sample data' control")

    dash = read(src / "pages" / "DashboardPage.tsx") + "\n" + "\n".join(read(Path(f)) for f in glob.glob(str(src / "components" / "onboarding" / "*.tsx")) + glob.glob(str(src / "components" / "dashboard" / "*.tsx")))
    dlow = dash.lower()
    if "onboard" not in dlow and "get started" not in dlow and "getting started" not in dlow and "welcome" not in dlow:
        fail("no first-run onboarding / getting-started guide")

    # --- 2. Contract tests (sample + shortcuts + regression), typecheck, lint --
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_12).resolve(), src / "lib" / "__phase12_contract__.test.ts"),
            (Path(args.contract_10b).resolve(), src / "lib" / "dashboard" / "__phase10b_contract__.test.ts"),
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
                     "src/lib/__phase12_contract__.test.ts",
                     "src/lib/dashboard/__phase10b_contract__.test.ts",
                     "src/lib/db/__phase3a_contract__.test.ts",
                     "src/lib/crypto/__phase1_contract__.test.ts"],
                root, "contract-tests", 55,
            )
        finally:
            for _, d in copies:
                d.unlink(missing_ok=True)
        run(p + ["run", "typecheck"], root, "typecheck", 55)
        run(p + ["run", "lint"], root, "lint", 55)
    elif fails:
        print("WARN: skipped execution because structural checks already failed")

    if fails:
        print(f"\nPhase 12 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 12 check PASSED: sample dataset integrity + shortcut registry verified, PWA update "
          "prompt + shortcuts + onboarding + sample-load present, prior contract tests still green, "
          "typecheck + lint pass (full suite + build verified in CI).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
