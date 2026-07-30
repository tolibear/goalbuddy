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

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle, records `full_outcome_complete: true`, and supplies exact-current complete review proof. If that review requirement itself cannot be met, the only substitute is whole-set owner acceptance that explicitly includes the missing `exact-final-review` requirement.

## Goal Kind

`specific | open_ended | existing_plan | recovery | audit`

## Current Tranche

<What is enough for the full owner outcome, and what is the current largest reversible local work package? For execution goals, the default is continuous: discover enough evidence, choose a coherent work package, implement it, verify it, apply the Execution Strategy's quality ladder, then immediately advance to the next work package until the full original outcome is complete. Plan-only or one-package-only stopping is valid only when explicitly requested.>

## Execution Strategy

<Compiled adaptive strategy for this goal. The execution contract's Adaptive Execution Strategy section governs; this section instantiates it. Describe capabilities semantically and do not pre-schedule tool calls.>

- Planning horizon: `upfront | just_in_time | hybrid` — <default for this goal and why>
- Normal quality ladder for material slices: hardened plan → bounded Worker implementation → PM diff review → independent implementation review → adjudicated fixes → verification → receipt.
- Materiality: auth, money, permissions, migrations, data integrity, public contracts, irreversible actions, and meaningful interaction changes are automatically material; copy tweaks and small styling changes are not. <Goal-specific additions or refinements.> When unsure, treat the slice as material.
- Risk triggers: decision risk (ambiguity, architecture, competing approaches, unverified external assumptions) or execution risk (blast radius, integration breadth, long autonomous duration, difficult verification) — either axis alone justifies planning and independent review.
- Capabilities are semantic — plan hardening, implementation review, simplification — and each harness maps them to its native workflows. Receipts record outcome, disposition, and artifact path, never full reports.
- Downward deviations from this ladder on a material slice are recorded in the PM's own evidence at the next phase-gate or final-audit receipt, never appended to a Worker receipt; PM confidence alone never justifies one.
- For material work, Fable/PM owns slice strategy; current-repository research when useful; JIT ExecPlan and Codex operator-prompt authoring or approval; full product-diff review; independent-review selection and adjudication; direct decisive-screenshot inspection for UI-visible work; unexpected-write and scope decisions; review convergence; accepted-deviation judgment; and final acceptance. A checker, test, Worker claim, receipt, or native task completion is evidence, not semantic completion.

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

During `/goal`, the PM owns meaning. Ordinary reviewed closeout uses GoalBuddy's explicit-source `advance`: the PM chooses the exact source or held handle, closeout authority, successor, and optional approved task card; GoalBuddy derives control evidence, installs atomically, and returns the next semantic frontier without a caller-supplied digest. Other complete canonical decisions use the digest-bound CLI for structural amendment, standalone hydration, exact-human wait/reply, optional held-receipt preservation, and final completion. Holding preserves evidence across interruption; it does not accept it or change status.

Keeper is exceptional, never ordinary closeout. Use `goal_keeper` in Codex or `goal-keeper` in Claude Code only when board inspection, repair, rebinding, ambiguity, or a noncanonical mutation is required. The PM may directly apply one already-known, one-location scalar or annotation only when the semantic frontier or latest validated receipt supplies exact old/new values, no board read is needed, and the bundled checker immediately passes. A Claude native task list may mirror execution, but it is optional ephemeral projection and never board truth; discard and rebuild it from the frontier on conflict.

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

1. Read this charter and the installed GoalBuddy execution kernel, then run `node <skill-path>/scripts/frontier.mjs docs/goals/<slug> --json`. Treat `goalbuddy_frontier_v1` as navigation, not proof; inspect every exact plan, full diff, review, receipt, or screenshot needed for the current semantic decision.
2. At genuine new-session or post-compaction uncertainty or another recovery trigger, run `resume-board.mjs` and invoke the read-only Goal Ledger Auditor. Continue automatically only from an `ok: true` projection with Ledger `congruent` on the same digest; otherwise perform the kernel's full-board recovery review. Do not redispatch a possibly in-flight Worker merely because the board says `active`.
3. Keep routine successful GoalBuddy control-plane mechanics backstage. User updates describe product progress, reviews, real blockers, required decisions, and completion evidence.
4. Re-check the intake, oracle, likely misfire, and current repository truth. Work only on the frontier's active task.
5. Choose the largest safe slice and assign Scout, Judge, Worker, or PM. For material work, author or approve the JIT plan and exact Codex operator prompt before implementation.
6. Inspect the full product diff and verification, select and adjudicate independent review, directly inspect decisive UI screenshots, decide unexpected writes or scope changes, and continue repair/review until Fable/PM judges convergence.
7. Choose the exact reviewed receipt source or held handle, legal closeout authority, successor, and any approved task card. Invoke explicit-source `advance`; if no legal successor exists, follow final completion and never invent one. Use Keeper only for exceptional inspection, repair, rebinding, ambiguity, or noncanonical mutation.
8. Continue from the frontier returned by `advance`. If safe local work remains, choose the next largest reversible package and continue unless blocked.
9. Apply one-location edits only under the kernel's exact-context and checker rules. Use the other canonical typed transitions for amendment, waits/replies, held evidence, and final completion.
10. If a problem or follow-up should become a repo artifact, create an approved issue/PR or ask the operator.
11. Apply independent implementation review to every material slice; use Judge gates at phase, risk, rejected-verification, ambiguity, or final-completion boundaries. Do not add a Judge after every Worker by habit, and do not skip independent review on a material slice on confidence alone.
12. Finish only after Fable/PM's final acceptance and a Judge/PM audit maps exact-current evidence to the original outcome, records `full_outcome_complete: true`, and supplies all terminal proof fields. Exact completion needs a complete final review. Accepted deviations require one persisted owner reply binding the complete ordered set; a missing exact review must be the `exact-final-review` deviation, never `not_required`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
