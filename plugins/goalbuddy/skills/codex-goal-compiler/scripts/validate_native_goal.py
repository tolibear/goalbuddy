#!/usr/bin/env python3
"""Validate a standalone native Codex goal compiled by codex-goal-compiler."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REQUIRED_HEADINGS = (
    "Objective",
    "Context Handoff",
    "Definition of Done",
    "Scope and Non-Goals",
    "Constraints and Permissions",
    "Source of Truth",
    "Execution Guidance",
    "Verification and Feedback Loop",
    "Living Record",
    "Stop and Ask Rules",
    "Run Command",
)

PLACEHOLDER = re.compile(
    r"<(?:(?:Goal Title)|(?:One bounded)|(?:short explanation)|(?:what already)|"
    r"(?:where Codex)|(?:decision to preserve)|(?:assumption)|(?:observable)|"
    r"(?:specific evidence)|(?:how Codex)|(?:allowed work)|(?:excluded work)|"
    r"(?:non-negotiable)|(?:accepted plan)|(?:supporting source)|(?:first responsible)|"
    r"(?:accepted decisions)|(?:phase or step)|(?:targeted test)|(?:final test)|"
    r"(?:honest proxy)|(?:first meaningful))[^>]*>|docs/codex-goals/<slug>",
    re.I,
)

PRIVATE_REASONING = re.compile(
    r"(?:show|reveal|provide|print|transcribe|include).{0,80}"
    r"(?:chain[- ]of[- ]thought|private reasoning|hidden reasoning|internal deliberation|reasoning trace)",
    re.I | re.S,
)

ACTIVE_BOARD_SEMANTICS = re.compile(
    r"(?:create|initialize|update|write|maintain|dispatch through|treat as canonical)"
    r".{0,80}(?:state\.yaml|GoalBuddy board|goal_worker|goal_judge|goal_scout|task receipt|\.goalbuddy-board)",
    re.I | re.S,
)


def heading_present(text: str, heading: str) -> bool:
    return bool(re.search(rf"^##\s+{re.escape(heading)}\s*$", text, re.M))


def extract_run_path(text: str) -> str | None:
    match = re.search(r"/goal\s+Follow\s+([^\s`]+/goal\.md)\.?", text)
    return match.group(1) if match else None


def validate(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not path.is_file():
        return [f"file not found: {path}"], warnings

    normalized = path.as_posix()
    if "/docs/goals/" in f"/{normalized}" or normalized.startswith("docs/goals/"):
        errors.append("standalone goals must not use docs/goals/<slug>/; that namespace is reserved for GoalBuddy boards")
    if "docs/codex-goals/" not in normalized:
        warnings.append("recommended path is docs/codex-goals/<slug>/goal.md")
    if path.name != "goal.md":
        errors.append("standalone native-goal file must be named goal.md")

    text = path.read_text(encoding="utf-8")
    if "<!-- codex-goal-compiler:native-goal:v1 -->" not in text:
        warnings.append("missing codex-goal-compiler:native-goal:v1 marker")

    for heading in REQUIRED_HEADINGS:
        if not heading_present(text, heading):
            errors.append(f"missing required heading: {heading}")

    if PLACEHOLDER.search(text):
        errors.append("unresolved template placeholder detected")
    if PRIVATE_REASONING.search(text):
        errors.append("goal requests private reasoning or a reasoning transcript")
    if ACTIVE_BOARD_SEMANTICS.search(text):
        errors.append("goal contains active GoalBuddy board semantics; use the GoalBuddy route instead")

    done_section = re.search(r"^## Definition of Done\s*$([\s\S]*?)(?=^##\s|\Z)", text, re.M)
    if not done_section or len(re.findall(r"^- \[[ xX]\] ", done_section.group(1), re.M)) < 1:
        errors.append("Definition of Done must contain at least one checklist item")
    if not re.search(r"\*\*Final proof:\*\*\s*\S", text):
        errors.append("missing non-empty Final proof")
    if not re.search(r"\*\*False-positive completion to avoid:\*\*\s*\S", text):
        warnings.append("missing explicit false-positive completion warning")

    if not re.search(r"Continue until", text, re.I):
        errors.append("Stop and Ask Rules must tell Codex to continue until completion or a real blocker")
    if not re.search(r"Ask only|Ask before", text, re.I):
        errors.append("missing explicit ask/approval boundary")

    run_path = extract_run_path(text)
    if not run_path:
        errors.append("missing /goal Follow <path>/goal.md command")
    else:
        expected_suffix = normalized[normalized.index("docs/codex-goals/"):] if "docs/codex-goals/" in normalized else normalized
        if run_path.rstrip(".") != expected_suffix:
            errors.append(f"run command path {run_path!r} does not match file path {expected_suffix!r}")

    if re.search(r"^## Progress\s*$", text, re.M):
        warnings.append("Progress should normally be nested under Living Record, not a second top-level section")

    return errors, warnings


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate a standalone native Codex goal")
    parser.add_argument("goal_path", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    errors, warnings = validate(args.goal_path)
    payload = {"ok": not errors, "path": str(args.goal_path), "errors": errors, "warnings": warnings}
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print("VALID" if not errors else "INVALID")
        for item in errors:
            print(f"ERROR: {item}")
        for item in warnings:
            print(f"WARNING: {item}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
