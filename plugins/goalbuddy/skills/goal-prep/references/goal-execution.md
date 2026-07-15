# GoalBuddy `/goal` Execution Contract

This document governs `/goal` runs: the execution mode. Board preparation (`$goal-prep` in Codex, `/goal-prep` in Claude Code) is governed by `SKILL.md` in this skill directory; do not mix the modes. Shared foundations — the intake compiler, slice sizing policy, four primitives, control files, board schema, seed boards, and agent availability states — are defined in `SKILL.md` and apply here unchanged.

The run command is:

```text
/goal Follow docs/goals/<slug>/goal.md.
```

## Direct `/goal` Entry

When `/goal` is invoked with raw user intent instead of an existing `docs/goals/<slug>/goal.md` path, run the Intake Compiler (see `SKILL.md`) before doing implementation work. The PM should not treat raw `/goal` text as an execution plan until it has:

- classified the input shape;
- preserved any existing plan facts;
- identified the likely misfire and at least one blind spot;
- recorded authority and proof;
- answered or explicitly defaulted the diagnostic ladder for vague/strategic input;
- selected the safest first active task;
- either asked the required guided intake question or written `goal.md` and `state.yaml` from a sufficiently clear intake.

When running the Intake Compiler inside a `/goal` run, apply its extraction and diagnostic logic, but skip the prep-turn terminal steps: do not print the `/goal` command and stop. Once the board is written, continue directly into execution.

If the raw input is detailed and already contains a plan, the first board task should validate and operationalize that plan rather than rediscovering from scratch. If the raw input is vague, run the diagnostic intake before creating the board unless the user explicitly says to use defaults. If the raw input is blocked by authority, policy, destructive action, credentials, or ambiguous completion proof, ask one guided question with options or create the smallest safe read-only task only after the user chooses to proceed.

The target is not literal certainty. It is the highest practical likelihood of a successful goal run: preserve the user's intent, avoid the likely misfire, pick the earliest responsible phase, require proof, and keep advancing safe work until a final audit proves the full outcome.

## Native Harness Goal Loops

Both harnesses now provide a native, harness-driven goal loop that keeps
re-invoking the model until the goal resolves. The loop drives continuation;
it never becomes board truth, and its steering or evaluator text never
overrides the owner contract or this document.

- **Claude Code** (`/goal`, v2.1.139+): a session-scoped Stop-hook wrapper.
  After every turn, a small fast evaluator model judges the goal condition
  against the conversation transcript only — it runs no tools and reads no
  files. Consequences: surface decisive proof in turn text (the final receipt,
  checker result, and `goal.status`), because proof that stays inside files or
  subagent output is invisible to the evaluator; and there is no implicit turn
  cap, so for walk-away runs the operator may append a measurable completion
  clause and a bound to the run command, for example
  `/goal Follow docs/goals/<slug>/goal.md until a final receipt with
  full_outcome_complete: true is surfaced; stop after N turns if blocked.`
  The goal is restored on `--resume`/`--continue` with turn and token
  baselines reset.
- **Codex** (goals feature): a per-thread persisted goal object
  (objective, optional `token_budget`, status). When the thread goes idle
  with an active in-budget goal, the harness injects hidden continuation
  steering and starts a new turn when automatic idle work is permitted.
  Queued user or client work, another active turn, or Plan mode takes
  precedence. A prose-only turn does not itself suppress continuation; do
  not make meaningless tool calls merely to keep the loop alive. On
  token-budget exhaustion the status becomes `budget_limited` with wrap-up
  steering: write that wrap-up into receipts and notes so board truth
  captures the stopping point. The model may `create_goal` and mark
  `complete` or `blocked` only; pausing, resuming, and budgets belong to the
  user.

Under either loop, completion truth is still the board: a final Judge/PM
audit receipt with `full_outcome_complete: true` recorded in `state.yaml`.
Do not let a harness evaluator's "achieved" verdict or a wrap-up steering
message substitute for that receipt, and do not mark a Codex goal `complete`
before the board's final transition is applied.

## Quiet Control Plane

GoalBuddy is internal operating state, not the subject of routine user conversation. Keep every safety mechanism in this contract, but keep successful mechanics backstage. User-facing commentary and final responses describe the product outcome, current implementation or review milestone, material finding, real blocker, required human decision, and completion evidence.

Do not narrate routine successful control-plane events, including:

- resume projection, congruent Ledger audit, or digest capture;
- Keeper spawn/reuse, request construction, receipt application, status change, or checker pass;
- task IDs, board fields, receipt plumbing, control-file edits, and prompt rendering;
- polling intervals, idle notifications, or a still-running subagent;
- a malformed control-plane request that was rejected before mutation and can be corrected safely in the same turn.

Do not use `GoalBuddy`, `board`, `Keeper`, `Ledger`, `digest`, `receipt`, `checker`, or a `T###` identifier in a routine user update merely because the mechanism ran. Translate the event into the work it protects:

- after a successful closeout and activation: “The authentication slice is verified; I’m moving to session revocation.”
- while an independent review is still running: “The security review is still running; no files have changed.”
- after successful recovery: continue with the product milestone without a recovery preamble.

Surface control-plane mechanics only when at least one condition holds:

1. the user asks about GoalBuddy or its mechanics;
2. recovery is discrepant or uncertain and safe continuation needs explanation;
3. a GoalBuddy runtime, installation, schema, checker, or Keeper/Ledger failure is the actual blocker after bounded retry;
4. the user must take an exact board-related action or supply an exact reply;
5. final native-harness completion requires one concise machine-readable proof marker such as `full_outcome_complete: true`.

When an exception applies, name the product impact first, then the minimum mechanism detail needed to make the decision understandable. Never hide a real discrepancy, approval gate, failed verification, possible duplicate Worker, or unsafe state merely to sound quiet. This is a communication boundary, not a reduction in durable proof, recovery auditing, or mutation safety.

## Boards Move Between Harnesses

A board may arrive mid-run from a different harness: a goal started in Codex can be resumed in Claude Code and vice versa. `state.yaml` is the only durable board truth, but a durable record can still be stale, malformed, mid-closeout, or inconsistent with repository reality. On recovery, never reconstruct progress from chat history, and never blindly trust an active-task label as proof that continuation or redispatch is safe. Receipts written by another harness are as authoritative as your own once the recovery audit below finds the board congruent.

Any receipt may include an optional `harness` field (for example `codex` or `claude-code`) naming the runtime that performed the task, so the board's history shows who did what across a handoff. When you know which harness you are, stamp it.

### Recovery Audit

A genuine recovery boundary is any cold start, new session, post-compaction recovery, cross-harness handoff, or return after interrupted closeout, verification, or Worker execution. It is not an ordinary transition immediately after the current PM received a validated Keeper receipt for the closeout and successor activation in the same uninterrupted context.

At every genuine recovery boundary:

1. Run the checker-validated continuation command for the specific board:

   ```bash
   node <skill-path>/scripts/resume-board.mjs docs/goals/<slug> --json
   ```

   The bundled resume script with no board remains discovery-only, and the public `goalbuddy resume` CLI delegates to this same script. The explicit-board form validates the exact captured root `state.yaml` and every referenced depth-one child `state.yaml`, then emits one deterministic `board.tree.digest` plus the complete projected `board.active_lanes` inventory. The existing checker remains byte-stable: resume invokes it against each exact snapshot rather than changing checker semantics or forcing runtime-binding migration. An `ok: true` projection is a read model, not a second source of truth. An `ok: false` response contains no partial projection and grants no continuation authority; its stable root digest, when available, only binds the full-board review.
2. Invoke the dedicated read-only Ledger Auditor: `goal_ledger` in Codex or `goal-ledger` in Claude Code. Give it the board path, root `board.state_digest`, composite `board.tree.digest`, board-tree entries, active lanes, checker status, and the response's exact bundled `commands.resume` command so its independent rerun never depends on a global CLI. Do not substitute Judge: Judge owns high-judgment phase, risk, scope, and completion decisions; Ledger owns mechanical recovery reconciliation.
3. Ledger independently reruns the explicit resume command, reads the complete charter plus every root/child board in `board.tree.boards`, and compares every active lane with independent repository evidence: relevant worktrees and diffs, persisted receipts, recorded verification, owner gates, and visible Worker/session state. Every pre/post file digest and the composite digest must match the PM's response; a changed board tree is `uncertain` and requires a fresh recovery audit. Ledger never returns `congruent` when resume failed.
4. Continue automatically from the projected active lane or lanes only when resume returned `ok: true` and Ledger returns `verdict: congruent`, the same root and composite digests, and `main_agent_action: continue`.
5. Treat checker failure, projection failure, `discrepant`, `uncertain`, malformed output, timeout, or unavailable Ledger as a mandatory full-board PM review. Errors affecting the live task, current transition, gate, verification, or Worker liveness must be repaired before continuation. If every checker error is confined to immutable completed-task history on a current `version: 2` board, do not rewrite or fabricate history merely to make the checker green: the PM may continue only after directly proving the exact live continuation against the complete board and independent evidence. This compatibility path is never automatic and does not apply to v1, missing or changing state, an inconsistent live tail, an unresolved gate, or uncertain Worker liveness. After that review explicitly authorizes compatibility, render the exact active task with:

   ```bash
   node <skill-path>/scripts/render-task-prompt.mjs docs/goals/<slug> --expected-state-digest <64-lowercase-hex> --allow-immutable-history --json
   ```

   The public `goalbuddy prompt` command accepts the same flags. The renderer validates the exact on-disk snapshot, reuses the board-transition compatibility proof, and strict-parses a read model containing the exact active-task block plus every unchanged non-task top-level section. It does not parse fields through the board UI fallback, infer a non-active task, or persist a secondary summary. Digest drift, changed checker errors, a non-done errored task, global/live-tail errors, malformed active bytes, multiple active tasks, or `active_task` mismatch emits no prompt.
6. Never infer Worker liveness from `status: active`. If any unfinished Worker lane might still be running and liveness is not proven, do not redispatch it. Ledger returns `uncertain`, and the PM checks the current harness/session or worktree before choosing recovery.

Ledger never edits state, applies receipts, chooses tasks, dispatches work, or becomes a task/receipt actor. Do not add Ledger status to `state.yaml`; install health belongs to `goalbuddy doctor`, while board truth stays in the existing schema.

### Board Keeper

The PM owns every semantic board decision; the Board Keeper owns the mechanical board operation. During `/goal` execution, use `goal_keeper` in Codex or `goal-keeper` in Claude Code for every full-board inspection and every mutation of `state.yaml`, receipts, task cards, goal/task status, `active_task`, verification state, owner gates, GoalBuddy notes, or charter control text. Board preparation may create the initial files directly; this Keeper boundary begins when `/goal` execution starts.

The PM should normally see only the compact resume projection, task prompt, agent receipt, and Keeper receipt. A board file already loaded into PM context remains in the cached conversation prefix on later turns, so targeted shell reads by the PM are not the default substitute for Keeper. Direct PM full-board review is the exceptional recovery path required by a failed or ambiguous Ledger audit, not routine bookkeeping.

For each operation, send one compact `goalbuddy_keeper_request_v1` containing:

- the exact `board_path`, operation, and authorized GoalBuddy control files;
- the current `state.yaml` digest from resume or the previous Keeper `after_digest`;
- exact PM-approved instructions and expected before/after facts;
- the exact bundled checker command.

Always include both operation-discriminated keys. Use `transition: null` and `control: null` as the canonical absence representation; never send an object whose fields are merely all null. Missing common authorization fields remain a fail-closed request error.

For `apply_receipt`, replace `transition: null` with the typed transition object containing `task_id`, `status`, `receipt_path`, and `activate`; keep `control: null` and set unused task-card fields to `null`. For a Judge decision that introduces exact successor cards, use `apply_amendment` and provide the same fields plus `task_cards_path`, which points to a JSON array of complete PM-approved task objects. When the selected successor is an existing queued Worker placeholder, use `apply_hydration`: set `hydrate_task_id` to that same successor and either set `task_card_path` plus its exact `task_card_sha256` or leave both null to consume the receipt's exact `worker_package`. The exact-human wait/reply and final-completion operations use the same typed transition object with only their operation-relevant fields populated. Do not embed a long task payload in prose and do not send separate `add_task`, task-edit, receipt, or activation requests. Keeper must perform either typed transition with one `apply-receipt.mjs` invocation so package materialization, closeout, activation, checker validation, and rollback share one atomic boundary.

For the reviewed immutable-history path, set request field `immutable_history_authorized: true`; otherwise it must be false and Keeper must not pass the compatibility flag. For `rebind_goalbuddy`, set `transition: null` exactly and replace `control: null` with the object containing `binding_path` plus every absolute `installed_checker_paths` entry. Do not send an all-null transition object. Keeper runs the public rebind command once; direct control editing is forbidden. For `inspect`, `activate`, `update_control`, and `repair`, keep both discriminated keys null unless a narrower operation rule explicitly replaces one.

Keeper reads the board in its isolated context, applies no judgment, prefers the bundled atomic receipt applier for receipt/status/successor transitions, validates the result, and returns one `goalbuddy_keeper_receipt_v1`. Reuse one warm Keeper for successive operations on one board during an uninterrupted session; send only the new decision payload and prior digest, not the role contract or full history. Start a fresh Keeper after a genuine recovery audit.

Keeper is control-plane, not a task agent: it receives no task card, never returns `goalbuddy_receipt_v1`, never chooses a task or successor, and never edits product files. Do not add Keeper status to `state.yaml`. Run at most one Keeper against a board. Digest drift, ambiguous instructions, unavailable validation, concurrent board activity, unauthorized paths, or a failed checker blocks the operation with no accepted mutation.

Keeper and Ledger are required installed control-plane roles. If Keeper is unavailable, malformed, or times out, do not silently fall back to routine PM full-board reads or direct edits. Preserve the last validated digest, run `goalbuddy doctor` through the installed channel, repair the install, and retry or escalate to the operator. Ledger remains independently read-only so the recovery auditor can never mutate the evidence it verifies.

### Mixed Fleets

A single board may also mix harnesses within one run: the PM stays where it is and dispatches an individual task to a different vendor's agent — for example a Codex worker on a Claude Code board, or a Claude judge on a Codex board — using the bundled dispatcher:

```bash
node <skill-path>/scripts/dispatch-task.mjs docs/goals/<slug> --to codex
```

Rules for external dispatch:

- Dispatch to an external harness only when the user asked for a specific harness or model, or the task card carries an optional `harness:` field naming one. Never dispatch externally by default — it spends the user's quota on another vendor.
- The dispatcher renders the task prompt, runs the target CLI headless with role-appropriate sandboxing, extracts the returned `goalbuddy_receipt_v1`, and mechanically verifies write scope with git: worker changes must match `allowed_files`, and read-only roles must change nothing.
- The dispatcher never edits `state.yaml`. The PM gives the reported receipt — including its `harness` stamp — to Keeper for exact recording, just as with any subagent receipt.
- Do not mark a dispatched task `done` unless the dispatch report's scope check is clean and the receipt's verify commands pass. A scope violation means inspect the working tree, decide what to keep, and record a blocked receipt with the facts.
- If the target CLI is missing, unauthenticated, or times out, fall back to the normal path: PM fallback or the required GoalBuddy agent, per the dispatch rules above.

## `/goal` Default Bias: Users Want Work Done

This section applies after the user starts `/goal Follow docs/goals/<slug>/goal.md.` It does not apply to the initial `$goal-prep` board-preparation turn.

Unless the user explicitly asks for planning only, treat a `/goal` run as a request for work to happen.

Planning, Scout findings, Judge decisions, and a queued Worker task are not terminal outcomes when the user's original ask is for a working capability, automation, fix, cleanup, or backend/frontend behavior. They are setup for execution.

For execution goals, the default run is continuous:

```text
Discover enough evidence, choose the largest reversible local work package, implement it, verify it, apply the Adaptive Execution Strategy's quality ladder, then immediately choose and execute the next work package until the full original outcome is complete.
```

If the first `/goal` run reaches a Judge decision that names a safe Worker task with `allowed_files`, `verify`, and `stop_if`, the PM should activate that Worker and continue in the same run unless a stop condition applies.

After a verified Worker package, do not mark the thread goal complete merely because that package passed. For broad automation or product goals, continue by reopening or advancing the board to the next safe Worker package until the full owner outcome is complete.

Missing owner input, credentials, production access, destructive-operation permission, or policy decisions are blockers for specific tasks, not stopping conditions for the whole goal. When a slice hits one of those blockers, mark that exact task blocked with a receipt, create a safe follow-up or workaround task, and keep doing local, non-destructive work that advances the full outcome.

## Adaptive Execution Strategy

The compiler and charter establish durable structure: outcome, constraints, vertical slices, dependencies, proof requirements, and owner gates. They do not pre-schedule quality tooling. At each material boundary — a slice about to start, a plan about to be trusted, a diff about to be accepted — the PM decides:

- Is the next slice sufficiently specified, or does it need a new or revised implementation plan?
- Should planning for it be upfront, just in time, or hybrid?
- Does the plan warrant independent hardening before implementation?
- Which implementation lane fits, and what review depth does the resulting diff deserve?
- Is a dedicated simplification pass worthwhile?
- Does this seam need the lead PM's judgment or a routine delegated Judge?

The PM may split, combine, reorder, or refine queued work as evidence accumulates. It may not silently change the owner's outcome, non-goals, permissions, final proof, or completed history.

### Risk axes and materiality

Two independent axes justify planning and review; either alone is sufficient:

- Decision risk: ambiguity, architectural choices, competing approaches, unverified external assumptions, new or changed authority, money, data-model, or cross-component seams.
- Execution risk: blast radius, integration breadth, long autonomous duration, difficult verification. A conceptually simple but enormous migration still needs hardening.

A slice is automatically material when it touches auth, money, permissions, migrations, data integrity, public contracts, irreversible actions, or meaningful interaction changes. Copy tweaks and small styling changes are not material. When unsure, treat the slice as material. The charter's Execution Strategy section may refine these defaults; it may not replace them with PM confidence.

### Quality ladder

Material slices normally receive, in order: a hardened plan, implementation by a bounded Worker, direct diff review by the PM, an independent implementation review, adjudication of findings with bounded fixes, verification, and a receipt. Simplification is available both as a review lens and as a standalone pass after large, cross-cutting, or complexity-producing changes.

Small, mechanical, decision-complete changes may skip rungs. PM confidence alone is never a sufficient reason to skip independent review on a material slice during a long autonomous run. When the PM reduces the ladder for a material slice, record that downward deviation in PM-owned evidence: the rationale and evidence of the next phase-gate or final-audit Judge/PM receipt the PM authors. Never append it to a Worker's receipt — Worker `deviations` keeps its receipt-spec meaning (the Worker's own in-scope judgment calls against the task text), and subagent receipts pass to Keeper verbatim. Do not add board notes or new schema fields for it; if per-slice durability ever proves necessary, design a PM-owned additive field explicitly rather than overloading `deviations`.

### Independent review is not Judge

Independent implementation review — plan hardening, diff review workflows, simplification — produces adversarial evidence about a plan or diff. A GoalBuddy Judge holds board-level decision authority at phase, risk, ambiguity, rejected-verification, and final-completion gates. Neither substitutes for the other: a clean review does not close a phase gate, and a Judge decision does not replace review evidence for a material diff.

The lead PM owns architecture, taste, ambiguous decisions, material board restructuring, workflow adjudication, and final completion. Routine readiness, scope, verification-adequacy, dependency, and post-fix rechecks may go to a delegated Judge, which escalates when a finding would change board structure, a task's authority model, or the owner contract. Model identity for either tier is a runtime routing choice, never board data.

### Capabilities are semantic

The board and charter name capabilities, not vendor skills:

| Capability | Claude Code | Codex |
|---|---|---|
| Plan hardening | Workflow Plan | Omega Plan |
| Implementation review | Workflow Review | Omega Review |
| Simplification | Workflow Simplify | Omega Simplify |

Receipts record the capability outcome, disposition, and artifact path — never full reports copied into board truth. Complete plans, review reports, and workflow artifacts live in their native locations.

### Evidence binding

Review and hardening evidence binds to the exact artifact it examined: the diff or plan content, its scope, the workflow version, and the run's completeness status. Evidence is stale when any relevant input changes; a review launched before a plan edit refutes text that no longer exists. When a board moves between harnesses, reuse completed evidence whose binding is unchanged; rerun the native workflow only when the evidence is incomplete, stale, untrusted, or the underlying input changed.

A completion claim alone is not proof. A structured receipt backed by exact commands and inspectable artifacts is evidence; important claims still receive independent verification. A task's proof contract may be tightened at runtime and never silently loosened. Decisive verification must prove the exact current bytes — through a forced run, an isolated worktree, or a correctly content-addressed cache; a cached result that cannot be tied to the current content proves nothing.

### Checkpoints and gate failures

Durably checkpoint implementation — a task branch or worktree commit, never a push to a protected branch — before launching independent review, so an interrupted review cannot lose the work. Gate-infrastructure failure does not invalidate the implementation artifact: preserve the checkpoint, repair and retry only the failed gate, and use a canary before relaunching a failed review fleet.

Transient quota, rate-limit, and timing conditions are scheduling inputs the PM may reorganize around freely; they never enter board truth. Durable safety constraints discovered at runtime — for example, a scheduler that reads prompts live from `main` — may enter board truth as constraints.

## Task Rules

A task is the only work that may happen.

- Scout tasks are read-only and produce findings.
- Judge tasks are read-only and produce decisions or constraints.
- Worker tasks may write only inside `allowed_files`.
- PM tasks may decide control-file and board-state changes; Keeper applies them.

No implementation without an active Worker or PM task that explicitly allows it.

Each board may have at most one active task and therefore at most one active write-capable Worker. When the user explicitly asks for parallel agent work, represent each additional lane as a depth-one child board and run the bundled `parallel-plan` projection. Parallel Workers are eligible only when their structured `allowed_files` scopes are known and pairwise disjoint. Separate branches or worktrees preserve bytes but do not prove semantic independence, recovery safety, verification, or merge compatibility; they never relax the board-tree or scope checks.

## Receipts

A receipt is compact proof that the task happened and what it changed, learned, decided, blocked, or spawned.

Scout, Judge, and Worker subagents return a `goalbuddy_receipt_v1` JSON object. The PM decides the resulting task status and successor, then gives Keeper the receipt verbatim. Keeper copies its fields into the task's `receipt:` mapping in `state.yaml`, dropping only null or empty fields. Do not rename fields or invent new ones. The YAML examples below show minimum shapes, not a different schema.

Scout receipt:

```yaml
receipt:
  result: done
  summary: "Found three high-leverage candidates: flaky auth tests, missing router coverage, stale build docs."
  evidence:
    - test/auth/session.test.ts
    - src/router/index.ts
    - README.md
  spawned_tasks:
    - T004
```

Judge receipt:

```yaml
receipt:
  result: done
  decision: "approved"
  full_outcome_complete: false
  rationale: "Router coverage is verified; continue with the next PM-selected work package."
  worker_package:
    objective: "Add regression coverage for invoice.paid routing."
    allowed_files:
      - src/billing/router.ts
      - test/billing/router.test.ts
    verify:
      - npm test -- test/billing/router.test.ts
    stop_if:
      - "Need files outside allowed_files."
  blocked_tasks:
    - T005
```

When a Judge decision selects or approves the next Worker task, `worker_package` carries the exact Worker spec; the PM copies it onto the Worker task card. When no Worker follows, `worker_package` is null. Judge `decision` is closed to `approved`, `rejected`, `approve_subgoal`, `reject_subgoal`, `not_complete`, or `complete`; any other value is invalid.

Worker receipt:

```yaml
receipt:
  result: done
  changed_files:
    - src/billing/router.ts
    - test/billing/router.test.ts
  commands:
    - cmd: git diff --check
      status: pass
    - cmd: npm test -- test/billing/router.test.ts
      status: pass
  summary: "invoice.paid now routes through eventRouter.dispatch; regression test added."
```

A `done` Worker receipt must list only passing commands and must include every command from the task's `verify` list verbatim. Extra passing diagnostic commands are allowed, but they do not replace a declared verification command. The bundled checker rejects a done Worker whose `commands` omit a declared verification command or include a non-`pass` status. If the task's own `verify` did not pass, the task is not done: mark it `blocked` and keep the failing command visible in the blocked receipt — do not move truthful failure evidence into prose to make a `done` receipt validate.

Blocked Worker receipt:

```yaml
receipt:
  result: blocked
  blocked_reason: "npm test fails for a cause outside allowed_files (broken test-runner script in package.json)."
  changed_files:
    - src/billing/router.ts
  commands:
    - cmd: npm test
      status: fail
  summary: "Router fix is complete and green in isolation; the task verify is blocked by an out-of-scope runner defect."
  spawned_tasks:
    - T005
```

Recording a receipt by hand takes three separate precise edits (task status, receipt block, `active_task`). The bundled applier does the transition atomically and fail-closed — it validates the resulting board with the checker and reverts the file on any error:

```bash
node <skill-path>/scripts/apply-receipt.mjs docs/goals/<slug> --task T### --receipt receipt.json --expected-state-digest <64-lowercase-hex> --activate T###
```

It accepts a bare receipt JSON, a `goalbuddy_receipt_v1` envelope, or a dispatch report. Receipt `task_id` and `board_path` identity are preserved losslessly and rejected when they contradict the selected task or board. Other additive receipt evidence is stored as inert data; GoalBuddy does not interpret it as product authority. Keeper invokes the applier from the PM's exact mutation request; the PM supplies the semantic status and successor decision without loading or hand-editing the full board.

Every official board mutation uses one stable per-board transition lock. The lock is held across the fresh `state.yaml` read, expected-digest check, candidate validation, atomic rename, and directory fsync. A competing writer is rejected without changing board bytes; after the active writer finishes, recover with `goalbuddy resume` and use the fresh digest rather than replaying the old request. A stale-lock diagnostic is not permission to delete it blindly: first prove that no board writer is live and preserve the current board bytes.

The immutable-history compatibility path remains explicit. After the recovery procedure's mandatory PM full-board review proves that every current checker error belongs to exactly one already-done task, add `immutable_history_authorized: true` to the Keeper request and let Keeper pass `--allow-immutable-history` to the same atomic command. The runtime compares the exact pre/post checker-error multiset, requires version 2, verifies every referenced task remains done, and compares each referenced task's raw YAML block byte-for-byte. It rejects global errors, live-tail errors, missing or multi-task attribution, changed history, new/different errors, digest drift, and malformed state. The explicit prompt compatibility flags invoke this same proof against one exact, unchanged snapshot before strictly projecting only the active task and non-task control sections. A successful compatibility report is compact: baseline error count/digest, preserved task IDs, unchanged-history proof, and zero live-tail errors. It never makes the raw checker green and never authorizes historical rewriting.

When a Judge amendment creates successors that are not yet on the board, put the exact complete task objects in a temporary JSON array and apply the entire transition once:

```bash
node <skill-path>/scripts/apply-receipt.mjs docs/goals/<slug> --task T### --receipt receipt.json --add-tasks task-cards.json --activate T###
```

The command rejects malformed, duplicate, or pre-existing task IDs before writing. The normal checker remains the final authority; any invalid resulting board is restored byte-for-byte. A successful retry therefore cannot duplicate cards, and a failed attempt does not leave a half-applied amendment.

When a Judge instead selects an already-existing queued Worker placeholder, hydrate and activate that exact task in the same transition:

```bash
node <skill-path>/scripts/apply-receipt.mjs docs/goals/<slug> --task T### --receipt receipt.json --hydrate-task T042 --task-card t042-task-card.json --task-card-sha256 <64-lowercase-hex> --activate T042
```

Omit `--task-card` and `--task-card-sha256` only when the receipt itself carries the exact four-field `worker_package`. A complete task card may additionally preserve generic package controls such as inputs, constraints, and expected output. Product-specific approval phrases and boundary classifications are not task-card fields. Hydration is deliberately narrow: the target must already be a queued, receipt-free Worker with empty `allowed_files` and `verify`; it may carry a protective provisional `stop_if`, which the exact package replaces atomically. Its ID must match both `--hydrate-task` and `--activate`; a complete card must preserve identity, assignee, lifecycle status, and null receipt. Hash mismatches, unknown card fields, populated Worker packages, ID mismatches, mixed add-and-hydrate requests, malformed packages, and checker failures are rejected without an accepted mutation. The report returns the exact hydration source and SHA-256 used.

### Exact-human wait and reply

When an exact human reply is the only remaining action, Keeper enters the terminal wait through the official digest-bound transition rather than hand-editing task and goal status:

```bash
goalbuddy wait docs/goals/<slug> --task T### --receipt wait.json --expected-state-digest <sha256> --json
```

The selected task and goal must both be active, `active_task` must select that task, and `rules.exact_human_approval_can_terminal_wait` must be true. `wait.json` must preserve `task_id` and `board_path`, use `result: blocked`, set `waiting_for_user_approval: true`, include a nonempty `required_reply`, and make no completion claim. The transition atomically blocks only the selected task and goal and clears `active_task`; queued dependent tasks remain inert and queued.

After the user supplies a reply, write exactly `{"reply":"<exact bytes>"}` to a temporary JSON file and run:

```bash
goalbuddy reply docs/goals/<slug> --task T### --reply-file reply.json --expected-state-digest <sha256> --json
```

Comparison is case- and whitespace-sensitive. A mismatch returns `no_change: true` with identical before/after digests. An exact match atomically reactivates only the waiting task and goal, moves the complete wait receipt into `transition_evidence.exact_human_replies`, records the waiting-board digest and SHA-256 hashes of the required and supplied strings, sets `exact_match: true`, and clears the live receipt for the eventual final task receipt. Resume projects only compact hashes and counts for Ledger recovery; the complete wait receipt remains durable in board truth. This proves an exact-string workflow transition only. It never proves who supplied the string or grants product authorization.

When the final active Judge or PM audit proves the full owner outcome, finish through the same atomic boundary:

```bash
goalbuddy complete docs/goals/<slug> --task T### --receipt final.json --expected-state-digest <sha256> --json
```

The final receipt must preserve `task_id` and `board_path` and contain `result: done`, `decision: complete`, and `full_outcome_complete: true`. The transition requires no other queued or active task, preserves task-level transition evidence, and atomically sets the task and goal done with `active_task: null`. The shared per-board lock prevents two callers holding the same prior digest from installing competing final receipts. Do not split final receipt application from goal completion.

### Rebinding a board to an accepted GoalBuddy runtime

When an existing board pins `checks.goalbuddy_binding` to an older accepted runtime, never hand-edit the control block. After the new local checkout is committed and clean, both installed checker copies are refreshed and byte-identical, both doctors are green, and the PM has authorized the exact replacement object, Keeper runs:

```bash
goalbuddy rebind docs/goals/<slug> \
  --binding goalbuddy-binding.json \
  --installed-checker <absolute-codex-checker-path> \
  --installed-checker <absolute-claude-checker-path> \
  --expected-state-digest <sha256> \
  [--allow-immutable-history] \
  --json
```

The binding JSON has exactly `source_root`, `accepted_commit`, `checker_path`, `checker_sha256`, `installed_checker_sha256`, `runtime_doctor_goal_ready`, and `cached_marketplace_checker_authoritative`. The command requires the source checkout to be clean at the exact commit, the source checker to live inside that checkout and match its hash, every supplied installed checker to match the same bytes, doctor readiness to be true, and cached-marketplace authority to be false. It replaces only `checks.goalbuddy_binding` under the shared lock and the same immutable-history proof. Missing control state, unknown keys, stale digests, dirty source, mismatched commits or bytes, and any live-tail checker error preserve board bytes.

Subagent idle signals and receipt messages can arrive out of order. Treat a bare idle notification as "receipt may still be in flight": check again briefly before nudging, and verify against the working tree (for example `git status`) rather than assuming the receipt is missing. A worker with uncommitted changes and no delivered receipt has not reached a valid stopping state.

For follow-up slices tightly coupled to a just-finished task, reusing the same still-available subagent — which retains the relevant context — is often cheaper and more accurate than a fresh spawn. Prefer it when the follow-up amends that worker's own output.

For long findings or decisions, write `notes/<task-id>-<slug>.md` and point to it:

```yaml
receipt:
  result: done
  note: notes/T001-repo-map.md
  summary: "Repo map completed; three candidate tranches found."
```

## Computed Gate

Do not store manual gate booleans.

The gate is computed from the active task:

- active Scout: edits are not allowed; receipt must include findings or a note.
- active Judge: edits are not allowed; receipt must include a decision.
- active Worker: edits are allowed only inside `allowed_files`; receipt must include changed files and commands.
- active PM: edits are limited to control files unless the task explicitly allows otherwise.

If verification is red, stale, blocked, or unknown, choose recovery, Scout, Judge, or PM board work before feature work.

## Blocked Does Not Mean Stop

Blocked tasks do not necessarily block the goal. The PM should keep doing safe local board work when possible:

- create a Scout task to improve evidence;
- create a Judge task to resolve ambiguity;
- create a Worker task for the largest reversible local work package that can proceed;
- write or update a note for handoff;
- update receipts and verification freshness.

Avoid setting `goal.status: blocked` for missing input, credentials, production access, destructive-operation permission, or policy decisions. Block the specific task instead, record the missing requirement, and continue with every safe local workaround or adjacent slice.

A common local case: the task's own fix is complete and correct, but its `verify` command fails for a pre-existing cause outside the task's `allowed_files` — for example, a broken test-runner script masking a correct code fix. Do not mark that task `done`, and do not widen its `allowed_files` mid-flight. Mark it `blocked` with the failing verify visible in the receipt, spawn a new Worker task scoped to the out-of-scope file, and verify the original oracle there.

Exception: if an exact human reply is the only remaining blocker and no safe local work remains, ask once, preserve the exact string, and stop. This exception requires `rules.exact_human_approval_can_terminal_wait: true`. Use the official `goalbuddy wait` transition with a receipt containing `result: blocked`, `waiting_for_user_approval: true`, and nonempty `required_reply: "<exact string>"`; do not hand-edit the terminal state. This exact pair is the sole `exact_human_reply` shape; do not invent or interpret approval classes. Queued dependents remain inert. No receipt may claim `decision: complete`, `decision: done`, or `full_outcome_complete: true`. Do not rephrase, retry, spawn follow-up work, or post another prompt until the user replies; then use `goalbuddy reply` with the exact string.

## Board Health Stewardship

The PM owns board-health decisions; Keeper performs the inspection and repair. Keeper is on demand or warm within one uninterrupted session, not an always-on poller or implementation actor. The recovery-only Ledger Auditor remains a separate bounded congruence check at genuine recovery boundaries.

When the board looks stale, misleading, offline, Not Found, or inconsistent, run the bundled checker:

```bash
node <skill-path>/scripts/check-goal-state.mjs docs/goals/<slug>
```

The checker accepts either the goal directory or the `state.yaml` path.

If a local board server is running, compare `state.yaml` with `http://127.0.0.1:41737/<slug>/api/board` or `http://127.0.0.1:41737/api/boards`. Repair only GoalBuddy control files: `goal.md`, `state.yaml`, `notes/`, depth-1 `subgoals/`, and `.goalbuddy-board/`. Never edit product implementation files during board-health work unless there is an active Worker or PM task with explicit `allowed_files`.

Board-health work should verify these truths: `active_task` matches live task status, done and blocked tasks have receipts, human-blocked work is in the blocked column, future work stays queued, and the live board/API reflects `state.yaml`.

## Operator Escalation

When Scout, Judge, Worker, or PM discovers a problem, improvement opportunity, product suggestion, follow-up repair, or tool limitation that should not be fixed inside the current active task, do not let it disappear in chat.

The PM may create a board task to prepare a repo-native follow-up. If the user has already approved publishing and the repo/auth state supports it, the PM may create an issue or PR directly and record the link in the receipt. Otherwise, ask the operator one concise question before creating the external artifact:

```markdown
I found [problem or suggestion].

Should I:
1. Create an issue in this repo for it? (Recommended) - [why]
2. Prepare a PR for the fix/suggestion - [when this is better]
3. Keep it only in the GoalBuddy board for now - [tradeoff]
```

Use an issue for follow-up work, unclear scope, missing approval, or suggestions that need discussion. Use a PR when the fix is already implemented or safely implementable within the current approved scope. If neither is appropriate, propose a different path and record the decision in `state.yaml`.

External issues and PRs are supporting artifacts, not board truth. `state.yaml` remains authoritative, and every issue/PR creation or decision must be reflected in a PM, Worker, or Judge receipt.

## Continuation Rule

After a task completes, immediately write its receipt and select the next active task unless:

- a final audit proves the full original owner outcome is complete.

Do not stop at "ready for implementation" when a safe Worker task exists. Activate the Worker, execute it, verify it, and keep going.

Do not stop after one verified work package when the broader owner outcome still has safe local follow-up work. Advance the board to the next work package unless a risk boundary or final audit is due.

Do not create a Judge task after every Worker by default. Use Judge only for phase boundaries, high-risk changes, unclear scope, rejected verification, or final completion. Repeated same-shape work belongs in one Worker package. Independent implementation review is not a Judge task: material slices receive it per the Adaptive Execution Strategy even when no Judge gate is due.

Do not stop because the current slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that slice blocked, spawn or activate the smallest safe local task that can proceed around the blocker, and continue.

Do not mark a goal or tranche done while any queued or active Worker task is still required for the user's original outcome. Complete it, block it with a receipt, or replace it with a smaller safe Worker task.

Do not end with an active task marked done.

Run the checker when available:

```bash
node <skill-path>/scripts/check-goal-state.mjs docs/goals/<slug>/state.yaml
```

If the checker and your judgment disagree, choose the more conservative state.

## PM Thinking Policy

The main `/goal` thread is the PM. It owns board meaning, chooses active tasks, decides when Scout/Judge/Worker receipts are sufficient, and decides completion. Keeper records those exact decisions and returns the validated board digest.

Recommended PM thinking:

| Goal mode | PM thinking |
|---|---:|
| specific, bounded | medium |
| open-ended | high |
| recovery | high |
| audit | high |
| high-risk or multi-day final audit | xhigh optional |

Do not use `xhigh` by default. Use it only when a wrong board, scope, or completion decision would be materially more expensive than latency and cost.

Tasks may include an optional `reasoning_hint` field:

```yaml
reasoning_hint: default # default | low | medium | high | xhigh
```

Treat `reasoning_hint` as PM guidance. It does not override task scope, write permissions, stop conditions, or the one-active-task rule.

## Execution Quality Commands

Use `node <skill-path>/scripts/render-task-prompt.mjs docs/goals/<slug>` to render a compact prompt for the active task. The prompt includes only task-specific material, safe agent metadata, continuation warnings, and the expected receipt shape. It should not include broad chat history or dump the whole state file.

When dispatching Codex subagents from a GoalBuddy prompt, the `required_spawn_agent_type` is mandatory. Use that exact `spawn_agent` `agent_type` (`goal_scout`, `goal_worker`, or `goal_judge`). Do not substitute generic `scout`, `worker`, or `judge` agents; if the required GoalBuddy agent is unavailable, stop spawning and continue as PM fallback or ask the operator to run the GoalBuddy CLI through their install channel with `agents` or `install`.

A `wait_agent` polling timeout while the target agent still reports `running` is only a polling interval expiry, not an agent or task execution timeout. Continue polling the same live agent and provide product-facing progress updates under the Quiet Control Plane; do not narrate polling or internal agent management, and do not interrupt, replace, redispatch, declare a timeout, or trigger PM fallback solely because a poll expired. Preserve the one-agent/no-duplicate-dispatch rule. Visible allowed-file changes are useful progress evidence, but their absence is not evidence of inactivity during reading, analysis, planning, or verification. Read-only Judge and Ledger work, plus inspection-only Keeper work, may never create allowed-file diffs at all.

Recover deterministically only when the agent itself reaches a terminal timeout, failed, or unavailable state; liveness cannot be established; the configured job/runtime deadline is actually exceeded; or an explicit task stop condition fires. If liveness is uncertain, do not duplicate the in-flight task: establish status through the current harness/session before choosing recovery.

`goal_ledger` / `goal-ledger` is separate from task prompt dispatch. Invoke it only through the Recovery Audit contract; it never receives a task card, returns a `goalbuddy_receipt_v1`, or changes board status.

`goal_keeper` / `goal-keeper` is also separate from task prompt dispatch. Invoke or reuse it through the Board Keeper contract for board inspection and exact PM-authorized mutations. Keep its request compact; the installed agent definition already contains the mutation and validation procedure.

Use `node <skill-path>/scripts/parallel-plan.mjs docs/goals/<slug>` when the user explicitly asks for parallel agent work. It is read-only: it consumes the same checker-validated root/child snapshots as resume, reports the same composite board-tree digest, recommends safe Scout/Judge handoffs, and recommends Worker handoffs only when write scopes are known and disjoint. It does not mutate `state.yaml`, create child boards, apply receipts, or spawn agents. If any board changes before output, validation fails closed; after a genuine recovery, Ledger reconciles every projected active lane before any redispatch.

## Completion

Never complete because work looks substantial.

At phase, risk, and final boundaries, run the full goal oracle suite — not only the commands named on the current task's card. Task-scoped re-runs miss regressions in suites the card never listed; the one regression a mid-phase Judge catches is usually exactly this kind.

Completion is a Judge or PM audit task. The goal is done only when a final done Judge or PM receipt says the full original outcome is complete and maps completion to current receipts, verification, and the user's original outcome.

For execution goals, completion also requires implementation evidence. A final audit cannot call the goal done if the only completed work is planning, discovery, or task selection.

For continuous execution goals, the final audit receipt must include `full_outcome_complete: true`. If the receipt only proves that the current work package or tranche is complete, keep the goal active and queue or activate the next safe Worker/PM task. Add a Judge only when the next decision is a phase, risk, ambiguity, rejected verification, or final completion review.

Queued or active Worker tasks block `goal.status: done`. If a Worker is no longer required, mark it blocked with a receipt explaining why, remove it during PM board maintenance, or replace it with the actual required Worker task before completion.

Default final task:

```yaml
- id: T999
  type: judge
  assignee: Judge
  status: queued
  objective: "Audit whether the current tranche is complete."
  inputs:
    - "All done task receipts"
    - "Last verification"
    - "Current dirty diff"
  expected_output:
    - "complete | not_complete"
    - "full_outcome_complete: true | false"
    - "missing evidence"
    - "next task if not complete"
  receipt: null
```
