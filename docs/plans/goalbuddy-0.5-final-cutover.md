# Complete the GoalBuddy 0.5 Product Cutover

This ExecPlan is a living document. It follows `/Users/danielalnajjar/.agents/resources/plans.md` and must remain current as implementation and activation proceed.

## Purpose / Big Picture

After this cutover, Daniel can invoke one installed `codex-goal-compiler` skill from Codex or Claude. That skill chooses the honest execution route; when it selects GoalBuddy, its focused internal backend compiles a decision-complete source into a new validated board. GoalBuddy 0.5 then keeps recovery, receipts, deterministic transitions, and board mechanics out of routine Fable-facing narration without weakening them. Existing boards remain byte-identical and may be referenced as history while new successor boards use 0.5.

## Progress

- [x] (2026-07-16) Built and tested the isolated GoalBuddy 0.5 runtime candidate through commit `1651bbd`.
- [x] (2026-07-16) Verified that the live installation is still GoalBuddy 0.4.0 with standalone compiler 3.2.1.
- [x] (2026-07-16) Confirmed that trading T118 is complete, trading T119 is ready for successor dispatch, and wedding-media T032 is ready for successor dispatch with no live writers.
- [x] (2026-07-16) Restored the single public routing front door around the focused 0.5 GoalBuddy backend, including native-goal resources and route-specific progressive disclosure.
- [x] (2026-07-16) Ported the approved Codex `default_permissions` agent schema without weakening 0.5 role contracts.
- [x] (2026-07-16) Synchronized plugin mirrors and updated current product documentation, composer copy, and tests.
- [ ] Run package dry-run, isolated-install validation, and representative compiler acceptance; focused tests are 92/92 Node plus 48/48 Python, and full `npm run check` is 212/212 Node plus 48/48 Python.
- [ ] Land the candidate and activate it transactionally for Codex and Claude.
- [ ] Prove both contracts and doctors, installed source identity, and representative old-board byte preservation.
- [ ] Retire the old skills-repository compiler source and push both repositories.

## Surprises & Discoveries

- Observation: The candidate's full test command requires loopback sockets and writes one generated example file, so the restricted sandbox produces `EPERM` failures unrelated to source correctness.
  Evidence: The initial `npm run check` passed 200 Node tests and failed 12 local-board tests only on `listen 127.0.0.1` or the generated example path. The final proof must run with the already-approved unsandboxed test boundary.
- Observation: The live 0.4 checkout contains uncommitted but approved Codex permission-schema edits.
  Evidence: Five canonical agent TOMLs replace `sandbox_mode` with `default_permissions`; Worker also defines the `workspace-network` profile. These exact semantics must be ported before activation.
- Observation: The restored public router and the 0.5 runtime remain cleanly separated by compiler contract v1.
  Evidence: Compiler tests cover all route exits, backend-specific progressive disclosure, exact installed Goal Prep binding, additive capabilities, native-goal isolation, and a stop-before-execution GoalBuddy handoff; the complete candidate suite passes.

## Decision Log

- Decision: Preserve one public compiler skill with route selection and two internal compilers, while retaining the new 0.5 GoalBuddy backend unchanged in ownership.
  Rationale: Daniel relies on one memorable front door; the compile-only candidate orphaned direct, planning, native-goal, Omega, and recurring route decisions without reducing GoalBuddy runtime complexity.
  Date/Author: 2026-07-16 / Codex with owner approval.
- Decision: Existing boards are not schema-migrated or rewritten.
  Rationale: GoalBuddy 0.5 keeps board schema v2 and historical compatibility. Trading and wedding-media will create fresh successor boards after activation, leaving old boards as evidence.
  Date/Author: 2026-07-16 / Daniel Alnajjar and Codex.
- Decision: Activation remains transactional and rollback-safe.
  Rationale: A failed install must restore all GoalBuddy-owned Codex and Claude surfaces before any skills-repository deletion lands.
  Date/Author: 2026-07-16 / Codex.

## Outcomes & Retrospective

Pending completion.

## Context and Orientation

The isolated candidate is `/Users/danielalnajjar/Code/.worktrees/goalbuddy-product-0.5` on branch `codex/goalbuddy-product-0.5`. Its `codex-goal-compiler/` directory is the canonical bundled compiler, `goalbuddy/` is the canonical Goal Prep and execution payload, and `plugins/goalbuddy/skills/` contains byte-exact installed mirrors. The package CLI at `internal/cli/goal-maker.mjs` owns transactional installation, contracts, doctors, and source binding.

The current compiler in `/Users/danielalnajjar/Code/skills/shared/skills/codex-goal-compiler` is version 3.2.1 and supplies the routing and standalone native-goal contracts that the candidate removed. The final compiler must reuse those current routing and native-goal resources, update GoalBuddy admission to compiler contract v1, and preserve the candidate's focused `references/goalbuddy-compiler.md`, adaptive strategy, handoff, preflight, board-path guard, and Codex-objective validator. It must not restore 0.4's exact-version or exact-agent-count coupling.

The canonical live GoalBuddy checkout at `/Users/danielalnajjar/Code/goalbuddy` contains approved uncommitted permission-schema changes. Port their semantics into the isolated candidate; do not mutate or clean that checkout. The clean skills-transfer worktree `/Users/danielalnajjar/Code/.worktrees/skills-goalbuddy-cutover` owns deletion of the old standalone compiler only after the 0.5 installation proves the bundled copy is live.

## Plan of Work

First merge the current routing and native-goal resources into the candidate compiler. Rewrite `codex-goal-compiler/SKILL.md` and `agents/openai.yaml` so route selection is the public surface, backend references load only after route selection, and the GoalBuddy route consumes compiler contract v1. Keep the candidate GoalBuddy backend references and scripts as the board-compilation authority. Restore the native-goal asset, guard, validator, and tests inside the GoalBuddy package.

Then update repository policy, release notes, README, changelog, plugin composer prompt, and compiler tests so every current surface describes one public route selector with a focused GoalBuddy backend. Port `default_permissions` to all five Codex agent definitions and add the Worker's network-enabled workspace profile, then run the existing mirror synchronizer.

Validate the candidate in isolation. Run the compiler tests, policy and marketplace tests, full `npm run check`, package dry-run, isolated Codex and Claude installs, contracts, and doctors. Exercise representative routing outcomes and a disposable GoalBuddy compile. Re-run the current-board compatibility fixtures and record pre/post hashes for live trading and wedding-media board files.

After a coherent candidate commit, land it into the canonical fork branch and update the Bun-owned local package binding. Run `goalbuddy install` from the verified source. Require the installation transaction to report success, then run fresh-process Codex and Claude contracts and doctors. If any activation step fails, require `rolled_back`; a `rollback_failed` result is a hard stop.

Only after installed compiler and Goal Prep fingerprints match the landed source, update the skills-transfer branch so the standalone compiler source and links are retired. Run affected skills-repository link and integration checks, commit, and push both repositories.

## Concrete Steps

All GoalBuddy source edits and tests run from `/Users/danielalnajjar/Code/.worktrees/goalbuddy-product-0.5`. Plugin mirrors are generated with `npm run sync:plugin`. Focused compiler validation is `python3 -B -m unittest discover -s internal/test/codex-goal-compiler -p 'test_*.py'`. Full validation is `npm run check`, followed by `npm run pack:dry-run`.

Activation uses the landed local checkout and the package's explicit `goalbuddy install` command. After installation, run `goalbuddy contract --target codex --json`, `goalbuddy contract --target claude --json`, `goalbuddy doctor --target codex --goal-ready`, and `goalbuddy doctor --target claude`. Do not use bare package invocation as an activation shortcut.

## Validation and Acceptance

Acceptance requires one installed compiler path and fingerprint per harness, compiler version 4.0.0, GoalBuddy product version 0.5.0, contract v1, board schema v2, both target doctors ready, and no duplicate standalone compiler. The compiler must route representative direct, planning, native-goal, GoalBuddy, Omega, and recurring cases without loading GoalBuddy backend references before the GoalBuddy route. A GoalBuddy compile must create only a new `docs/goals/<slug>/` root and stop before execution; a native goal must create only `docs/codex-goals/<slug>/goal.md`.

The candidate must retain all runtime safety tests, exact installed mirror equality, content-aware dispatch proof, current-active digest admission, immutable-history compatibility, quiet control-plane policy, and deterministic direct transitions. Existing trading and wedding-media board hashes must match their preactivation values exactly.

## Idempotence and Recovery

Mirror synchronization and tests are deterministic. Source changes remain isolated until committed. Transactional install snapshots every GoalBuddy-owned surface and restores it on failure. Do not delete the old compiler source or modify old boards until both installed targets prove the bundled compiler. If installation rolls back successfully, continue using 0.4 and repair only the isolated candidate. If rollback itself fails, stop and preserve the reported recovery snapshot.

## Artifacts and Notes

Record the final candidate commit, package archive contents, test totals, installation transaction report, both contract reports, both doctor reports, installed fingerprints, old-board hashes, and skills-transfer commit in this section as work completes.

## Interfaces and Dependencies

`codex-goal-compiler` remains the public skill name. Its routing reference chooses direct work, planning, standalone native goal, GoalBuddy, Omega, or recurring execution. The native compiler writes `docs/codex-goals/<slug>/goal.md`. The GoalBuddy backend writes a new `docs/goals/<slug>/` through the installed Goal Prep skill after `check_goalbuddy_runtime.py` validates compiler contract v1. GoalBuddy owns every board schema and runtime operation. Python 3 runs compiler validators; Node runs GoalBuddy scripts and tests. No new package dependency, daemon, compatibility shim, board schema, or secondary ledger is introduced.

Revision note (2026-07-16): Created this final activation ExecPlan to supersede the compile-only interface decision after owner review established that one routing front door is a required workflow capability.
