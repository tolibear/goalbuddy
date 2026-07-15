#!/usr/bin/env python3
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"


class CompilerContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.goalbuddy = (ROOT / "references" / "goalbuddy-compiler.md").read_text(encoding="utf-8")
        cls.strategy = (ROOT / "references" / "adaptive-execution-strategy.md").read_text(encoding="utf-8")
        cls.handoff = (ROOT / "references" / "handoff-prompts.md").read_text(encoding="utf-8")
        cls.agent = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_name_version_and_single_output(self):
        self.assertIn("name: codex-goal-compiler", self.skill)
        self.assertIn('version: "4.0.0"', self.skill)
        self.assertIn("docs/goals/<slug>/", self.skill)
        self.assertIn("one public transformation", self.skill)

    def test_route_selector_job_is_removed(self):
        combined = "\n".join((self.skill, self.agent))
        for removed in (
            "Routes among direct work",
            "Standalone native Codex goal",
            "Loop, Automation, or Schedule",
            "one user-facing skill and two internal compilers",
            "docs/codex-goals/<slug>",
        ):
            self.assertNotIn(removed, combined)
        self.assertIn("does not choose an execution system", self.skill)
        self.assertIn("Do not route to another workflow", self.agent)

    def test_source_readiness_is_material_not_exhaustive(self):
        for needle in (
            "observable completion proof",
            "accepted scope, non-goals, constraints, and authority boundaries",
            "Do not require exhaustive implementation detail",
            "just in time",
            "change outcome, authority, risk, user-visible behavior, architecture, or final proof",
        ):
            self.assertIn(needle, self.skill)

    def test_not_compilable_is_fail_closed_and_non_mutating(self):
        self.assertIn("Compile: not_compilable", self.skill)
        self.assertIn("Board created: no", self.skill)
        self.assertIn("create no board", self.skill)
        self.assertIn("Do not ask a diagnostic ladder", self.skill)
        self.assertIn("never write placeholders into a board or invoke a hardening workflow", self.goalbuddy)

    def test_only_board_compiler_resources_ship(self):
        expected = (
            "references/goalbuddy-compiler.md",
            "references/adaptive-execution-strategy.md",
            "references/handoff-prompts.md",
            "scripts/check_goalbuddy_runtime.py",
            "scripts/check_new_goal_path.py",
            "scripts/validate_codex_goal_objective.py",
        )
        for rel in expected:
            self.assertTrue((ROOT / rel).is_file(), rel)
            self.assertIn(rel, self.skill)
        for rel in (
            "references/routing.md",
            "references/native-goal-compiler.md",
            "assets/native-goal.md",
            "scripts/check_new_native_goal_path.py",
            "scripts/validate_native_goal.py",
        ):
            self.assertFalse((ROOT / rel).exists(), rel)

    def test_goalbuddy_safety_contract_is_preserved(self):
        for needle in (
            "GoalBuddy compiler contract v1",
            "atomic_placeholder_hydration_transition",
            "lossless_receipt_identity",
            "strict_multiline_yaml_projection",
            "closed_judge_decision_vocabulary",
            "atomic_exact_human_wait_resume",
            "atomic_goal_completion",
            "Five-proof mapping",
            "clean Git baseline",
            "goal_worker_ultra",
            "Do not invent budgets",
        ):
            self.assertIn(needle, self.goalbuddy)
        self.assertIn("official_five_proof_mapping", self.handoff)

    def test_adaptive_strategy_preserves_dynamic_large_run_shape(self):
        for needle in (
            "vertical slices",
            "upfront, just-in-time, or hybrid",
            "review every diff",
            "keep small mechanical slices light",
            "never vendor skill names",
        ):
            self.assertIn(needle, self.skill)
        self.assertIn("Planning horizon", self.strategy)
        self.assertIn("capabilities are semantic", self.strategy)

    def test_large_source_is_bound_not_copied_into_board_truth(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff))
        self.assertIn("path and stable revision", combined)
        self.assertIn("content digest", combined)
        self.assertIn("never paste the complete source", combined)
        self.assertIn("Never copy the complete plan or specification into board truth", combined)

    def test_board_preparation_stays_inline_and_bounded(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff))
        self.assertIn("Goal Prep", combined)
        self.assertIn("same compiler context", combined)
        self.assertIn("Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board", combined)
        self.assertIn("official board checker", combined)
        self.assertIn("does not run unrelated repository-wide product or source suites", combined)

    def test_compiler_prints_commands_but_never_starts(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff, self.agent))
        self.assertIn("Execution started: no", self.skill)
        self.assertIn("never starts the goal", self.goalbuddy)
        self.assertIn("never calls `get_goal`, `create_goal`, or starts execution", self.handoff)
        self.assertNotIn("Start: <not requested | started", combined)

    def test_default_prompt_is_bounded_and_uses_same_skill(self):
        self.assertIn("$codex-goal-compiler", self.agent)
        match = re.search(r'^\s*default_prompt:\s*"(?P<value>.*)"\s*$', self.agent, re.M)
        self.assertIsNotNone(match)
        self.assertLessEqual(len(match.group("value")), 1024)

    def test_no_private_reasoning_request(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.strategy, self.handoff))
        self.assertNotRegex(
            combined,
            re.compile(r"(?:show|reveal|provide).{0,50}(?:chain[- ]of[- ]thought|private reasoning)", re.I | re.S),
        )


if __name__ == "__main__":
    unittest.main()
