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
        cls.strategy = (ROOT / "references" / "adaptive-execution-strategy.md").read_text(encoding="utf-8")
        cls.handoff = (ROOT / "references" / "handoff-prompts.md").read_text(encoding="utf-8")
        cls.agent = (ROOT / "agents" / "openai.yaml").read_text(encoding="utf-8")

    def test_name_version_and_one_front_door(self):
        self.assertIn("name: codex-goal-compiler", self.skill)
        self.assertIn('version: "4.0.0"', self.skill)
        self.assertIn("one user-facing skill and two internal compilers", self.skill)
        self.assertIn("native-goal compiler", self.skill)
        self.assertIn("GoalBuddy compiler", self.skill)
        self.assertIn("Goal Prep is not a second routing front door", self.skill)

    def test_all_routes_are_explicit(self):
        for route in (
            "Direct work",
            "Planning or Goal Prep",
            "Standalone native Codex goal",
            "GoalBuddy board",
            "Loop, Automation, or Schedule",
        ):
            self.assertIn(route, self.skill)
        self.assertIn("bounded plan-to-branch implementation package", self.skill)

    def test_backend_resources_load_only_after_route_selection(self):
        read_block = self.skill.split("## Read before routing", 1)[1].split("## Routing order", 1)[0]
        self.assertIn("Read `references/routing.md` first", read_block)
        self.assertIn("Do not load backend-specific compiler", read_block)
        goalbuddy_section = self.skill.split("## GoalBuddy route", 1)[1].split(
            "## Direct, planning, and recurring exits", 1
        )[0]
        for reference in (
            "references/goalbuddy-compiler.md",
            "references/adaptive-execution-strategy.md",
            "references/handoff-prompts.md",
        ):
            self.assertIn(reference, goalbuddy_section)

    def test_native_and_goalbuddy_namespaces_remain_separate(self):
        self.assertIn("docs/codex-goals/<slug>/goal.md", self.skill)
        self.assertIn("docs/goals/<slug>/", self.skill)
        self.assertIn("Never create `state.yaml`", self.skill)
        self.assertIn("Do not place standalone goals under `docs/goals/`", self.native)

    def test_goalbuddy_backend_uses_contract_v1_without_version_lock(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff))
        for needle in (
            "GoalBuddy compiler contract v1",
            "board schema v2",
            "atomic_placeholder_hydration_transition",
            "lossless_receipt_identity",
            "strict_multiline_yaml_projection",
            "closed_judge_decision_vocabulary",
            "atomic_exact_human_wait_resume",
            "atomic_goal_completion",
            "task_bound_codex_exec_resume",
            "content-aware before/after manifest",
            "exact equality",
            "goal_worker_ultra",
        ):
            self.assertIn(needle, combined)
        self.assertNotIn("stable GoalBuddy 0.4.x", combined)
        self.assertIn("accept additive", self.skill)

    def test_installed_goal_prep_binding_is_exact(self):
        combined = "\n".join((self.skill, self.goalbuddy, self.handoff))
        self.assertIn("contract.skills.goal_prep.path", combined)
        self.assertIn("contract.skills.compiler.path", combined)
        self.assertIn("tree fingerprint", combined)
        self.assertIn("Do not rediscover Goal Prep", combined)
        self.assertIn("stop and rerun preflight", combined)

    def test_native_resources_and_goalbuddy_backend_ship_together(self):
        for rel in (
            "references/routing.md",
            "references/native-goal-compiler.md",
            "assets/native-goal.md",
            "scripts/check_new_native_goal_path.py",
            "scripts/validate_native_goal.py",
            "scripts/check_goalbuddy_runtime.py",
            "scripts/check_new_goal_path.py",
            "scripts/validate_codex_goal_objective.py",
        ):
            self.assertTrue((ROOT / rel).is_file(), rel)

    def test_adaptive_strategy_preserves_large_run_shape(self):
        normalized = re.sub(r"\s+", " ", self.strategy.lower())
        for needle in (
            "vertical slices",
            "upfront, just-in-time, or hybrid",
            "review every diff",
            "keep small mechanical slices light",
        ):
            self.assertIn(needle, normalized)
        self.assertIn("bounded component or directory globs", self.strategy)
        self.assertIn("atomic just-in-time hydration", self.strategy)

    def test_goalbuddy_acceptance_is_evidence_bound_without_clean_worktree_gate(self):
        for needle in (
            "exact path, existence proof, revision or SHA-256",
            "explicit coherence rationale or is split",
            "Worker `verify` contains only commands that Worker may run",
            "implementation review is owned by the lead/native review workflow",
            "complete package (`allowed_files`, `verify`, and `stop_if`)",
            "direct card, bound current plan, or just-in-time hardened brief",
            "one compact acceptance matrix",
        ):
            self.assertIn(needle, self.handoff)
        self.assertIn("supports a preserved dirty baseline", self.handoff)
        self.assertNotIn("clean-worktree-only", self.handoff)
        self.assertNotIn("If `git status --porcelain` is nonempty, do not propose cross-vendor dispatch", self.handoff)

    def test_goalbuddy_compile_prints_start_and_stops(self):
        section = self.skill.split("## GoalBuddy route", 1)[1].split(
            "## Direct, planning, and recurring exits", 1
        )[0]
        self.assertIn("Print the target-correct start command and stop", section)
        self.assertIn("never starts the goal", self.goalbuddy)
        self.assertIn("never calls `get_goal`, `create_goal`, or starts execution", self.handoff)

    def test_default_prompt_is_bounded_and_routes(self):
        self.assertIn("$codex-goal-compiler", self.agent)
        match = re.search(r'^\s*default_prompt:\s*"(?P<value>.*)"\s*$', self.agent, re.M)
        self.assertIsNotNone(match)
        self.assertLessEqual(len(match.group("value")), 1024)
        for route in ("direct work", "standalone native /goal", "GoalBuddy", "Omega", "recurring automation"):
            self.assertIn(route, match.group("value"))

    def test_no_private_reasoning_request(self):
        combined = "\n".join((self.skill, self.routing, self.native, self.goalbuddy, self.strategy, self.handoff))
        self.assertNotRegex(
            combined,
            re.compile(r"(?:show|reveal|provide).{0,50}(?:chain[- ]of[- ]thought|private reasoning)", re.I | re.S),
        )


if __name__ == "__main__":
    unittest.main()
