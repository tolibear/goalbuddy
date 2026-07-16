# Adaptive Execution Strategy

Design rationale for the policy upgrade landed in
`goalbuddy/references/goal-execution.md` (section "Adaptive Execution
Strategy"), `goalbuddy/templates/goal.md` (charter "Execution Strategy"
section), and the Codex Goal Compiler's adaptive-strategy reference. This is a
focused policy upgrade, not a GoalBuddy redesign: `state.yaml`, the checker,
Ledger, statuses, receipts, and the parallelism model are unchanged. Complete
canonical transitions are deterministic runtime operations; Keeper remains the
exceptional inspection, repair, rebinding, and noncanonical-control role.

## Problem

The user gives the Goal Compiler a plan, specification, or large product
objective and invokes nothing else. Before this upgrade, the execution
contract defined safe execution (board truth, recovery, receipts, atomic
mutations) but reviewed mainly at phase/risk boundaries and carried no durable
description of the preferred quality strategy: when to author or revise a
slice plan, when to harden it independently, what review depth a diff
deserves, and when a delegated Judge suffices. The desired posture — for long
autonomous product development, plan hardening and independent review are used
more often, not less — lived only in operator habit.

## Evidence

Two long production runs in the `trading` repository established the pattern
(transcripts `ddeeb016-4b5f-4d68-a71d-04baafc80635` and
`87833fbc-0353-42ab-8d7f-8fc95ee8da06`; both verified against the design brief
line by line before this spec was written):

- Macro board of vertical slices; the lead authored detailed, self-contained
  slice plans just in time, not the whole program upfront.
- Bounded workers implemented; the lead reviewed every resulting diff itself
  and additionally ran independent review workflows for adversarial evidence.
- Plan hardening caught real decision-level defects before implementation: a
  false assumption about an external config model, an unimplementable health
  digest, an authority contradiction in an execution design.
- Evidence discipline paid off: a "successful" build was rejected because its
  evidence was invalid; the proof contract was strengthened and the rebuilt
  slice passed. An independent Judge later caught a production cutover defect
  that 137/137 passing tests missed.
- A standalone simplification pass caught a real regression introduced by a
  review-fix batch.
- When review infrastructure failed mid-fleet, the completed builds were
  preserved and only the review layer was retried, canary first.

## Decisions

1. The compiler emits durable macro structure plus an adaptive execution
   strategy — principles and available capabilities, never a pre-scheduled
   sequence of tool calls. The PM chooses planning horizon, review depth,
   simplification cadence, and implementation topology at each seam.
2. Two independent risk axes justify planning and review: decision risk
   (ambiguity, architecture, competing approaches, unverified assumptions,
   authority/money/data-model seams) and execution risk (blast radius,
   integration breadth, long autonomous duration, difficult verification).
   Either alone is sufficient; a conceptually simple but enormous migration
   still needs hardening.
3. Materiality is categorical, not felt: auth, money, permissions, migrations,
   data integrity, public contracts, irreversible actions, and meaningful
   interaction changes are automatically material; copy and small styling
   changes are not; unsure defaults to material. Charters may refine the list,
   never replace it with confidence.
4. Material slices normally receive the full quality ladder: hardened plan →
   bounded Worker implementation → PM diff review → independent implementation
   review → adjudicated fixes → verification → receipt. Downward deviations on
   material slices are recorded in PM-owned evidence — the next phase-gate or
   final-audit receipt the PM authors — no board notes, no new schema fields.
   Worker receipt `deviations` keeps its receipt-spec meaning (the Worker's
   own in-scope judgment calls) and subagent receipts pass losslessly to the
   deterministic typed transition.
   PM confidence alone never justifies a skip.
5. Independent implementation review and the GoalBuddy Judge are distinct:
   review produces adversarial evidence about a plan or diff; Judge holds
   board-level decision authority at phase/risk/ambiguity/rejection/final
   gates. Neither substitutes for the other. Lead vs delegated Judge routing
   is behavioral (escalate when a finding would change board structure, a
   task's authority model, or the owner contract); model identity is runtime
   routing, never board data.
6. Capabilities are semantic — plan hardening, implementation review,
   simplification — mapped per harness (Claude: Workflow Plan/Review/Simplify;
   Codex: Omega Plan/Review/Simplify). Boards record compact outcome,
   disposition, and artifact path; complete reports stay in native locations.
7. Evidence binds to the exact artifact, scope, workflow version, and
   completeness status, and goes stale when any relevant input changes (a
   review launched before a plan edit refutes text that no longer exists).
   Cross-harness reuse is allowed only with an unchanged binding.
8. A completion claim alone is not proof; receipts backed by exact commands
   and inspectable artifacts are evidence, and important claims still receive
   independent verification. Proof contracts tighten at runtime, never
   silently loosen. Decisive verification proves the exact current bytes —
   forced run, isolated worktree, or content-addressed cache; the mechanism is
   harness-local, the outcome is contract.
9. Implementation is durably checkpointed before independent review.
   Gate-infrastructure failure never invalidates the implementation artifact:
   preserve the checkpoint, retry only the gate, canary before relaunching a
   fleet.
10. Transient quota/timing conditions are scheduling inputs and never board
    truth; durable safety constraints discovered at runtime may enter board
    truth.

## Rejected alternatives

- Board-note skip diary (one note per skipped rung): recreates prose
  bookkeeping; replaced by charter-defined materiality plus PM-owned
  closeout evidence.
- Recording PM ladder reductions in the Worker receipt `deviations` list:
  contradicts the verbatim-receipt rule and receipt-v1 semantics, where
  `deviations` is Worker-owned (in-scope judgment calls against the task
  text). A PM cannot honestly append its own orchestration decision to a
  subagent's receipt.
- "Worker self-report is never evidence": overbroad — a structured receipt
  with inspectable artifacts is evidence; the retained rule is that the claim
  alone is not.
- Decision risk as the sole primary planning trigger: under-serves huge
  mechanical migrations; replaced by the two-axis model.
- Encoding `--force` (or any specific cache-busting mechanism) as contract:
  wrong altitude; the portable invariant is proving the exact current bytes.
- Route re-statement as board content: stays ephemeral dispatch text (already
  mandated by the operator's global instructions).
- New statuses, quality-tier schema fields, Keeper operations, workflow agent
  roles, or historical-board migrations: unnecessary; the runtime already
  supports the policy.
