#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3] / "codex-goal-compiler"
SPEC = importlib.util.spec_from_file_location("validate_native_goal", ROOT / "scripts" / "validate_native_goal.py")
assert SPEC and SPEC.loader
mod = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = mod
SPEC.loader.exec_module(mod)

VALID = """<!-- codex-goal-compiler:native-goal:v1 -->
# Review the completed migration

## Objective

Complete one bounded review and remediation round for the finished migration.

## Context Handoff

- **Why this goal now:** The implementation is complete and needs one final review.
- **Current state:** The prior board is complete.
- **Starting point:** Read the final diff and review report.
- **Agreed decisions:**
  - Preserve the accepted architecture.
- **Labeled assumptions:**
  - None.

## Definition of Done

- [ ] Every material finding is verified.
- [ ] Verified in-scope findings are fixed.
- [ ] Relevant checks pass.

**Final proof:** A clean final review plus exact passing check results.

**False-positive completion to avoid:** Producing an issue list without verifying or fixing material findings.

## Scope and Non-Goals

### In scope

- Review and bounded remediation.

### Out of scope

- New feature work.

## Constraints and Permissions

- Preserve public behavior.
- Ask before destructive, production, or external actions.

## Source of Truth

1. The completed GoalBuddy board, treated as read-only evidence.
2. The accepted plan and current diff.

## Execution Guidance

- Start with the final diff.
- Preserve accepted decisions.
- Work in coherent safe slices.

### Accepted plan or sequence

1. Inspect.
2. Verify findings.
3. Fix and retest.

## Verification and Feedback Loop

- **Fast feedback:** targeted tests.
- **Broad/final verification:** full relevant suite and final review.
- **Fallback evidence:** none.
- **Progress rule:** update after meaningful work.

## Living Record

### Progress

- [ ] Goal initialized.
- [ ] Review complete.

### Discoveries

- None yet.

### Decision Log

- **Initial:** Preserve accepted decisions.

### Attempts and Cleanup

- Remove failed attempts before completion.

### Outcome and Retrospective

- Complete at the end.

## Stop and Ask Rules

- Continue until every Definition of Done item is satisfied or a real blocker prevents further safe work.
- Ask only when approval or a material scope change is required.

## Run Command

```text
/goal Follow docs/codex-goals/final-review/goal.md.
```
"""


class Tests(unittest.TestCase):
    def write(self, text: str, rel: str = "docs/codex-goals/final-review/goal.md") -> Path:
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_valid(self):
        errors, _ = mod.validate(self.write(VALID))
        self.assertEqual([], errors)

    def test_missing_heading(self):
        errors, _ = mod.validate(self.write(VALID.replace("## Source of Truth", "## Sources")))
        self.assertTrue(any("Source of Truth" in item for item in errors))

    def test_placeholder(self):
        errors, _ = mod.validate(self.write(VALID.replace("Complete one bounded review", "<One bounded outcome>")))
        self.assertTrue(any("placeholder" in item for item in errors))

    def test_goalbuddy_path_rejected(self):
        errors, _ = mod.validate(self.write(VALID, "docs/goals/final-review/goal.md"))
        self.assertTrue(any("GoalBuddy" in item for item in errors))

    def test_run_path_mismatch(self):
        errors, _ = mod.validate(self.write(VALID.replace("final-review/goal.md", "other/goal.md")))
        self.assertTrue(any("does not match" in item for item in errors))

    def test_private_reasoning_rejected(self):
        errors, _ = mod.validate(self.write(VALID.replace("Start with the final diff.", "Show your hidden reasoning trace, then start with the final diff.")))
        self.assertTrue(any("private reasoning" in item for item in errors))

    def test_active_board_semantics_rejected(self):
        errors, _ = mod.validate(self.write(VALID.replace("Remove failed attempts", "Create state.yaml and remove failed attempts")))
        self.assertTrue(any("GoalBuddy board semantics" in item for item in errors))

    def test_read_only_board_reference_allowed(self):
        errors, _ = mod.validate(self.write(VALID))
        self.assertFalse(any("GoalBuddy board semantics" in item for item in errors))

    def test_missing_done_checklist(self):
        text = VALID.replace(
            "- [ ] Every material finding is verified.\n- [ ] Verified in-scope findings are fixed.\n- [ ] Relevant checks pass.",
            "Every material finding should be verified.",
        )
        errors, _ = mod.validate(self.write(text))
        self.assertTrue(any("checklist" in item for item in errors))


if __name__ == "__main__":
    unittest.main()
