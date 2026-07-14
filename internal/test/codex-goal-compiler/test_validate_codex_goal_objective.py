#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"
SPEC = importlib.util.spec_from_file_location(
    "validate_codex_goal_objective", ROOT / "scripts" / "validate_codex_goal_objective.py"
)
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)
SCRIPT = ROOT / "scripts" / "validate_codex_goal_objective.py"


class ValidateObjectiveTests(unittest.TestCase):
    def test_normalization(self):
        cases = {
            "bare command": ("/goal", ""),
            "spaces only body": ("/goal    ", ""),
            "tab only body": ("/goal\t", ""),
            "newline only body": ("/goal\n", ""),
            "normal command": ("/goal Ship the compiler fixes", "Ship the compiler fixes"),
            "raw objective": ("Ship the compiler fixes", "Ship the compiler fixes"),
            "fenced command": ("```text\n/goal Ship the compiler fixes\n```", "Ship the compiler fixes"),
        }
        for label, (text, expected) in cases.items():
            with self.subTest(label=label):
                self.assertEqual(expected, mod.normalize(text))

    def test_cli_objective_length_limits(self):
        for length, expected_exit in ((0, 1), (4000, 0), (4001, 1)):
            with self.subTest(length=length):
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), "--text", "x" * length, "--json"],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(expected_exit, result.returncode)

    def test_cli_reports_missing_and_non_utf8_files_as_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cases = (root / "missing.txt", root / "non-utf8.txt")
            cases[1].write_bytes(b"\xff\xfe")

            for path in cases:
                with self.subTest(path=path.name):
                    result = subprocess.run(
                        [sys.executable, str(SCRIPT), str(path), "--json"],
                        check=False,
                        capture_output=True,
                        text=True,
                    )
                    self.assertEqual(1, result.returncode)
                    self.assertEqual("", result.stderr)
                    report = json.loads(result.stdout)
                    self.assertFalse(report["ok"])
                    self.assertEqual(0, report["objective_chars"])
                    self.assertIn("could not read objective input", report["error"])


if __name__ == "__main__":
    unittest.main()
