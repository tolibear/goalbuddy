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
        cls.openai = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_frontmatter_has_concrete_compatibility_and_version(self):
        match = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S)
        self.assertIsNotNone(match)
        front = match.group("front")
        self.assertIn("Python 3", front)
        self.assertIn("GoalBuddy compiler contract v1", front)
        self.assertIn('version: "4.0.0"', front)
        if yaml is not None:
            data = yaml.safe_load(front)
            self.assertEqual("codex-goal-compiler", data["name"])
            self.assertEqual("4.0.0", data["metadata"]["version"])
            self.assertLessEqual(len(data["description"]), 1024)

    def test_description_contains_positive_triggers(self):
        match = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S)
        self.assertIsNotNone(match)
        front = match.group("front")
        for trigger in (
            "compile this spec into a GoalBuddy board",
            "turn this accepted plan into a goal board",
            "use Codex Goal Compiler",
            "make a board from what we decided",
        ):
            self.assertIn(trigger, front)

    def test_description_and_body_reject_adjacent_jobs(self):
        front = re.match(r"^---\n(?P<front>.*?)\n---\n", self.skill, re.S).group("front")
        for near_miss in (
            "direct work",
            "planning",
            "native goals",
            "Omega",
            "recurring automation",
            "existing-board recovery",
        ):
            self.assertIn(near_miss, front)
        for heading in (
            "creating or reviewing a plan or specification",
            "implementing a change",
            "resuming, migrating, auditing, or repairing an existing board",
        ):
            self.assertIn(heading, self.skill)

    def test_small_explicit_board_request_is_honored(self):
        self.assertIn("a small decision-complete plan when the user explicitly wants a board", self.skill)
        self.assertIn("smallest honest board", self.skill)
        self.assertIn("source contract, oracle, and completion-proof floor", self.skill)

    def test_missing_source_does_not_trigger_another_workflow(self):
        for needle in (
            "Do not select, invoke, or orchestrate the adjacent workflow",
            "Do not ask a diagnostic ladder",
            "run another skill",
            "not_compilable",
        ):
            self.assertIn(needle, self.skill)

    def test_dependencies_are_only_compilation_dependencies(self):
        for needle in (
            "references/goalbuddy-compiler.md",
            "references/adaptive-execution-strategy.md",
            "references/handoff-prompts.md",
            "installed Goal Prep `SKILL.md`",
            "GoalBuddy's official checker",
        ):
            self.assertIn(needle, self.skill)
        for removed in ("references/routing.md", "references/native-goal-compiler.md", "assets/native-goal.md"):
            self.assertNotIn(removed, self.skill)

    def test_openai_default_prompt_matches_compiler_boundary(self):
        match = re.search(r'^\s*default_prompt:\s*"(?P<prompt>.*)"\s*$', self.openai, re.M)
        self.assertIsNotNone(match)
        prompt = match.group("prompt")
        self.assertLessEqual(len(prompt), 1024)
        self.assertIn("new validated GoalBuddy board", prompt)
        self.assertIn("return not_compilable", prompt)
        self.assertIn("Do not route to another workflow", prompt)
        self.assertIn("do not implement or start execution", prompt.lower())
        self.assertRegex(self.openai, r"(?m)^\s*allow_implicit_invocation: true$")

    def test_goalprep_is_an_explicit_internal_backend(self):
        goalbuddy = (ROOT.parents[0] / "goalbuddy" / "SKILL.md").read_text(encoding="utf-8")
        goalbuddy_openai = (ROOT.parents[0] / "goalbuddy" / "agents" / "openai.yaml").read_text(encoding="utf-8")
        self.assertIn("disable-model-invocation: true", goalbuddy)
        self.assertIn("user-invocable: true", goalbuddy)
        self.assertRegex(goalbuddy_openai, r"(?m)^\s*allow_implicit_invocation: false$")


if __name__ == "__main__":
    unittest.main()
