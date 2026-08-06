#!/usr/bin/env python3
"""Executable check for MonetaFox Reborn — test-suite determinism fix.

The suite was flaky (shared fake-indexeddb state leaking across test files).
This check proves the fix by running the FULL suite N times and requiring EVERY
run to pass, and it guards against "fixing" flakiness by deleting assertions:
the passing-test count must stay at or above a floor. Also runs typecheck/lint/
build once. Prints WHY on failure. Exit 0 only if all pass.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RUNS = 8
MIN_TESTS = 125  # floor: the fix must not reduce coverage below the current count

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


def run_capture(cmd: list[str], cwd: Path, timeout: int):
    env = dict(os.environ)
    env["COREPACK_ENABLE_DOWNLOAD_PROMPT"] = "0"
    env["CI"] = "1"
    return subprocess.run(cmd, cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True)
    args = ap.parse_args()
    root = Path(args.target).expanduser().resolve()
    p = pm()
    if not p:
        print("Determinism check FAILED:\n  ✗ " + fails[0])
        return 1

    passed_counts: list[int] = []
    for i in range(1, RUNS + 1):
        try:
            r = run_capture(p + ["run", "test"], root, 600)
        except subprocess.TimeoutExpired:
            fail(f"suite run {i}/{RUNS} timed out")
            break
        out = r.stdout + "\n" + r.stderr
        m = re.search(r"Tests\s+(?:(\d+)\s+failed[^\n]*?\|\s*)?(\d+)\s+passed", out)
        n_failed = int(m.group(1)) if (m and m.group(1)) else 0
        n_passed = int(m.group(2)) if m else -1
        passed_counts.append(n_passed)
        if r.returncode != 0 or n_failed > 0:
            tail = out.strip().splitlines()[-25:]
            fail(f"suite run {i}/{RUNS} was NOT green ({n_failed} failed): \n    " + "\n    ".join(tail))
            break

    if not fails and passed_counts:
        lo = min(c for c in passed_counts if c >= 0)
        if lo < MIN_TESTS:
            fail(f"test count dropped to {lo} (floor {MIN_TESTS}) — flakiness must be fixed, not deleted")

    if not fails:
        for label, cmd in [("typecheck", ["run", "typecheck"]), ("lint", ["run", "lint"]), ("build", ["run", "build"])]:
            try:
                r = run_capture(p + cmd, root, 600)
            except subprocess.TimeoutExpired:
                fail(f"{label} timed out")
                continue
            if r.returncode != 0:
                tail = (r.stdout + "\n" + r.stderr).strip().splitlines()[-20:]
                fail(f"{label} exited {r.returncode}:\n    " + "\n    ".join(tail))

    if fails:
        print(f"\nDeterminism check FAILED ({len(fails)} issue(s)):")
        for f in fails:
            print(f"  ✗ {f}")
        return 1
    print(f"Determinism check PASSED: {RUNS}/{RUNS} suite runs green "
          f"(>= {MIN_TESTS} tests each), typecheck + lint + build clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
