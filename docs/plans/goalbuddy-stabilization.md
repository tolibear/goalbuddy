# Stabilize GoalBuddy deterministic workflow boundaries

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. Maintain this document in accordance with `/Users/danielalnajjar/.agents/resources/plans.md`.

## Purpose / Big Picture

GoalBuddy must preserve a Worker or Judge receipt exactly enough that the task identity and board identity cannot disappear, while remaining a generic workflow engine rather than an authority system for any product. After this change, a receipt applied through the public command retains `task_id`, `board_path`, and arbitrary additive evidence; valid multiline YAML resumes strictly; Judge decisions and advertised runtime capabilities are admitted from closed vocabularies; atomic amendment and placeholder-hydration transitions roll back on failure; and Codex Goal Compiler diagnoses the actual resolved runtime without confusing a dirty local checkout with a pristine published package. The result is observable through the focused regression suite, the full GoalBuddy check, the compiler test suite, exact mirror checks, and two scoped commits.

## Progress

- [x] (2026-07-13 00:20Z) Rendered active Worker T003 from `docs/goals/goalbuddy-stabilization/state.yaml` and recorded its exact objective, allowed files, verification commands, and stop conditions.
- [x] (2026-07-13 00:20Z) Verified the handed-off fingerprints before editing: GoalBuddy HEAD/status/diff/capture files, compiler HEAD and clean scoped paths, cloud-env HEAD/status/diff, environment-configuration HEAD/status/diff, cloud-board digest, absence of Git locks, and absence of a live writer for the handed-off cloud work.
- [x] (2026-07-13 00:20Z) Created this living ExecPlan as the first file edit.
- [x] (2026-07-13 00:22Z) Added the receipt-identity regression without changing behavior and retained its exact red failure: stored `task_id` was `undefined` instead of `T001`.
- [x] (2026-07-13 00:48Z) Removed receipt capture and product authority semantics while preserving the neutral multiline parser repair.
- [x] (2026-07-13 00:48Z) Implemented receipt identity, closed decisions/capabilities, digest-bound atomic rollback, recovery and wait-boundary regressions, truthful runtime reporting, and task-card schema cleanup.
- [x] (2026-07-13 00:48Z) Synchronized tracked GoalBuddy mirrors and rebuilt the compiler archive.
- [ ] Run every literal verification command and update this plan with the evidence (completed: first three commands passed; blocked: the fourth command hung twice in the linked-child SSE regression and was interrupted; remaining commands were not run after the stop condition fired).
- [ ] Create exactly one scoped GoalBuddy commit and one scoped codex-goal-compiler commit (not attempted because verification failed twice).
- [x] (2026-07-13 01:10Z) T004 resumed the same warm Worker, verified the exact inherited GoalBuddy/compiler and preservation fingerprints, and authorized the two local-board runtime paths needed for the SSE repair.
- [x] (2026-07-13 01:12Z) Repaired watcher registration by installing the complete replacement watcher set before closing the previous set and scheduling an immediate post-registration reconciliation.
- [x] (2026-07-13 01:20Z) Ran the focused SSE replay, plan/capture/mirror gates, combined 133-test stabilization lane, and full 154-test GoalBuddy check successfully.
- [x] (2026-07-13 01:22Z) Rebuilt the compiler archive without directory entries after its first archive regression failure, then passed all 48 compiler tests on the second declared attempt.
- [x] (2026-07-13 01:25Z) Created scoped compiler commit `d5963b29add95101536cac6ac24c0cb3c3cfb85c`; the GoalBuddy commit containing this plan remains the final commit action.
- [x] (2026-07-13 02:05Z) Rendered T009, read the approved T008 architecture, and verified exact clean GoalBuddy/compiler bases plus protected repository fingerprints before editing.
- [x] (2026-07-13 02:05Z) Recorded the canary's byte-preserving failed wait at digest `3994129e221bc9aac2988be3a89afaafeab701bcccb4cfc87ea24716298c94e2` as the T009 red failure evidence.
- [x] (2026-07-13 02:35Z) Implemented digest-bound atomic `goalbuddy wait` and exact `goalbuddy reply`, durable task-level transition evidence, compact resume projection, typed Keeper operations, and the sixth closed runtime capability.
- [x] (2026-07-13 02:38Z) Added strict lifecycle, malformed-input, mismatch, replay, final-receipt, checker, CLI, resume, Keeper-policy, and compiler-admission regressions; synchronized canonical plugin mirrors and rebuilt the byte-exact compiler archive.
- [x] (2026-07-13 02:43Z) Passed the 111-test focused GoalBuddy lane, full 158-test GoalBuddy check, all 50 compiler tests, both compiler runtime validators, mirror check, and archive hygiene gate.
- [x] (2026-07-13 02:45Z) Created scoped compiler commit `89d9af9b329167e8522f10eff7b2a77ba9996e5b`; the GoalBuddy commit containing this living plan remains the final commit action.
- [x] (2026-07-13 04:35Z) Ran the requested normal four-seat Council ship gate over final completion. The Chairman rejected the concurrency overclaim: digest rechecking did not serialize two writers that validated the same prior state.
- [x] (2026-07-13 04:41Z) Serialized every official board mutation with one stable per-board lock held through fresh read, digest check, candidate validation, rename, and directory fsync; added a deterministic same-digest two-writer regression and passed the 54-test focused apply/checker lane.
- [x] (2026-07-13 04:45Z) Synchronized canonical/plugin mirrors, passed the full 162-test GoalBuddy check, all 50 compiler tests, both runtime preflights, both compiler skill validators, and `git diff --check`.
- [x] (2026-07-13 04:55Z) Confirmed the paused cloud board has exactly eight checker errors, each tied to an already-done Judge task, while its historical receipt indentation is checker-tolerated but not strict-parser compatible; preserved its exact digest and bytes.
- [x] (2026-07-13 05:05Z) Added explicit immutable-history admission for receipt transitions, a typed `goalbuddy rebind` control mutation, Keeper request/receipt support, strict installed-checker/source proof, and fail-closed coverage for implicit use, live-tail errors, changed error sets, legacy parser dialect, byte preservation, and bad installed bytes.
- [x] (2026-07-13 05:07Z) Synchronized all canonical/plugin mirrors and passed the 120-test focused apply/checker/CLI/policy lane.
- [x] (2026-07-13 05:08Z) Passed the final 167-test GoalBuddy suite, all 50 compiler tests, both compiler skill validators, mirror equality, and `git diff --check` after the complete compatibility correction.

## Surprises & Discoveries

- Observation: The handed-off GoalBuddy tree is intentionally dirty at clean base commit `34faed6b5f032b559e44e1dea718ca073fa47993`; its eight tracked edits and two untracked receipt-capture files match every supplied digest exactly.
  Evidence: status digest `b64aeaf7732bac90ac97b5a361db9a2b04838e343cc0ee5620ab4f51066cee8f`, binary tracked-diff digest `d745eb71a8cb98c1222461e78b2e7b2020a63810ad00a24fbc108aeb36f963e9`, capture source digest `d89a4a34447b87004b76d0523d6b190e26ddb40e8d4711f02b3f421990d929ec`, and capture test digest `a68fa22fb4ff9e7f4bd8043f2394334e7a4efb7843cef0494045953ed6b77eda`.
- Observation: cloud-env is intentionally dirty, but its exact handed-off state is stable and must remain untouched; environment-configuration also has only its supplied board and ExecPlan modifications.
  Evidence: cloud-env HEAD `8fc9bc4919761b145e98b89316adf68e83b84b49`, status digest `96410599c2962fd52b12c3901505ca1396449149de6aaa95fa9ff774e783ef07`, diff digest `11acf062116267e7cda59a002c98457b8ab163a10c133186f4d6e52ef3e5c205`; environment-configuration HEAD `01c1e495a113b26b5c04011deb604ac5a260e8b7`; cloud board digest `a38bbbff414d85169783a38f4a770b32108aa61c616b80238370647b38fef29c`.
- Observation: The public receipt transition silently discarded both receipt identity fields before serialization.
  Evidence: `node --test --test-name-pattern='apply-receipt preserves receipt task and board identity losslessly' internal/test/apply-receipt.test.mjs` exited 1. The assertion at line 200 reported `actual: undefined`, `expected: 'T001'`; source inspection shows `loadReceipt` deleting both `board_path` and `task_id`.
- Observation: On macOS, temporary paths may spell the same file through `/var` and `/private/var`; lexical receipt-board comparison rejected a valid identity after the preservation fix.
  Evidence: The first focused green attempt failed because the receipt carried `/var/folders/.../state.yaml` while the applier resolved the board as `/private/var/folders/.../state.yaml`. Comparing `realpathSync` results preserves the original receipt spelling while validating the same file, and the rerun passed all 48 apply/checker tests.
- Observation: `exact_human_reply` is a conceptual boundary label, not a new schema key.
  Evidence: PM clarification confirms the closed public shape remains `result: blocked`, `waiting_for_user_approval: true`, and nonempty `required_reply` under `rules.exact_human_approval_can_terminal_wait: true`; no resume or template migration is required.
- Observation: The literal five-file Node verification consistently hangs in the local-board child-subgoal SSE test, although that test passes in isolation.
  Evidence: Both literal attempts advanced through `coalesces transient active-task violations` and then left `streams parent board updates when linked child subgoal state changes` pending. The second attempt was interrupted after 179474 ms with 123 passing tests, zero assertion failures, one cancelled local-board file, and `Promise resolution is still pending but the event loop has already resolved`. The child state had already changed to blocked while the SSE connection remained open, consistent with the watcher-registration race in `goalbuddy/surfaces/local-goal-board/scripts/local-goal-board.mjs`, which is outside T003 `allowed_files`.
- Observation: `watchGoal.rebuild` previously closed every current watcher before registering replacements and did not reconcile state after initial registration.
  Evidence: A child-state change during that unobserved interval could be absent from both `lastPayload` and every filesystem watcher. T004 now authorizes the runtime file and closes the gap without changing board data or weakening the regression.
- Observation: Updating the compiler zip with ordinary recursive `zip` options introduced directory entries that the byte-exact archive contract excludes.
  Evidence: The first full compiler verification failed `test_package_archive.py` because the archive contained six additional directory members. Rebuilding with `zip -FS -D -r` removed directory entries; the focused archive test and the second literal 48-test compiler run passed.
- Observation: The clean-room canary can validate and project a manually shaped exact-human wait, but the official applier cannot enter that state atomically.
  Evidence: The official terminal-wait application reverted byte-for-byte because it left `goal.status: active`; the preserved board digest is `3994129e221bc9aac2988be3a89afaafeab701bcccb4cfc87ea24716298c94e2`. No official exact-reply reactivation command exists.
- Observation: A compare-before-rename digest check detects an intervening completed write but does not itself exclude two writers between their shared read and their separate renames.
  Evidence: The normal Council ship gate traced the public completion path and produced a no-ship Chairman verdict. Both writers could read the same digest, validate distinct candidates, pass their pre-rename checks, and then install sequentially; the second rename would overwrite the first accepted receipt.
- Observation: The real cloud board's live tail is checker-clean relative to exactly eight frozen decision-vocabulary errors, but the strict board parser rejects a historical indentless sequence at line 3628 that the checker deliberately tolerates.
  Evidence: The canonical checker reports only T007, T009, T001, T035, T041, T047, T055, and T056 legacy Judge decisions; each task is already `done`. A direct strict parse stops at the preserved `evidence` sequence. Compatibility proof therefore uses the checker plus raw task status/block bytes, never lossy parsed semantics.

## Decision Log

- Decision: Delete the receipt-capture feature rather than generalize or quarantine its product-specific authority model.
  Rationale: T002 Judge approved only deterministic workflow boundaries and explicitly rejected cloud-env authority, provider/session assumptions, approval classes, and security semantics inside GoalBuddy.
  Date/Author: 2026-07-13 / Worker T003
- Decision: Preserve the handed-off multiline plain-scalar parser change and validate it independently from receipt capture.
  Rationale: It is a neutral strict-parsing correction within GoalBuddy's generic board boundary and is explicitly retained by T003.
  Date/Author: 2026-07-13 / Worker T003
- Decision: Treat existing historical board keys as inert data while removing product-specific fields only from newly hydrated task-card validation and generation.
  Rationale: The task prohibits historical-board migration while requiring the new hydration surface to stop advertising product policy.
  Date/Author: 2026-07-13 / Worker T003
- Decision: Advertise the five runtime capabilities as one hard-coded object rather than infer them by text-scanning installed files.
  Rationale: The capability names describe the versioned runtime contract, and exact compiler admission plus the regression suite proves the implementation. Text-scanning was permissive boilerplate and could advertise partial or unknown semantics.
  Date/Author: 2026-07-13 / Worker T003
- Decision: Preserve optional receipt identity exactly, reject contradictory identity when present, and leave older receipts without these additive fields valid.
  Rationale: This is lossless and fail-closed for new envelopes without requiring historical-board migration.
  Date/Author: 2026-07-13 / Worker T003
- Decision: Register an entire new watcher set successfully before closing the old set, then schedule a debounced reconciliation after every rebuild.
  Rationale: Overlapping watcher generations removes refresh gaps; the reconciliation closes the initial snapshot-to-registration gap and recovers coalesced filesystem events. Existing SSE payload and board semantics remain unchanged.
  Date/Author: 2026-07-13 / Worker T004
- Decision: Reuse `apply-receipt.mjs` as the only persistence boundary for wait entry and reply resumption, with public `goalbuddy wait` and `goalbuddy reply` CLI modes.
  Rationale: T008 approved a single digest-bound, candidate-validated, atomic boundary rather than a daemon, database, manifest, or parallel state system.
  Date/Author: 2026-07-13 / Worker T009
- Decision: Store completed exact-reply transitions under task-level `transition_evidence.exact_human_replies` and keep the live `receipt` slot free for the task's eventual final receipt.
  Rationale: This preserves the complete wait receipt and compact transition hashes through final receipt replacement without claiming authenticated human identity or product authority.
  Date/Author: 2026-07-13 / Worker T009
- Decision: Serialize all mutations at the existing `apply-receipt.mjs` persistence boundary with one stable sibling lock per canonical goal directory.
  Rationale: The lock closes the same-digest overwrite race without a service, database, secondary state, schema migration, or compiler change. Contention fails closed and requires a fresh resume digest; a possibly stale lock is never removed automatically.
  Date/Author: 2026-07-13 / PM corrective verification
- Decision: Make legacy-history admission explicit with `--allow-immutable-history`, and accept it only when the exact checker-error multiset survives and every referenced done-task raw block is byte-identical.
  Rationale: This permits a verified live tail to move without rewriting history, while global, ambiguous, live, malformed, added, removed, or changed errors still fail closed. Raw bytes avoid granting the tolerant parser authority to reinterpret historical receipts.
  Date/Author: 2026-07-13 / PM compatibility correction
- Decision: Rebind `checks.goalbuddy_binding` only through typed `goalbuddy rebind` plus Keeper `rebind_goalbuddy`.
  Rationale: A single locked control mutation can verify exact digest, clean source commit, canonical checker location/hash, and every supplied installed checker copy while changing no task or adjacent control field.
  Date/Author: 2026-07-13 / PM compatibility correction

## Outcomes & Retrospective

T004 completed the stabilization implementation and repaired the T003 verification blocker without weakening the regression. The focused SSE replay passes; the combined stabilization lane passes 133 tests; `npm run check` passes 154 tests; the compiler passes all 48 tests; receipt capture is absent; and tracked mirrors are byte-exact. Compiler commit `d5963b29add95101536cac6ac24c0cb3c3cfb85c` is clean and scoped. This plan is being finalized inside the single scoped GoalBuddy commit; its exact hash is necessarily recorded in the external Worker receipt to avoid a self-referential commit.

T009 is complete. Its required outcome was one official atomic wait/reply lifecycle that preserves strict exact-string evidence across reply, resume, and eventual final receipt replacement while leaving historical boards valid and product authority external.

T009 delivered that lifecycle without a new service or migration. Public wait entry and reply resumption share the existing candidate-validated atomic applier; mismatches preserve board bytes and digest; successful replies preserve the complete wait receipt plus deterministic hashes in task-level transition evidence; resume exposes only compact proof. Compiler version 3.1.7 now requires the sixth runtime capability. Compiler commit `89d9af9b329167e8522f10eff7b2a77ba9996e5b` is clean and scoped. The exact GoalBuddy commit hash is recorded in the external Worker receipt because this plan is part of that commit.

The post-completion Council gate found one real correctness gap in the otherwise completed workflow: the word "atomic" overclaimed concurrent-writer safety. The corrective successor keeps the closed board immutable and strengthens the existing persistence boundary instead. Official mutations are now serialized from fresh read through durable install, and a deterministic two-writer regression proves that only the lock holder can install a same-digest candidate. Codex Goal Compiler 3.1.8 and its `atomic_goal_completion` capability contract need no semantic change; the runtime now fully earns the capability it already advertises.

The corrective successor is green before installation: 54 focused apply/checker tests, 162 full GoalBuddy tests, 50 compiler tests, both compiler runtime preflights, both compiler skill validators, byte-exact plugin mirrors, and `git diff --check` all pass. The already-closed stabilization board remains untouched; this plan and the corrective commit are the successor verification artifact.

The cloud-thread compatibility follow-up extends that correction without altering compiler semantics or historical boards. Compatibility must be PM-authorized and digest-bound; the raw checker remains honest, while the applier returns a compact `immutable_history_compatible` proof only when every pre-existing error and referenced history byte survives unchanged. Rebinding is now a separate typed control operation with source and installed-byte evidence. The real cloud board has not been mutated; its exact digest remains the preservation oracle for the post-commit disposable-copy canary.

Final pre-commit evidence for the complete successor is 167/167 GoalBuddy tests, 50/50 compiler tests, both compiler skill validators, byte-exact plugin mirrors, and a clean diff check. The only validator output is the pre-existing `.DS_Store` packaging warning; it is unrelated and unchanged.

## Context and Orientation

`goalbuddy/scripts/apply-receipt.mjs` is the public transition engine that consumes a receipt JSON object and writes a version 2 `state.yaml`. It must preserve the receipt envelope's identity fields, keep arbitrary evidence inert, and apply amendments or placeholder hydration atomically. `goalbuddy/scripts/check-goal-state.mjs` is the strict validator for persisted boards. `goalbuddy/surfaces/local-goal-board/scripts/lib/goal-board.mjs` parses and serializes YAML for the local board and resume surfaces. `internal/cli/goal-maker.mjs` is the package CLI and runtime-capability authority. Canonical skill files under `goalbuddy/` are copied byte-for-byte into `plugins/goalbuddy/skills/goal-prep/` by `internal/cli/sync-skill-tree.mjs`; the Claude Keeper markdown mirror under `plugins/goalbuddy/agents/` is maintained separately.

The Codex Goal Compiler lives in the sibling repository path `/Users/danielalnajjar/Code/skills/shared/skills/codex-goal-compiler/`. Its runtime checker resolves the installed or local GoalBuddy command, validates the hard-coded capability contract, and reports provenance. The tracked `shared/skills/codex-goal-compiler.zip` archive must exactly reflect that skill directory after changes.

A "closed vocabulary" means a fixed set of accepted string values. GoalBuddy's Judge decision set is exactly `approved`, `rejected`, `approve_subgoal`, `reject_subgoal`, `not_complete`, and `complete`. Its runtime capability set is exactly `atomic_amendment_transition`, `atomic_placeholder_hydration_transition`, `lossless_receipt_identity`, `strict_multiline_yaml_projection`, `closed_judge_decision_vocabulary`, `atomic_exact_human_wait_resume`, and `atomic_goal_completion`. Unknown or missing advertised capabilities fail closed. Human waiting has one shape: `exact_human_reply`; it does not imply an approval class.

T009 adds `atomic_exact_human_wait_resume` as the sixth and only new capability. Wait entry requires an active selected task and goal, the existing terminal-wait rule, a mandatory expected board digest, and an identity-bound blocked receipt containing the sole exact-human wait shape. Reply compares a one-field JSON string exactly, including case and whitespace. A mismatch is a digest-identical no-op. An exact match reactivates only the waiting task and goal, moves the complete wait receipt into task-level transition evidence, and clears the live receipt.

T011 later adds `atomic_goal_completion` as the seventh capability. The corrective successor does not add another capability; it makes the shared atomicity claim concurrency-safe for all seven mutation surfaces.

## Plan of Work

First, add a public-surface regression to `internal/test/apply-receipt.test.mjs` that supplies a receipt with `task_id` and `board_path`, applies it to a disposable board, and asserts those fields remain in the stored receipt. Run only that test against the handed-off behavior and retain the exact assertion failure before any behavioral fix.

Next, inspect and adjudicate every handed-off edit. Delete `goalbuddy/scripts/receipt-capture.mjs` and `internal/test/receipt-capture.test.mjs`; remove capture capabilities, metadata, Keeper prose, receipt spec claims, and product authority language from canonical and mirrored files. Keep the multiline parser correction. Update `apply-receipt.mjs`, `check-goal-state.mjs`, the package CLI, and the public-surface tests to preserve receipt identity, constrain Judge decisions and advertised capabilities, keep additive evidence inert, and prove amendment/hydration rollback, verification coverage, recovery liveness, approval-only waits, and polling-versus-terminal timeout guidance. Remove `approval_phrase`, `approval_phrases`, and `boundary_classification` from newly hydrated task-card fields without rejecting them on historical boards.

Then update the compiler skill, references, metadata, checker, and tests so it requires the exact runtime capability set and reports package version separately from the resolved executable path, source kind, Git HEAD, and dirty state. Synchronize GoalBuddy's tracked plugin tree with the canonical skill and rebuild the compiler zip deterministically using the repository's existing archive method.

Finally, run every T003 verification command literally. Repair failures only within allowed files and stop after a second failure of any declared gate. Update this plan after each milestone. Stage only the T003 paths, create one narrative GoalBuddy commit and one narrative compiler commit, and prove commit counts and path scopes. Never stage `docs/goals/`, unrelated skills-repository dirt, cloud-env, or environment-configuration.

## Concrete Steps

Work from `/Users/danielalnajjar/Code/goalbuddy` unless a command explicitly changes directory.

1. Add and run the isolated receipt identity regression before changing `apply-receipt.mjs`. Expect a non-zero exit whose assertion shows missing `task_id` and/or `board_path`; record the exact output in this plan and the final Worker receipt.
2. Read the handed-off diffs and current test/public surfaces, then make bounded edits only to T003 `allowed_files` using `apply_patch`.
3. Run focused tests during development, synchronize tracked mirrors with `node internal/cli/sync-skill-tree.mjs`, and rebuild `../skills/shared/skills/codex-goal-compiler.zip` with the existing deterministic packaging command.
4. Run the nine literal verification commands rendered from T003, in order, recording pass or fail for each.
5. Stage explicit allowed paths and inspect each staged diff. Commit GoalBuddy once. Stage only `shared/skills/codex-goal-compiler/` and its zip in the skills repo, preserve all unrelated dirt, inspect the staged diff, and commit once.
6. Re-run the commit-scope and cloud-env preservation commands after commits.

## Validation and Acceptance

Acceptance requires a retained red-before-green receipt identity transcript; focused tests proving lossless receipt identity, strict multiline resume, closed Judge decisions and capability admission, atomic rollback, verification coverage, recovery liveness, timeout guidance, and sole `exact_human_reply` waits; absence of receipt capture files and language; byte-exact canonical/plugin mirrors; the full `npm run check`; all compiler unittests; one commit after each supplied repository base; clean GoalBuddy status; clean compiler scoped paths despite unrelated skills dirt; no `docs/goals/` changes in the GoalBuddy commit; exactly this plan under `docs/plans/`; and unchanged cloud-env/environment-configuration evidence.

## Idempotence and Recovery

All focused and full test commands are read-only except for disposable temporary files managed by their test harnesses. Mirror synchronization and archive generation may be repeated until their outputs are byte-exact. If a test exposes a defect, edit only an allowed file and rerun the focused lane before the full literal gate. If any fix requires an unlisted path, a historical-board migration, product-policy authority, or mutation of cloud-env/environment-configuration, stop without improvising. Before either commit, verify the index contains only explicit T003 paths; after a failed commit command, inspect repository state rather than resetting or discarding user work.

## Artifacts and Notes

Initial preservation evidence:

    GoalBuddy HEAD: 34faed6b5f032b559e44e1dea718ca073fa47993
    GoalBuddy status/diff: b64aeaf7732bac90ac97b5a361db9a2b04838e343cc0ee5620ab4f51066cee8f / d745eb71a8cb98c1222461e78b2e7b2020a63810ad00a24fbc108aeb36f963e9
    Compiler HEAD: cad2db38968c0f552f89e697e4131fcc4a4207bc
    cloud-env HEAD/status/diff: 8fc9bc4919761b145e98b89316adf68e83b84b49 / 96410599c2962fd52b12c3901505ca1396449149de6aaa95fa9ff774e783ef07 / 11acf062116267e7cda59a002c98457b8ab163a10c133186f4d6e52ef3e5c205
    cloud board SHA-256: a38bbbff414d85169783a38f4a770b32108aa61c616b80238370647b38fef29c

Required pre-fix red evidence:

    $ node --test --test-name-pattern='apply-receipt preserves receipt task and board identity losslessly' internal/test/apply-receipt.test.mjs
    exit 1
    AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
    + actual - expected
    + undefined
    - 'T001'
    at internal/test/apply-receipt.test.mjs:200:12

Focused post-fix evidence:

    $ node --test internal/test/apply-receipt.test.mjs internal/test/check-goal-state.test.mjs
    tests 48; pass 48; fail 0
    $ python3 -m unittest test_goalbuddy_runtime.py test_goalbuddy_runtime_cli.py test_trigger_and_dependency_contract.py test_unified_contract.py
    Ran 26 tests; OK
    $ npm run sync:plugin
    Plugin skill tree matches goalbuddy/.

Literal verification evidence before the stop:

    ExecPlan headings: pass
    Receipt-capture absence and forbidden-language scan: pass
    Tracked mirror check: pass
    Combined Node regression gate, attempt 1: interrupted after the same SSE test stopped progressing
    Combined Node regression gate, attempt 2: fail/cancelled after 179474 ms; 123 pass, 0 assertion fail, 1 cancelled
    Terminal diagnostic: Promise resolution is still pending but the event loop has already resolved

T004 recovery and final evidence:

    Focused linked-child SSE replay: 1 pass, 0 fail
    Combined stabilization lane: 133 pass, 0 fail, 0 cancelled
    npm run check: 154 pass, 0 fail, 0 cancelled
    Compiler attempt 1: fail, archive contained directory entries
    Compiler attempt 2: 48 tests, OK
    Compiler commit: d5963b29add95101536cac6ac24c0cb3c3cfb85c

## Interfaces and Dependencies

No runtime dependency may be added. Receipt application and validation remain dependency-free Node.js modules. `apply-receipt.mjs` must accept the existing receipt envelope and persist the identity fields `task_id` and `board_path` unchanged in the selected task's `receipt`. The runtime capability query must return exactly the seven strings named above. The compiler checker remains Python standard-library code and must expose provenance fields that distinguish package version, resolved CLI path, source kind, Git HEAD, and dirty state. Canonical GoalBuddy skill files and tracked plugin mirrors must be byte-identical where `sync-skill-tree.mjs` defines a mirror relationship.

Revision note (2026-07-13 01:25Z): Recorded all T004 verification evidence, the deterministic archive repair, the exact compiler commit, and the completed outcome before the self-containing GoalBuddy commit.

Revision note (2026-07-13 02:05Z): Recorded T009 intake, exact clean bases, the preserved canary failure digest, and the approved atomic wait/reply architecture before behavioral edits.

Revision note (2026-07-13 02:45Z): Recorded T009 implementation, durable evidence decisions, full verification results, the rebuilt compiler archive, and scoped compiler commit before the self-containing GoalBuddy commit.

Revision note (2026-07-13 04:45Z): Recorded the normal Council concurrency finding, the serialized persistence-boundary correction, deterministic two-writer proof, and complete successor verification without reopening the closed board.

Revision note (2026-07-13 05:08Z): Recorded the exact cloud-board compatibility evidence, explicit immutable-history admission, typed runtime rebind, Keeper integration, legacy-dialect proof, and final full-suite results before the corrective commit.
