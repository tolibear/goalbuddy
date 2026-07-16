#!/usr/bin/env python3
"""Validate GoalBuddy's stable compiler contract for one selected harness.

GoalBuddy owns installation topology, agent inventory, provenance, and doctor
details. The compiler consumes only this versioned projection and its required
capability subset, so additive runtime changes do not break goal compilation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
from pathlib import Path
from typing import Any

REQUIRED_CONTRACT_VERSION = 1
REQUIRED_BOARD_SCHEMA_VERSION = 2
FINGERPRINT_RE = re.compile(r"^[0-9a-f]{64}$")
FINGERPRINT_EXCLUDES = {
    ".DS_Store",
    ".goalbuddy-board",
    ".goalbuddy-install.json",
    ".goal-maker-install.json",
    "__pycache__",
}
REQUIRED_RUNTIME_CAPABILITIES = frozenset(
    {
        "atomic_amendment_transition",
        "atomic_placeholder_hydration_transition",
        "lossless_receipt_identity",
        "strict_multiline_yaml_projection",
        "closed_judge_decision_vocabulary",
        "atomic_exact_human_wait_resume",
        "atomic_goal_completion",
    }
)


def resolve_cli() -> Path | None:
    override = os.environ.get("GOALBUDDY_BIN")
    if override:
        candidate = Path(override).expanduser()
        return candidate if candidate.is_file() and os.access(candidate, os.X_OK) else None
    bun_install = Path(os.environ.get("BUN_INSTALL", Path.home() / ".bun")).expanduser()
    candidate = bun_install / "bin" / "goalbuddy"
    return candidate if candidate.is_file() and os.access(candidate, os.X_OK) else None


def command_timeout_seconds() -> float:
    raw = os.environ.get("GOALBUDDY_TIMEOUT_SECONDS", "30")
    try:
        timeout = float(raw)
    except ValueError as error:
        raise ValueError(
            f"GOALBUDDY_TIMEOUT_SECONDS must be a finite positive number; got {raw!r}"
        ) from error
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError(f"GOALBUDDY_TIMEOUT_SECONDS must be a finite positive number; got {raw!r}")
    return timeout


def run_json(command: list[str], *, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, None, f"command timed out after {timeout:g}s: {' '.join(command)}"
    except OSError as error:
        return 127, None, f"could not launch {' '.join(command)}: {error}"

    try:
        decoded = json.loads(result.stdout)
    except json.JSONDecodeError:
        decoded = None
    if not isinstance(decoded, dict) or not decoded:
        detail = (result.stderr or result.stdout).strip()
        return result.returncode, None, detail or "command returned empty or non-object JSON"
    return result.returncode, decoded, ""


def skill_tree_fingerprint(root: Path) -> str:
    if not root.is_dir():
        return ""
    digest = hashlib.sha256()
    files = sorted(
        path
        for path in root.rglob("*")
        if path.is_file()
        and not any(part in FINGERPRINT_EXCLUDES for part in path.relative_to(root).parts)
    )
    for path in files:
        relative = path.relative_to(root).as_posix()
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def contract_semantic_errors(target: str, contract: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    required_fields = {
        "ok",
        "contract_version",
        "product_version",
        "board_schema_version",
        "skills",
        "capabilities",
        "source",
        "target",
        "errors",
    }
    missing_fields = sorted(required_fields.difference(contract))
    if missing_fields:
        errors.append(f"GoalBuddy contract missing required fields: {missing_fields}")

    if contract.get("contract_version") != REQUIRED_CONTRACT_VERSION:
        errors.append(
            f"GoalBuddy compiler contract v{REQUIRED_CONTRACT_VERSION} required; "
            f"found {contract.get('contract_version')!r}"
        )
    if contract.get("board_schema_version") != REQUIRED_BOARD_SCHEMA_VERSION:
        errors.append(
            f"GoalBuddy board schema v{REQUIRED_BOARD_SCHEMA_VERSION} required; "
            f"found {contract.get('board_schema_version')!r}"
        )
    if not isinstance(contract.get("product_version"), str) or not contract.get("product_version"):
        errors.append("GoalBuddy contract product_version must be a non-empty string")

    skills = contract.get("skills")
    if not isinstance(skills, dict):
        errors.append("GoalBuddy contract skills must be an object")
    else:
        for skill_name in ("goal_prep", "compiler"):
            binding = skills.get(skill_name)
            if not isinstance(binding, dict):
                errors.append(f"GoalBuddy contract skills.{skill_name} must be an object")
                continue
            path_value = binding.get("path")
            fingerprint = binding.get("tree_fingerprint")
            source_fingerprint = binding.get("source_tree_fingerprint")
            if not isinstance(path_value, str) or not Path(path_value).is_absolute():
                errors.append(f"GoalBuddy contract skills.{skill_name}.path must be absolute")
                continue
            if not isinstance(fingerprint, str) or not FINGERPRINT_RE.fullmatch(fingerprint):
                errors.append(f"GoalBuddy contract skills.{skill_name}.tree_fingerprint must be sha256")
                continue
            if not isinstance(source_fingerprint, str) or not FINGERPRINT_RE.fullmatch(source_fingerprint):
                errors.append(f"GoalBuddy contract skills.{skill_name}.source_tree_fingerprint must be sha256")
                continue
            actual_fingerprint = skill_tree_fingerprint(Path(path_value))
            if actual_fingerprint != fingerprint:
                errors.append(f"GoalBuddy contract skills.{skill_name} path bytes do not match its fingerprint")
            if fingerprint != source_fingerprint:
                errors.append(f"GoalBuddy contract skills.{skill_name} installed bytes do not match source bytes")

    capabilities = contract.get("capabilities")
    if not isinstance(capabilities, list) or not all(isinstance(item, str) for item in capabilities):
        errors.append("GoalBuddy contract capabilities must be a list of strings")
    else:
        capability_set = set(capabilities)
        if len(capability_set) != len(capabilities):
            errors.append("GoalBuddy contract capabilities must not contain duplicates")
        for capability in sorted(REQUIRED_RUNTIME_CAPABILITIES.difference(capability_set)):
            errors.append(f"GoalBuddy runtime capability {capability!r} is required")

    source = contract.get("source")
    if not isinstance(source, dict):
        errors.append("GoalBuddy contract source must be an object")
    else:
        if source.get("kind") != "local_git_checkout":
            errors.append(f"GoalBuddy contract source.kind is invalid: {source.get('kind')!r}")
        if not isinstance(source.get("root"), str) or not source.get("root"):
            errors.append("GoalBuddy contract source.root must be a non-empty string")
        if source.get("verified") is not True:
            errors.append("GoalBuddy contract source must be verified")
        if source.get("installed_bytes_match") is not True:
            errors.append("GoalBuddy installed package bytes must match the local checkout")

    target_report = contract.get("target")
    if not isinstance(target_report, dict):
        errors.append("GoalBuddy contract target must be an object")
    else:
        if target_report.get("name") != target:
            errors.append(f"GoalBuddy contract target mismatch: {target_report.get('name')!r}")
        expected_install_model = "plugin" if target == "codex" else "personal-skills-and-agents"
        if target_report.get("install_model") != expected_install_model:
            errors.append(
                f"GoalBuddy {target} install model must be {expected_install_model!r}; "
                f"found {target_report.get('install_model')!r}"
            )
        for field in ("ready", "goal_prep_installed", "compiler_installed", "agents_ready", "source_ready"):
            if target_report.get(field) is not True:
                errors.append(f"GoalBuddy {target} target.{field} must be true")
        if target == "codex":
            if target_report.get("native_goal_ready") is not True:
                errors.append("GoalBuddy Codex target.native_goal_ready must be true")
            if target_report.get("duplicate_compiler_present") is not False:
                errors.append("GoalBuddy Codex target reports a duplicate standalone compiler")
        elif target_report.get("goal_command_ready") is not True:
            errors.append("GoalBuddy Claude target.goal_command_ready must be true")

    declared_errors = contract.get("errors")
    if not isinstance(declared_errors, list):
        errors.append("GoalBuddy contract errors must be a list")
    else:
        errors.extend(str(error) for error in declared_errors if error)
    if contract.get("ok") is not True:
        errors.append("GoalBuddy contract reports ok=false")
    return errors


def preflight(target: str) -> dict[str, Any]:
    try:
        timeout = command_timeout_seconds()
    except ValueError as error:
        return {"ok": False, "target": target, "errors": [str(error)]}

    cli = resolve_cli()
    if cli is None:
        return {
            "ok": False,
            "target": target,
            "errors": ["GoalBuddy CLI not found; install the GoalBuddy-owned local runtime."],
        }

    exit_code, contract, command_error = run_json(
        [str(cli), "contract", "--target", target, "--json"], timeout=timeout
    )
    errors: list[str] = []
    if contract is None:
        errors.append(command_error or f"GoalBuddy {target} contract returned invalid output")
    else:
        errors.extend(contract_semantic_errors(target, contract))
    if exit_code != 0:
        errors.append(f"GoalBuddy {target} contract exited {exit_code}")

    return {
        "ok": not errors,
        "target": target,
        "resolved_cli_path": str(cli.resolve()),
        "contract": contract or {},
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate GoalBuddy compiler contract v1.")
    parser.add_argument("--target", choices=("codex", "claude"), required=True)
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of concise text.")
    args = parser.parse_args()

    report = preflight(args.target)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    elif report["ok"]:
        version = report["contract"].get("product_version", "unknown")
        print(f"GoalBuddy {version} {args.target} compiler contract: pass")
    else:
        print(f"GoalBuddy {args.target} compiler contract: blocked")
        for error in report["errors"]:
            print(f"- {error}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
