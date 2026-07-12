# <Goal Title>

## Objective

<User-editable objective. Keep this bounded to the current tranche, not an infinite mission.>

## Original Request

<Shortest faithful copy of what the user asked for. Preserve user-provided plan details here or summarize them under Intake Summary.>

## Intake Summary

- Input shape: `vague | specific | existing_plan | recovery | audit`
- Audience: <beneficiary or unknown>
- Authority: `requested | approved | inferred | needs_approval | blocked`
- Proof type: `test | demo | artifact | metric | review | source_backed_answer | decision`
- Completion proof: <observable signal that closes the full original outcome>
- Goal oracle: <live check, walkthrough, artifact, metric, source-backed answer, or decision that keeps pressure on the goal>
- Likely misfire: <how GoalBuddy could succeed at the wrong thing>
- Blind spots considered: <risks, unstated choices, or success dimensions surfaced during diagnostic intake>
- Existing plan facts: <user-provided steps/files/constraints/sequencing to preserve and validate, or none>

## Goal Oracle

The oracle for this goal is:

`<specific observable signal>`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific | open_ended | existing_plan | recovery | audit`

## Current Tranche

<What is enough for the full owner outcome, and what is the current largest reversible local work package? For execution goals, the default is continuous: discover enough evidence, choose a coherent work package, implement it, verify it, review only at phase/risk/final boundaries, then immediately advance to the next work package until the full original outcome is complete. Plan-only or one-package-only stopping is valid only when explicitly requested.>

## Non-Negotiable Constraints

- <Constraint, safety rule, compatibility rule, or owner preference.>

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

If an exact human approval phrase is the only remaining blocker and no safe local work remains, ask once and stop. Preserve the exact phrase in the blocked receipt as `required_reply`, set `waiting_for_user_approval: true`, set `goal.status: blocked`, and set `active_task: null`. Do not keep posting approval prompts until the user replies.

## Board Health

The PM owns board-health decisions. The Board Keeper performs full-board inspection, repair, and checker execution from the PM's exact request:

```bash
node <skill-path>/scripts/check-goal-state.mjs docs/goals/<slug>
```

If the local board is running, Keeper compares `state.yaml` to the live board API. Keeper repairs only exact PM-authorized GoalBuddy control files and never edits product files.

## Board Mutation Delegation

During `/goal` execution, the PM owns meaning but does not routinely full-read or directly edit the board. Use `goal_keeper` in Codex or `goal-keeper` in Claude Code for every full-board inspection and every mutation. Send one compact `goalbuddy_keeper_request_v1` with the current digest, exact operation, authorized control files, expected before/after facts, and bundled checker command. Reuse one Keeper within an uninterrupted session; its `after_digest` chains into the next operation. Full-board PM review is reserved for the execution contract's explicit recovery escalation.

## Canonical Board

Machine truth lives at:

`docs/goals/<slug>/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/<slug>/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter, and follow the GoalBuddy execution contract (`references/goal-execution.md` in the goal-prep skill) when available.
2. At a genuine recovery boundary, run `node <skill-path>/scripts/resume-board.mjs docs/goals/<slug> --json` and invoke the read-only Goal Ledger Auditor (`goal_ledger` in Codex or `goal-ledger` in Claude Code) with the board path, response digest, checker status, and returned `commands.resume` command. Continue automatically only from an `ok: true` projection with Ledger `congruent` on the same digest. Any failure requires the execution contract's full-board PM review; preserve immutable completed-task history on a current v2 board when the live continuation is independently proven instead of rewriting old receipts. Do not redispatch a possibly in-flight Worker merely because the board says `active`.
3. Start a fresh Keeper from the Ledger-approved digest. During uninterrupted transitions, reuse it and chain each validated `after_digest`; do not rerun recovery or load the full board into PM context.
4. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
5. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
6. Work only on the active board task.
7. Assign Scout, Judge, Worker, or PM according to the task.
8. Write or accept a compact task receipt and decide the exact resulting status, gates, and successor.
9. Give that exact mutation to Keeper; continue only from its passing checker receipt and new digest.
10. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
11. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
12. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
13. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
