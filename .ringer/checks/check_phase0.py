#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — Phase 0 (Foundation).

Verifies a real scaffold, not file existence: parses package.json for the
required stack, then EXECUTES install / build / test / lint and inspects the
build output for PWA artifacts. Every failure prints WHY.

Exit 0 only if every substantive assertion passes.
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
warns: list[str] = []


def fail(msg: str) -> None:
    fails.append(msg)


def warn(msg: str) -> None:
    warns.append(msg)


def any_glob(root: Path, *patterns: str) -> list[str]:
    hits: list[str] = []
    for p in patterns:
        hits += glob.glob(str(root / p), recursive=True)
    return hits


def resolve_pm(target: Path) -> list[str]:
    """Prefer a real pnpm on PATH; else drive it through corepack."""
    if shutil.which("pnpm"):
        return ["pnpm"]
    if shutil.which("corepack"):
        # packageManager in package.json pins the exact version for corepack.
        return ["corepack", "pnpm"]
    fail("no pnpm and no corepack on PATH — cannot run the toolchain")
    return []


def run(cmd: list[str], cwd: Path, label: str, timeout: int) -> bool:
    env = dict(os.environ)
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["CI"] = "1"
    try:
        r = subprocess.run(
            cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout
        )
    except subprocess.TimeoutExpired:
        fail(f"{label}: `{' '.join(cmd)}` timed out after {timeout}s")
        return False
    except FileNotFoundError as e:
        fail(f"{label}: command not found: {e}")
        return False
    if r.returncode != 0:
        tail = (r.stdout + "\n" + r.stderr).strip().splitlines()[-25:]
        fail(f"{label}: `{' '.join(cmd)}` exited {r.returncode}:\n    " + "\n    ".join(tail))
        return False
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="absolute path to the scaffolded project root")
    args = ap.parse_args()

    root = Path(args.target).expanduser().resolve()
    if not root.is_dir():
        print(f"FAIL: target dir does not exist: {root}")
        return 1

    # --- 1. Structural scaffold files -------------------------------------
    def need(patterns: list[str], what: str) -> None:
        if not any_glob(root, *patterns):
            fail(f"missing {what} (looked for: {', '.join(patterns)})")

    need(["package.json"], "package.json")
    need(["tsconfig*.json"], "TypeScript config")
    need(["index.html"], "index.html")
    need(["src/main.tsx", "src/main.jsx"], "app entry (src/main.tsx)")
    need(["vite.config.ts", "vite.config.js", "vite.config.mts"], "Vite config")
    need(["eslint.config.js", "eslint.config.mjs", ".eslintrc*"], "ESLint config")
    need(["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"], "at least one test file")
    need([".github/workflows/*.yml", ".github/workflows/*.yaml"], "GitHub Actions workflow")
    need([".gitignore"], ".gitignore")
    if not (root / ".git").is_dir():
        fail("git repository not initialized (.git missing)")
    if not any_glob(root, "components.json"):
        fail("shadcn/ui not initialized (components.json missing)")

    # Tailwind: config file OR the v4 CSS-first import.
    tw_cfg = any_glob(root, "tailwind.config.*")
    css_has_tw = any(
        "tailwind" in Path(f).read_text(errors="ignore")
        for f in any_glob(root, "src/**/*.css")
    )
    if not tw_cfg and not css_has_tw:
        fail("Tailwind not wired (no tailwind.config.* and no `tailwind` import in any src CSS)")

    # PWA plugin referenced in the Vite config.
    vite_cfgs = any_glob(root, "vite.config.*")
    if vite_cfgs and not any(
        "VitePWA" in Path(f).read_text(errors="ignore")
        or "vite-plugin-pwa" in Path(f).read_text(errors="ignore")
        for f in vite_cfgs
    ):
        fail("vite-plugin-pwa not referenced in the Vite config")

    # --- 2. package.json contents -----------------------------------------
    pkg_path = root / "package.json"
    pkg = {}
    if pkg_path.exists():
        try:
            pkg = json.loads(pkg_path.read_text())
        except Exception as e:  # noqa: BLE001
            fail(f"package.json is not valid JSON: {e}")

    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}

    def need_dep(name: str) -> None:
        if name not in deps:
            fail(f"dependency missing from package.json: {name}")

    for d in [
        "react", "react-dom", "dexie", "zustand", "recharts",
        "vite", "typescript", "vitest", "@testing-library/react",
        "eslint", "prettier", "vite-plugin-pwa",
    ]:
        need_dep(d)
    # Tailwind may be the plugin (v4) or the core pkg.
    if "tailwindcss" not in deps and "@tailwindcss/vite" not in deps:
        fail("Tailwind not in package.json (tailwindcss or @tailwindcss/vite)")

    # React 19 specifically (modernize decision).
    rv = deps.get("react", "")
    if rv and "19" not in rv.split(".")[0].lstrip("^~>=< "):
        # crude major check tolerant of ^19.x / 19.x / >=19
        if not (rv.lstrip("^~>=< ").startswith("19")):
            fail(f"react is not v19 (found '{rv}')")

    scripts = pkg.get("scripts", {})
    for s in ["dev", "build", "test", "lint"]:
        if s not in scripts:
            fail(f"package.json scripts missing: {s}")
    # Test must be non-watch so the check can run it headless.
    if "test" in scripts and "watch" in scripts["test"] and "run" not in scripts["test"]:
        fail("`test` script looks like watch mode; use `vitest run` for headless CI")

    # --- 3. Execute the toolchain -----------------------------------------
    pm = resolve_pm(root)
    if pm and not fails:  # only bother executing if structure is sane
        if run(pm + ["install"], root, "install", 900):
            run(pm + ["run", "build"], root, "build", 600)
            run(pm + ["run", "test"], root, "test", 600)
            run(pm + ["run", "lint"], root, "lint", 300)

            # PWA artifacts in the build output.
            dist = root / "dist"
            if not dist.is_dir():
                fail("build produced no dist/ directory")
            else:
                if not any_glob(dist, "**/*.webmanifest", "**/manifest.webmanifest", "**/manifest.json"):
                    fail("no web app manifest in dist/ (PWA manifest not emitted)")
                if not any_glob(dist, "**/sw.js", "**/service-worker.js", "**/workbox-*.js", "**/registerSW.js"):
                    fail("no service worker in dist/ (vite-plugin-pwa not generating one)")
    elif fails:
        warn("skipped install/build/test/lint because structural checks already failed")

    # --- 4. CI workflow actually builds and tests -------------------------
    wf_files = any_glob(root, ".github/workflows/*.yml", ".github/workflows/*.yaml")
    if wf_files:
        wf_text = "\n".join(Path(f).read_text(errors="ignore") for f in wf_files)
        if "build" not in wf_text:
            fail("CI workflow never runs a build step")
        if "test" not in wf_text:
            fail("CI workflow never runs the tests")

    # --- Report -----------------------------------------------------------
    for w in warns:
        print(f"WARN: {w}")
    if fails:
        print(f"\nPhase 0 check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print("Phase 0 check PASSED: scaffold builds, tests pass, lint clean, PWA artifacts emitted, CI wired.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
