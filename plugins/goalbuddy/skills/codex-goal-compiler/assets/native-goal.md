<!-- codex-goal-compiler:native-goal:v1 -->
# <Goal Title>

## Objective

<One bounded, outcome-first statement describing what must be true when this goal is complete.>

## Context Handoff

- **Why this goal now:** <short explanation>
- **Current state:** <what already exists or has already been completed>
- **Starting point:** <where Codex should begin>
- **Agreed decisions:**
  - <decision to preserve>
- **Labeled assumptions:**
  - <assumption, or `None`>

## Definition of Done

- [ ] <observable completion criterion>
- [ ] <observable completion criterion>
- [ ] <required final validation, artifact, or decision>

**Final proof:** <specific evidence that closes the full goal>

**False-positive completion to avoid:** <how Codex could appear done while missing the real outcome>

## Scope and Non-Goals

### In scope

- <allowed work>

### Out of scope

- <excluded work>

## Constraints and Permissions

- <non-negotiable technical, product, safety, compatibility, or owner constraint>
- Routine local, reversible work inside the stated scope is authorized unless repository instructions say otherwise.
- Ask before destructive, irreversible, externally visible, credential-sensitive, production, billing, deployment, publication, or material scope-expanding actions.

## Source of Truth

Use these sources in order:

1. <accepted plan, completed board, review artifact, issue, conversation decision, or repository instruction>
2. <supporting source>

If sources conflict, preserve higher-priority instructions and the latest explicit user decision. Do not reopen accepted decisions without new evidence.

## Execution Guidance

- Start with: <first responsible action or inspection>
- Preserve: <accepted decisions, public behavior, interfaces, or invariants>
- Work in the largest coherent, safe, reversible slice that moves the goal.
- Do not stop after planning or discovery when safe authorized implementation or remediation remains.

### Accepted plan or sequence

1. <phase or step>
2. <phase or step>
3. <phase or step>

If an accepted plan file is listed under Source of Truth, follow it rather than recreating it. Amend the plan only when current evidence exposes a material problem; record the amendment in the Decision Log.

## Verification and Feedback Loop

- **Fast feedback:** <targeted test, check, metric, review, or artifact inspection used during work>
- **Broad/final verification:** <final test suite, real-surface QA, evidence audit, or acceptance review>
- **Fallback evidence:** <honest proxy if the authoritative environment is unavailable, including its limits>
- **Progress rule:** update Progress after meaningful work and ground completion claims in observed evidence.

Do not weaken tests, redefine the goal, remove required coverage, manipulate a scorer, or use a superficial artifact to make the goal appear complete.

## Living Record

### Progress

- [ ] Goal initialized from the agreed context.
- [ ] <first meaningful milestone>
- [ ] Final verification and cleanup complete.

### Discoveries

- None yet.

### Decision Log

- **Initial:** Preserved the decisions and constraints recorded above.

### Attempts and Cleanup

- Record failed or superseded approaches that leave artifacts or affect the final review.
- Before completion, remove temporary work and inspect the final diff/artifacts for abandoned attempts.

### Outcome and Retrospective

- Complete this section at the end with the achieved outcome, evidence, remaining limitations, and follow-up work that is outside this goal.

## Stop and Ask Rules

- Continue until every Definition of Done item is satisfied or an exact blocker prevents further safe work.
- Ask only when a user decision, approval, credential, destructive action, or material scope change is required.
- If one slice is blocked, continue other safe in-scope work when it still advances the goal.
- If the work grows beyond one honest standalone goal, keep this goal bounded and recommend a separate GoalBuddy board or follow-up goal; do not silently create board state.
- Before finishing, run final verification, review the complete result, and clean up failed or obsolete attempts.

## Run Command

```text
/goal Follow docs/codex-goals/<slug>/goal.md.
```
