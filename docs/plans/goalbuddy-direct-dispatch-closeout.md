# Remove Fable's dispatch-report materialization step

Status: **Closed historical record (2026-07-30).** Implemented, verified, and activated; retained as the delivery record for Git-local dispatch-report transport and closeout.

This ExecPlan is a living document and follows `/Users/danielalnajjar/.agents/resources/plans.md`. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must remain current while implementation proceeds.

## Purpose / Big Picture

After a successful GoalBuddy Worker dispatch, the lead model should review the product result and choose the next queued task. It should not also have to copy the dispatch JSON into a new file merely so the receipt transition can read it. The public dispatcher will therefore preserve its own successful authoritative report as a short-lived Git-local transport artifact and return its exact path in the existing `commands.apply_receipt` operation. The lead supplies only the semantic successor choice. The atomic receipt transition consumes the report, embeds the validated receipt in `state.yaml`, and removes the transport artifact after successful installation.

This is a transport simplification only. It does not change board schema, receipt grammar, task authority, dispatch scope, successor legality, recovery, Ledger, Keeper, planning policy, or installed runtime until all tests and doctors pass.

## Progress

- [x] (2026-07-19T02:02:00Z) Confirmed the live 0.5 source and installed plugin are clean, byte-exact, and doctor-green at commit `368cdf655406269bb45aca45d47988ce2d83d2bd`.
- [x] (2026-07-19T02:02:00Z) Verified that `apply-receipt.mjs` already accepts an authoritative dispatch-report file and that the remaining Fable-facing gap is report materialization.
- [x] (2026-07-19T02:12:00Z) Implemented Git-local successful-report transport, a compact public outcome, and a populated apply-receipt operation.
- [x] (2026-07-19T02:12:00Z) Implemented safe cleanup of only GoalBuddy-owned transport artifacts after successful receipt application.
- [x] (2026-07-19T02:12:00Z) Added public-surface success, retry, cleanup, failure, and deletion-safety tests; focused suite passes 64/64.
- [x] (2026-07-19T02:25:00Z) Updated the compact runtime contract, exceptional reference, receipt specification, 0.5 release notes/changelog, and byte-exact plugin mirror.
- [x] (2026-07-19T02:25:00Z) Ran focused and full public-surface verification: 248 Node tests and 49 Python compiler tests pass, including normal and linked-worktree dispatch-to-closeout lifecycles.
- [x] (2026-07-19T02:31:00Z) Prepared the isolated source checkpoint with this plan.
- [x] (2026-07-19T02:36:00Z) Verified no local GoalBuddy dispatcher or Codex Exec Worker was live, transactionally refreshed Codex and Claude, and passed both installed-surface doctors with byte-exact runtime scripts.

## Surprises & Discoveries

- Observation: The receipt applier already treats `{ok:true, scope_check:{status:"clean"}, receipt:{...}}` as an authoritative input envelope.
  Evidence: `goalbuddy/scripts/apply-receipt.mjs` function `loadReceipt` unwraps a clean dispatch report and rejects unsuccessful or non-clean reports.

- Observation: The previous interface plan intentionally left `receipt_path` unresolved because dispatch did not own an output artifact.
  Evidence: `docs/plans/goalbuddy-interface-simplification.md` and `dispatch-task.mjs` both describe an unresolved receipt-file path. This plan narrows that earlier decision without reopening the surrounding architecture.

- Observation: Once the full report has a durable local handoff path, returning its recovery-only fields in the successful stdout object is unnecessary Fable context.
  Evidence: Public dispatch success now projects the exact receipt, scope summary, session/brief identity, mutation truth, report path, and one apply operation. The complete scope and repair evidence remains in the report file.

## Decision Log

- Decision: Preserve successful dispatch reports beneath the current worktree's actual Git directory, not in the product worktree or board notes.
  Rationale: The report becomes available across lead turns and compaction without creating Git-visible product changes, board clutter, or a second semantic ledger. Git-local storage follows the worktree recovery identity and remains subordinate to `state.yaml`.
  Date/Author: 2026-07-19 / Codex

- Decision: Persist only an authoritative successful report, and retain the existing inline report as the source of truth if local transport creation fails.
  Rationale: A transport failure must not reinterpret clean Worker output as a product or scope failure. The old manual path remains a fail-safe, not a compatibility implementation.
  Date/Author: 2026-07-19 / Codex

- Decision: Delete only a positively identified GoalBuddy-owned transport directory after the corresponding receipt transition installs successfully.
  Rationale: This prevents accumulation while ensuring stale/checker-rejected transitions retain their exact report for retry. User-authored receipt files must never be deleted.
  Date/Author: 2026-07-19 / Codex

- Decision: Do not combine dispatch, semantic review, and receipt application.
  Rationale: Fable must still inspect the diff and choose the successor. Automatic closeout would erase the model-owned judgment boundary the architecture is designed to preserve.
  Date/Author: 2026-07-19 / Codex

- Decision: Return a compact successful outcome while retaining the complete authoritative report in Git-local transport.
  Rationale: Fable needs the Worker result, observed changed paths, consequential repair status, and one semantic next action. It does not need duplicate scope arrays, dispatch-contract hashes, or recovery commands on the ordinary clean closeout path; those remain available by exact report path.
  Date/Author: 2026-07-19 / Codex

## Outcomes & Retrospective

The implementation and activation are complete. A public `goalbuddy dispatch --json` result now returns a smaller outcome, a usable report path, and one command template with only `<T###>` unresolved. `goalbuddy receipt` consumes that report directly, successful application removes the Git-local transport, and rejected application leaves it intact. The full repository gate passes 248 Node tests and 49 Python tests. After a local liveness check found no GoalBuddy dispatcher or Codex Exec Worker in flight, the transactional two-harness update committed successfully. Both doctors are clean and canonical, Codex, and Claude runtime script hashes are byte-exact. No active board or product repository was changed.

## Context and Orientation

`goalbuddy/scripts/dispatch-task.mjs` admits the exact active task, launches the selected harness, binds a Codex session when applicable, validates the receipt, and reconciles observed writes. Its successful report currently contains the receipt and an `apply_receipt` operation whose `receipt_path` and `activate_task_id` are both unresolved.

`goalbuddy/scripts/apply-receipt.mjs` owns the locked atomic receipt/status/successor transition. Its `loadReceipt` function already accepts either a bare receipt or a clean successful dispatch report stored in a file. This plan uses that existing boundary rather than adding another receipt schema or transition.

`internal/cli/goal-maker.mjs` exposes those scripts as `goalbuddy dispatch` and `goalbuddy receipt`. `internal/test/dispatch-task.test.mjs` and `internal/test/apply-receipt.test.mjs` test the public script surfaces. `plugins/goalbuddy/skills/goal-prep/` is a byte-exact generated mirror of the canonical `goalbuddy/` tree.

A Git-local transport artifact is an implementation detail stored beneath the worktree's real Git directory. It is not board truth, evidence authority, or a recovery ledger. The dispatch report remains authoritative only because receipt application rechecks its `ok`, clean scope, exact receipt identity, current task, expected digest, receipt grammar, successor legality, and final board candidate.

## Plan of Work

In `goalbuddy/scripts/dispatch-task.mjs`, add a small helper that resolves the current repository's real Git directory, creates a private random subdirectory below `goalbuddy/dispatch-reports`, writes the complete successful JSON report atomically with owner-only permissions, and returns a compact public outcome. The compact outcome has a top-level `report_path`, a narrow `report_transport` description, the exact receipt and observed-change summary, and one `commands.apply_receipt` operation whose `receipt_path` is set to that same absolute path. Its unresolved list contains only `activate_task_id`. If report persistence fails, keep the dispatch successful but return the existing full inline result with an unresolved receipt path plus a bounded transport warning.

In `goalbuddy/scripts/apply-receipt.mjs`, add best-effort post-install cleanup. Cleanup must parse the consumed dispatch report, require the exact GoalBuddy transport marker and self-path, resolve the repository's real Git directory, prove containment below `goalbuddy/dispatch-reports`, and remove only that one random transport directory. Run cleanup only after `installValidatedCandidate` returns `ok:true`. A stale digest, illegal successor, receipt failure, or checker failure must leave the report intact. Cleanup failure after a successful board mutation must be reported as non-authoritative housekeeping evidence and must not falsely claim that the board transition failed.

Update the execution kernel and receipt documentation to say that public dispatch returns a ready receipt source and the PM supplies the successor. Keep the semantic review boundary explicit. Update the 0.5 changelog/release notes because this is current-release behavior, then regenerate the plugin mirror.

## Concrete Steps

Work from `/Users/danielalnajjar/Code/goalbuddy`.

First, edit the canonical dispatcher and applier with the behavior above. Add flat public-surface tests covering successful transport creation, identical stdout/file content, owner-only file mode, direct application, cleanup after success, retention after rejected application, absence of transport on failed dispatch, and refusal to delete a user-authored file that imitates transport metadata.

Run focused tests:

    node --test internal/test/dispatch-task.test.mjs internal/test/apply-receipt.test.mjs

Update documentation and synchronize the generated mirror:

    pnpm run sync:plugin

Run the full repository gate:

    pnpm run check

After the isolated source checkpoint is green and no local GoalBuddy/Codex Worker is in flight, transactionally refresh both harnesses and run their doctors:

    goalbuddy update --json
    goalbuddy doctor --target codex --json
    goalbuddy doctor --target claude --json

The update must report `transaction.status: committed`, both targets verified, and no rollback. Both doctors must report no errors, no stale skill, and exact installed/source fingerprints.

## Validation and Acceptance

A disposable Git repository with one active Worker and one queued successor must support this observable lifecycle:

1. `goalbuddy dispatch ... --json` succeeds and returns a compact outcome, `report_path`, and an `apply_receipt` operation whose only unresolved field is `activate_task_id`.
2. The full report file exists outside the worktree beneath the real Git directory, has owner-only permissions, and contains the exact receipt plus detailed evidence omitted from the compact stdout projection.
3. The lead reviews the diff and invokes `goalbuddy receipt ... --receipt <returned-report-path> --activate T002 ...` without creating another file.
4. `state.yaml` contains the original receipt losslessly, T002 becomes active, and the transport directory is gone.
5. If the receipt transition is stale or names an illegal successor, board bytes remain unchanged and the transport report remains available for a corrected attempt.
6. A failed or scope-violating dispatch does not create an authoritative transport report.

The existing full suite and plugin-mirror tests must remain green. Activation changes only GoalBuddy-owned installed files after the local liveness gate; no active board, product repository, credential, service, provider, or external system changes.

## Idempotence and Recovery

Source edits and tests are repeatable. Transport directories use random names, so concurrent successful dispatches cannot overwrite one another. Only successful application of the exact report attempts cleanup. If cleanup fails, the board transition remains valid and the leftover private file may be removed later; it must never trigger a duplicate transition or semantic retry. If implementation fails, preserve the clean active installation and revert only changes introduced in this branch without touching unrelated work.

## Artifacts and Notes

Focused verification passed 82/82 across dispatch, receipt, and policy tests. The complete gate passed 248/248 Node tests plus 49/49 Python tests. The linked-worktree test proves the report follows the worktree-specific Git recovery identity and is removed after closeout. Do not store real Worker transcripts or real-board copies.

## Interfaces and Dependencies

Use only Node built-ins and the existing Git dependency. Add no package. Keep `dispatchTask(options)` usable as the existing internal function; transport materialization belongs to the public direct-run boundary because it solves CLI turn-to-turn handoff. Keep `applyTransition(options)` and receipt grammar unchanged. The new helpers should remain narrow and private unless direct behavioral testing requires an exported pure containment predicate.

Revision note 2026-07-19: Initial plan created after live source inspection showed that receipt application already consumes dispatch-report files and only automatic report transport remained missing.

Revision note 2026-07-19: Updated after implementation to record compact successful stdout, Git-local full-report transport, command-template generation, cleanup safety, linked-worktree coverage, and full-suite results.

Revision note 2026-07-19: Updated after the quiescent transactional activation to record the committed two-harness refresh, clean doctors, and byte-exact canonical/Codex/Claude runtime hashes.

Revision note 2026-07-30: Archived as a completed implementation and activation record. The current runtime owns this behavior; this plan has no open execution tranche.
