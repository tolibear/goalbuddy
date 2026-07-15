---
name: codex-goal-compiler
compatibility: "Python 3 plus GoalBuddy compiler contract v1; compiles new GoalBuddy v2 boards for Codex or Claude Code."
description: "Compiles a decision-complete specification, accepted implementation plan, or agreed conversation contract into a new validated GoalBuddy board. Use for: 'compile this spec into a GoalBuddy board', 'turn this accepted plan into a goal board', 'use Codex Goal Compiler', or 'make a board from what we decided'. Does not choose among direct work, planning, native goals, Omega, recurring automation, or existing-board recovery; does not invent missing product decisions, implement the work, mutate an existing board, or start /goal."
metadata:
  version: "4.0.0"
  short-description: "Decision-complete source → validated GoalBuddy board"
---

# Codex Goal Compiler

Compile one decision-complete source contract into one new validated GoalBuddy board. Mine accepted decisions from the current conversation and named artifacts so the user does not have to restate them.

The compiler has one public transformation:

```text
accepted spec | accepted plan | agreed conversation contract
                              ↓
                 docs/goals/<slug>/
```

It does not choose an execution system. It does not plan the product, implement it, start `/goal`, repair an existing board, or replace GoalBuddy's schema.

## Trigger boundary

Use this skill when the user explicitly asks to compile settled work into a GoalBuddy board, including:

- a large accepted product specification;
- an accepted implementation or migration plan;
- the current conversation after its material decisions are settled;
- a small decision-complete plan when the user explicitly wants a board.

For an explicit small request, compile the smallest honest board; do not second-guess the owner's request by routing elsewhere.

Do not use it for:

- vague intent that still needs product, architecture, authority, scope, or proof decisions;
- creating or reviewing a plan or specification;
- choosing between direct work, native `/goal`, Omega, GoalBuddy, a loop, or automation;
- implementing a change;
- resuming, migrating, auditing, or repairing an existing board;
- starting `/goal` after a board already exists.

If an adjacent workflow is more appropriate, state only that this compiler's input contract is not satisfied. Do not select, invoke, or orchestrate the adjacent workflow from this skill.

## Source contract

A source is decision-complete enough to compile when it supplies or safely fixes all load-bearing facts:

- one owner outcome and intended beneficiary;
- observable completion proof and a live oracle signal;
- accepted scope, non-goals, constraints, and authority boundaries;
- accepted product or architecture decisions that would change implementation shape;
- known sequencing, dependencies, approval gates, and irreversible boundaries;
- a realistic verification path, including known environment limits;
- enough starting context to choose a safe first phase.

Do not require exhaustive implementation detail. A large specification may intentionally leave implementation plans just in time. The missing fact is material only when guessing it could change outcome, authority, risk, user-visible behavior, architecture, or final proof.

Use this precedence when sources disagree:

1. applicable system, harness, and repository instructions;
2. latest explicit user decision;
3. explicitly accepted spec, plan, review decision, or owner-approved artifact;
4. current repository facts and executed evidence already supplied to the compiler;
5. earlier conversation context;
6. clearly labeled conservative inference.

Do not reopen accepted decisions merely because alternatives exist. Do not invent files, tests, metrics, permissions, budgets, credentials, or approvals.

## Not-compilable result

If the source contract is not decision-complete, create no board and return:

```text
Compile: not_compilable
Source: <conversation | spec path | plan path | other>
Missing decisions:
- <only facts that materially block a truthful board>
Why they matter: <one concise explanation>
Board created: no
```

Do not ask a diagnostic ladder, draft a replacement plan, run another skill, or emit route-selection advice. The user may resolve the missing decisions however they prefer and invoke the compiler again.

## Read before compilation

When the source is ready, read these references and treat them as the compilation contract:

- `references/goalbuddy-compiler.md` — ownership, runtime preflight, future-only path, semantic acceptance, and checkpoint;
- `references/adaptive-execution-strategy.md` — how a board preserves dynamic planning, review, simplification, and Judge choices without pre-scheduling vendor tools;
- `references/handoff-prompts.md` — source-to-intake mapping and the exact internal Goal Prep handoff.

If the repository provides `AGENTS.md`, `PLANS.md`, `plans.md`, or another governing plan contract, read the applicable files before compiling. Do not invent absent instructions.

## Compilation workflow

1. Read the current conversation and every named accepted source artifact.
2. Test the source against the decision-complete contract above.
3. Determine the active target: `codex` or `claude`, unless the user explicitly supplied it.
4. Run only that target's `scripts/check_goalbuddy_runtime.py` preflight.
5. Choose a lowercase-hyphen slug and run `scripts/check_new_goal_path.py` before reading or writing the root.
6. Synthesize the owner outcome, oracle, completion proof, likely misfire, done/not-done traps, verification loop, boundaries, concurrency, and first safe phase.
7. Preserve accepted source facts and challenge only material ambiguity. Do not silently alter the accepted design.
8. Compile the adaptive execution strategy. For large work, preserve vertical slices and choose an honest upfront, just-in-time, or hybrid planning horizon. Record semantic capabilities, never vendor skill names or a pre-scheduled ceremony list.
9. For Codex, construct and validate the hybrid `/goal` objective defined in `references/goalbuddy-compiler.md`; for Claude, prepare the portable `/goal Follow ...` command.
10. Explicitly load the selected harness's installed Goal Prep `SKILL.md` in this same compiler context and give it the exact handoff from `references/handoff-prompts.md`.
11. Have Goal Prep create the file-only board from its canonical templates and schema. Never spawn a subagent or separate task merely to prepare it.
12. Run GoalBuddy's official checker and every semantic acceptance gate in `references/goalbuddy-compiler.md`.
13. Fix compilation defects and rerun validation. Do not waive them in prose.
14. Return the compilation checkpoint below. Stop without starting `/goal`.

## Compilation invariants

- Create one new direct child at `docs/goals/<slug>/` only.
- On any file, directory, or broken-symlink collision, stop without inspecting the collision.
- Goal Prep owns `goal.md`, `state.yaml`, notes, task and receipt fields, templates, agents, checker behavior, and runtime semantics.
- The compiler owns source synthesis, oracle and proof design, ambiguity challenge, source-plan preservation, adaptive strategy, and semantic acceptance.
- Keep the accepted specification or plan in its native artifact. Bind the board to its path and stable revision when available, then carry only load-bearing decisions, slices, constraints, and proof expectations; never paste the complete source into `goal.md` or `state.yaml`.
- Default to a file-only board. Do not start the local board server or open a browser unless the user explicitly asked for visual tracking.
- Preserve the five proof expectations through official GoalBuddy fields and tasks; never invent compiler-owned board schema.
- Preserve user-provided limits exactly. Never synthesize a time, token, turn, or paid-service budget.
- Never select the quarantined legacy `goal_worker_ultra` role for a new board.
- Never run unrelated product implementation or repository-wide product suites during board preparation.
- Never start `/goal`, call `create_goal`, dispatch a Worker, or perform product work from the compiler.

## Dynamic execution shape

The board must preserve what the user liked about successful large runs without freezing every future tool call:

- compile durable vertical slices, dependencies, owner gates, and proof requirements;
- let execution author or revise implementation plans just in time at material seams;
- require the PM to review every diff and use independent plan/review/simplification capabilities more often on long autonomous material work;
- keep small mechanical slices light;
- let the lead orchestrator choose lead or delegated Judges from live risk and ambiguity;
- bind review evidence to the exact plan or diff it examined;
- let the PM split, combine, reorder, or refine queued work as evidence arrives without changing owner intent or completed history.

GoalBuddy's execution contract maps those semantic capabilities to the active harness. The compiler does not encode Claude-, Codex-, or model-specific tool names into board truth.

## Compilation checkpoint

```text
Compile: pass | blocked
Target: codex | claude
Source: <conversation | spec path | plan path | other>
Goal path: docs/goals/<slug>/goal.md | none
Runtime preflight: pass | blocked: <reason>
Official checker: pass | blocked: <reason>
Semantic acceptance: pass | blocked: <reason>
Planning horizon: upfront | just_in_time | hybrid
First safe phase: <concise phase>
Git baseline: clean | dirty; preserved
Board surface: file-only | visual requested
Start command: <Codex hybrid /goal objective | Claude /goal Follow docs/goals/<slug>/goal.md. | none>
Execution started: no
Open questions: none | <material blocker>
```

For Claude walk-away use, the user may append the measurable completion clause defined in `references/goalbuddy-compiler.md`. The compiler still does not start it or invent a turn cap.

## Failure and safety

- Runtime missing or stale: block compilation with the exact preflight result; do not reconstruct GoalBuddy schema.
- Source not decision-complete: return `not_compilable`; create no path.
- Path collision: stop without inspecting it.
- Weak oracle, final proof, or unresolved placeholder: reject semantic acceptance.
- Dirty Git state: preserve it. Disable mixed-vendor dispatch expectations unless a later execution run reaches an approved clean checkpoint.
- Existing board request: stop; explicit Goal Prep repair or GoalBuddy execution owns that job.
- Product, architecture, permission, or scope change discovered during compilation: stop and name the decision instead of choosing it.
- Destructive, credential-sensitive, production, billing, deployment, publication, or external action: never perform it during compilation.

## Resources

- `references/goalbuddy-compiler.md` — board compiler contract and acceptance gates.
- `references/adaptive-execution-strategy.md` — adaptive strategy compilation.
- `references/handoff-prompts.md` — exact Goal Prep handoff and target outputs.
- `scripts/check_goalbuddy_runtime.py` — selected-target GoalBuddy contract preflight.
- `scripts/check_new_goal_path.py` — future-only board-root guard.
- `scripts/validate_codex_goal_objective.py` — validates the Codex hybrid start command printed after compilation.
