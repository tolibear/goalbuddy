---
description: Run the GoalBuddy execution loop against a prepared goal board
---

Run the GoalBuddy `/goal` execution loop.

Goal: $ARGUMENTS

If the argument names a prepared `docs/goals/<slug>/goal.md`, read only that charter and the installed GoalBuddy execution kernel. When this command was read from `<claude-home>/commands/goal.md`, use the sibling `<claude-home>/skills/goal-prep` directly; do not query environment variables or search for another copy. Otherwise resolve `<skill-path>` once as `${CLAUDE_HOME:-$HOME/.claude}/skills/goal-prep`; do not replace a set `CLAUDE_HOME` with `~/.claude`. Read `<skill-path>/references/goal-execution.md`, then run `<skill-path>/scripts/frontier.mjs docs/goals/<slug> --json` for the healthy semantic frontier. Follow its exact drill-down references for evidence needed by the current decision.

During prepared execution, do not search source repos, locate alternate copies, or compare mirrors; install and doctor own provenance. Do not load Goal Prep, Codex Goal Compiler, raw `state.yaml`, or `references/goal-execution-reference.md` on a healthy start. Genuine new-session or post-compaction uncertainty and other named recovery triggers use the kernel's checked resume plus Ledger audit. Ordinary reviewed closeout uses the kernel's explicit-source `advance`, never Keeper. A Claude native task list is optional ephemeral projection for visibility, never board truth.

If the argument is raw intent rather than a prepared charter, route to Goal Prep intake. If the kernel cannot be read, fail closed without dispatching or mutating the board; do not reconstruct the contract from memory.
