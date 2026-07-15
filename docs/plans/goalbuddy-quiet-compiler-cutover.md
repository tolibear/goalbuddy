# Make board compilation focused and execution quiet

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current as implementation proceeds. It follows `/Users/danielalnajjar/.agents/resources/plans.md`.

## Purpose / Big Picture

GoalBuddy 0.5 should expose one focused compilation job: turn a decision-complete specification, accepted plan, or sufficiently complete conversation contract into a new validated GoalBuddy board. It should not make the user or agent reason through direct work, native goals, Omega, recurring automation, and GoalBuddy before every compile. Once a board is running, its safety machinery should remain fully active but stay backstage; routine user updates should describe the product work, not the board, Keeper, Ledger, receipts, digests, or checker.

This work remains isolated on `codex/goalbuddy-product-0.5`. It must not install or refresh either live harness, mutate any current board, change the live 0.4 checkout, or land the companion skills-repo ownership transfer. Activation remains a separate owner-approved operation.

## Progress

- [x] (2026-07-14) Read the current compiler, Goal Prep boundary, execution contract, release notes, mirrors, tests, and isolated-worktree instructions.
- [x] (2026-07-14) Captured the previous compiler baseline: 50 Python compiler tests and 13 focused Node policy/mirror tests pass.
- [x] (2026-07-14) Replaced the route-selector compiler with one GoalBuddy-board compiler and removed the superseded native/routing resources and tests.
- [x] (2026-07-14) Added the quiet control-plane communication contract to the canonical execution reference and every required fallback surface.
- [x] (2026-07-14) Updated package documentation, 0.5 release notes, plugin mirrors, metadata, and the isolated skills-repo transfer wording.
- [x] (2026-07-14) Passed 20 focused Node policy/mirror tests, 34 focused compiler tests, the full 192 Node + 34 Python suite, package dry-run/archive inspection, and isolated Codex/Claude install-contract tests. The live 0.4 checkout remains clean at `41cb2fb` and the installed Codex cache remains 0.4.0.
- [x] (2026-07-14) Ran read-only adversarial audits with Claude Opus 4.8 at xhigh and Grok 4.5 at its supported high effort; both accepted the separation with bounded modifications rather than recommending a redesign.
- [x] (2026-07-14) Integrated the live 0.4 targeted-Keeper policy semantically, made rendered task prompts obey the quiet control plane, removed the compiler-internal Goal Prep question, clarified readiness boundaries, enforced the smallest-board proof floor, and reduced compilation to one user-facing checkpoint.
- [x] (2026-07-14) Passed 90 focused Node + 35 focused Python tests, the full 193 Node + 35 Python suite, compiler skill validation, mirror sync, package dry-run, and inspection of all 126 packed files. No live install, board, or current run was changed.

## Surprises & Discoveries

- Observation: The isolated 0.5 candidate integrated the compiler but preserved its older five-route interface, including direct work, native goals, Omega, and recurring automation.
  Evidence: `codex-goal-compiler/SKILL.md` is 292 lines and ships `routing.md`, `native-goal-compiler.md`, a native goal asset, and two native-goal validators.
- Observation: Goal Prep is already non-model-invocable while remaining available for explicit manual intake and repair.
  Evidence: `goalbuddy/SKILL.md` has `disable-model-invocation: true`; both OpenAI metadata files disable implicit Goal Prep invocation.
- Observation: The execution safety layer already reduces PM context, but it does not clearly prohibit narrating routine control-plane work to the user.
  Evidence: `goalbuddy/references/goal-execution.md` requires compact projections and Keeper isolation but still asks for periodic user-facing updates without defining product-level wording.
- Observation: Narrowing the compiler removes more code than it adds: its main instruction file fell from 292 to 180 lines and the package lost the native-goal asset, two routing/compiler references, two validators, and their tests.
  Evidence: comparison against `adc5781`; the packed archive contains 126 files and none of the removed route/native surfaces.
- Observation: Existing GoalBuddy CLI tests already exercise isolated Codex and Claude installation, doctor/contract readiness, rollback safety, stale-byte detection, and bundled compiler preflight with temporary homes.
  Evidence: `internal/test/goal-maker-cli.test.mjs`; all cases passed within the 192-test Node suite.
- Observation: The live 0.4 branch gained a narrower Keeper rule while the 0.5 candidate was isolated: a direct PM edit is allowed only for one already-known scalar or one-line annotation that needs no board read; all multi-location, authority, receipt, card, scope, approval, completion, and uncertain mutations still require Keeper mediation.
  Evidence: live commit `f73f45993a29cdd867be9e2d188279faf0319bb3`; the rule is represented in the candidate's canonical skill, execution contract, templates, and public-surface policy tests without cherry-picking unrelated live history.
- Observation: The generic skill validator cleanly validates both compiler copies but is not a valid package gate for the rich Goal Prep tree: it rejects pre-existing human-facing assets, JavaScript template literals as placeholders, the canonical directory/frontmatter naming convention, and one pre-existing resource-path heuristic.
  Evidence: the same flagged Goal Prep surfaces existed at candidate `HEAD` before this patch; the package's own 193 Node + 35 Python behavioral suite and mirror tests pass. This cutover does not broaden scope to redesign Goal Prep around a generic validator.

## Decision Log

- Decision: Keep the public name `codex-goal-compiler` for this cutover, but change its job and version it as 4.0.0.
  Rationale: The installed invocation name is familiar and already owned by GoalBuddy. Renaming it would add migration surface without making the agent interface deeper or clearer. The semantic narrowing is large enough for a compiler major version.
  Date/Author: 2026-07-14 / Codex
- Decision: Compile only new GoalBuddy boards from decision-complete source contracts.
  Rationale: This creates one deep public interface. Direct execution, plan creation, native goals, Omega, recurring automation, existing-board recovery, and implementation are adjacent jobs with different outputs and authority.
  Date/Author: 2026-07-14 / Codex
- Decision: A non-ready source returns `not_compilable` with the exact missing decisions; the compiler does not route to or invoke another workflow.
  Rationale: Reporting the boundary is part of compilation. Choosing and starting another workflow would recreate the route-selector job being removed.
  Date/Author: 2026-07-14 / Codex
- Decision: Preserve Goal Prep as an explicit/manual repair surface and compiler-internal schema backend.
  Rationale: Goal Prep owns current board schema and repair intake. Its existing non-model-invocation policy prevents it from competing with the compiler without duplicating schema in the compiler.
  Date/Author: 2026-07-14 / Codex
- Decision: Preserve every recovery, mutation, receipt, checker, and review invariant while making routine narration product-facing.
  Rationale: The problem is interface leakage, not the safety machinery. Hiding successful mechanics reduces cognitive load without weakening crash recovery or auditability.
  Date/Author: 2026-07-14 / Codex
- Decision: Keep Keeper mediation for every mutation that requires reading the board or changes more than one known location, but permit one exact-context direct edit to an already-known scalar or one-line annotation.
  Rationale: This incorporates the field-tested 0.4 ergonomics improvement without creating a direct-edit escape hatch for authority, receipts, task cards, scope, approvals, completion, or uncertain mutations.
  Date/Author: 2026-07-14 / Codex
- Decision: Goal Prep returns compiler-internal evidence silently; Codex Goal Compiler owns the only user-facing compilation checkpoint.
  Rationale: Two checkpoints made the backend feel like a competing workflow and invited duplicate start/refine/stop questions. One owner surface makes the interface predictable while preserving backend validation.
  Date/Author: 2026-07-14 / Codex
- Decision: Permit a first validation task only when the owner contract is complete and the missing information is environmental, evidentiary, calibration-related, or implementation-detail evidence.
  Rationale: Missing outcome, authority, scope, proof, or irreversible-boundary decisions are not discoverable implementation facts and must still fail closed as `not_compilable`.
  Date/Author: 2026-07-14 / Codex

## Outcomes & Retrospective

The isolated cutover is complete. Codex Goal Compiler now performs one transformation: decision-complete source to one new validated GoalBuddy board. Missing material decisions return `not_compilable`; compilation never selects another workflow, mutates an existing board, implements product work, or starts `/goal`. The compiler's main instruction file is 112 lines smaller, obsolete native/routing resources are absent from the inspected 126-file package archive, and the compiler emits one user-facing checkpoint after Goal Prep returns its evidence internally.

GoalBuddy's runtime safety model is preserved. Resume, Ledger, Keeper, digest, receipt, checker, polling, and prompt-rendering mechanics remain mandatory but are no longer routine user-facing narration. The only ergonomic relaxation is the live 0.4 rule for one already-known, exact-context scalar or one-line annotation edit that needs no board read; all consequential and uncertain mutations remain Keeper-owned. Product progress, independent review, material findings, actual blockers, required decisions, and completion evidence stay visible. Focused 90 Node + 35 Python tests, the full 193 Node + 35 Python suite, compiler validation, package inspection, and temporary Codex/Claude install-contract tests pass.

No activation occurred. The live 0.4 checkout, installed harness surfaces, and current boards were not written by this cutover. The next step is a separate owner-approved activation after reviewing the isolated candidate commit.

## Context and Orientation

`codex-goal-compiler/` is the bundled user-facing compiler skill. `goalbuddy/` is the Goal Prep and execution skill that owns board schema, templates, checker behavior, Keeper/Ledger contracts, and runtime scripts. `plugins/goalbuddy/skills/` contains byte-exact mirrors of both canonical skill trees. `internal/cli/sync-skill-tree.mjs` is the only mirror synchronizer. `internal/test/codex-goal-compiler/` verifies the compiler package. `internal/test/goalbuddy-skill-policy.test.mjs` verifies cross-surface execution policy.

The previous compiler supports five routes and two internal compilers. This refactor retains only the GoalBuddy compiler resources: runtime preflight, new-board path guard, Codex hybrid-objective validation, adaptive execution strategy, GoalBuddy compiler contract, and target handoff. The native-goal template, validators, routing reference, and their tests become obsolete and must be deleted, not retained as compatibility code.

The quiet interface is a communication policy. Internally, a genuine recovery still runs the validated resume projection and independent Ledger audit; execution-time board mutations still go through Keeper; task receipts and exact verification still persist. Externally, successful mechanics are omitted from routine updates. The user hears what product milestone is being implemented, reviewed, blocked, or completed. GoalBuddy mechanics are named only when the user asks, a discrepancy or runtime failure blocks safe continuation, or an exact board-related action is required from the user.

## Working Brief

The compiler should trigger for requests such as “compile this accepted RSVP specification into a GoalBuddy board,” “turn this approved implementation plan into a board,” and an explicit `$codex-goal-compiler` invocation with a decision-complete conversation contract. It should not trigger for “implement this typo fix,” “help me decide the RSVP architecture,” “resume this existing board,” or “schedule this every Friday.” If explicitly invoked on a small but decision-complete plan, it may create the smallest honest board rather than second-guess the owner. If invoked on vague intent, it returns `not_compilable` and names the missing outcome, authority, constraints, proof, or source decisions.

The primary pattern is Generator plus Inversion: generate one validated board, but fail closed before generation when the source contract is not decision-complete. The failure cost is medium to high because a weak board can drive a multi-day autonomous run. The compiler may write only a new `docs/goals/<slug>/` root. It must not inspect a colliding root, implement product work, start `/goal`, mutate an existing board, install GoalBuddy, publish, or perform external effects.

Success is observable when the compiler has one output type, its core file and package are smaller, its trigger/near-miss contract is explicit, a new board passes the official checker and semantic acceptance gates, and ordinary `/goal` updates can be written without control-plane vocabulary while all control-plane actions still occur internally. The preserved previous commit `adc5781` is the baseline.

Representative evaluation cases are: a large accepted end-to-end product specification that needs vertical slices and just-in-time planning seams; an accepted bounded implementation plan that needs a compact board; a vague “make the app better” request that must return `not_compilable`; and an explicit small plan that should produce the smallest valid board without route-selection prose. The difficult near-misses are existing-board recovery and requests to choose between planning/Omega/direct/automation.

## Plan of Work

First rewrite `codex-goal-compiler/SKILL.md` as a concise board compiler and revise `agents/openai.yaml`, `references/goalbuddy-compiler.md`, and `references/handoff-prompts.md` to remove route-selection and optional start behavior. Keep `references/adaptive-execution-strategy.md` because it controls how a large specification becomes durable vertical slices while execution decides plan/review/simplification depth at live seams. Delete `references/routing.md`, `references/native-goal-compiler.md`, `assets/native-goal.md`, the two native-goal scripts, and the superseded tests. Replace route-centric tests with observable compile-boundary, readiness, dependency, no-start, and resource-set tests.

Then add a `Quiet Control Plane` section near the top of `goalbuddy/references/goal-execution.md`. Repeat only its minimum fallback invariant in `goalbuddy/SKILL.md` and `plugins/goalbuddy/commands/goal.md`, because those surfaces explicitly govern behavior when the main reference cannot be read. Add focused policy assertions that successful recovery, Keeper operations, polling, receipt application, and checker runs remain internal while product milestones, real blockers, and user-required actions remain visible.

Update `AGENTS.md`, `README.md`, `docs/releases/0.5.0.md`, plugin metadata, and the companion skills-transfer branch so every product description agrees that the compiler produces GoalBuddy boards rather than choosing among unrelated workflows. Run the existing mirror synchronizer instead of editing plugin copies by hand.

Finally run focused compiler and policy tests, the full package check, package dry-run, and isolated Codex/Claude installation checks with temporary homes. Compare the final resource inventory and instruction size with `adc5781`, inspect the packed archive, and prove live 0.4 paths and representative active-board hashes are unchanged. Commit the GoalBuddy candidate and the skills-transfer documentation separately. Do not install or activate 0.5.

## Concrete Steps

From `/Users/danielalnajjar/Code/.worktrees/goalbuddy-product-0.5`, edit only the isolated branch, run `npm run sync:plugin`, then run `npm run check` and `npm run pack:dry-run`. Run the existing isolated-install test path used by `internal/test/goal-maker-cli.test.mjs` or an equivalent temporary `CODEX_HOME` and `CLAUDE_HOME`; both `goalbuddy doctor` and `goalbuddy contract` targets must pass. From `/Users/danielalnajjar/Code/.worktrees/skills-goalbuddy-cutover`, update only ownership-transfer documentation and run that repository's affected link/integration checks.

## Validation and Acceptance

Acceptance requires all of the following observable behavior:

1. The packaged compiler contains no direct/native/Omega/recurring route-selection reference, native-goal template, or native-goal validator.
2. Its frontmatter and default prompt clearly say “decision-complete source to new validated GoalBuddy board,” and explicit near-misses do not claim another workflow.
3. `not_compilable` is the only failure outcome for missing source decisions; it names missing facts and creates no board.
4. A successful compile creates only a new GoalBuddy root, passes official checker plus semantic acceptance, prints the board path and exact start command, and does not start execution.
5. Goal Prep remains non-model-invocable and compiler-internal, with explicit manual repair still available.
6. The execution contract says routine successful control-plane mechanics are silent and product-facing updates do not use GoalBuddy vocabulary unless an exception applies.
7. Existing board schema and runtime safety behavior do not change, full tests pass, both isolated harness installs pass, and live 0.4 files and boards remain untouched.

## Idempotence and Recovery

All edits are in isolated worktrees. The mirror sync is deterministic and may be rerun. Tests use temporary directories and must not target live homes. If the candidate fails, leave the live 0.4 installation untouched and repair or reset only the isolated branches. Do not use compatibility wrappers, dual compiler paths, historical board rewrites, or an activation shim.

## Artifacts and Notes

Baseline evidence before refactoring:

    node --test internal/test/goalbuddy-skill-policy.test.mjs internal/test/skill-tree-sync.test.mjs
    # 13 passed

    python3 -B -m unittest discover -s internal/test/codex-goal-compiler -p 'test_*.py'
    # 50 passed

## Interfaces and Dependencies

The stable public skill remains `codex-goal-compiler`. Its only artifact is `docs/goals/<slug>/` and its only schema dependency is the selected installed Goal Prep skill after `check_goalbuddy_runtime.py` validates GoalBuddy compiler contract v1. GoalBuddy remains the sole owner of board schema, checker, templates, agents, and execution. Python 3 runs the deterministic compiler validators; Node runs GoalBuddy's official checker and package tests. No network, credential, external service, or live-harness mutation is required for this implementation.
