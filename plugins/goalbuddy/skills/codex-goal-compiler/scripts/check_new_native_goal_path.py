#!/usr/bin/env python3
"""Fail closed unless one explicit future standalone Codex goal root is unused."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def lexical_absolute(path: str | Path, base: Path | None = None) -> Path:
    expanded = os.path.expanduser(str(path))
    if not os.path.isabs(expanded):
        expanded = os.path.join(str(base or Path.cwd()), expanded)
    return Path(os.path.abspath(expanded))


def has_malformed_components(path: str | Path) -> bool:
    expanded = os.path.expanduser(str(path))
    if not expanded or expanded.endswith("/") or "//" in expanded:
        return True
    components = expanded.split("/")
    if expanded.startswith("/"):
        components = components[1:]
    return not components or any(component in ("", ".", "..") for component in components)


def check(path: str, project_root: str | None = None) -> dict[str, object]:
    root = lexical_absolute(project_root or os.getcwd())
    candidate = lexical_absolute(path, root)
    expected_parent = root / "docs" / "codex-goals"
    expanded = os.path.expanduser(str(path))

    if os.path.isabs(expanded):
        valid_shape = not has_malformed_components(expanded)
    else:
        parts = expanded.split("/")
        valid_shape = (
            not has_malformed_components(expanded)
            and parts[:2] == ["docs", "codex-goals"]
            and len(parts) == 3
        )

    valid_location = valid_shape and candidate.parent == expected_parent and bool(SLUG.fullmatch(candidate.name))
    if not valid_location:
        return {
            "ok": False,
            "path": str(candidate),
            "collision": False,
            "error": f"native goal root must be one direct docs/codex-goals/<slug> child of {root}",
        }

    resolved_root = root.resolve(strict=False)
    if expected_parent.resolve(strict=False) != resolved_root / "docs" / "codex-goals":
        return {
            "ok": False,
            "path": str(candidate),
            "collision": False,
            "error": "docs/codex-goals must not traverse a symlinked ancestor",
        }

    collision = os.path.lexists(candidate)
    return {
        "ok": not collision,
        "path": str(candidate),
        "collision": collision,
        "error": "native goal root already exists; choose another slug without inspecting it" if collision else "",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Require a new, nonexistent standalone Codex goal root.")
    parser.add_argument("path", help="Explicit future docs/codex-goals/<slug> root.")
    parser.add_argument("--project-root", help="Target project root (default: current directory).")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = check(args.path, args.project_root)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    elif report["ok"]:
        print(f"new native goal root available: {report['path']}")
    else:
        print(f"blocked: {report['error']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
