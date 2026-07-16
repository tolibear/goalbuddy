# GoalBuddy Board Compiler Contract

## Contents

- [Ownership](#ownership)
- [Future-only boundary](#future-only-boundary)
- [Target selection and preflight](#target-selection-and-preflight)
- [GoalBuddy workflow](#goalbuddy-workflow)
- [Quality requirements](#quality-requirements)
- [Conditional dimensions](#conditional-dimensions)
- [Mixed-fleet safety](#mixed-fleet-safety)
- [Board surface](#board-surface)
- [Start handoff](#start-handoff)
- [Backend return](#backend-return)
- [Failure handling](#failure-handling)

Use after the compiler has confirmed that its source is decision-complete. This reference governs one output only: a new validated GoalBuddy board.

The installed GoalBuddy skill is authoritative for board files, task and receipt fields, checker behavior, agents, and execution. This compiler supplies the owner contract, proof expectations, source-plan preservation, and target-aware handoff. It must not invent board schema.

## Ownership

- **Compiler core:** source readiness, oracle and proof design, source-plan preservation, ambiguity challenge, executor boundaries, concurrency assessment, adaptive strategy, and semantic acceptance.
- **Codex adapter:** Codex runtime preflight plus construction and validation of the hybrid start command printed for later use. It never starts the goal.
- **Claude adapter:** Claude runtime preflight plus the installed `/goal Follow ...` command printed for later use. It never uses Codex native goal tools or Codex objective validation.
- **GoalBuddy:** `goal.md`, `state.yaml`, notes, tasks, receipts, roles, checker, prompt rendering, dispatch, atomic receipt application, and execution.

Do not bundle GoalBuddy templates, recreate its checker, invent board fields, or select the legacy `goal_worker_ultra` role for new boards.

## Future-only boundary

GoalBuddy compilation creates a new board only.

Choose a lowercase-hyphen slug and require one new direct child:

```text
docs/goals/<slug>
```

Run:

```bash
python3 <compiler-skill>/scripts/check_new_goal_path.py docs/goals/<slug> --json
```

The root must not already exist as a directory, file, or broken symlink. On collision, choose another slug or stop without inspecting the collision. Never scan other boards to find a path.

Existing boards are outside this compiler. Explicit Goal Prep repair or GoalBuddy execution owns rescue, migration, resumption, and mutation.

## Target selection and preflight

Determine `target = codex | claude` from the active harness unless explicitly supplied.

Run only the selected target:

```bash
python3 <compiler-skill>/scripts/check_goalbuddy_runtime.py --target codex --json
python3 <compiler-skill>/scripts/check_goalbuddy_runtime.py --target claude --json
```

The checker consumes GoalBuddy compiler contract v1 and requires board schema v2 plus seven capabilities: `atomic_amendment_transition`, `atomic_placeholder_hydration_transition`, `lossless_receipt_identity`, `strict_multiline_yaml_projection`, `closed_judge_decision_vocabulary`, `atomic_exact_human_wait_resume`, and `atomic_goal_completion`. It also returns the exact absolute installed Goal Prep and compiler paths plus installed/source tree fingerprints. Missing requirements or mismatched bytes block preflight; additive capabilities do not. GoalBuddy itself owns doctor topology, installed agent inventory, compiler/backend presence, target readiness, source provenance, and installed skill binding. Agent-file presence alone is insufficient because a Keeper must be able to apply either Judge outcome without a partial task edit/close/activate sequence, preserve receipt identity, enter and resume an exact-human wait through the digest-bound atomic surface, complete a goal through one digest-bound final-audit transition, and fail closed at strict parser and decision boundaries. If preflight fails, block compilation and report the exact repair. Do not infer readiness from another harness or fall back to private schema.

## GoalBuddy workflow

1. Confirm the accepted specification, plan, or conversation contract satisfies the compiler's decision-complete source contract. Otherwise return `not_compilable` without creating a board.
2. Run selected-target preflight and retain the exact `contract.skills` paths and fingerprints.
3. Guard the new board path.
4. Synthesize readiness:
   - interpreted outcome;
   - observable oracle signal;
   - completion proof;
   - likely misfire;
   - done/not-done traps;
   - fast and final checks;
   - realistic proof surface and proxy limits;
   - stop/ask conditions;
   - first safe phase;
   - concurrency summary.
5. Run the quality pass in `references/handoff-prompts.md`.
6. For Codex, construct and validate the hybrid objective with `validate_codex_goal_objective.py`. Target under 400 characters; hard cap 4,000.
7. In the current compiler context, explicitly load and execute `<contract.skills.goal_prep.path>/SKILL.md` as a declared internal dependency. Do not rediscover it through harness search paths or a similarly named skill. If its current tree fingerprint differs from the accepted contract, stop and rerun preflight. Its implicit/model invocation may be disabled by design; do not rely on trigger matching. Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board.
8. Run the official board checker and the compiler acceptance gates: require checker `ok: true`, no unresolved placeholders, no weak oracle/final-proof warnings, installed agents, and visible official mapping for all proof expectations. File-only preparation does not run unrelated repository-wide product or source suites.
9. Return to the compiler immediately after checker and semantic acceptance, then print one user-facing checkpoint. Do not keep a board-preparation loop alive after acceptance.
10. Stop. Print the target-correct command for a later execution turn; never start `/goal` from the compiler.

The direct-current-context restriction applies only to Goal Prep board preparation. It does not restrict intended Scout, Judge, Worker, Keeper, Ledger, Council, or other explicit delegation during later planning, execution, recovery, or review.

## Quality requirements

Every GoalBuddy compile must preserve:

1. **Outcome and oracle** — one durable owner outcome and observable signal.
2. **Readiness** — completion proof, likely misfire, done/not-done traps, fast/final checks, realistic proof surface, stop/ask conditions, first phase, concurrency.
3. **Installed intake mapping** — the selected Goal Prep intake wins.
4. **Source-plan facts** — bind the native source artifact by path plus stable revision or content digest when available; preserve decisions, sequence, files, constraints, non-goals, and labeled assumptions compactly. Never copy the complete plan or specification into board truth.
5. **Ambiguity challenge** — plausible readings, accepted reading, unchanged decisions, material owner decisions only.
6. **Verification loop** — per-slice check, broad pre-audit check, fallback evidence, proxy limits.
7. **Executor boundaries** — allowed scope, approval gates, repeated-failure stop, cleanup.
8. **Concurrency assessment** — safe independent work, disjoint writes, dependencies, per-lane verification, integration audit, serial reasons.
9. **Five-proof mapping through official GoalBuddy surfaces:**
   - scope/oracle → goal oracle and official task scope fields;
   - automated verification → Worker verification and receipt commands/attempts;
   - real-surface QA → executable verification or separate QA task/evidence;
   - adversarial QA → Judge decision/evidence/missing evidence;
   - cleanup/receipt → changed files, deviations, cleanup/final audit, atomic receipt application.
10. **Adaptive execution strategy** — the charter's `## Execution Strategy` section instantiated per `references/adaptive-execution-strategy.md`: planning horizon, quality ladder, materiality refinements, risk triggers, semantic capabilities, and the narrowest truthful write-scope strategy. Never a pre-scheduled sequence of workflow invocations, and never vendor skill names in board or charter text.
11. **Preflight** — baseline commit, Git state, applicable `AGENTS.md`, agents, target adapter.

Do not copy a generic `gates:` object into GoalBuddy cards or receipts unless the installed runtime defines it.

## Conditional dimensions

Include only when applicable:

- **Optimization:** measured baseline/target, scorer, fast proxy, authoritative evaluation, forbidden shortcuts, generalization check, reliability requirement.
- **Explicit limits:** preserve only user-provided time, token, and paid-service limits.
- **Pilot:** first representative calibration slice for paid, stochastic, production-connected, unproven-verifier, or parallel work when current calibration evidence is absent.
- **Environment realism:** auth, data, deployment, performance, UI, or unavailable authoritative surfaces.
- **Visual QA:** flows, viewports, console checks, references, false shortcuts.
- **Progress reporting:** allowed commits, draft PRs, status artifacts, external updates.
- **Parallel plan:** disjoint scopes, dependencies, per-lane verification, integration audit.

Do not emit optimization machinery for ordinary completion goals. Do not invent budgets.

## Mixed-fleet safety

GoalBuddy mixed-vendor dispatch is allowed only from a clean Git baseline because its path-set scope check cannot detect edits to paths already dirty before dispatch.

- Cross-harness continuation on an explicit board path remains available.
- If `git status --porcelain` is nonempty, preserve dirty work and use the current harness's normal roles or reach a user-approved clean checkpoint.
- Do not claim dirty-worktree mechanical scope enforcement.

## Board surface

Default to a file-only board. Preserve board files and notes, but do not launch the local server or browser unless the user explicitly requests visual tracking.

## Start handoff

### Codex

After semantic acceptance, construct the hybrid command:

```text
/goal Achieve <outcome>, proven by <oracle>. Operating procedure and board: docs/goals/<slug>/goal.md.
```

Validate its exact objective with `validate_codex_goal_objective.py`. Target under 400 characters; hard cap 4,000. Print the command for a later execution turn and stop. Never call `get_goal`, `create_goal`, or any native goal mutation tool from the compiler. Never supply or invent `token_budget`.

### Claude Code

Do not call or mention Codex goal tools. Print:

```text
/goal Follow docs/goals/<slug>/goal.md.
```

For a walk-away run, add the measurable completion clause:

```text
/goal Follow docs/goals/<slug>/goal.md until a final receipt with full_outcome_complete: true is surfaced.
```

Append `stop after <N> turns if blocked` only when the user supplied that exact turn limit. Never invent a cap or ask for one merely to render this handoff; GoalBuddy's exact-human wait, no-safe-work, and full-outcome completion rules already define the unbounded stop conditions.

The user starts the installed Claude `/goal` command after reviewing the checkpoint. The compiler never executes it, including for non-production work.

## Backend return

Goal Prep returns preparation evidence to the current compiler context; it does not print a second user-facing checkpoint. Return the target, new goal path, checker JSON, semantic warnings and allowlist, intake completeness, five-proof mapping, first phase, concurrency and mixed-fleet result, plus target-correct start and continuation commands. The compiler then prints exactly the single `## Compilation checkpoint` defined in `SKILL.md`.

## Failure handling

- Runtime missing/stale → block compilation with exact preflight result.
- Board path exists → stop without reading it.
- Source contract incomplete → return `not_compilable`; never write placeholders into a board or invoke a hardening workflow.
- Semantic warning denylist fires → preparation is not accepted.
- Codex objective invalid → rewrite and revalidate.
- Existing board request → stop; this compiler never repairs, resumes, or replaces it.
- Dirty baseline plus mixed-fleet request → keep board, disable cross-vendor dispatch until a clean checkpoint.
