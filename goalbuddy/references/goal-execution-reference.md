# GoalBuddy Exceptional Recipes

This file is non-normative syntax for exceptional operations. Load only the named recipe triggered by the execution kernel. The kernel remains authority when wording conflicts.

## Child-board recipe

Implements **One write frontier and child boards**. Use `parallel-plan` with the root board's current expected state digest before creating or launching concurrent product-writing lanes. Each lane gets a depth-one child board, one active task, a distinct board home, and structured scope. Do not create multiple active tasks on one board.

```bash
node <skill-path>/scripts/parallel-plan.mjs docs/goals/<slug> --expected-state-digest <sha256> --json
```

Apply the returned plan only if every lane remains pairwise disjoint and the integration order is understood. Otherwise serialize the work.

## Worktree board-home recipe

Implements **One write frontier and child boards**. The branch/worktree owns product bytes; the child board owns recovery identity. Record the exact repository root, worktree, branch, child-board path, and scope in the lane plan. A worktree never substitutes for a child board or semantic-coupling review.

## Immutable-history recovery

Implements **Recovery triggers** and **Exact receipts and proof**. Do not rewrite historical done-task bytes. First run normal resume. If its checker errors are confined to byte-identical completed task blocks, use the bundled immutable-history proof path with the exact expected digest. Any changed history, live-tail/global/new error, ambiguous task attribution, stale digest, or malformed current task fails closed to PM review.

Prompt rendering after explicit authorization uses:

```bash
node <skill-path>/scripts/render-task-prompt.mjs docs/goals/<slug> \
  --expected-state-digest <sha256> --allow-immutable-history --json
```

## Exact-human wait and reply

Implements **Typed transitions and exceptional Keeper work**. Use the typed wait transition only when the exact human reply is the sole remaining blocker. Record the exact required reply; queued dependents remain inert. A reply transition accepts only that exact string and does not interpret approval classes or intent.

Use the digest-bound command emitted by the preceding transition. Never hand-edit `waiting_for_user_approval`, `required_reply`, or the successor.

## Role receipt examples

Implements **Exact receipts and proof**. The executable source is `scripts/receipt-contract.mjs`; the exact current task's done and blocked examples are printed by `render-task-prompt.mjs`. Do not maintain copied static JSON schemas here or in help text. Return one of those shapes with truthful values.

## Amendment and hydration

Implements **Worker authority and stop conditions**. Prose alone never expands authority. Before dispatch, use the typed amendment or hydration operation to materialize objective, inputs, `allowed_files`, `verify`, and `stop_if` atomically. If work already revealed an out-of-scope need, close the active task blocked and amend or hydrate a fresh successor; never retroactively widen the writer.

```bash
node <skill-path>/scripts/apply-receipt.mjs docs/goals/<slug> \
  --expected-state-digest <sha256> --receipt receipt.json --activate T002 --json
```

Use `--add-tasks task-cards.json` or `--hydrate-task T###` only through the exact command returned by the current projection/transition and the CLI's current help. Do not embed long task payloads in prose.

## Keeper request and runtime rebind

Implements **Typed transitions and exceptional Keeper work**. Send one `goalbuddy_keeper_request_v1` containing the exact board path/digest, authorized control files, operation, instructions, expected before/after facts, checker command, and a fully specified transition shape. For `rebind_goalbuddy`, set `transition: null` exactly. For non-transition inspection or repair, follow the Keeper agent's installed schema; do not invent an all-null transition object.

Keeper returns `goalbuddy_keeper_receipt_v1`. It may inspect or mutate only authorized GoalBuddy control files, must run the checker, and must revert its own failed mutation. It never changes product files or semantic authority.

## Dispatch failure recovery

Implements **Dispatch and exact-session continuation**.

- Stale digest or non-current task: rerun the returned recovery projection; do not launch.
- Scope/control violation: preserve evidence, do not repair the receipt, and escalate the actual unauthorized write.
- First schema-invalid receipt with clean scope and exact bound Codex session: the dispatcher itself may perform its single zero-write receipt repair.
- Repair unavailable or failed: inspect preserved product work; do not fabricate proof, resume merely to rewrite a receipt, clear the binding, or silently launch a fresh Worker.
- Changed task authority: close the old task with a truthful blocked receipt and activate a fresh successor.
- Possible live Worker: confirm terminal liveness before exact-session resume or replacement.
- Candidate checker rejection: board bytes remain uninstalled; repair only the reported control decision.

Use the one `next_action` and immediately relevant digest-bound commands in the public failure report. Avoid broad recovery probing.

## Failure-specific recovery

Implements **Recovery triggers**. Start with the compact projection and Ledger audit. Direct full-board review is justified only by an explicit discrepancy, uncertainty, failed/unavailable audit, malformed live state, or named historical evidence. Preserve immutable history, product WIP, session identity, and owner gates while resolving the smallest actual inconsistency.
