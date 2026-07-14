#!/usr/bin/env python3
"""Validate the exact Codex-native /goal objective payload.

This validator belongs only to the Codex adapter. It accepts either a file or
--text, strips a Markdown fence and a leading /goal prefix when present, then
reports the objective character count.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def normalize(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    if stripped == "/goal" or (
        stripped.startswith("/goal") and stripped[len("/goal") :].startswith((" ", "\n", "\t"))
    ):
        stripped = stripped[len("/goal") :].strip()
    return stripped


def read_input(path: str | None, text: str | None) -> str:
    if text is not None:
        return text
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Codex-native /goal objective length.")
    parser.add_argument("path", nargs="?", help="File containing the exact /goal command or objective.")
    parser.add_argument("--text", help="Exact /goal command or objective to validate.")
    parser.add_argument("--max-chars", type=int, default=4000, help="Maximum objective characters.")
    parser.add_argument("--json", action="store_true", help="Emit JSON.")
    args = parser.parse_args()

    if args.text is not None and args.path:
        parser.error("Use either a path or --text, not both.")

    try:
        objective = normalize(read_input(args.path, args.text))
    except (OSError, UnicodeError) as error:
        result = {
            "ok": False,
            "objective_chars": 0,
            "max_chars": args.max_chars,
            "error": f"could not read objective input: {error}",
        }
        if args.json:
            print(json.dumps(result, sort_keys=True))
        else:
            print(f"ERROR: {result['error']}")
            print("ok=false")
        return 1

    count = len(objective)
    ok = 0 < count <= args.max_chars
    result = {"ok": ok, "objective_chars": count, "max_chars": args.max_chars}

    if args.json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"objective_chars={count}")
        print(f"max_chars={args.max_chars}")
        print(f"ok={str(ok).lower()}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
