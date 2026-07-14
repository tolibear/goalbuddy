# GoalBuddy Compiler Backend

## Contents

- [Ownership](#ownership)
- [Future-only boundary](#future-only-boundary)
- [Target selection and preflight](#target-selection-and-preflight)
- [GoalBuddy workflow](#goalbuddy-workflow)
- [Quality requirements](#quality-requirements)
- [Conditional dimensions](#conditional-dimensions)
- [Mixed-fleet safety](#mixed-fleet-safety)
- [Board surface](#board-surface)
- [Start policies](#start-policies)
- [GoalBuddy checkpoint](#goalbuddy-checkpoint)
- [Failure handling](#failure-handling)

Use only after unified routing selects GoalBuddy or the user explicitly requests a GoalBuddy board and the route is honest.

The installed GoalBuddy skill is authoritative for board files, task and receipt fields, checker behavior, agents, and execution. This compiler supplies the owner contract, proof expectations, source-plan preservation, and target-aware handoff. It must not invent board schema.

## Ownership

- **Compiler core:** route confirmation, readiness synthesis, oracle and proof design, source-plan preservation, ambiguity challenge, executor boundaries, concurrency assessment, and one review checkpoint.
- **Codex adapter:** Codex runtime preflight, hybrid native objective, objective-length validation, Plan Mode exit checks, `get_goal`, and explicit-request-only `create_goal`.
- **Claude adapter:** Claude runtime preflight and installed `/goal Follow ...` command. It never uses Codex native goal tools or Codex objective validation.
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

Existing boards require an explicit user request naming the board before rescue, migration, resumption, or mutation.

## Target selection and preflight

Determine `target = codex | claude` from the active harness unless explicitly supplied.

Run only the selected target:

```bash
python3 <compiler-skill>/scripts/check_goalbuddy_runtime.py --target codex --json
python3 <compiler-skill>/scripts/check_goalbuddy_runtime.py --target claude --json
```

The checker consumes GoalBuddy compiler contract v1 and requires board schema v2 plus seven capabilities: `atomic_amendment_transition`, `atomic_placeholder_hydration_transition`, `lossless_receipt_identity`, `strict_multiline_yaml_projection`, `closed_judge_decision_vocabulary`, `atomic_exact_human_wait_resume`, and `atomic_goal_completion`. Missing requirements block preflight; additive capabilities do not. GoalBuddy itself owns doctor topology, installed agent inventory, compiler/backend presence, target readiness, and source provenance. Agent-file presence alone is insufficient because a Keeper must be able to apply either Judge outcome without a partial task edit/close/activate sequence, preserve receipt identity, enter and resume an exact-human wait through the digest-bound atomic surface, complete a goal through one digest-bound final-audit transition, and fail closed at strict parser and decision boundaries. If preflight fails, block the GoalBuddy route and report the exact repair. Do not infer readiness from another harness or fall back to private schema.

## GoalBuddy workflow

1. Confirm the source plan or agreed context is strong enough for a durable board.
2. Run selected-target preflight.
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
7. In the current compiler context, explicitly load and execute the selected harness's installed Goal Prep `SKILL.md` as a declared internal dependency. Its implicit/model invocation may be disabled by design; do not rely on trigger matching. Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board.
8. Run the official board checker and the compiler acceptance gates: require checker `ok: true`, no unresolved placeholders, no weak oracle/final-proof warnings, installed agents, and visible official mapping for all proof expectations. File-only preparation does not run unrelated repository-wide product or source suites.
9. Return to the compiler immediately after checker and semantic acceptance, then print one user-facing checkpoint. Do not keep a board-preparation loop alive after acceptance.
10. Start only when explicitly requested and the target-specific start gate passes.

The direct-current-context restriction applies only to Goal Prep board preparation. It does not restrict intended Scout, Judge, Worker, Keeper, Ledger, Council, or other explicit delegation during later planning, execution, recovery, or review.

## Quality requirements

Every GoalBuddy compile must preserve:

1. **Outcome and oracle** — one durable owner outcome and observable signal.
2. **Readiness** — completion proof, likely misfire, done/not-done traps, fast/final checks, realistic proof surface, stop/ask conditions, first phase, concurrency.
3. **Installed intake mapping** — the selected Goal Prep intake wins.
4. **Source-plan facts** — decisions, sequence, files, constraints, non-goals, labeled assumptions.
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
10. **Adaptive execution strategy** — the charter's `## Execution Strategy` section instantiated per `references/adaptive-execution-strategy.md`: planning horizon, quality ladder, materiality refinements, risk triggers, and semantic capabilities. Never a pre-scheduled sequence of workflow invocations, and never vendor skill names in board or charter text.
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

## Start policies

### Codex

Default terminal state: validated board plus checkpoint, not execution.

When explicit start is requested:

1. Confirm semantic board acceptance.
2. Confirm the session is out of Plan Mode.
3. Confirm the hybrid objective passed validation.
4. Report dirty Git state without automatic stash/commit requests.
5. Call `get_goal`. Never clear, overwrite, or silently replace an unfinished active goal. If one exists, report the conflict and stop.
6. Call `create_goal` only when no unfinished goal exists.
7. Supply `token_budget` only when explicitly requested.

### Claude Code

Do not call or mention Codex goal tools. Print:

```text
/goal Follow docs/goals/<slug>/goal.md.
```

For a walk-away run, also print the bounded form and say why: Claude's native
`/goal` loop judges completion from the conversation transcript with no
implicit turn cap, so a measurable completion clause plus a bound protects
against runaway continuation:

```text
/goal Follow docs/goals/<slug>/goal.md until a final receipt with full_outcome_complete: true is surfaced; stop after <N> turns if blocked.
```

Do not auto-execute production-sensitive work. The user starts the installed Claude `/goal` command after reviewing the checkpoint.

## GoalBuddy checkpoint

```text
Route: goalbuddy
Target: <codex | claude>
Runtime preflight: <pass with version | blocked>
Goal path: <new docs/goals/<slug>/goal.md | blocked>
Board: none (file-only)
Validation: <pass | blocked>
Goal readiness: <complete | missing fields>
Five-proof mapping: <all mapped | blocked>
Ambiguity challenge: <none | summary | blocked>
Concurrency: <safe lanes | read-only only | serial because: reason>
Mixed-fleet dispatch: <available from clean baseline | disabled: dirty baseline>
Git state: <clean | dirty; preserved>
Initial Codex start: </goal hybrid objective | n/a>
Initial Claude start: </goal Follow docs/goals/<slug>/goal.md. | n/a>
Portable continuation: /goal Follow docs/goals/<slug>/goal.md.
CLI helper: goalbuddy resume docs/goals/<slug>
Start: <not requested | started | command printed | blocked>
Open questions: <none | material questions>
```

## Failure handling

- Runtime missing/stale → block GoalBuddy route with exact doctor result.
- Board path exists → stop without reading it.
- Plan/readiness weak → route to hardening; never write placeholders into a board.
- Semantic warning denylist fires → preparation is not accepted.
- Codex objective invalid → rewrite and revalidate.
- Existing unfinished Codex goal → report and stop.
- Dirty baseline plus mixed-fleet request → keep board, disable cross-vendor dispatch until a clean checkpoint.
