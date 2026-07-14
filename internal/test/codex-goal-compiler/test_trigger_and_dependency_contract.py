#!/usr/bin/env python3
from __future__ import annotations

import re
import unittest
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - structural tests still work without PyYAML
    yaml = None

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"


class TriggerAndDependencyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.routing = (ROOT / "references" / "routing.md").read_text(encoding="utf-8")
        cls.openai = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_frontmatter_has_concrete_compatibility_and_version(self):
        match = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S)
        self.assertIsNotNone(match)
        front = match.group("front")
        self.assertIn("compatibility:", front)
        self.assertIn("native /goal", front)
        self.assertIn("Python 3", front)
        self.assertIn("GoalBuddy compiler contract v1", front)
        self.assertIn('version: "3.2.1"', front)
        if yaml is not None:
            data = yaml.safe_load(front)
            self.assertEqual("codex-goal-compiler", data["name"])
            self.assertEqual("3.2.1", data["metadata"]["version"])
            self.assertLessEqual(len(data["description"]), 1024)

    def test_description_contains_positive_triggers_and_near_miss_boundary(self):
        match = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S)
        self.assertIsNotNone(match)
        front = match.group("front")
        for trigger in (
            "turn this into a goal",
            "goalize this",
            "make a goal.md",
            "put this review round in goal mode",
        ):
            self.assertIn(trigger, front)
        self.assertIn("Do not use merely to execute a small change", front)
        self.assertIn("unless the user explicitly asks to goalize or route", front)

    def test_body_states_primary_pattern_and_execution_boundary(self):
        self.assertIn("one user-facing skill and two internal compilers", self.skill)
        self.assertIn("Goal Prep is not a second routing front door", self.skill)
        self.assertIn("Trigger boundary and intended use", self.skill)
        self.assertIn("does not perform the underlying implementation", self.skill)
        self.assertIn("does not recompile or start it unless explicitly asked", self.skill)

    def test_route_specific_dependency_fallbacks_are_explicit(self):
        for needle in (
            "Omega unavailable",
            "Native `/goal` unavailable",
            "GoalBuddy or Goal Prep unavailable/stale",
            "Recurring runtime unavailable",
            "Governing plan resource unavailable",
        ):
            self.assertIn(needle, self.skill)
        for needle in (
            "Omega",
            "Native `/goal`",
            "GoalBuddy or Goal Prep",
            "Loop/Automation/Schedule",
            "Governing plans resource",
        ):
            self.assertIn(needle, self.routing)
        self.assertIn("disclose that loss", self.routing)

    def test_routing_reference_covers_difficult_near_misses(self):
        for heading in (
            "Execute an existing goal",
            "Small direct task",
            "Vague planning request",
            "Recurring task",
        ):
            self.assertIn(heading, self.routing)
        self.assertIn("This is execution, not compilation", self.routing)
        self.assertIn("do not create a perpetual goal", self.routing)

    def test_openai_default_prompt_is_bounded_and_preserves_no_start_rule(self):
        match = re.search(r'^\s*default_prompt:\s*"(?P<prompt>.*)"\s*$', self.openai, re.M)
        self.assertIsNotNone(match)
        prompt = match.group("prompt")
        self.assertLessEqual(len(prompt), 1024)
        self.assertIn("standalone native /goal", prompt)
        self.assertIn("GoalBuddy", prompt)
        self.assertIn("directly in the current compiler context", prompt)
        self.assertIn("do not implement or start execution unless explicitly requested", prompt)
        self.assertIn("explicitly load Goal Prep as the internal board-preparation dependency", prompt)
        self.assertRegex(self.openai, r"(?m)^\s*allow_implicit_invocation: true$")

    def test_goalprep_preparation_is_direct_and_bounded(self):
        goalbuddy = (ROOT / "references" / "goalbuddy-compiler.md").read_text(encoding="utf-8")
        handoff = (ROOT / "references" / "handoff-prompts.md").read_text(encoding="utf-8")
        combined = "\n".join((self.skill, goalbuddy, handoff))
        for needle in (
            "directly in the current compiler context",
            "explicit internal dependency",
            "do not rely on implicit skill matching",
            "Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board",
            "official board checker",
            "not run unrelated repository-wide product or source suites",
            "Return to the compiler immediately after checker and semantic acceptance",
        ):
            self.assertIn(needle, combined)
        for role in ("Scout", "Judge", "Worker", "Keeper", "Ledger", "Council"):
            self.assertIn(role, combined)


if __name__ == "__main__":
    unittest.main()
