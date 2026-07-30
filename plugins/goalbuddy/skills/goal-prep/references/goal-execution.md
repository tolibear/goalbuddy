# GoalBuddy Execution Kernel

This is the normative contract for prepared `/goal` runs. Read it with the charter and trust the installed bytes; installation and doctor own provenance, so do not search for alternate copies during execution.

## Start and board truth

`state.yaml` remains durable control truth and the board remains the recovery identity, but neither belongs in the healthy PM interface. The PM decides meaning; tools validate and install it.

For a prepared board, read only its charter and this kernel, then begin with the semantic frontier:

```bash
node <skill-path>/scripts/frontier.mjs docs/goals/<slug> --json
```

`goalbuddy_frontier_v1` is the compact checked decision packet. Follow exact drill-down references for plans, full diffs, reviews, receipts, or screenshots; summaries never replace evidence. Do not load Goal Prep, Codex Goal Compiler, raw `state.yaml`, or `goal-execution-reference.md` on a healthy start.

Claude's native task list may mirror work for visibility, ownership, and dependency release. It is optional ephemeral projection, never board truth or a second ledger. On conflict, discard and rebuild it from the frontier.

Genuine new-session or post-compaction uncertainty, a possible in-flight Worker, failed frontier, or discrepant evidence triggers recovery. Run `resume-board.mjs` and the read-only Ledger audit. There, treat `state_digest` / `state_yaml_sha256` and `board.tree.digest` / `board_tree_sha256` as opaque distinct tokens. Read raw board bytes only if the audit remains failed, uncertain, or discrepant, or names evidence to inspect.

## Authority roles

- **PM:** selects work, owns planning and review judgment, applies transitions, and decides escalation or completion.
- **Scout:** read-only evidence mapping. It does not mutate board or product state.
- **Judge:** read-only independent decision at material seams, ambiguity, or final audit. Independent review is not automatically a Judge task.
- **Worker:** one bounded slice. It writes only within `allowed_files`, runs `verify`, obeys `stop_if`, and returns one exact receipt.
- **Ledger:** recovery-only, read-only reconciliation of board, repository, proof, gates, and possible in-flight work.
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

For a material or insufficiently decision-complete slice, harden a current ExecPlan or compact JIT delta brief, then dispatch a bounded Worker, review the product diff, run independent review, repair, simplify when useful, and verify exact current bytes. Dispatch a decision-complete mechanical card directly with an outcome-oriented operator prompt.

For material work, Fable/PM retains every semantic seam: slice strategy; current-repository research when useful; JIT ExecPlan and Codex operator-prompt authoring or approval; full product-diff review; independent-review selection and adjudication; direct decisive-screenshot inspection for UI-visible work; unexpected-write and scope decisions; review-convergence judgment; accepted-deviation judgment; and final acceptance. A green checker, test result, Worker completion claim, receipt, or native task completion is evidence, not semantic completion. Runtime bookkeeping may support but never make these decisions.

Claude resolves semantic capabilities to its native workflow planning, review, simplify, browser-QA, and Codex Exec routes. Codex resolves them to its native Omega planning/review, browser-QA, and Worker routes. Board truth names capabilities and proof, not vendor skill names.

Important claims require independent verification. A completion claim alone is not proof. Bind reviews to the artifact/diff, workflow version, base/current commit or content-addressed snapshot, and completeness status. If the reviewed input changes, the old review is stale. Decisive verification gates rerun against exact current bytes; in dirty or shared worktrees, bypass stale caches when the gate supports it.

Downward deviations from the charter's material-slice ladder are PM-owned evidence. Record the reason in the next phase-gate or final-audit receipt's existing `deviations` field. Do not create diary cards or Worker-owned skip notes.

## Dispatch and exact-session continuation

After the PM authors or approves the semantic operator prompt, fresh dispatch captures and validates its own exact state immediately before launch:

```bash
node <skill-path>/scripts/dispatch-task.mjs docs/goals/<slug> --to codex --json
```

The dispatcher keeps its control envelope below the PM interface, validates authority and scope, and never normalizes receipt meaning. Healthy success stores the full report in private Git-local transport and returns one exact `receipt_source`, with no digest, raw receipt, session ID, or command template. After full product review, the PM chooses that source, authority, and successor for `advance`. Transport-unavailable output remains an exceptional retained source.

Recovery dispatch, immutable-history compatibility, and exact-session resume remain explicitly bound to `--expected-state-digest <sha256>` from the congruent recovery envelope.

For Codex, bind the exact JSONL session id to the active task. Never use `codex exec resume --last`. Resume only the task-bound session id, only after confirming the old process is not live, and only while workspace, task, execution profile, plan/brief, and dispatch-contract hashes still match. A polling timeout while liveness remains `running` is only a polling interval; do not interrupt, replace, or redispatch solely because a poll expired. A configured runtime deadline or explicit stop condition may terminate the Worker.

If a terminal Worker returns a schema-invalid receipt after clean authorized writes, the same dispatcher may perform exactly one receipt-only repair through that exact bound Codex session. Scope/control validation happens first, so a violation never buys a retry. The repair turn may write no repository byte, must preserve the original malformed receipt as inert report evidence, and cannot change the task or proof. A second invalid receipt, changed contract, unsupported harness, repair-turn write, lost dispatcher, or unavailable exact session fails closed. Never fabricate pass status or create a durable repair registry.

Load `goal-execution-reference.md` only for the kernel trigger **dispatch failure recovery**.

## Exact receipts and proof

Every terminal task returns exactly one `goalbuddy_receipt_v1` object matching the result-specific shape printed in its rendered prompt. Identity fields `task_id` and `board_path` are required; optional self-authored `harness` provenance is preserved unchanged.

A completed Worker receipt lists every actually changed path, reports each declared verification as `{cmd, status: "pass"}`, and contains only passing command results. A blocked Worker receipt preserves changed paths, attempted commands with truthful statuses, `blocked_reason`, and remaining blockers. Judge, Scout, and PM receipts use their role-specific shapes. Long evidence may use an explicit `notes/...` pointer; no empty `notes/` directory is required before first use.

The dispatcher and receipt applier import the same role/result-aware validator. They do not infer results, add fields, normalize commands, or rewrite historical receipts. `result` is the sole terminal-status source. `advance` applies only a validated exact source for the current active receipt-free task, under the board lock, and activates one legal queued successor. A candidate that fails the checker is not installed.

Every newly applied receipt stores adjacent `transition_evidence.receipt_provenance` as a closed `goalbuddy_receipt_provenance_v1` object with orthogonal receipt transport, report transport, dispatch disposition, closeout authority, exact artifact identities, and the canonical receipt-value digest. It is transition-owned proof, never an agent-supplied receipt field. Eligible Git-local transport is cleaned only after that proof is durable; cleanup unlinks only the authenticated report and removes its directory only when empty. Retained explicit, unavailable, rejected, and PM-closeout artifacts remain available.

A rejected dispatch cannot be converted into a successful role receipt. It may close only blocked through a separate exact `pm_blocked_closeout` for the source task: `authored_by: pm`, nonempty summary, blocked reason, remaining blockers, and evidence, with the rejected artifact retained as origin. It cannot claim commands, successful scope, Worker authorship, or `result: done`.

Load `goal-execution-reference.md` only for **role receipt examples**, **amendment/hydration**, or **immutable-history recovery**.

## Typed transitions and exceptional Keeper work

Ordinary reviewed closeout uses one explicit-source semantic operation:

```bash
node <skill-path>/scripts/goal-operation.mjs advance docs/goals/<slug> \
  --task T004 --source <exact-path> \
  --closeout-authority original_role --activate T005 \
  [--task-card <approved-path>] --json
```

Fable/PM chooses the reviewed source or exact `--held-receipt <handle>`, closeout authority, successor, and any approved task card. GoalBuddy derives provenance, captures checked concurrency identity, atomically installs the transition, and returns the next frontier. Never copy an embedded receipt, relay a digest, scan for a likely report, or route ordinary closeout through Keeper. If no legal successor exists, follow Final Completion; never invent one.

Other complete canonical decisions use the deterministic digest-bound CLI directly: structural amendment, standalone hydration, exact-human wait/reply, held-receipt preservation, and final completion. These transitions validate under lock and install atomically.

Use `goalbuddy hold` only when the PM chooses to preserve one exact unapplied candidate across interruption. It validates the same source/origin evidence accepted at the receipt boundary and appends one digest-bound `goalbuddy_held_receipt_v1` under `transition_evidence.held_receipts`; it binds the admitted board path and digest, current task authority, and dispatch contract in addition to the artifact and receipt hashes. It does not apply or semantically accept the receipt and does not change task status. An unselected candidate remains checked unapplied history if another receipt later closes the task. The handle binds every held field. Do not infer a hold from chat, a native task list, process memory, or directory scanning.

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

Do not mark the goal done because the queue is empty or a Worker says it finished. A final Judge or PM audit must map current product evidence, receipts, independent review, exact verification, owner gates, child-board state, and the original oracle back to the requested outcome. Run the full goal oracle suite.

A prospective final receipt supplies `completion_disposition`, `accepted_deviations`, `deviation_acceptance`, and `final_review` together. Exact completion requires an empty deviation set, null acceptance, and a safely opened `goalbuddy_final_review_v1` artifact whose repeated metadata and exact bytes match the receipt. Its closed bounded scope must cover the root-and-child union of every completed-Worker `changed_files` product path. Receipt-selected base metadata and artifact locations cannot change that coverage oracle. The union is honestly empty for a read-only goal with no completed Worker product paths; the review must still be complete and exact-current over its declared semantic scope. Scoped product identity omits GoalBuddy control bytes under `docs/goals/`, including when a broader bounded scope contains that subtree. Its reviewed identity must still match current scoped product bytes at the last pre-rename gate, and the checker repeats the proof after completion. Complete review, empty unresolved blockers, every sibling done, every child done, and the current identity are mandatory; tests or a self-declared scope do not substitute.

Owner-accepted completion binds one complete ordered deviation set, not individual entries. Enter the exact-human wait with `approve GoalBuddy deviation set <sha256>`, where the digest is over canonical JSON for the entire current set, then cite the persisted exact reply. Any set change invalidates acceptance. A non-review deviation still requires the exact-current complete final review. Only an accepted `exact-final-review` deviation may select the closed `final_review.status: accepted_deviation` branch; that branch records an owner-approved missing requirement and never claims the review is current or complete. There is no `not_required` branch.

Complete only when the audit records `full_outcome_complete: true`, one valid completion disposition, and no required work, approval, verification, or live lane remains.
