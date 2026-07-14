---
description: Run the GoalBuddy execution loop against a prepared goal board
---

Run the GoalBuddy `/goal` execution loop.

Goal: $ARGUMENTS

First read `references/goal-execution.md` in the goal-prep skill directory and follow it as the execution contract for this run. If the argument names a `docs/goals/<slug>/goal.md` charter, load it and its sibling `state.yaml` board. If it is raw intent, run the GoalBuddy intake first (see the goal-prep skill).

If the execution contract cannot be read, these invariants still hold: `state.yaml` is board truth; each board has at most one active task and one write-capable Worker; each additional concurrent product-writing lane requires its own depth-one child board, pairwise-disjoint structured `allowed_files`, and the bundled `parallel-plan` projection; Worktrees isolate bytes but never replace board recovery identity or those checks; Scout and Judge tasks are read-only; Worker tasks write only inside `allowed_files` and run their `verify` commands; every completed, blocked, or escalated task gets a receipt; after each receipt select the next safe task and keep executing; mark the goal done only through a final Judge or PM audit that maps receipts and verification back to the original outcome with `full_outcome_complete: true`.
