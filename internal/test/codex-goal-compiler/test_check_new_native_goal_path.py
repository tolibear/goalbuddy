#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"
SPEC = importlib.util.spec_from_file_location(
    "check_new_native_goal_path", ROOT / "scripts" / "check_new_native_goal_path.py"
)
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)


class Tests(unittest.TestCase):
    def test_missing_root_is_available(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs" / "codex-goals").mkdir(parents=True)
            self.assertTrue(mod.check("docs/codex-goals/new-goal", str(root))["ok"])

    def test_collision_is_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "docs" / "codex-goals" / "existing"
            target.mkdir(parents=True)
            report = mod.check(str(target), str(root))
            self.assertFalse(report["ok"])
            self.assertTrue(report["collision"])

    def test_file_and_broken_symlink_collisions_are_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            goals = root / "docs" / "codex-goals"
            goals.mkdir(parents=True)
            file_path = goals / "file-goal"
            file_path.write_text("owner material", encoding="utf-8")
            self.assertFalse(mod.check(str(file_path), str(root))["ok"])
            link = goals / "broken-link"
            os.symlink(root / "missing", link)
            self.assertFalse(mod.check(str(link), str(root))["ok"])

    def test_goalbuddy_namespace_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs" / "goals").mkdir(parents=True)
            self.assertFalse(mod.check("docs/goals/not-native", str(root))["ok"])

    def test_nested_or_bad_slug_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs" / "codex-goals").mkdir(parents=True)
            for value in (
                "docs/codex-goals/one/nested",
                "docs/codex-goals/Bad_Slug",
                "docs/codex-goals/-leading",
                "docs/codex-goals/trailing-",
                "docs/codex-goals/double--dash",
            ):
                with self.subTest(value=value):
                    self.assertFalse(mod.check(value, str(root))["ok"])

    def test_symlinked_namespace_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "docs").mkdir()
            outside = root / "outside"
            outside.mkdir()
            os.symlink(outside, root / "docs" / "codex-goals")
            self.assertFalse(mod.check("docs/codex-goals/future", str(root))["ok"])


if __name__ == "__main__":
    unittest.main()
