#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPT = REPO / "codex-goal-compiler" / "scripts" / "check_goalbuddy_runtime.py"
SPEC = importlib.util.spec_from_file_location("check_goalbuddy_runtime", SCRIPT)
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)

RUNTIME_CAPABILITIES = sorted(mod.REQUIRED_RUNTIME_CAPABILITIES)


def valid_contract(target: str) -> dict[str, object]:
    target_report: dict[str, object] = {
        "name": target,
        "ready": True,
        "install_model": "plugin" if target == "codex" else "personal-skills-and-agents",
        "goal_prep_installed": True,
        "compiler_installed": True,
        "agents_ready": True,
        "source_ready": True,
    }
    if target == "codex":
        target_report.update(native_goal_ready=True, duplicate_compiler_present=False)
    else:
        target_report["goal_command_ready"] = True
    goal_prep_path = REPO / "goalbuddy"
    compiler_path = REPO / "codex-goal-compiler"
    return {
        "ok": True,
        "contract_version": 1,
        "product_version": "0.5.0",
        "board_schema_version": 2,
        "skills": {
            "goal_prep": {
                "path": str(goal_prep_path),
                "tree_fingerprint": mod.skill_tree_fingerprint(goal_prep_path),
                "source_tree_fingerprint": mod.skill_tree_fingerprint(goal_prep_path),
            },
            "compiler": {
                "path": str(compiler_path),
                "tree_fingerprint": mod.skill_tree_fingerprint(compiler_path),
                "source_tree_fingerprint": mod.skill_tree_fingerprint(compiler_path),
            },
        },
        "capabilities": list(RUNTIME_CAPABILITIES),
        "source": {
            "kind": "local_git_checkout",
            "root": "/tmp/goalbuddy",
            "commit": "a" * 40,
            "dirty": False,
            "installed_bytes_match": True,
            "verified": True,
        },
        "target": target_report,
        "errors": [],
    }


class Tests(unittest.TestCase):
    def test_accepts_both_targets_and_additive_runtime_fields(self):
        for target in ("codex", "claude"):
            with self.subTest(target=target):
                contract = valid_contract(target)
                contract["capabilities"].append("future_additive_capability")
                contract["future_metadata"] = {"allowed": True}
                self.assertEqual([], mod.contract_semantic_errors(target, contract))

    def test_rejects_missing_required_capability_without_rejecting_unknown_capabilities(self):
        contract = valid_contract("codex")
        contract["capabilities"].remove("atomic_amendment_transition")
        errors = mod.contract_semantic_errors("codex", contract)
        self.assertTrue(any("atomic_amendment_transition" in error for error in errors), errors)

        contract["capabilities"].append("future_additive_capability")
        errors = mod.contract_semantic_errors("codex", contract)
        self.assertFalse(any("unknown" in error for error in errors), errors)

    def test_rejects_contract_schema_target_and_readiness_mismatches(self):
        cases = []
        contract = valid_contract("codex")
        contract["contract_version"] = 2
        cases.append(contract)
        contract = valid_contract("codex")
        contract["board_schema_version"] = 3
        cases.append(contract)
        contract = valid_contract("codex")
        contract["target"]["name"] = "claude"
        cases.append(contract)
        contract = valid_contract("codex")
        contract["target"]["compiler_installed"] = False
        cases.append(contract)
        contract = valid_contract("codex")
        contract["target"]["duplicate_compiler_present"] = True
        cases.append(contract)
        contract = valid_contract("codex")
        contract["ok"] = False
        contract["errors"] = ["runtime blocked"]
        cases.append(contract)

        for contract in cases:
            with self.subTest(contract=contract):
                self.assertTrue(mod.contract_semantic_errors("codex", contract))

    def test_rejects_skill_path_fingerprint_and_source_drift(self):
        contract = valid_contract("codex")
        contract["skills"]["goal_prep"]["path"] = "relative/path"
        errors = mod.contract_semantic_errors("codex", contract)
        self.assertTrue(any("path must be absolute" in error for error in errors), errors)

        contract = valid_contract("codex")
        contract["skills"]["goal_prep"]["tree_fingerprint"] = "0" * 64
        errors = mod.contract_semantic_errors("codex", contract)
        self.assertTrue(any("path bytes do not match" in error for error in errors), errors)

        contract = valid_contract("codex")
        contract["skills"]["goal_prep"]["source_tree_fingerprint"] = "f" * 64
        errors = mod.contract_semantic_errors("codex", contract)
        self.assertTrue(any("installed bytes do not match source" in error for error in errors), errors)

    def test_timeout_configuration_requires_a_finite_positive_number(self):
        original = os.environ.get("GOALBUDDY_TIMEOUT_SECONDS")
        try:
            for value in ("not-a-number", "0", "-1", "nan", "inf"):
                with self.subTest(value=value):
                    os.environ["GOALBUDDY_TIMEOUT_SECONDS"] = value
                    with self.assertRaisesRegex(ValueError, "finite positive number"):
                        mod.command_timeout_seconds()
            os.environ["GOALBUDDY_TIMEOUT_SECONDS"] = "0.25"
            self.assertEqual(0.25, mod.command_timeout_seconds())
        finally:
            if original is None:
                os.environ.pop("GOALBUDDY_TIMEOUT_SECONDS", None)
            else:
                os.environ["GOALBUDDY_TIMEOUT_SECONDS"] = original

    def test_resolve_cli_override(self):
        with tempfile.TemporaryDirectory() as directory:
            cli = Path(directory) / "goalbuddy"
            cli.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            cli.chmod(cli.stat().st_mode | stat.S_IXUSR)
            old = os.environ.get("GOALBUDDY_BIN")
            try:
                os.environ["GOALBUDDY_BIN"] = str(cli)
                self.assertEqual(cli, mod.resolve_cli())
            finally:
                if old is None:
                    os.environ.pop("GOALBUDDY_BIN", None)
                else:
                    os.environ["GOALBUDDY_BIN"] = old


if __name__ == "__main__":
    unittest.main()
