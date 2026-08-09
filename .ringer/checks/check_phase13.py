#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 13 (testing & deployment).

LEAN + HONEST. ringer.py kills checks at 60s AND this sandbox has no browser, so
this check CANNOT run the Playwright e2e or the production build. It verifies:
  1. Structure: real e2e specs covering the core flow (setup/unlock -> account ->
     transaction -> it shows up); a Playwright config with a webServer; Vitest
     coverage configured (dep + script + thresholds); the CI workflow runs the
     e2e job AND bumps the deprecated @v4 actions; a deploy workflow + SPA
     fallback + a deployment doc.
  2. The Phase 1 + 3a contract tests still pass (config changes didn't break the
     core), and typecheck + lint are green.
The ACTUAL e2e run + coverage + production build are gated by GitHub Actions CI
(browsers + no 60s cap) and watched by the orchestrator.

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
    ap.add_argument("--contract-3a", required=True)
    ap.add_argument("--contract-1", required=True)
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    src = root / "src"

    # --- 1. E2E core-flow specs ------------------------------------------
    e2e_files = glob.glob(str(root / "e2e" / "**" / "*.spec.ts"), recursive=True) + glob.glob(str(root / "e2e" / "*.spec.ts"))
    e2e_blob = "\n".join(read(Path(f)) for f in e2e_files).lower()
    if not e2e_files:
        fail("no Playwright specs under e2e/")
    # A real flow beyond the Phase 0 smoke: must exercise setup/unlock + account + transaction.
    if not any(k in e2e_blob for k in ["sign in", "sign up", "passphrase", "password", "unlock", "set up", "setup"]):
        fail("no e2e coverage of the auth/setup flow")
    if "account" not in e2e_blob:
        fail("no e2e coverage of creating/using an account")
    if "transaction" not in e2e_blob:
        fail("no e2e coverage of transactions")

    pw = read(root / "playwright.config.ts") or read(root / "playwright.config.js")
    if "webserver" not in pw.lower():
        fail("playwright.config has no webServer (e2e must launch the app)")

    # --- 2. Coverage ------------------------------------------------------
    pkg = read(root / "package.json")
    if "@vitest/coverage" not in pkg:
        fail("no @vitest/coverage-v8 dependency")
    if "coverage" not in pkg:
        fail("no coverage script in package.json")
    cfg = read(root / "vite.config.ts") + read(root / "vitest.config.ts")
    if "coverage" not in cfg or ("threshold" not in cfg.lower() and "lines" not in cfg.lower()):
        fail("coverage is not configured with thresholds in the vite/vitest config")

    # --- 3. CI: e2e job + action bump ------------------------------------
    ci = read(root / ".github" / "workflows" / "ci.yml")
    if "playwright" not in ci.lower():
        fail("CI workflow does not run Playwright e2e")
    for dep in ["actions/checkout@v4", "actions/setup-node@v4", "actions/upload-artifact@v4"]:
        if dep in ci:
            fail(f"CI still uses deprecated {dep} (bump to @v5)")

    # --- 4. Deploy: workflow + SPA fallback + docs -----------------------
    workflows = "\n".join(read(Path(f)) for f in glob.glob(str(root / ".github" / "workflows" / "*.yml")))
    if "pages" not in workflows.lower() and "deploy" not in workflows.lower() and not (root / ".github" / "workflows" / "deploy.yml").exists():
        fail("no deployment workflow (GitHub Pages / static hosting)")
    spa = (root / "public" / "404.html").exists() or "404.html" in workflows or (root / "staticwebapp.config.json").exists() or "historyApiFallback" in cfg
    if not spa:
        fail("no SPA fallback for client-side routing (404.html / static config)")
    if not any((root / d).exists() for d in ["docs/DEPLOYMENT.md", "DEPLOYMENT.md"]):
        fail("no deployment documentation (docs/DEPLOYMENT.md)")

    # --- 5. Regression contracts + typecheck + lint ----------------------
    p = pm()
    if p and not fails:
        copies = [
            (Path(args.contract_3a).resolve(), src / "lib" / "db" / "__phase3a_contract__.test.ts"),
            (Path(args.contract_1).resolve(), src / "lib" / "crypto" / "__phase1_contract__.test.ts"),
        ]
        try:
            for s, d in copies:
                if s.exists() and d.parent.is_dir():
                    shutil.copyfile(s, d)
            run(
                p + ["exec", "vitest", "run",
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
        print(f"\nPhase 13 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 13 check PASSED (structure + regressions): core-flow e2e specs, Playwright webServer, "
          "coverage config, CI e2e + action bump, deploy workflow + SPA fallback + docs present; "
          "Phase 1/3a contracts green; typecheck + lint pass. e2e RUN + coverage + build are gated by CI.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
