#!/usr/bin/env python3
from __future__ import annotations

import re
import unittest
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"


class TriggerAndDependencyContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.routing = (ROOT / "references" / "routing.md").read_text(encoding="utf-8")
        cls.openai = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_frontmatter_has_current_compatibility_and_version(self):
        match = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S)
        self.assertIsNotNone(match)
        front = match.group("front")
        for needle in ("native /goal", "Python 3", "GoalBuddy compiler contract v1", 'version: "4.0.0"'):
            self.assertIn(needle, front)
        if yaml is not None:
            data = yaml.safe_load(front)
            self.assertEqual("codex-goal-compiler", data["name"])
            self.assertEqual("4.0.0", data["metadata"]["version"])
            self.assertLessEqual(len(data["description"]), 1024)

    def test_description_preserves_positive_triggers_and_near_miss(self):
        front = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S).group("front")
        for trigger in (
            "turn this into a goal",
            "goalize this",
            "make a goal.md",
            "put this review round in goal mode",
            "compile this plan into a goal",
        ):
            self.assertIn(trigger, front)
        self.assertIn("Do not use merely to execute a small change", front)

    def test_route_specific_fallbacks_are_explicit(self):
        for needle in (
            "Omega unavailable",
            "Native `/goal` unavailable",
            "GoalBuddy or Goal Prep unavailable/stale",
            "Recurring runtime unavailable",
            "Governing plan resource unavailable",
        ):
            self.assertIn(needle, self.skill)
        self.assertIn("disclose that loss", self.routing)

    def test_routing_reference_covers_difficult_near_misses(self):
        for heading in ("Execute an existing goal", "Small direct task", "Vague planning request", "Recurring task"):
            self.assertIn(heading, self.routing)
        self.assertIn("This is execution, not compilation", self.routing)

    def test_goalbuddy_dependency_is_contract_bound_and_inline(self):
        combined = "\n".join((
            self.skill,
            (ROOT / "references" / "goalbuddy-compiler.md").read_text(encoding="utf-8"),
            (ROOT / "references" / "handoff-prompts.md").read_text(encoding="utf-8"),
        ))
        for needle in (
            "GoalBuddy compiler contract v1",
            "exact Goal Prep path",
            "directly in the current compiler context",
            "Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board",
            "official board checker",
        ):
            self.assertIn(needle, combined)

    def test_openai_prompt_matches_the_public_router(self):
        match = re.search(r'^\s*default_prompt:\s*"(?P<prompt>.*)"\s*$', self.openai, re.M)
        self.assertIsNotNone(match)
        prompt = match.group("prompt")
        self.assertLessEqual(len(prompt), 1024)
        self.assertIn("correct goal route", prompt)
        self.assertIn("compiler contract v1", prompt)
        self.assertIn("print the start command, and stop", prompt)
        self.assertRegex(self.openai, r"(?m)^\s*allow_implicit_invocation: true$")

    def test_goalprep_remains_an_explicit_internal_backend(self):
        goalbuddy = (ROOT.parents[0] / "goalbuddy" / "SKILL.md").read_text(encoding="utf-8")
        goalbuddy_openai = (ROOT.parents[0] / "goalbuddy" / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn("disable-model-invocation: true", goalbuddy)
        self.assertIn("user-invocable: true", goalbuddy)
        self.assertRegex(goalbuddy_openai, r"(?m)^\s*allow_implicit_invocation: false$")


if __name__ == "__main__":
    unittest.main()
