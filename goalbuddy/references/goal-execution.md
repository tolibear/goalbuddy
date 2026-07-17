# GoalBuddy Execution Kernel

This file is the normative contract for prepared `/goal` runs. Read it with the goal charter. Trust the installed kernel bytes; installation and doctor own source/mirror provenance, so never search for or compare alternate copies during execution. Do not load Goal Prep, Codex Goal Compiler, raw `state.yaml`, or `goal-execution-reference.md` on a healthy start.

## Start and board truth

`state.yaml` is durable board truth and the board is the recovery identity for its one write frontier. The PM owns semantic decisions; tools validate and install them. Treat state and board-tree digests as opaque, distinct tokens:

- `state_digest` / `state_yaml_sha256` binds one `state.yaml`.
- `board.tree.digest` / `board_tree_sha256` binds the checked root plus child-board set.

For a prepared board, begin with the compact projection, not a direct board read:

```bash
node <skill-path>/scripts/resume-board.mjs docs/goals/<slug> --json
```

Use the projection's returned digest-bound commands verbatim. `resume --planning` is the ordinary one-call planning inventory. Use `parallel-plan` only when creating or recovering concurrent product-writing lanes. Read raw board bytes only after a failed, uncertain, or discrepant recovery audit, or when the projection points to specific evidence requiring review.

## Authority roles

- **PM:** selects work, decides planning/review depth, applies canonical transitions, reviews product evidence, and decides escalation or completion.
- **Scout:** read-only evidence mapping. It does not mutate board or product state.
- **Judge:** read-only independent decision at material seams, ambiguity, or final audit. Independent review is not automatically a Judge task.
- **Worker:** one bounded implementation slice. It writes only within structured `allowed_files`, runs the declared `verify`, obeys `stop_if`, and returns one exact receipt.
- **Ledger:** recovery-only, read-only reconciliation of projection, board, repository, receipts, verification, gates, and possible in-flight work.
- **Keeper:** exceptional board inspection or mutation when no canonical typed transition represents the complete known decision.

The task card is the order. A role may not expand its own authority. Prose, plans, notes, or receipts never widen `allowed_files`, `verify`, `stop_if`, approval, or task status.

## One write frontier and child boards

Each board has at most one active task and one write-capable Worker. A blocked task is not a hidden writer. Never mark a card blocked while its Worker continues writing.

Each additional concurrent product-writing lane requires its own depth-one child board and recovery identity. Before launch, `parallel-plan` must validate the same checked root/child snapshots used by resume, pairwise-disjoint structured write scopes, board-home ownership, and the board-tree digest. Separate branches or worktrees isolate bytes but do not prove semantic independence. The PM remains responsible for integration coupling and merge order.

Read-only reviews may fan out without child boards when they cannot write product or control files. Do not run multiple product-writing Workers under one task.

Load `goal-execution-reference.md` only for the kernel trigger **child-board recipe** or **worktree board-home recipe**.

## Worker authority and stop conditions

Worker scope is decided or hydrated just in time from current repository truth. A future placeholder card is not dispatchable until its objective, inputs, `allowed_files`, `verify`, and `stop_if` are decision-complete.

`allowed_files` may use bounded file, directory, or analyzable glob scope. It is a fail-closed authority boundary, not a prediction contest. If legitimate implementation discovers a required path outside scope, the Worker stops. Do not widen an already-active task after writes exist. Record a truthful blocked receipt, then use a structured amendment or successor card with the new authority.

`stop_if` is mandatory behavior. Stop for ambiguity that changes the design, missing authority, out-of-scope needs, unsafe external effects, invalid assumptions, or the card's explicit conditions. Preserve useful partial work and proof in the receipt; do not improvise through the boundary.

## Adaptive execution strategy

The board owns long-horizon trajectory; current plans and briefs own short-horizon implementation memory. Decide the next quality ladder from current evidence rather than pre-scheduling ceremony.

At each seam, assess primarily:

1. **Decision risk:** unclear contracts, auth, money, privacy, data-model or public-surface choices, irreversible decisions, or cross-component integration.
2. **Execution risk:** blast radius, difficult rollback, scale, migration, operational coupling, or long autonomous duration.

If unsure whether a seam is material, treat it as material. The charter may add goal-specific materiality rules but may not narrow this floor.

For a material or insufficiently decision-complete slice, harden a current ExecPlan or compact just-in-time delta brief before implementation. Use the harness's planning capability, then dispatch the bounded Worker, review the product diff, run independent review, repair findings, simplify when it improves maintainability, and verify exact current bytes. For a small mechanical card whose implementation is already decision-complete, dispatch it directly with an outcome-oriented operator prompt; do not spend the orchestrator restating the card.

Claude resolves semantic capabilities to its native workflow planning, review, simplify, browser-QA, and Codex Exec routes. Codex resolves them to its native Omega planning/review, browser-QA, and Worker routes. Board truth names capabilities and proof, not vendor skill names.

Important claims require independent verification. A completion claim alone is not proof. Bind reviews to the artifact/diff, workflow version, base/current commit or content-addressed snapshot, and completeness status. If the reviewed input changes, the old review is stale. Decisive verification gates rerun against exact current bytes; in dirty or shared worktrees, bypass stale caches when the gate supports it.

Downward deviations from the charter's material-slice ladder are PM-owned evidence. Record the reason in the next phase-gate or final-audit receipt's existing `deviations` field. Do not create diary cards or Worker-owned skip notes.

## Dispatch and exact-session continuation

Render and dispatch only the checker-admitted current active task using the exact state digest returned by resume:

```bash
node <skill-path>/scripts/render-task-prompt.mjs docs/goals/<slug> --expected-state-digest <sha256> --json
node <skill-path>/scripts/dispatch-task.mjs docs/goals/<slug> --to codex --expected-state-digest <sha256> --json
```

The dispatcher validates authority before launch, observes the before/after write frontier including declared ignored paths, requires receipt `changed_files` to match observed product changes exactly, rejects GoalBuddy control writes, and reports truthful mutation state. It never normalizes receipt meaning.

For Codex, bind the exact JSONL session id to the active task. Never use `codex exec resume --last`. Resume only the task-bound session id, only after confirming the old process is not live, and only while workspace, task, execution profile, plan/brief, and dispatch-contract hashes still match. A polling timeout while liveness remains `running` is only a polling interval; do not interrupt, replace, or redispatch solely because a poll expired. A configured runtime deadline or explicit stop condition may terminate the Worker.

If a terminal Worker returns a schema-invalid receipt after clean authorized writes, the same dispatcher may perform exactly one receipt-only repair through that exact bound Codex session. Scope/control validation happens first, so a violation never buys a retry. The repair turn may write no repository byte, must preserve the original malformed receipt as inert report evidence, and cannot change the task or proof. A second invalid receipt, changed contract, unsupported harness, repair-turn write, lost dispatcher, or unavailable exact session fails closed. Never fabricate pass status or create a durable repair registry.

Load `goal-execution-reference.md` only for the kernel trigger **dispatch failure recovery**.

## Exact receipts and proof

Every terminal task returns exactly one `goalbuddy_receipt_v1` object matching the result-specific shape printed in its rendered prompt. Identity fields `task_id` and `board_path` are required; optional self-authored `harness` provenance is preserved unchanged.

A completed Worker receipt lists every actually changed path, reports each declared verification as `{cmd, status: "pass"}`, and contains only passing command results. A blocked Worker receipt preserves changed paths, attempted commands with truthful statuses, `blocked_reason`, and remaining blockers. Judge, Scout, and PM receipts use their role-specific shapes. Long evidence may use an explicit `notes/...` pointer; no empty `notes/` directory is required before first use.

The dispatcher and receipt applier import the same role/result-aware validator. They do not infer results, add fields, normalize commands, or rewrite historical receipts. `result` is the sole terminal-status source. Apply only a validated receipt for the exact current active receipt-free task, under the board lock and expected digest, then activate one legal queued successor. A candidate that fails the checker is not installed.

Use the returned `after_digest` and immediately relevant command templates directly. Do not reconstruct or manually retype a digest. Historical receipts remain immutable.

Load `goal-execution-reference.md` only for **role receipt examples**, **amendment/hydration**, or **immutable-history recovery**.

## Typed transitions and exceptional Keeper work

Complete canonical decisions use the deterministic digest-bound CLI directly: receipt closeout plus successor activation, amendment, hydration, exact-human wait/reply, and final completion. These transitions validate under lock, install atomically, and return the new opaque digest plus the next relevant commands.

Use Keeper only when the PM must inspect raw board content, repair checker-red control state, rebind runtime identity, resolve ambiguity, or perform a noncanonical mutation. Keeper receives one digest-bound request with exact authorized control files and expected before/after facts. It makes no semantic decision and never edits product files. A known one-location scalar or annotation may be edited directly only when no board read is needed, exact old/new context is known, and the checker immediately passes; otherwise use Keeper.

Load `goal-execution-reference.md` only for **Keeper request**, **runtime rebind**, or **exact-human wait/reply** syntax.

## Quiet control plane

GoalBuddy is internal operating state, not the subject of routine user conversation. Keep successful resume, prompt rendering, digest relay, receipt application, Keeper/Ledger work, polling, checker runs, and next-task activation backstage. Report product progress, review status, real blockers, and decisions.

Surface GoalBuddy mechanics only when the user asks, recovery is discrepant or uncertain, the runtime itself blocks product work after bounded repair, an exact owner action is required, or final completion needs one concise proof marker. A malformed request rejected before mutation should be corrected silently when safe.

## Recovery triggers

A genuine recovery boundary is a new session, post-compaction continuation, process/harness loss, ambiguous closeout, possible in-flight Worker, conflicting board/repository evidence, or explicit handoff. Walking away or finishing an ordinary task is not by itself recovery.

At recovery, run the exact-board resume projection and a fresh read-only Ledger audit. Continue automatically only when the projection is `ok`, digests match, Ledger is congruent, repository/worktree evidence agrees, and no duplicate Worker may be live. If the audit is discrepant, uncertain, failed, unavailable, or identifies evidence requiring inspection, stop automatic continuation and review the named evidence. Never reconstruct progress from chat history or rewrite completed receipts merely to satisfy a newer checker.

Load `goal-execution-reference.md` only for **immutable-history recovery** or **failure-specific recovery**.

## Final completion

Do not mark the goal done because the queue is empty or a Worker says it finished. A final Judge or PM audit must map current product evidence, receipts, independent review, exact verification, owner gates, child-board state, and the original oracle back to the requested outcome. Run the full goal oracle suite. Complete only when the audit records `full_outcome_complete: true` and no required work, approval, verification, or live lane remains.
