#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"
SPEC = importlib.util.spec_from_file_location("check_new_goal_path", ROOT / "scripts" / "check_new_goal_path.py")
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class GoalPathTests(unittest.TestCase):
    def test_available_and_relative_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            goals = root / "docs" / "goals"
            goals.mkdir(parents=True)

            self.assertTrue(mod.check(str(goals / "missing"), str(root))["ok"])
            self.assertTrue(mod.check("docs/goals/relative", str(root))["ok"])

    def test_existing_paths_and_nested_roots_are_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            goals = root / "docs" / "goals"
            goals.mkdir(parents=True)

            existing_dir = goals / "existing-dir"
            existing_dir.mkdir()
            self.assertFalse(mod.check(str(existing_dir), str(root))["ok"])

            existing_file = goals / "existing-file"
            existing_file.write_text("user material", encoding="utf-8")
            self.assertFalse(mod.check(str(existing_file), str(root))["ok"])
            self.assertFalse(mod.check(str(existing_dir / "nested"), str(root))["ok"])
            self.assertFalse(mod.check(str(root / "outside"), str(root))["ok"])

    def test_broken_symlinks_and_escaped_namespaces_are_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            goals = root / "docs" / "goals"
            goals.mkdir(parents=True)

            broken_link = goals / "broken-link"
            os.symlink(root / "absent-target", broken_link)
            self.assertFalse(mod.check(str(broken_link), str(root))["ok"])

            escaped_root = root / "escaped-project"
            (escaped_root / "docs").mkdir(parents=True)
            outside = root / "outside-goals"
            outside.mkdir()
            os.symlink(outside, escaped_root / "docs" / "goals")
            self.assertFalse(mod.check("docs/goals/future", str(escaped_root))["ok"])

    def test_slug_and_path_shape_are_strict(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            goals = root / "docs" / "goals"
            goals.mkdir(parents=True)

            self.assertFalse(mod.check(str(goals / "Bad_Slug"), str(root))["ok"])
            for malformed in (
                "docs//goals/future",
                "docs/./goals/future",
                "docs/goals/../goals/future",
                "docs/goals/future/",
            ):
                with self.subTest(value=malformed):
                    self.assertFalse(mod.check(malformed, str(root))["ok"])
            for bad_slug in ("-leading", "trailing-", "double--dash"):
                with self.subTest(value=bad_slug):
                    self.assertFalse(mod.check(str(goals / bad_slug), str(root))["ok"])


if __name__ == "__main__":
    unittest.main()
