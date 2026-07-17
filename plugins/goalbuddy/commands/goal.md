---
description: Run the GoalBuddy execution loop against a prepared goal board
---

Run the GoalBuddy `/goal` execution loop.

Goal: $ARGUMENTS

If the argument names a prepared `docs/goals/<slug>/goal.md`, read only that charter and the installed Goal Prep kernel. When this command was read from `<claude-home>/commands/goal.md`, use the sibling `<claude-home>/skills/goal-prep` directly; do not query environment variables or search for another copy. Otherwise resolve `<skill-path>` once as `${CLAUDE_HOME:-$HOME/.claude}/skills/goal-prep`; do not replace a set `CLAUDE_HOME` with `~/.claude`. Read `<skill-path>/references/goal-execution.md` directly, then run `<skill-path>/scripts/resume-board.mjs` for the compact explicit-board resume projection. During prepared execution, do not search source repos, locate alternate copies, or compare mirrors; install and doctor own provenance. Do not load Goal Prep, Codex Goal Compiler, raw `state.yaml`, or `references/goal-execution-reference.md` on a healthy start. Load only the exceptional-reference recipe named by a kernel trigger. Direct board review is recovery-only after a discrepant, uncertain, failed, or unavailable audit, or when the projection names evidence requiring inspection.

If the argument is raw intent rather than a prepared charter, route to Goal Prep intake. If the kernel cannot be read, fail closed without dispatching or mutating the board; do not reconstruct the contract from memory.
