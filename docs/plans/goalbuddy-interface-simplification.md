# Make GoalBuddy quiet and exact at the execution boundary

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as implementation proceeds.

This plan follows `/Users/danielalnajjar/.agents/resources/plans.md`. It is intentionally separate from `docs/plans/goalbuddy-fable-efficiency-stabilization.md`. That earlier plan records the dispatcher, ignored-path, adaptive-brief, and exact Codex-session work already implemented. This plan begins from the resulting current runtime and addresses a different problem: Fable-facing instruction weight, receipt-contract drift, digest handoff friction, planning projection ergonomics, and truthful recovery output.

## Purpose / Big Picture

GoalBuddy should let a Claude/Fable lead spend its context and turns on decisions that improve the product: understanding the current slice, hardening a plan when needed, dispatching implementation, reviewing diffs, adjudicating independent review, and deciding what should happen next. GoalBuddy should perform board parsing, receipt validation, digest binding, scope comparison, and transition installation behind a small deterministic interface.

Today the safety architecture is valuable, but its interface still makes the lead perform avoidable control-plane work. A healthy prepared-board start loads an execution contract of roughly sixty kilobytes. Planning requires probing a nested projection and manually carrying digests. Worker prompts display `commands: []` even though durable completed Worker receipts require objects shaped as `{cmd, status}`. The external dispatcher accepts a merely receipt-shaped object, while the atomic receipt applier and board checker enforce stricter semantics later. When a failure occurs after a Codex session has been bound or product files have changed, a generic unchanged-state claim would be false. Child-board setup also requires an empty `notes/` directory that Git cannot preserve across checkouts.

After this work, a fresh prepared-board `/goal` run should read one compact normative kernel, the goal charter, and one compact projection. A single planning call should return the current state, ready and blocked candidates, the relevant blocker evidence, and commands carrying the correct state digest. A Worker should see an exact role-specific receipt example. The dispatcher and receipt applier should import one role/result-aware receipt validator and reject malformed proof without inventing meaning. When rejection occurs after a session binding or product write, the report should state exactly what changed, preserve the exact resumable Worker identity, and give one legal next action. Existing completed receipts and board files remain untouched.

This is an interface-deepening pass, not a new workflow system. It adds no daemon, watcher, lease, unbind transition, persistent runtime ledger, second board truth, compatibility shim, board migration, or broad schema redesign. It does not remove GoalBuddy's existing read-only Goal Ledger recovery audit. It does not weaken `stop_if`, allowed-file scope, exact verification, receipts, independent review, or final proof.

## Artifact Status

**Decision-complete and ready for isolated implementation. Activation is not authorized by this plan.** Implementation occurs only in `/Users/danielalnajjar/Code/.worktrees/goalbuddy-interface-simplification` on branch `codex/goalbuddy-interface-simplification`, based on local `main` commit `ab3724c940507836abc71a24f5436ca5dc6b5206`. Live Codex and Claude installations, active project boards, and project worktrees stay untouched until a separate activation decision after all acceptance gates pass and no GoalBuddy-dispatched Worker is live.

## Progress

- [x] (2026-07-17) Reconciled the Trading and Video Memories transcript findings with the live GoalBuddy runtime and Fable's field review.
- [x] (2026-07-17) Ran an unknowns pass and identified role/result receipt semantics, mutation-truth reporting, state-versus-tree digest handling, activation liveness, projection size, and empty-`notes/` behavior as the remaining high-impact uncertainties.
- [x] (2026-07-17) Confirmed that the earlier Fable-efficiency plan is an implementation/activation record and created a separate isolated worktree for this follow-on change.
- [x] (2026-07-17) Authored this self-contained ExecPlan against current local `main` without changing installed runtime or any board.
- [ ] Complete Milestone 1: executable prototypes for receipt validation, projection shape, mutation-truth reporting, and `notes/` behavior.
- [ ] Complete Milestone 2: one shared role/result-aware receipt contract at dispatch and apply boundaries.
- [ ] Complete Milestone 3: one-call planning and opaque digest relay through relevant command output.
- [ ] Complete Milestone 4: truthful, actionable public failure reports and exact-session receipt repair.
- [ ] Complete Milestone 5: compact execution kernel, exceptional recipe reference, and thin help surfaces.
- [ ] Complete Milestone 6: checker/scaffolder cleanup for an absent empty `notes/` directory.
- [ ] Complete Milestone 7: isolated automated verification and fresh Claude/Codex journey acceptance.
- [ ] Obtain separate explicit approval before activation; activation itself is not part of this implementation run.

## Surprises & Discoveries

- Observation: The current prepared-board execution contract is `59,786` UTF-8 bytes, while the Claude `/goal` command is `2,418` bytes. The contract is the dominant healthy-path instruction load.
  Evidence: `wc -c goalbuddy/references/goal-execution.md plugins/goalbuddy/commands/goal.md` on base commit `ab3724c`.

- Observation: The Worker receipt example already comes from code, but it renders `commands: []`. This is structurally valid JSON while omitting the required inner command shape that the board checker later demands.
  Evidence: `receiptSchema()` in `goalbuddy/scripts/render-task-prompt.mjs` and Worker receipt checks in `goalbuddy/scripts/check-goal-state.mjs`.

- Observation: `extractReceipt()` accepts an object when it has a string `result` and any one of several marker fields. It does not validate the admitted task role, closed result vocabulary, required fields, command-entry shape, or done-versus-blocked semantics before scope comparison.
  Evidence: `extractReceipt()` and `isReceiptShaped()` in `goalbuddy/scripts/dispatch-task.mjs`.

- Observation: The receipt applier validates exact identity and `done|blocked` before candidate construction, but relies on the later candidate checker for most role-specific proof semantics. This permits the external dispatch boundary and mutation boundary to disagree about whether a receipt is authoritative.
  Evidence: `applyReceiptUnderLock()` in `goalbuddy/scripts/apply-receipt.mjs` and the stored-receipt rules in `goalbuddy/scripts/check-goal-state.mjs`.

- Observation: The dispatcher currently mutates an extracted receipt by adding `harness` when the Worker omitted it. Harness provenance is already present in the dispatch report, so the receipt need not be rewritten.
  Evidence: `dispatchTask()` in `goalbuddy/scripts/dispatch-task.mjs` assigns `receipt.harness = to` after extraction.

- Observation: Resume output already distinguishes the exact root `state.yaml` digest from the composite board-tree digest. The friction comes from broad command output and manual relay, not from an absent digest primitive.
  Evidence: `createResumeProjection()` in `goalbuddy/scripts/resume-board.mjs` returns `board.state_digest` and `board.tree.digest`; per-lane prompt commands already carry `--expected-state-digest`.

- Observation: A fresh Codex Worker dispatch can bind its session into `state.yaml` before the Worker exits and before receipt validation. A later receipt or scope failure can therefore coexist with a changed board and product WIP. A universal `state_changed: false` error field would lie.
  Evidence: `dispatchTask()` calls `bindCodexWorkerSession()` from the `thread.started` callback before extracting and validating the final receipt.

- Observation: `goalbuddy init` creates `notes/`, and the checker rejects its absence, but Git cannot preserve an empty directory. The current search found no recovery operation that consumes an empty `notes/`; actual note paths matter only once referenced or written.
  Evidence: `initGoal()` in `internal/cli/goal-maker.mjs` and the unconditional root check in `goalbuddy/scripts/check-goal-state.mjs`.

- Observation: Goal Prep is marked `disable-model-invocation: true`, and the prepared Claude `/goal` command directly reads the execution reference. Fresh-harness acceptance must nevertheless prove that a prepared-board run does not load the full prep-mode `goalbuddy/SKILL.md`, because prior sessions have shown surprising skill-loading behavior.
  Evidence: the frontmatter in `goalbuddy/SKILL.md` and `plugins/goalbuddy/commands/goal.md`.

## Decision Log

- Decision: Create a new follow-on plan and leave `goalbuddy-fable-efficiency-stabilization.md` unchanged.
  Rationale: The older document records already-implemented routing, prompt-brief, dispatch-manifest, and exact-session work plus pending historical activation notes. Mixing a new receipt/kernel/projection pass into it would erase the boundary between proven work and new acceptance criteria.
  Date/Author: 2026-07-17 / Codex.

- Decision: Keep one pure receipt-contract module for board task roles `worker`, `judge`, `scout`, and `pm`, with result-specific examples and rules for `done` and `blocked`.
  Rationale: Those are the four task types accepted by the board checker. Goal Ledger and Board Keeper have separate recovery/control receipts and do not traverse the task dispatch/application boundary, so folding them into this module would create false coupling.
  Date/Author: 2026-07-17 / Codex.

- Decision: Import the same receipt validator at dispatch extraction and atomic receipt application. Do not silently normalize invalid command entries or infer a passing status from prose.
  Rationale: Extraction-time rejection keeps the exact Codex session recoverable, while mutation-time validation protects file-based and non-dispatch receipt inputs. One implementation at two boundaries prevents version skew and proof laundering.
  Date/Author: 2026-07-17 / Codex.

- Decision: Keep the checker as the durable serialized-board verifier and immutable-history compatibility boundary. Do not replace its tolerant historical parsing with the new strict live-receipt validator.
  Rationale: The checker must continue reading existing historical bytes, including explicitly supported immutable-history debt. New receipt parity is enforced by shared fixtures and public-boundary tests rather than by forcing legacy history through a new strict parser.
  Date/Author: 2026-07-17 / Codex.

- Decision: Preserve additive evidence fields as inert JSON-safe data, but reject reserved fields from the wrong role. Require exact common identity fields and role/result-required fields.
  Rationale: Existing receipts legitimately carry additions such as `harness` and product evidence, but a Worker must not smuggle Judge authority through `decision`, nor may a Judge claim Worker write proof through `changed_files` without being a Worker.
  Date/Author: 2026-07-17 / Codex.

- Decision: Preserve tolerant extraction of a fenced or bare JSON receipt object, but validate the extracted inner object exactly and never mutate it. Report runtime harness provenance outside the receipt.
  Rationale: Markdown fences and a bare versus wrapped JSON object do not change semantic meaning. Inventing command statuses or adding evidence inside the receipt does. The parser may be syntactically forgiving without being semantically permissive.
  Date/Author: 2026-07-17 / Codex.

- Decision: Do not perform a repository-wide digest-field rename. Continue treating transition `before_digest` and `after_digest` as state-file digests, explicitly label that kind in public reports, and keep the already-distinct `board.state_digest` and `board.tree.digest` projection fields.
  Rationale: The current primitives are correct. The observed failure was manual truncation and stale reuse, not a cryptographic or storage defect. Digest-bound generated commands and explicit `digest_kind` provide clarity without creating a gratuitous breaking migration.
  Date/Author: 2026-07-17 / Codex.

- Decision: Every successful mutation or dispatch report returns the immediately resulting state digest and only commands that are legal or useful from that result. Templates with unresolved artifact paths are labeled as templates.
  Rationale: The lead should relay an opaque digest supplied by GoalBuddy, never reconstruct, truncate, or select one. Returning every possible command would replace probing with output bloat, so the command set remains state-specific.
  Date/Author: 2026-07-17 / Codex.

- Decision: Public failures carry a typed mutation-truth object rather than one universal changed/unchanged boolean.
  Rationale: Prelaunch admission failure, post-binding receipt failure, scope violation with product WIP, and atomic candidate rejection have different truths. Unknown must remain representable when the runtime cannot prove absence.
  Date/Author: 2026-07-17 / Codex.

- Decision: `goalbuddy/references/goal-execution.md` remains the sole normative prepared-board kernel. Move exceptional mechanics into one non-normative `goalbuddy/references/goal-execution-reference.md`; do not copy normative rules between them.
  Rationale: One compact authority avoids drift and reduces Fable context. The reference may contain recipes, syntax, and examples while pointing back to named kernel invariants.
  Date/Author: 2026-07-17 / Codex.

- Decision: Treat `18,000` UTF-8 bytes as the initial kernel ceiling and validate behavior in a fresh Fable journey. Adjust the ceiling only through a recorded plan amendment backed by a concrete missing invariant or failed acceptance case.
  Rationale: The present contract is nearly sixty kilobytes. An explicit ceiling forces consolidation, but comprehension and safe behavior remain the real acceptance bar.
  Date/Author: 2026-07-17 / Codex.

- Decision: Make missing empty `notes/` valid when no `tasks[].receipt.note` scalar names a contained `notes/` path; require that exact file when the pointer is present. Do not add `.gitkeep` files merely to satisfy the checker or infer note paths from arbitrary strings.
  Rationale: An empty directory has no durable Git identity or proven recovery role. The meaningful invariant is that declared evidence resolves, not that an unused directory exists.
  Date/Author: 2026-07-17 / Codex.

- Decision: Preserve the existing read-only Goal Ledger audit at genuine recovery boundaries. The non-goal is a new persisted or runtime ledger, not removal of recovery reconciliation.
  Rationale: The Ledger prevented duplicate work in real runs and keeps complete board bytes out of the lead context. It is a recovery role, not a second source of truth.
  Date/Author: 2026-07-17 / Codex.

- Decision: Activate only after no GoalBuddy-dispatched Worker is live, both harnesses are quiescent, and fresh sessions can load the new contract. Existing boards are never migrated or rewritten for this release.
  Rationale: A Worker launched under the old receipt prompt may return an old-form receipt. Tightening validation underneath it would create an avoidable cutover failure even though the product work is sound.
  Date/Author: 2026-07-17 / Codex.

## Outcomes & Retrospective

No runtime behavior has changed yet. The planning outcome is a bounded seven-milestone implementation that deepens existing modules rather than adding orchestration machinery. Update this section after each milestone with what became observable, what was rejected, and whether the Fable-context and tool-call targets were actually met.

At final completion, summarize at minimum: contract bytes before and after; healthy-start and post-compaction lead-tool-call counts; malformed-receipt repair behavior; projection bytes for the representative board; focused and full test totals; disposable install hashes; fresh Claude and Codex journey outcomes; remaining limitations; and activation status.

## Context and Orientation

GoalBuddy is a private local package installed into Codex and Claude Code. The canonical execution skill lives under `goalbuddy/`; byte-exact plugin mirrors live under `plugins/goalbuddy/skills/goal-prep/`. Always edit the canonical tree, then run `npm run sync:plugin`. `internal/cli/goal-maker.mjs` is the public `goalbuddy` command. `goalbuddy/scripts/check-goal-state.mjs` validates durable `state.yaml` bytes. `goalbuddy/scripts/resume-board.mjs` creates the compact continuation and planning projection. `goalbuddy/scripts/render-task-prompt.mjs` admits the exact active task and renders a Worker, Judge, Scout, or PM prompt. `goalbuddy/scripts/dispatch-task.mjs` launches the external harness, binds Codex session identity, extracts a receipt, and compares observed writes. `goalbuddy/scripts/apply-receipt.mjs` owns locked atomic receipt/status/successor transitions.

A state digest is the SHA-256 of one exact `state.yaml`. It is the optimistic-concurrency token consumed by `--expected-state-digest`. A board-tree digest is the SHA-256 identity of a validated root board plus its depth-one child boards. It is used for recovery congruence and parallel-lane planning; it is not interchangeable with a state digest. Existing resume JSON already exposes them separately as `board.state_digest` and `board.tree.digest`.

A receipt is proof returned by the agent performing one board task. Common receipt identity consists of `result`, `task_id`, and `board_path`. Role fields differ. A completed Worker must name every changed file and every declared verification command with status `pass`. A blocked Worker preserves actual partial changes, attempted commands, failures, and remaining blockers. A Judge records a closed decision vocabulary and evidence. A Scout records facts, contradictions, and ambiguity. A PM task records orchestration or owner-level evidence without impersonating Worker or Judge authority.

Immutable historical receipts are already stored inside completed task blocks. This plan does not parse and rewrite them. The strict shared validator applies to newly extracted or newly submitted receipt objects. The candidate checker still validates the serialized candidate and retains its existing immutable-history compatibility path.

The current public-error module already supplies stable `error_code`, bounded `error`, and `next_action`. Extend it rather than inventing another envelope. The current transition reports already supply `before_digest`, `after_digest`, and in some cases `no_change`. Preserve those successful primitives and add explicit digest-kind and relevant command information.

The existing exact Codex-session binding remains authoritative on its task. A malformed receipt for an otherwise unchanged task is repaired by resuming that exact bound session and asking it to return a valid receipt. If the structured authority changes, the PM records a truthful blocked receipt and activates a new successor task. Do not add an unbind operation or repurpose the old task.

## User-Visible Behavior and Acceptance Criteria

A healthy prepared-board Claude session should begin with the compact execution kernel, charter, and one resume projection. It should not load the compiler, full Goal Prep authoring skill, exceptional execution reference, raw `state.yaml`, or complete historical receipt bodies unless an explicit trigger requires them.

When the PM asks for planning inventory, one JSON response should contain the active task, ready queued candidates, blocked candidates with bounded blocker/receipt context, the exact state digest, the composite tree digest, and the immediately relevant digest-bound command templates. The PM should not probe JSON keys, re-run `jq` to reconstruct a truncated hash, or perform a second board read merely to assemble the next command.

When a Worker returns `commands` as bare strings, dispatch should return `RECEIPT_SCHEMA_INVALID` before claiming success. It should identify the exact path such as `commands[0]`, show a bounded offending value, preserve the session binding and observed product-write truth, and provide the exact resume command for the same task/session when safe. The PM should not convert prose into `{cmd, status: "pass"}`.

When the same resumed Worker returns a valid receipt with `{cmd, status}`, dispatch should pass the shared validator and scope comparison. Applying that receipt should invoke the same validator again, install atomically, return the new state digest, and return only the relevant next commands. The stored receipt must equal the Worker's receipt object; GoalBuddy must not add `harness`, infer status, or otherwise rewrite it.

When a board has no notes, a fresh Git checkout should still pass the checker. When `tasks[].receipt.note` contains a valid relative `notes/` pointer, the checker should require that exact in-board path to exist and remain within the owning board's `notes/` directory. No other prose field becomes a note pointer by textual resemblance.

At a genuine recovery boundary, the existing Goal Ledger audit remains required. On a congruent healthy recovery, the lead should not read raw full-board bytes. On discrepancy or ambiguity, the exceptional reference and full-board review remain available.

## Plan of Work

### Milestone 1: Prove the interfaces before integration

Create focused executable prototypes in tests before changing public behavior. These prototypes are not parallel runtime paths and must not survive as alternate implementations.

First, add a provisional pure module at `goalbuddy/scripts/receipt-contract.mjs` and a focused `internal/test/receipt-contract.test.mjs`. Encode the currently supported task types and distinct `done` and `blocked` results. Build a matrix containing a separate exact example and valid/invalid cases for every Worker, Judge, Scout, and PM result shape. Include the real failure classes: bare-string Worker commands, inferred pass status, missing `task_id`, wrong `board_path`, invalid Judge decisions, wrong-role reserved fields, unknown additive evidence, blocked Worker failures, done Worker non-pass status, missing declared verify command, duplicate changed paths, and zero-change completed Worker. The module must return structured validation findings without mutating its input. A hybrid example that says `done | blocked` while omitting their different required fields does not pass this milestone.

Second, extend or construct a representative in-test board with one active task, several ready queued candidates, blocked candidates, one child board, bounded receipt summaries, and enough history to expose projection bloat. Prototype the new `planning_inventory` and relevant command object in `resume-board.mjs` behind test-local functions or a short-lived branch-local shape. Measure serialized bytes and confirm one call contains every fact needed to select and construct the next legal transition without raw-board reads.

Third, write a failure-truth matrix for dispatch and apply. Cover failure before launch, failure after Codex session binding but before product writes, malformed receipt after product writes, scope violation, harness failure, stale digest, and candidate-checker rejection. For every row specify the only truthful values for board state, product state, session binding, receipt application, before digest, and after digest. Use the matrix to define the public object rather than choosing fields opportunistically in each catch block.

Fourth, prove the `notes/` decision through a closed path contract. The current first-class long-note pointer is the scalar `tasks[].receipt.note`. It counts as a note reference only when its value is a relative forward-slash path rooted at `notes/`; it resolves relative to the owning root or child board and must remain inside that board's `notes/` tree. `note_needed` is a boolean, `commands[].note` is explanatory text, and strings in `inputs`, `evidence`, `summary`, `rationale`, or other arbitrary fields are not note pointers and must never be reclassified because they happen to contain `notes/`. If source inspection finds another existing field explicitly documented as a long-note path, enumerate it in this plan and tests before integration; do not scan arbitrary strings. Create a board without `notes/` and no first-class pointer, a board with a valid scalar receipt note, a board with a missing referenced note, a child board without notes, a board with a note path escaping the board, and an unrelated evidence string containing `notes/`. Confirm no runtime operation requires an empty directory. If contrary evidence appears, amend this plan before integration rather than adding a placeholder reflexively.

Milestone acceptance: the prototypes fail before integration for the known bad cases; the shared validator is pure; the representative projection supplies the complete planning decision in one response; the mutation-truth matrix has no `false` claim where state is unknown or changed; and the notes behavior is proven from public checker output.

### Milestone 2: Establish one live receipt contract

Promote `goalbuddy/scripts/receipt-contract.mjs` into the canonical live receipt grammar. Export a small interface:

    receiptExample({ role, result })
    validateTaskReceipt(receipt, { role, taskId, boardPath, verify, boundary })
    assertTaskReceipt(receipt, context)

`receiptExample()` returns one result-specific JSON-safe example used by prompt rendering and structural help. Prompt rendering may display the separate `done` and `blocked` examples together, but it must not collapse them into a hybrid shape. For a completed Worker, the example displays at least one passing command object with `cmd` and `status`; for a blocked Worker, it displays actual attempted status and blocker fields. Every role/result example includes `task_id` and `board_path`, which the current developer receipt spec declares mandatory but omits from role examples. Tests cover every role × result pair so result semantics cannot drift back into prose.

`validateTaskReceipt()` must be pure and return stable findings with a code, JSON path, bounded offending value, and message. It validates exact common identity, closed role/result vocabularies, required role fields, list/object types, command-entry shape, result-sensitive status semantics, declared verification coverage, and reserved wrong-role fields. It permits additional JSON-safe inert evidence fields. It must not normalize, infer, sort, deduplicate, append, or delete receipt fields.

`assertTaskReceipt()` converts findings into the existing public-error envelope with code `RECEIPT_SCHEMA_INVALID`. Dispatch calls it immediately after extraction and exact task identity resolution, before a receipt can be treated as authoritative. Apply calls it under the board lock after exact source-task admission and before constructing candidate bytes. Both boundaries import this same module.

Do not make `check-goal-state.mjs` run all historical receipts through this strict object validator. Instead, derive shared valid/invalid fixtures and prove three-way parity: a canonical new receipt is accepted by dispatch validation, apply validation, and the candidate checker; a malformed new receipt is rejected at both live boundaries; and existing immutable historical boards retain their exact compatibility result.

Stop mutating `receipt.harness` inside `dispatch-task.mjs`. Keep runtime harness provenance on the dispatch report. If a Worker includes an optional `harness`, preserve it losslessly and validate only that it is a nonempty string or an existing supported value when the boundary contract requires one.

Update `goalbuddy/scripts/render-task-prompt.mjs`, `docs/spec/receipt-v1.md`, the public CLI usage, and focused policy tests from the shared structural source. Help prose may explain flags and point to the normative kernel, but it must not independently restate role semantics. Do not build a documentation generator; export only small structural examples and pin all remaining prose against required field names in tests.

Milestone acceptance: the T105-style bare-string receipt fails at dispatch with `RECEIPT_SCHEMA_INVALID`; the same object fails identically at apply; no PM can turn prose into pass proof; valid `done` and `blocked` receipts for all four task roles survive unchanged; the candidate checker accepts every canonical fixture; historical receipt bytes and compatibility reports are unchanged.

### Milestone 3: Make planning one call and digests opaque

Deepen `createResumeProjection()` in `goalbuddy/scripts/resume-board.mjs` instead of adding another summary file or command. Keep `state.yaml` as the sole durable board truth.

The planning projection must include bounded objects for ready queued candidates and blocked candidates. A ready candidate includes task id, type, objective, dependency readiness, relevant gate state, and only the command or arguments needed to select it after the current receipt. A blocked candidate includes task id, bounded blocked reason, blocker ids, waiting-for-owner state, and a bounded recent receipt or note pointer when that evidence affects selection. Do not embed complete historical task bodies or full notes.

Preserve `board.state_digest` and `board.tree.digest`. Add explicit digest-kind labels anywhere a generic transition report could be misunderstood. Every generated state-mutating or task-prompt command must use the exact current state digest. Commands involving the board tree must identify the tree digest separately and never pass it as `--expected-state-digest`.

Return only immediately relevant commands. A healthy resume returns resume, current prompt, planning, and recovery commands. A dispatch success returns the bound session evidence, resulting state digest, exact resume command when applicable, and an apply-receipt command template clearly marking the unresolved receipt-file path. A receipt transition returns the resulting state digest, next active-task prompt command, and planning command if semantic selection is still required. A planning candidate may return a transition template for that candidate, but must not pretend that a missing receipt path or decision has already been supplied.

The PM contract must say: consume the exact returned digest and command; never truncate, retype, reconstruct, or reuse a pre-mutation digest. Tests must assert that every state mutation invalidates prior generated commands and that stale commands fail before mutation.

Measure the representative projection. It must eliminate the observed multi-call shape-probing sequence and remain materially smaller than the raw board. If per-candidate commands make output grow without reducing calls, replace them with one typed command-template object plus candidate ids; record the choice in the Decision Log.

Milestone acceptance: planning requires one command; no field named or documented as a state digest contains the tree digest; every mutation result supplies its resulting state digest; stale templates fail closed; a representative lead can choose a successor without reading raw `state.yaml`; and projection size is recorded before and after.

### Milestone 4: Report truthful failures and repair malformed receipts through the same session

Extend `goalbuddy/scripts/public-error.mjs` rather than adding a second error envelope. Add stable `RECEIPT_SCHEMA_INVALID` handling and let boundary code attach one `mutation` object:

    mutation: {
      board: "unchanged | changed | unknown",
      product: "none_observed | observed | unknown",
      receipt_applied: false,
      before_digest: "<state sha256 or null>",
      after_digest: "<state sha256 or null>",
      digest_kind: "state_yaml_sha256",
      session_binding_preserved: true | false | null
    }

Do not synthesize `unchanged` merely because an operation returned an error. The dispatch path knows when session binding succeeded, when the before/after manifest observed product changes, and when scope comparison is unavailable. The atomic applier knows whether candidate installation occurred. Use those facts. Unknown is correct when the runtime lacks proof.

Specific checker or validation details must outrank generic recovery guidance. Include a stable JSON path and bounded offending value for receipt failures. Reserve Ledger/full-board escalation for genuine board ambiguity, strict parse/checker failure, immutable-history mismatch, or recovery incongruence. A malformed new receipt is not a recovery audit.

When a malformed receipt belongs to a bound Codex Worker and the structured task, brief, execution profile, and dispatch contract remain unchanged, return the exact session id and a digest-bound exact resume command telling that Worker to restate a valid receipt. Do not launch automatically. If task authority changed, return the existing blocked-receipt-plus-successor recovery direction; never clear the binding or reuse the task under changed authority.

Milestone acceptance: prelaunch error reports unchanged board/no product observation; post-binding malformed receipt reports changed board, preserved binding, and observed or unknown product truth; candidate rejection reports no receipt application and unchanged board; the exact same Codex session can be resumed to correct only the receipt; and a changed contract cannot use that repair path.

### Milestone 5: Replace instruction volume with one kernel and one exceptional reference

Refactor `goalbuddy/references/goal-execution.md` into a compact normative kernel no larger than 18,000 UTF-8 bytes. Preserve all invariants needed on every healthy run: board truth and recovery identity, PM/Scout/Judge/Worker authority, one-active/child-board rule, allowed-file and `stop_if` behavior, adaptive planning/review strategy, exact receipt/proof rule, typed transitions, digest relay, exact-session continuation, quiet user-facing behavior, recovery triggers, and final completion proof.

Create `goalbuddy/references/goal-execution-reference.md` for exceptional syntax and recipes: child-board creation; worktree-lane board-home ownership; immutable-history recovery; exact-human wait/reply; role receipt examples sourced from the executable contract; amendment/hydration examples; Keeper request details; and failure-specific recovery. Each recipe names the kernel invariant it implements. It may not redefine authority or copy complete invariant paragraphs.

Update `plugins/goalbuddy/commands/goal.md` so a prepared board reads only the kernel, charter, and resume projection. It loads the exceptional reference only when the kernel names a specific trigger. Keep the fallback short and fail closed; do not duplicate the complete kernel. Preserve raw-intent routing to Goal Prep.

Audit `goalbuddy/SKILL.md` only for statements that would contradict the new kernel or cause prepared execution to load prep-mode prose. Do not perform a general rewrite of Goal Prep. Prepared `/goal` acceptance, not an aesthetic line-count target, decides whether further separation is required.

Add policy tests that enforce the kernel byte ceiling, required invariant headings, forbidden duplicated blocks, exact canonical/plugin mirrors, and the command's healthy-path read set. Help output must be pointer-thin or use shared receipt examples; it must not become a third normative contract.

Milestone acceptance: the kernel is at most 18,000 bytes; canonical and plugin copies are byte-exact; a fresh prepared-board Claude run does not load full Goal Prep or the exceptional reference on the healthy path; child-board/recovery tasks can find the exceptional recipe without source-diving; and no required invariant is lost in the fresh journey tests.

### Milestone 6: Remove the empty-directory trap

Change `goalbuddy/scripts/check-goal-state.mjs` so an absent `notes/` directory is valid when no `tasks[].receipt.note` scalar points into `notes/`. Treat that field as a note pointer only under the closed syntax established in Milestone 1: a relative forward-slash path beginning `notes/`, resolved inside the owning root or child board. Reject absolute paths, backslash aliases, empty terminal names, `.` or `..` traversal, and resolved escape. Require the referenced file to exist. Do not inspect `note_needed`, `commands[].note`, `inputs`, `evidence`, summaries, rationales, or arbitrary strings for path-like text. If Milestone 1 enumerates another pre-existing explicitly documented long-note pointer, add it here by name and test it; do not introduce a semantic string classifier. Apply the same rule to depth-one child boards.

Keep `goalbuddy init` free to create `notes/` locally for convenience, but do not add `.gitkeep` solely to satisfy validation. Update templates, local board tests, checker tests, and documentation to describe notes as created on first use rather than a durable empty-directory invariant.

Milestone acceptance: a newly committed board survives a second Git checkout without a placeholder; missing or escaping referenced notes still fail; existing boards with notes remain unchanged; no board schema version changes.

### Milestone 7: Verify in isolation and replay the real operator journeys

Synchronize plugin mirrors and run focused tests after each milestone. Then run the full package gate in the isolated worktree:

    npm run sync:plugin
    node --test internal/test/receipt-contract.test.mjs internal/test/dispatch-task.test.mjs internal/test/apply-receipt.test.mjs internal/test/check-goal-state.test.mjs internal/test/goal-maker-cli.test.mjs internal/test/goalbuddy-skill-policy.test.mjs internal/test/preactivation-lifecycle.test.mjs
    npm run check
    npm run pack:dry-run
    git diff --check

Install only into disposable Codex and Claude homes using the candidate checkout's public CLI. Run both doctors and contract projections. Never edit installed files by hand.

Replay a fresh Claude/Fable journey against a disposable representative board. Record actual files read, lead tool calls, tool output bytes, and decisions. Healthy cold start to first useful product action should require no more than six lead tool calls. Post-compaction congruent recovery should require no more than three. Planning inventory should require one. These are acceptance measurements, not runtime quotas; legitimate product investigation remains unrestricted.

The Claude journey must prove: no compiler or full prep bundle on prepared execution; no exceptional reference on the healthy path; one-call planning; exact digest relay; direct dispatch for a decision-complete Worker; a malformed command receipt rejected without PM meaning-injection; exact same-session receipt repair; scope and `stop_if` unchanged; Fable reviews the product diff and independent review rather than performing ledger mechanics.

Replay the same board shape in a fresh Codex session. Prove the same receipt, projection, digest, transition, and recovery interfaces work without Claude-specific names in board truth. Codex may use native GoalBuddy agents and Omega capabilities according to the existing harness contract.

Run a child-board journey from a clean second checkout. Prove the board checks without an empty `notes/`, the exceptional recipe is sufficient without source-reading, board-tree and state digests remain distinct, and recovery reconciles every active lane without duplicate launch.

Activation readiness requires all automated gates, both fresh harness journeys, the child-board journey, byte-exact mirrors, disposable doctors, and the bounded manual quiescence audit below. A passing test suite alone is insufficient.

The quiescence audit is an operator gate, not a new runtime registry. At the moment activation is requested, enumerate the exact active GoalBuddy boards the owner identifies plus every board returned by the installed runtime's board discovery under the repositories involved in current work. For each board, record the compact resume projection, active root/child lanes, bound Codex session ids, owning repository/worktree, and latest receipt or verification pointer. Ask each owning PM session to pause dispatch and report whether a local, remote, WSL, or cloud Worker command remains in flight. Independently inspect local processes with a read-only command such as:

    ps -axo pid,ppid,lstart,command | rg 'goalbuddy.*dispatch|codex exec|claude -p'

For a local Worker, terminal status requires process exit plus congruent repository/worktree evidence. For a remote, WSL, cloud, or monitor-owned Worker, require the owning harness's terminal event or explicit unavailable/lost adjudication and preserve any resumable session identity. A saved board binding alone proves identity, not liveness; absence from local `ps` does not prove a remote Worker is terminal. The root PM adjudicates the combined evidence. Any disagreement, unreachable owning session, ambiguous process, uncertain remote state, or board/repository mismatch blocks activation. Record the exact evidence and final `quiescent | not_quiescent | uncertain` result, and require a separate explicit owner instruction before installing live.

## Concrete Steps

Work only in:

    cd /Users/danielalnajjar/Code/.worktrees/goalbuddy-interface-simplification

Confirm isolation and base:

    git status --short --branch
    git rev-parse HEAD
    git merge-base --is-ancestor ab3724c940507836abc71a24f5436ca5dc6b5206 HEAD

Expected initial result: branch `codex/goalbuddy-interface-simplification`, base ancestry succeeds, and only this plan is modified before implementation begins.

Implement Milestone 1 first. Run focused prototypes without synchronizing installed surfaces:

    node --test internal/test/receipt-contract.test.mjs internal/test/check-goal-state.test.mjs internal/test/goal-maker-cli.test.mjs

After Milestone 2:

    node --test internal/test/receipt-contract.test.mjs internal/test/render-task-prompt.test.mjs internal/test/dispatch-task.test.mjs internal/test/apply-receipt.test.mjs internal/test/check-goal-state.test.mjs

If `internal/test/render-task-prompt.test.mjs` does not exist at implementation time, place prompt-rendering public behavior in the existing `goal-maker-cli.test.mjs` and record that choice; do not create a file merely to satisfy this plan's example command.

After Milestones 3 and 4:

    node --test internal/test/resume-board.test.mjs internal/test/dispatch-task.test.mjs internal/test/apply-receipt.test.mjs internal/test/goal-maker-cli.test.mjs internal/test/preactivation-lifecycle.test.mjs

If resume behavior remains covered through `goal-maker-cli.test.mjs`, use that public-surface test instead of inventing a duplicate test layer.

After Milestones 5 and 6:

    npm run sync:plugin
    node --test internal/test/goalbuddy-skill-policy.test.mjs internal/test/check-goal-state.test.mjs internal/test/goal-maker-cli.test.mjs

Run the full isolated gate exactly as listed in Milestone 7. Store compact journey receipts under a branch-local ignored review directory or in this plan's `Artifacts and Notes`; do not commit raw session transcripts or copied real boards.

Before any future activation, rebase or merge the candidate onto then-current canonical local `main`, rerun the complete matrix, execute the bounded quiescence audit from Milestone 7, and require its result to be `quiescent`. Activation requires a new explicit owner instruction. `not_quiescent` or `uncertain` stops without installing.

## Validation and Acceptance

Automated validation must cover observable public behavior rather than internal call counts. Required cases include:

- every valid role/result receipt and every known malformed shape;
- identical receipt rejection at dispatch and apply boundaries;
- no input-object mutation by the validator or dispatcher;
- valid canonical receipts accepted by the serialized candidate checker;
- immutable historical receipt bytes unchanged;
- exact state-versus-tree digest placement;
- stale command no mutation;
- planning inventory complete in one response;
- prelaunch, post-binding, post-write, scope, harness, and candidate-rejection mutation truth;
- exact-session malformed-receipt correction and changed-contract rejection;
- kernel byte ceiling and canonical/plugin equality;
- healthy prepared `/goal` read set;
- absent unused `notes/` accepted and missing referenced note rejected;
- full package, packaging, doctor, and contract gates in disposable homes.

Behavioral acceptance is the fresh-harness journey, not merely prose inspection. Capture enough evidence to answer four questions directly:

1. Did Fable avoid reading large control documents and raw board history on the healthy path?
2. Did GoalBuddy prevent the PM from inventing proof when a Worker returned an invalid receipt?
3. Could the PM continue and plan through returned opaque digests without probing or reconstruction?
4. Did all safety properties that paid for themselves remain active: Ledger recovery, `stop_if`, scope manifests, exact verification, receipts, independent review, and exact-session continuation?

The candidate is a no-go if any answer is no, if the projection hides blocker evidence needed for a correct decision, if an invalid receipt can reach durable board state, if an error lies about board/product mutation, if a healthy run loads the exceptional reference by default, or if activation requires modifying existing board history.

## Idempotence and Recovery

All source work occurs on an isolated branch and worktree. Prototypes and tests may be rerun. `npm run sync:plugin` writes only repo-local mirrors and is safe to repeat. Disposable installs use dedicated homes and may be deleted after receipts are captured.

Receipt validation failure does not auto-clean product work or clear a session binding. The PM inspects observed changes and resumes the exact bound session when the task contract is unchanged. If product authority changes, use the existing truthful blocked-receipt and successor transition. Never fabricate a corrected receipt, infer a command result, or silently redispatch a fresh Worker.

If a milestone reveals that the shared validator cannot represent an existing legitimate receipt without historical rewriting, stop integration, record the fixture and reason in `Surprises & Discoveries`, and amend the live-boundary policy. Do not add a compatibility parser without explicit review.

If the compact kernel causes a fresh journey to miss a required healthy-path invariant, move the smallest necessary rule back into the kernel and record the byte impact. Do not respond by loading the entire exceptional reference.

If a disposable install or journey fails, delete only that disposable home, repair the canonical source, resynchronize mirrors, and retry. Never use a live active board as the first reproduction.

Rollback after a later activation means reinstalling the previously recorded canonical commit through the transactional installer and rerunning both doctors. It does not rewrite boards. Because this plan makes no board-schema migration, existing version-2 boards remain ordinary files under either runtime; only fresh sessions should continue after the runtime switch so cached old instructions do not conflict.

## Artifacts and Notes

Maintain compact evidence here or in a branch-local ignored review directory:

- base, candidate, and final commit ids;
- contract bytes before and after;
- receipt role/result fixture matrix and parity results;
- representative planning projection bytes and lead-call comparison;
- mutation-truth matrix and public failure examples;
- `notes/` checker proof;
- focused and full test totals;
- canonical/plugin/package/disposable-install hashes;
- disposable Codex and Claude doctor/contract outputs;
- fresh Claude, Codex, and child-board journey receipts;
- activation-readiness result and explicit activation status.

Do not store complete transcripts, real board copies, full historical receipts, or repetitive tool output in this plan.

## Interfaces and Dependencies

The final implementation should expose only these narrow interfaces:

- `goalbuddy/scripts/receipt-contract.mjs` owns examples and pure validation for new task receipts.
- `render-task-prompt.mjs` consumes the shared example; it does not maintain a second schema.
- `dispatch-task.mjs` performs tolerant JSON extraction, exact shared validation, identity/scope comparison, and truthful dispatch reporting without mutating the receipt.
- `apply-receipt.mjs` performs the same shared validation under the existing lock before candidate construction, then uses the existing checker and atomic installer.
- `check-goal-state.mjs` remains durable board and immutable-history authority; shared parity fixtures prevent drift for newly accepted receipts.
- `resume-board.mjs` remains the sole compact continuation/planning projection and command source.
- `public-error.mjs` remains the sole public failure envelope and receives additive stable error/mutation details.
- `goal-execution.md` remains the sole normative prepared-board contract.
- `goal-execution-reference.md` is non-normative exceptional syntax and recipes.
- `internal/cli/goal-maker.mjs` remains the public wrapper and transactional installer.

Use only Node built-ins and existing GoalBuddy modules. Do not add a runtime dependency, background process, database, cache, generated state file, or new install channel. Codex Goal Compiler should change only if a current integration test or versioned capability contract must acknowledge the runtime behavior; it must not absorb execution, receipt, or recovery mechanics.

## Explicitly Out of Scope

- Removing the existing Goal Ledger recovery audit.
- A new persisted ledger, process registry, liveness database, daemon, watcher, lease, or heartbeat service.
- An unbind operation or reuse of a task under changed authority.
- A board-schema version bump, historical receipt rewrite, active-board migration, or compatibility shim.
- Weakening allowed-file scope, `stop_if`, verification, receipt identity, independent review, or final proof.
- Automatic product-file rollback after a failed dispatch.
- Hard global tool-call quotas or restrictions on legitimate product investigation.
- Rewriting Codex Goal Compiler into a runtime orchestrator.
- A broad aesthetic rewrite of Goal Prep.
- A documentation-generation framework.
- Activating the candidate, editing installed Claude/Codex copies, or mutating live project boards during implementation.

## Revision Note

2026-07-17: Initial plan created after transcript/tool-call analysis, two rounds of Fable field adjudication, a blind-spot pass, and live source inspection. It incorporates the final corrections: one shared role/result-aware receipt validator used twice; separate exact examples for each role/result shape; no proof normalization; explicit state-versus-tree digest handling without a gratuitous rename; truthful mutation reporting rather than universal unchanged claims; compact relevant command output; one normative kernel plus one exceptional reference; a closed `tasks[].receipt.note` path rule with optional empty `notes/`; historical receipts preserved; and a manual fail-closed quiescence audit before any activation.
