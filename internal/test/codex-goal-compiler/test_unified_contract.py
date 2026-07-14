#!/usr/bin/env python3
from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"


class UnifiedContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.routing = (ROOT / "references" / "routing.md").read_text(encoding="utf-8")
        cls.native = (ROOT / "references" / "native-goal-compiler.md").read_text(encoding="utf-8")
        cls.goalbuddy = (ROOT / "references" / "goalbuddy-compiler.md").read_text(encoding="utf-8")
        cls.handoff = (ROOT / "references" / "handoff-prompts.md").read_text(encoding="utf-8")
        cls.agent = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_name_and_version(self):
        self.assertIn("name: codex-goal-compiler", self.skill)
        self.assertIn('version: "3.2.1"', self.skill)

    def test_one_front_door_and_two_internal_compilers(self):
        self.assertIn("one user-facing skill and two internal compilers", self.skill)
        self.assertIn("native-goal compiler", self.skill)
        self.assertIn("GoalBuddy compiler", self.skill)
        self.assertIn("Goal Prep is not a second routing front door", self.skill)
        self.assertNotIn("use `codex-goal-handoff`", self.skill)

    def test_all_routes_are_explicit(self):
        for route in (
            "Direct work",
            "Planning or Goal Prep",
            "Standalone native Codex goal",
            "GoalBuddy board",
            "Loop, Automation, or Schedule",
        ):
            self.assertIn(route, self.skill)


    def test_omega_is_considered_before_native_goal(self):
        omega = self.skill.index("bounded plan-to-branch implementation package")
        native = self.skill.index("one bounded, coherent outcome that benefits from persistence")
        self.assertLess(omega, native)

    def test_backend_references_load_only_after_route_selection(self):
        read_block = self.skill.split("## Read before routing", 1)[1].split("## Routing order", 1)[0]
        self.assertIn("Read `references/routing.md` first", read_block)
        self.assertIn("Do not load backend-specific compiler", read_block)
        self.assertIn("Direct work, planning, or recurring work", read_block)
        self.assertNotIn("../omega-cycle/", read_block)

        goalbuddy_section = self.skill.split("## GoalBuddy route", 1)[1].split(
            "## Direct, planning, and recurring exits", 1
        )[0]
        for reference in (
            "references/goalbuddy-compiler.md",
            "references/adaptive-execution-strategy.md",
            "references/handoff-prompts.md",
        ):
            self.assertIn(reference, goalbuddy_section)

    def test_namespaces_are_separate(self):
        self.assertIn("docs/codex-goals/<slug>/goal.md", self.skill)
        self.assertIn("docs/goals/<slug>/", self.skill)
        self.assertIn("Never create `state.yaml`", self.skill)
        self.assertIn("Do not place standalone goals under `docs/goals/`", self.native)

    def test_post_board_review_defaults_native(self):
        self.assertIn("post-board review default", self.skill.lower())
        self.assertIn("completed GoalBuddy board", self.routing)
        self.assertIn("read-only evidence", self.skill)

    def test_goalbuddy_contract_preserved(self):
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
            "token_budget",
            "Do not invent budgets",
        ):
            self.assertIn(needle, self.goalbuddy)
        self.assertIn("official_five_proof_mapping", self.handoff)

    def test_native_scripts_and_asset_exist(self):
        for rel in (
            "assets/native-goal.md",
            "scripts/check_new_native_goal_path.py",
            "scripts/validate_native_goal.py",
            "scripts/check_goalbuddy_runtime.py",
            "scripts/check_new_goal_path.py",
            "scripts/validate_codex_goal_objective.py",
        ):
            self.assertTrue((ROOT / rel).is_file(), rel)

    def test_default_prompt_uses_same_skill_name(self):
        self.assertIn("$codex-goal-compiler", self.agent)
        self.assertIn("standalone native /goal", self.agent)
        match = re.search(r'^\s*default_prompt:\s*"(?P<value>.*)"\s*$', self.agent, re.M)
        self.assertIsNotNone(match)
        self.assertLessEqual(len(match.group("value")), 1024)

    def test_no_private_reasoning_request(self):
        combined = "\n".join((self.skill, self.routing, self.native, self.goalbuddy, self.handoff))
        self.assertNotRegex(
            combined,
            re.compile(r"(?:show|reveal|provide).{0,50}(?:chain[- ]of[- ]thought|private reasoning)", re.I | re.S),
        )

    def test_start_safety_and_legacy_handoff_contract(self):
        self.assertIn("one durable objective and living execution record", self.native)
        self.assertIn("Never clear, overwrite, or silently replace an unfinished active goal", self.goalbuddy)
        self.assertNotIn("use `codex-goal-handoff`", self.skill)
        self.assertNotIn("goalbuddy resume` is another prompt", self.skill)

    def test_board_preparation_returns_to_the_same_compiler_context(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff))
        self.assertIn("Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board", combined)
        self.assertIn("return immediately to the current compiler", combined)
        self.assertIn("explicit internal dependency", combined)
        self.assertIn("do not rely on implicit skill matching", combined)
        self.assertIn("must not run unrelated repository-wide product or source suites", combined)
        self.assertIn("does not restrict intended Scout, Judge, Worker, Keeper, Ledger, Council", combined)


if __name__ == "__main__":
    unittest.main()
