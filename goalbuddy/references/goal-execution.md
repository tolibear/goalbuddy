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

   The bundled resume script with no board remains discovery-only, and the public `goalbuddy resume` CLI delegates to this same script. The explicit-board form validates the exact captured `state.yaml` bytes first and uses the strict parser. An `ok: true` projection is a read model, not a second source of truth. An `ok: false` response contains no partial projection and grants no continuation authority; its stable digest, when available, only binds the full-board review.
2. Invoke the dedicated read-only Ledger Auditor: `goal_ledger` in Codex or `goal-ledger` in Claude Code. Give it the board path, response digest, checker status, and the response's exact bundled `commands.resume` command so its independent rerun never depends on a global CLI. Do not substitute Judge: Judge owns high-judgment phase, risk, scope, and completion decisions; Ledger owns mechanical recovery reconciliation.
3. Ledger independently reruns the explicit resume command, reads the complete charter and board, and compares them with independent repository evidence: relevant worktrees and diffs, persisted receipts, recorded verification, owner gates, and visible Worker/session state. Its pre/post board digests must match the PM's response; a changed board is `uncertain` and requires a fresh recovery audit. Ledger never returns `congruent` when resume failed.
4. Continue automatically from the projected active task only when resume returned `ok: true` and Ledger returns `verdict: congruent`, the same `state_digest`, and `main_agent_action: continue`.
5. Treat checker failure, projection failure, `discrepant`, `uncertain`, malformed output, timeout, or unavailable Ledger as a mandatory full-board PM review. Errors affecting the live task, current transition, gate, verification, or Worker liveness must be repaired before continuation. If every error is confined to immutable completed-task history on a current `version: 2` board, do not rewrite or fabricate history merely to make the checker green: the PM may continue only after directly proving the exact live continuation against the complete board and independent evidence. This compatibility path is never automatic and does not apply to v1, missing or changing state, an inconsistent live tail, an unresolved gate, or uncertain Worker liveness.
6. Never infer Worker liveness from `status: active`. If an unfinished Worker might still be running and liveness is not proven, do not redispatch it. Ledger returns `uncertain`, and the PM checks the current harness/session or worktree before choosing recovery.

Ledger never edits state, applies receipts, chooses tasks, dispatches work, or becomes a task/receipt actor. Do not add Ledger status to `state.yaml`; install health belongs to `goalbuddy doctor`, while board truth stays in the existing schema.

### Board Keeper

The PM owns every semantic board decision; the Board Keeper owns the mechanical board operation. During `/goal` execution, use `goal_keeper` in Codex or `goal-keeper` in Claude Code for every full-board inspection and every mutation of `state.yaml`, receipts, task cards, goal/task status, `active_task`, verification state, owner gates, GoalBuddy notes, or charter control text. Board preparation may create the initial files directly; this Keeper boundary begins when `/goal` execution starts.

The PM should normally see only the compact resume projection, task prompt, agent receipt, and Keeper receipt. A board file already loaded into PM context remains in the cached conversation prefix on later turns, so targeted shell reads by the PM are not the default substitute for Keeper. Direct PM full-board review is the exceptional recovery path required by a failed or ambiguous Ledger audit, not routine bookkeeping.

For each operation, send one compact `goalbuddy_keeper_request_v1` containing:

- the exact `board_path`, operation, and authorized GoalBuddy control files;
- the current `state.yaml` digest from resume or the previous Keeper `after_digest`;
- exact PM-approved instructions and expected before/after facts;
- the exact bundled checker command.

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
Discover enough evidence, choose the largest reversible local work package, implement it, verify it, review only at risk or phase boundaries, then immediately choose and execute the next work package until the full original outcome is complete.
```

If the first `/goal` run reaches a Judge decision that names a safe Worker task with `allowed_files`, `verify`, and `stop_if`, the PM should activate that Worker and continue in the same run unless a stop condition applies.

After a verified Worker package, do not mark the thread goal complete merely because that package passed. For broad automation or product goals, continue by reopening or advancing the board to the next safe Worker package until the full owner outcome is complete.

Missing owner input, credentials, production access, destructive-operation permission, or policy decisions are blockers for specific tasks, not stopping conditions for the whole goal. When a slice hits one of those blockers, mark that exact task blocked with a receipt, create a safe follow-up or workaround task, and keep doing local, non-destructive work that advances the full outcome.

## Task Rules

A task is the only work that may happen.

- Scout tasks are read-only and produce findings.
- Judge tasks are read-only and produce decisions or constraints.
- Worker tasks may write only inside `allowed_files`.
- PM tasks may decide control-file and board-state changes; Keeper applies them.

No implementation without an active Worker or PM task that explicitly allows it.

At most one write-capable Worker may be active. Do not run parallel Workers unless `state.yaml` proves disjoint write scopes and the user explicitly asked for parallel agent work.

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

When a Judge decision selects or approves the next Worker task, `worker_package` carries the exact Worker spec; the PM copies it onto the Worker task card. When no Worker follows, `worker_package` is null.

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
node <skill-path>/scripts/apply-receipt.mjs docs/goals/<slug> --task T### --receipt receipt.json --activate T###
```

It accepts a bare receipt JSON, a `goalbuddy_receipt_v1` envelope, or a dispatch report. Keeper invokes it from the PM's exact mutation request; the PM supplies the semantic status and successor decision without loading or hand-editing the full board.

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

Exception: if an exact human approval phrase is the only remaining blocker and no safe local work remains, ask once, preserve the exact phrase, and stop. Set `goal.status: blocked`, set `active_task: null`, mark every unfinished task `blocked`, and write a receipt with `result: blocked`, `waiting_for_user_approval: true`, and `required_reply: "<exact phrase>"`. Do not rephrase, retry, spawn follow-up work, or post another approval prompt until the user replies.

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

Do not create a Judge task after every Worker by default. Use Judge only for phase boundaries, high-risk changes, unclear scope, rejected verification, or final completion. Repeated same-shape work belongs in one Worker package.

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

When dispatching Codex subagents from a GoalBuddy prompt, the `required_spawn_agent_type` is mandatory. Use that exact `spawn_agent` `agent_type` (`goal_scout`, `goal_worker`, or `goal_judge`). Do not substitute generic `scout`, `worker`, or `judge` agents; if the required GoalBuddy agent is unavailable, stop spawning and continue as PM fallback or ask the operator to run the GoalBuddy CLI through their install channel with `agents` or `install`. After one `wait_agent` timeout with no visible allowed-file changes, stop waiting, record the timeout, and recover deterministically instead of waiting forever.

`goal_ledger` / `goal-ledger` is separate from task prompt dispatch. Invoke it only through the Recovery Audit contract; it never receives a task card, returns a `goalbuddy_receipt_v1`, or changes board status.

`goal_keeper` / `goal-keeper` is also separate from task prompt dispatch. Invoke or reuse it through the Board Keeper contract for board inspection and exact PM-authorized mutations. Keep its request compact; the installed agent definition already contains the mutation and validation procedure.

Use `node <skill-path>/scripts/parallel-plan.mjs docs/goals/<slug>` when the user explicitly asks for parallel agent work. It is read-only: it recommends safe Scout/Judge handoffs and Worker handoffs only when write scopes are known and disjoint. It does not mutate `state.yaml`, create sub-goals, apply receipts, or spawn agents.

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
