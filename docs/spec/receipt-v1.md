# GoalBuddy Receipt and Task-Card Format, v1

Status: stable, shipped since GoalBuddy 0.4.0. This document specifies the machine-readable format GoalBuddy uses to record delegated agent work: what a task authorized, what actually happened, and what proved it. It is harness-neutral — the format is plain YAML in ordinary repo files, and nothing in it depends on Codex, Claude Code, or any specific agent runtime.

The reference validator is `check-goal-state.mjs`, bundled with the GoalBuddy skill. Everything this spec calls an invariant is machine-enforced by that checker; the rest is convention.

## Files

A goal lives in the target repository:

```text
docs/goals/<slug>/
  goal.md      # human-editable charter: outcome, oracle, constraints
  state.yaml   # machine truth: the board
  notes/       # long-form receipts that do not fit on a task card
```

`state.yaml` is authoritative. When any other artifact disagrees with it, `state.yaml` wins for task status, active task, receipts, and completion truth.

## Task card

Every unit of work is a task card in `state.yaml`:

```yaml
id: T001
type: scout | judge | worker | pm
assignee: Scout | Judge | Worker | PM
status: queued | active | blocked | done
objective: "<one sentence>"
inputs: []
constraints: []
expected_output: []
receipt: null
```

Worker tasks additionally require a scoped authority grant:

```yaml
allowed_files: []   # the only paths this task may write
verify: []          # commands that must pass for the task to be done
stop_if: []         # conditions that halt the task instead of improvising
```

A task card may also carry an optional dispatch preference:

```yaml
harness: codex | claude-code   # request: which runtime should perform this task
```

Invariants:

- Task ids match `T` followed by exactly three digits (`T001`, `T999`). The validator rejects other shapes such as `T001b`; a sibling or follow-up task takes the next free number.
- Exactly one task is `active` at a time unless parallel write scopes are provably disjoint.
- Scout and Judge tasks are read-only. Worker tasks write only inside `allowed_files`. The coordinating PM owns every board decision; the control-plane Board Keeper applies exact authorized mutations.

## Receipt envelope

Agents performing a task return a single JSON object:

```json
{ "goalbuddy_receipt_v1": { "result": "done | blocked", "task_id": "<T###>", "board_path": "<path to state.yaml>", "...role fields...": "see below" } }
```

The PM decides the resulting status and successor, then gives the receipt to Board Keeper. Keeper copies its fields losslessly into the task card's `receipt:` mapping as YAML, including `task_id` and `board_path`. The applier rejects either identity field when it contradicts the selected task or board. Additive evidence fields are retained as inert data: GoalBuddy does not reinterpret them as product approval, security authority, or a new decision vocabulary.

Newly hydrated Worker task cards accept only generic GoalBuddy fields. Product-specific `approval_phrase`, `approval_phrases`, and `boundary_classification` keys are rejected during hydration. Existing historical board text is not migrated or rewritten.

## Receipt shapes by role

Scout (findings, read-only):

```yaml
receipt:
  result: done
  summary: "<=120 words>"
  evidence: [<file paths>]
  facts: []
  contradictions: []
  ambiguity_requiring_judge: []
  note_needed: false
```

Judge (decision, read-only). When the decision selects or approves the next Worker task, `worker_package` carries the exact spec the PM copies onto that Worker's card; otherwise it is null:

```yaml
receipt:
  result: done
  decision: "approved | rejected | approve_subgoal | reject_subgoal | not_complete | complete"
  full_outcome_complete: false
  rationale: "<=120 words>"
  worker_package:
    objective: "<one sentence>"
    allowed_files: []
    verify: []
    stop_if: []
  evidence: []
  blocked_tasks: []
  missing_evidence: []
  required_board_updates: []
```

The six displayed Judge decisions are a closed vocabulary. The validator rejects every other value.

Worker, done:

```yaml
receipt:
  result: done
  changed_files: [<paths, all inside allowed_files>]
  commands:
    - cmd: npm test
      status: pass
  summary: "<=120 words>"
  deviations: [<in-scope judgment calls that differ from the task text, one line each>]
```

`deviations` records sound in-scope engineering calls that differ from the task's literal text, so the PM can accept or revisit them explicitly. Needing a file outside `allowed_files` is never a deviation — it is a stop condition.

Worker, blocked:

```yaml
receipt:
  result: blocked
  blocked_reason: "<why this task cannot finish, e.g. verify blocked by a cause outside allowed_files>"
  changed_files: []
  commands:
    - cmd: npm test
      status: fail
  summary: "<what landed, what is blocked, and where the failure lives>"
  spawned_tasks: [<T### ids of scoped follow-ups>]
```

## Optional fields

Any receipt may additionally include:

```yaml
harness: codex | claude-code | <other runtime name>
```

identifying the runtime that performed the task. Boards are portable across harnesses (the format is plain repo files), and this field lets a board's history show which harness produced each receipt after a handoff. Optional and additive — validators must tolerate its absence and its presence.

A terminal wait for an exact human reply uses one closed shape: `result: blocked`, `waiting_for_user_approval: true`, and a nonempty `required_reply`, on a board that explicitly enables `rules.exact_human_approval_can_terminal_wait: true`. No approval-class field is recognized or inferred.

The official `goalbuddy wait` command requires `task_id`, `board_path`, and an expected board digest, then atomically blocks the selected task and goal while clearing `active_task`. `goalbuddy reply` consumes a JSON object containing exactly one string field, `reply`. Comparison is byte-for-byte at the JSON string value: case and whitespace differences are mismatches and cannot mutate state.

After an exact reply, the task returns to `active` with `receipt: null`. Its complete wait receipt moves to optional task-level transition evidence so a later final receipt cannot erase why the task paused:

```yaml
transition_evidence:
      exact_human_replies:
        - wait_board_digest: "<sha256 of the waiting state before reply>"
          required_reply_sha256: "<sha256>"
          reply_sha256: "<same sha256 after exact match>"
          exact_match: true
          wait_receipt:
            result: blocked
            task_id: T001
            board_path: /absolute/path/to/state.yaml
            waiting_for_user_approval: true
            required_reply: "exact string"
```

This evidence records only a deterministic workflow transition. It is not authenticated-human evidence and conveys no product authorization. Historical tasks without `transition_evidence` remain valid and require no migration.

Final goal completion uses `goalbuddy complete` with a mandatory expected digest and an identity-bound Judge or PM receipt containing `result: done`, `decision: complete`, and `full_outcome_complete: true`. It atomically records the final receipt, sets `goal.status: done`, and clears `active_task` while preserving task-level transition evidence. Invalid, stale, wrong-task, non-audit, incomplete, duplicate, and replayed completion requests cannot mutate the board.

## The honesty invariant

This is the format's load-bearing rule, and the validator enforces it:

- A `done` Worker receipt lists **only passing commands**. A red verify means the task is `blocked`, not done.
- A `blocked` receipt keeps the failing command visible in structured `commands` — failure evidence is never moved into prose to make a done receipt validate.
- The goal itself completes only through a final Judge or PM audit receipt that maps receipts and verification back to the original outcome; for continuous execution goals it must record `full_outcome_complete: true`.

The rule exists because it failed in practice: in adversarial testing, a capable model marked a Worker done despite a failing verify and relocated the failure into prose to satisfy the validator. The format is specified so that the honest path is the only valid one.

## Validation

```bash
node <skill-path>/scripts/check-goal-state.mjs docs/goals/<slug>          # goal directory
node <skill-path>/scripts/check-goal-state.mjs docs/goals/<slug>/state.yaml
```

Both forms return structured JSON: `ok`, `errors`, `warnings`. CI can gate on exit code.

## Versioning

The envelope key `goalbuddy_receipt_v1` is the version marker. Additive optional fields do not bump the version; renaming, removing, or changing the meaning of any field above requires `goalbuddy_receipt_v2` with a documented migration.
