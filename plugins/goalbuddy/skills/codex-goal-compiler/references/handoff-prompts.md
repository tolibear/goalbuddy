# GoalBuddy Board-Compilation Handoff

## Contents

- [Shared compile core](#shared-compile-core)
- [Conditional dimensions](#conditional-dimensions)
- [Target-aware board-preparation handoff](#target-aware-board-preparation-handoff)
- [Target outputs](#target-outputs)
- [Blocked runtime](#blocked-runtime)
- [Production-sensitive work](#production-sensitive-work)

This is the canonical source-to-board quality pass and target adapter for `codex-goal-compiler`. The installed GoalBuddy skill remains authoritative for board files, task and receipt fields, checker behavior, agents, and execution.

Every handoff includes all MUST blocks with real content. Include a SHOULD block only when its condition applies. Never fill a block with placeholders or `unknown` boilerplate.

## Shared compile core

### Outcome and oracle (MUST)

Derive one durable outcome and one observable signal that would prove the owner's real intent. Record both in GoalBuddy's official goal oracle/intake surfaces.

For the Codex adapter only, also construct this hybrid native objective:

```text
Achieve <interpreted outcome>, proven by <oracle signal>. Operating procedure and board: docs/goals/<slug>/goal.md.
```

Validate its exact `/goal ...` form with `scripts/validate_codex_goal_objective.py`. Target under 400 characters; hard cap 4,000. Claude does not use or validate this native objective.

### Goal readiness (MUST)

Synthesize:

```text
goal_mode_readiness:
  interpreted_outcome: <what must become true>
  oracle_signal: <live signal that keeps the run honest>
  completion_proof: <final evidence proving the owner outcome>
  likely_misfire: <how the run could satisfy words while missing intent>
  done_when: [<evidence items>]
  not_done_when: [<false-completion traps>]
  fast_check: <per-slice check or first task to create one>
  final_check: <broad final audit>
  realistic_environment: <available surface, gaps, proxy limits>
  stop_or_ask: [<authority, risk, proof, or scope boundaries>]
  first_safe_phase: <PM validation | Scout evidence | Judge validation | Worker slice>
  concurrency_summary: <safe lanes and serial reasons>
```

Infer conservatively from the accepted source and already-supplied repository evidence. Stop when inference would change scope, authority, risk, user-visible behavior, architecture, or completion proof. If the oracle, completion proof, likely misfire, or realistic proof path remains weak, return `not_compilable` with the exact missing decisions instead of creating a board or invoking a hardening workflow.

### Official GoalBuddy intake mapping (MUST)

Read the selected harness's installed Goal Prep skill and map the source plan plus readiness into its current intake. Preserve original request, interpreted outcome, audience, authority, proof type, completion proof, likely misfire, blind spots, existing-plan facts, constraints, non-goals, and oracle signal when the installed intake supports them. The installed fields win; this list is guidance, not a schema.

### Source-plan facts and ambiguity challenge (MUST)

Keep the accepted plan or specification in its native location and bind it by path plus stable revision or content digest when available. Preserve only its load-bearing milestones, decisions, known files, interfaces, constraints, assumptions, non-goals, verification commands, and rollback facts in board intake; never paste the complete source into `goal.md` or `state.yaml`. For each material ambiguity, record two plausible interpretations, the accepted reading and rationale, unchanged decisions, and any owner decision that truly changes architecture, authority, risk, or proof.

### Official five-proof mapping (MUST)

Preserve the five proof expectations without inventing compiler-owned board fields:

| Proof | Official GoalBuddy representation |
| --- | --- |
| Scope and oracle | `goal.oracle`, task `objective`, `allowed_files`, `expected_output` |
| Automated verification | Worker `verify`; receipt `commands`, `verification_attempts` |
| Real-surface QA | Executable `verify`, or a separate Scout/Judge/PM QA task with evidence |
| Adversarial QA | Judge task; receipt `decision`, `evidence`, `missing_evidence` |
| Cleanup and receipt | Worker `changed_files`, `deviations`; cleanup/final audit; atomic receipt application |

Worker candidates use only official card fields such as `objective`, `allowed_files`, `verify`, `stop_if`, and `expected_output`. A Judge transfers the exact next Worker package through the installed Judge receipt shape. Workers return the installed receipt shape. The compiler supplies proof expectations; GoalBuddy decides the final task graph and schema.

### Verification, cleanup, and completion (MUST)

Define the fastest per-slice check, broad pre-audit check, fallback evidence, and any realistic-environment limitation. Final audit maps every `done_when`, non-goal, and constraint to evidence; requires real-surface and adversarial proof when applicable; rejects completion while required tasks remain; and records cleanup/deviations through official receipts.

### Concurrency and dispatch (MUST)

Identify independent read-only work, disjoint Worker candidates, dependencies, per-lane verification, and an integration audit. State why serial execution is safer when scopes overlap.

Mixed-vendor GoalBuddy CLI dispatch is clean-worktree-only. If `git status --porcelain` is nonempty, do not propose cross-vendor dispatch: preserve the dirty work and use the current harness's normal GoalBuddy roles. Cross-harness continuation through the explicit board path remains available.

Do not select `goal_worker_ultra` for a new board during its legacy-only quarantine. Use canonical roles and official `reasoning_hint`.

### Semantic board acceptance (MUST)

Preparation is accepted only when:

- the installed checker reports `ok: true`;
- `goal.md` and `state.yaml` contain no unresolved template placeholders;
- checker warnings do not identify weak or placeholder-like `goal.oracle.signal`, `goal.oracle.final_proof`, or `goal.intake.completion_proof`;
- agent statuses are installed;
- all five proof expectations map to official tasks, verification, QA, or receipts;
- any other warning is explicitly allowlisted with a reason.

## Conditional dimensions

- **Optimization:** only for goals that improve a measured result, record the baseline, target, scorer, fast proxy, authoritative evaluation, forbidden shortcuts, generalization check, and reliability requirement. Use a GoalBuddy note for an experiment ledger only when iterative experiments are expected. Omit this material from ordinary completion goals.
- **Explicit limits:** preserve user-provided time, token, and paid-service limits verbatim through existing charter and `stop_if` surfaces. Never synthesize a budget.
- **Pilot:** for paid, production-connected, stochastic, unproven-verifier, or parallel work, make the first phase a representative calibration slice unless current calibration evidence already exists.
- **Environment realism:** for auth, data, deployment, performance, or UI, record the most realistic available proof surface and setup gaps.
- **Visual QA:** for browser-visible work, identify flows, viewports, console checks, references, and false shortcuts.
- **Progress reporting:** for multi-hour work, state which commits, draft PRs, status artifacts, or external updates are allowed.
- **Parallel plan:** when safe lanes exist, provide disjoint scopes, per-lane verification, dependency order, and an integration audit.

## Target-aware board-preparation handoff

Use the selected harness's real preparation surface directly in the current compiler context. Explicitly load its installed `SKILL.md` as the compiler's declared internal dependency even when runtime metadata disables Goal Prep's implicit/model invocation; do not rely on trigger matching. This is an inline handoff block, not a delegation request: never spawn a subagent, collaboration agent, or separate Codex task merely to run Goal Prep. That narrow preparation rule does not restrict intended Scout, Judge, Worker, Keeper, Ledger, Council, or other explicit delegation elsewhere.

```text
<Codex: $goal-prep | Claude Code: /goal-prep>

Use the finished plan below/above as an existing_plan source artifact.

The goal compiler accepted a decision-complete source contract and selected target: <codex | claude>.

Execute this preparation directly in the current compiler context. Do not spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board.

Before reading or writing a goal root, choose the new slug supplied by the compiler and run its non-recursive `check_new_goal_path.py` guard. The entire docs/goals/<slug> root must not exist. On any directory, file, or broken-symlink collision, stop or choose another slug without opening it. Do not discover, validate, migrate, or repair any other board.

Read the selected harness's installed Goal Prep skill. It is the only authority for goal.md, state.yaml, task/receipt schema, checker behavior, and agents. Do not introduce compiler-owned board fields.

Do not implement and do not start /goal. Prepare and validate the new file-only board, then return its result to the compiler.

Board surface: none (file-only). Do not start the local board server or open a browser unless the user explicitly requested visual tracking.

Compiled brief:

<target>                         [MUST]
<new_slug_and_path>              [MUST — fail if it already exists]
<codex_hybrid_objective>         [MUST for Codex; omit for Claude]
<goal_mode_readiness>            [MUST]
<goalbuddy_intake_mapping>       [MUST]
<source_plan_facts>              [MUST]
<ambiguity_challenge>            [MUST]
<context_and_starting_guidance>  [MUST]
<non_goals_and_constraints>      [MUST]
<done_when>                      [MUST]
<not_done_when>                  [MUST]
<verification_loop>              [MUST]
<official_five_proof_mapping>    [MUST]
<concurrency_assessment>         [MUST — include clean-only mixed-dispatch policy]
<start_gate_and_preflight>       [MUST — target, Git baseline, AGENTS.md, first phase]
<stop_or_ask_conditions>         [MUST]
<cleanup_and_completion_audit>   [MUST]
<scoring>                        [SHOULD when applicable]
<environment_readiness>          [SHOULD when applicable]
<visual_goal_guardrails>         [SHOULD when applicable]
<progress_reporting>             [SHOULD when applicable]
<parallel_execution_plan>        [SHOULD when applicable]

Omitted SHOULD blocks are intentionally not applicable. Do not reconstruct them.

If the owner contract is incomplete because outcome, authority, scope, proof, or an irreversible boundary is materially unresolved, return that missing fact to the compiler so it emits `not_compilable`; do not seed a board task. If the owner contract is complete but environment, evidence, calibration, or implementation-plan detail remains unproven, make the first task that validation work. Never hide weak proof behind placeholders.

Run the installed official board checker and apply only the compiler semantic acceptance rules above. File-only preparation must not run unrelated repository-wide product or source suites. As soon as checker and acceptance results are available, return immediately to the current compiler with: target, new goal path, checker JSON, warnings and allowlist, intake completeness, five-proof mapping, first phase, and target-correct start/continuation commands. Do not keep waiting, launch another task, or print a duplicate user-facing checkpoint.
```

## Target outputs

### Codex

```text
Codex start command: /goal Achieve <outcome>, proven by <oracle>. Operating procedure and board: docs/goals/<slug>/goal.md.
Claude start command: n/a
Portable continuation: /goal Follow docs/goals/<slug>/goal.md.
CLI helper: goalbuddy resume docs/goals/<slug>
```

The compiler validates this command and prints it for a later execution turn. It never calls `get_goal`, `create_goal`, or starts execution.

### Claude Code

```text
Codex start command: n/a
Claude start command: /goal Follow docs/goals/<slug>/goal.md.
Portable continuation: /goal Follow docs/goals/<slug>/goal.md.
CLI helper: goalbuddy resume docs/goals/<slug>
```

Claude never uses Codex native goal tools or the Codex objective validator. The user starts `/goal` in a fresh session after reviewing the checkpoint; the compiler never starts it.

## Blocked runtime

```text
Blocked: GoalBuddy compiler contract preflight failed for <target>. The compiler will not resolve another harness's skill, invent a fallback schema, inspect existing boards, or route to a different workflow. Repair the selected target and rerun.
```

## Production-sensitive work

Prepare and validate the board, preserve the checkpoint, and stop. A later execution turn owns every start and risk gate.
