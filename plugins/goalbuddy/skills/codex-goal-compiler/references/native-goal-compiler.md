# Standalone Native Codex Goal Compiler

## Contents

- [Purpose](#purpose)
- [Path contract](#path-contract)
- [Compilation workflow](#compilation-workflow)
- [Context and plan handling](#context-and-plan-handling)
- [Goal quality contract](#goal-quality-contract)
- [Verification loop](#verification-loop)
- [Review/remediation mode](#reviewremediation-mode)
- [Living record policy](#living-record-policy)
- [Route escalation during execution](#route-escalation-during-execution)
- [Minimal question rule](#minimal-question-rule)

## Purpose

A standalone native goal is one durable objective and living execution record for a Codex `/goal` run. It fills the space between direct implementation and a GoalBuddy board.

It contains:

- one `goal.md`;
- no `state.yaml`;
- no task DAG;
- no Worker/Judge/PM receipts;
- no board server;
- no cross-harness board state.

It is stronger than an ordinary prompt because it survives compaction, preserves accepted decisions, defines an observable exit condition, and maintains a living progress record.

## Path contract

Default root:

```text
docs/codex-goals/<slug>/
```

File:

```text
docs/codex-goals/<slug>/goal.md
```

Run command:

```text
/goal Follow docs/codex-goals/<slug>/goal.md.
```

Do not place standalone goals under `docs/goals/`; that namespace is reserved for GoalBuddy.

Before writing:

```bash
python3 <compiler-skill>/scripts/check_new_native_goal_path.py docs/codex-goals/<slug> --json
```

On collision, choose another slug or ask before overwriting. Do not inspect an unrelated existing goal to work around the collision.

## Compilation workflow

1. Read current conversation and named source artifacts.
2. Confirm one bounded owner outcome exists.
3. Preserve latest accepted decisions and current repo facts.
4. Determine an observable Definition of Done, final proof, and false-positive completion.
5. Capture scope, non-goals, permissions, source precedence, accepted plan, verification, and stop/ask rules.
6. Render `assets/native-goal.md`.
7. Omit optional empty material; leave no placeholders.
8. Write one `goal.md` under the new path.
9. Validate with `scripts/validate_native_goal.py`.
10. Print the exact `/goal Follow ...` command.
11. Start only if explicitly requested and the host supports it.

## Context and plan handling

When an accepted plan file exists:

- link it under Source of Truth;
- preserve decisions, non-goals, sequence, files, interfaces, and verification expectations;
- summarize only what the goal needs to remain usable after compaction;
- do not re-plan from scratch;
- record evidence-backed amendments in the Decision Log.

When the plan exists only in conversation:

- distill the accepted sequence;
- preserve meaningful ordering and dependencies;
- omit rejected exploratory branches;
- label unresolved assumptions.

When a governing `PLANS.md`, `plans.md`, or configured agent plans resource exists, use its applicable living-plan conventions. Do not duplicate a complete ExecPlan when a source reference plus concise execution guidance is sufficient.

## Goal quality contract

Every standalone goal must include:

- one bounded objective;
- concise context handoff;
- observable Definition of Done;
- final proof;
- false-positive completion to avoid;
- scope and non-goals;
- constraints and permissions;
- source-of-truth references;
- accepted plan or execution guidance;
- fast and final verification;
- living progress, discoveries, decisions, attempts/cleanup, and outcome sections;
- stop/ask rules;
- exact run command.

Stable during the run:

- Objective.
- Definition of Done.
- Non-negotiable constraints.
- Explicit permissions.
- Accepted source-plan decisions.

Codex may update the living sections during execution. Material changes to the stable contract require user approval.

## Verification loop

A good native goal gives Codex:

- fastest useful feedback during work;
- broad/final verification;
- honest fallback evidence when the authoritative environment is unavailable;
- limits of any proxy;
- cleanup and final-diff/artifact review;
- explicit rejection of test weakening, scorer manipulation, superficial output, or fabricated completion.

Do not require numeric metrics when completion is otherwise observable.

## Review/remediation mode

Use when a completed board, implementation, PR, plan, branch, diff, report, or artifact needs one bounded review and remediation round.

Specify:

- reviewed baseline;
- review dimensions;
- what counts as material;
- evidence required for findings;
- remediation authority;
- validation after fixes;
- cleanup and final re-review.

Do not finish after producing findings when remediation is requested. Do not fix speculative findings without verification. Do not create a second GoalBuddy board merely to represent one bounded review round.

## Living record policy

Codex may update:

- Progress.
- Discoveries.
- Decision Log.
- Attempts and Cleanup.
- Outcome and Retrospective.

It must not silently alter the stable goal contract.

## Route escalation during execution

If the work grows beyond one honest standalone goal:

- keep the current goal bounded;
- record expansion as follow-up;
- recommend a separate native goal or GoalBuddy board;
- do not silently create board state or turn one Markdown file into a task DAG.

## Minimal question rule

Ask one focused question only when a missing answer changes:

- objective;
- final proof;
- permission to modify, publish, deploy, or purchase;
- destructive or irreversible action;
- or route between native goal and GoalBuddy.

Otherwise proceed with the narrowest labeled assumption.
