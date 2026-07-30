# GoalBuddy Receipt and Task-Card Format, v1

Status: stable, shipped since GoalBuddy 0.4.0. This document specifies the machine-readable format GoalBuddy uses to record delegated agent work: what a task authorized, what actually happened, and what proved it. It is harness-neutral — the format is plain YAML in ordinary repo files, and nothing in it depends on Codex, Claude Code, or any specific agent runtime.

The reference validator is `check-goal-state.mjs`, bundled with the GoalBuddy skill. Everything this spec calls an invariant is machine-enforced by that checker; the rest is convention.

## Files

A goal lives in the target repository:

```text
docs/goals/<slug>/
  goal.md      # human-editable charter: outcome, oracle, constraints
  state.yaml   # machine truth: the board
  notes/       # optional long-form evidence, created on first use
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

A PM-authored Worker task card may additionally supply one path-only just-in-time brief:

```yaml
brief: docs/goals/<slug>/notes/<slice>-execplan.md
```

The locked hydration transition safely opens that repository-local regular file, rejects absolute paths, traversal, backslashes, globs, missing files, non-regular files, and symlinks in any path component, and persists only the exact binding:

```yaml
brief:
  path: docs/goals/<slug>/notes/<slice>-execplan.md
  sha256: <64 lowercase hex>
```

`brief` is optional and Worker-only. Dispatch consumes a persisted binding automatically. An explicit `--brief`/`--brief-sha256` pair remains available for historical or direct dispatch, but when both sources exist they must agree exactly. GoalBuddy verifies the binding before contract construction and re-hashes it immediately before harness launch. Brief contents are context subordinate to the task card; they are not copied into board projections or granted authority.

Invariants:

- Task ids match `T` followed by exactly three digits (`T001`, `T999`). The validator rejects other shapes such as `T001b`; a sibling or follow-up task takes the next free number.
- Exactly one task is `active` per board. Parallel recovery identities use validated depth-one child boards; a worktree alone is byte isolation, not board authority or proof of semantic independence.
- Scout and Judge tasks are read-only. Worker tasks write only inside `allowed_files`. The coordinating PM owns every board decision. Complete canonical decisions use GoalBuddy's digest-bound typed transitions directly; Board Keeper is reserved for inspection, repair, rebinding, ambiguity, and noncanonical control work.

## Receipt envelope

Agents performing a task return a single JSON object:

```json
{ "goalbuddy_receipt_v1": { "result": "done | blocked", "task_id": "<T###>", "board_path": "<path to state.yaml>", "...role fields...": "see below" } }
```

The PM validates the compact dispatch outcome and chooses one explicit queued successor, then invokes the digest-bound typed receipt transition. A successful public dispatch preserves its already-validated full report in private Git-local transport and returns that exact input path plus one apply operation, so the PM does not receive unrelated recovery commands or copy and translate receipt JSON. The transport is not board truth and is removed only after successful atomic application; a rejected transition leaves it available for correction. The receipt's `result` is the sole source of terminal status (`done` or `blocked`); `task_id` and `board_path` are mandatory and must identify the exact active receipt-free source task and board. The transition stores the envelope losslessly, validates the successor before mutation, installs atomically under the per-board lock, and returns before/after digests. Additive evidence fields are retained as inert data: GoalBuddy does not reinterpret them as product approval, security authority, or a new decision vocabulary.

Newly hydrated Worker task cards accept only generic GoalBuddy fields. Product-specific `approval_phrase`, `approval_phrases`, and `boundary_classification` keys are rejected during hydration. Existing historical board text is not migrated or rewritten.

## Receipt shapes by role

`goalbuddy/scripts/receipt-contract.mjs` is the executable source for these shapes. `render-task-prompt.mjs` prints the exact done and blocked examples for the admitted current task. The examples below show the role fields; every terminal receipt also includes `task_id` and `board_path`, and may include self-authored `harness` provenance.

Scout (findings, read-only):

```yaml
receipt:
  result: done
  task_id: T001
  board_path: docs/goals/example/state.yaml
  harness: codex
  summary: "<=120 words>"
  evidence: [<file paths>]
  facts: []
  contradictions: []
  ambiguity_requiring_judge: []
  note_needed: false
```

Judge (decision, read-only). When the decision selects or approves the next Worker task, `worker_package` carries exactly four closed keys — `objective`, `allowed_files`, `verify`, and `stop_if` — that the PM copies onto that Worker's card; otherwise it is null. A Judge cannot place `brief` or any other extra authority in `worker_package`; only PM-authored task-card hydration may bind a brief.

```yaml
receipt:
  result: done
  task_id: T001
  board_path: docs/goals/example/state.yaml
  harness: codex
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
  task_id: T001
  board_path: docs/goals/example/state.yaml
  harness: codex
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
  task_id: T001
  board_path: docs/goals/example/state.yaml
  harness: codex
  blocked_reason: "<why this task cannot finish, e.g. verify blocked by a cause outside allowed_files>"
  changed_files: []
  commands:
    - cmd: npm test
      status: fail
  summary: "<what landed, what is blocked, and where the failure lives>"
  remaining_blockers: ["<what authority or evidence is still required>"]
```

Judge, Scout, and PM blocked receipts likewise include `result: blocked`, identity, and a nonempty `blocked_reason`; the rendered prompt supplies each role's exact additional evidence fields. A completed PM receipt includes a nonempty `summary` and optional evidence. GoalBuddy validates these role/result distinctions at both dispatch extraction and receipt application using the same module; it never normalizes one role's output into another shape.

One cross-role closeout is intentionally separate from those role receipts. After a rejected dispatch, the PM may author only this exact blocked closeout for the active source task:

```yaml
receipt:
  result: blocked
  task_id: T001
  board_path: docs/goals/example/state.yaml
  authored_by: pm
  summary: "<what was attempted and preserved>"
  blocked_reason: "<why the rejected source cannot close normally>"
  remaining_blockers: ["<what remains required>"]
  evidence: ["<reference to the preserved rejected artifact>"]
```

The `pm_blocked_closeout` validator requires all eight displayed keys, nonempty blocker and evidence arrays, and `authored_by: pm`. It cannot claim passing commands, successful Worker scope, Worker authorship, or `result: done`. The rejected artifact remains the closeout's origin evidence; GoalBuddy does not convert its contents into a Worker receipt.

## Optional fields

Any receipt may additionally include:

```yaml
harness: codex | claude-code | <other runtime name>
```

identifying the runtime that performed the task. Boards are portable across harnesses (the format is plain repo files), and this field lets a board's history show which harness produced each receipt after a handoff. Optional and additive — validators must tolerate its absence and its presence.

A receipt may point to long-form evidence through a relative forward-slash `note: notes/<task-id>-<slug>.md` path. The file must exist inside the owning board. An empty `notes/` directory is never required and need not be committed; create it when the first explicit note pointer is written. New receipts may use `note` only in this canonical pointer form. The serialized-board checker preserves pre-contract prose, empty, and external-path `note` values as inert historical evidence so existing boards require no rewrite.

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

## Adjacent transition evidence

Prospective receipt transitions preserve how the exact receipt reached board authority in `task.transition_evidence.receipt_provenance`; this evidence is adjacent to the receipt and is never accepted from an agent-authored receipt:

```yaml
receipt_provenance:
  kind: goalbuddy_receipt_provenance_v1
  receipt_transport: git_local_report # git_local_report | explicit_file
  report_transport: ready # ready | unavailable | not_applicable
  dispatch_disposition: accepted # accepted | rejected | not_applicable
  closeout_authority: original_role # original_role | pm_blocked_closeout
  application_state: applied
  receipt_artifact:
    root: git_common_dir # git_common_dir | repository
    path: goalbuddy/dispatch-reports/<report>/dispatch-report.json
    sha256: <64 lowercase hex>
    retention_policy: cleanup_eligible # cleanup_eligible | retained
  origin_artifact: null
  receipt_value_sha256: <canonical-JSON SHA-256 of the exact receipt value>
```

The transport, dispatch disposition, and closeout authority are orthogonal closed fields. Artifact paths are safely opened non-symlink regular files beneath their declared repository or Git-common-dir root. The receipt value digest uses canonical JSON with recursively sorted object keys and preserved array order. Eligible Git-local transport may be cleaned only after the applied provenance is atomically durable. Cleanup unlinks only the authenticated `dispatch-report.json` and removes its directory only when empty; unrelated sidecars are preserved. Retained explicit, unavailable, rejected, or PM-closeout evidence is not removed.

The PM may preserve an exact unapplied candidate with the digest-bound `goalbuddy hold` transition. A held entry lives in `task.transition_evidence.held_receipts` and has the closed `goalbuddy_held_receipt_v1` shape: task and repository-relative board identity; the admitted state digest; task-authority and nullable dispatch-contract digests; `application_state: held`; the same orthogonal transport and dispatch fields; safely bound `source_artifact` and optional `origin_artifact`; the canonical receipt-value digest; and a `handle` equal to the canonical-JSON SHA-256 of every other held field. Holding does not apply or semantically accept the receipt and does not change task status. Duplicate, stale-task, changed-authority, changed-artifact, malformed, and digest-stale holds fail without mutation. An unselected entry may remain as checked, unapplied history after its task closes; only the later exact-handle transition consumes a selected entry. Historical receipts without prospective terminal fields, provenance, or held evidence remain valid and are not rewritten.

## Final completion proof

Final goal completion uses `goalbuddy complete` with a mandatory expected digest and an identity-bound final Judge or PM receipt containing `result: done`, `decision: complete`, and `full_outcome_complete: true`. Prospective final receipts must also supply all four terminal proof fields together:

```yaml
completion_disposition: exact # exact | accepted_deviation
accepted_deviations: []
deviation_acceptance: null
final_review:
  status: complete
  artifact: {path: "<repository-relative JSON>", sha256: "<exact file SHA-256>"}
  workflow_version: "<nonempty workflow identity>"
  scope:
    kind: goalbuddy_review_scope_v1
    patterns: ["<closed exact path or bounded terminal /** tree>"]
  base_identity: {kind: git_commit, value: "<review base identity>"}
  reviewed_identity: {kind: git_commit, value: "<exact reviewed identity>"}
  completeness_status: complete
```

`completion_disposition: exact` requires an empty deviation set, null acceptance, and the `complete` final-review branch. The safely opened `goalbuddy_final_review_v1` artifact repeats the workflow version, scope, identities, completeness status, `decision: complete`, and an empty `unresolved_blocking_findings` array. Receipt and artifact fields must deep-equal, the artifact byte digest must match, and the closed review scope must cover the exact union of changed product paths from every completed Worker receipt on the checked root and child boards. That Worker-history union is the coverage oracle; receipt and review artifact locations cannot subtract from it, and receipt-supplied `base_identity` cannot add, remove, or hide required paths. For a genuinely read-only goal with no completed Worker product paths, the union is empty and the coverage condition is vacuously satisfied; the declared review itself must still be complete and exact-current. GoalBuddy control bytes under `docs/goals/` are excluded from scoped product identities even when a bounded scope such as `docs/**` contains that subtree, so an atomic board transition cannot stale its own product review. Immediately before completion, GoalBuddy recomputes the exact current scoped identity. The checker repeats the artifact, coverage, owner-acceptance, and current-identity validation on every prospective completed board, so later deletion or product drift makes the board checker-red. A stale product identity, incomplete coverage, incomplete review, unresolved blocker, unfinished sibling, or non-done child fails closed.

An owner may instead accept one complete ordered deviation set. Each entry contains a unique `requirement_id`, requirement, observed shortfall, reason, and nonempty evidence. The set digest is the canonical-JSON SHA-256 of the entire ordered array, so adding, removing, editing, or reordering any entry invalidates acceptance. The PM first enters the existing exact-human wait with exactly:

```text
approve GoalBuddy deviation set <sha256>
```

`deviation_acceptance` must locate that persisted exact reply by task id and reply index and repeat the same set digest. This is whole-set owner acceptance, not per-entry approval and not a Judge-created assertion. If the accepted set does not include `exact-final-review`, the complete exact-current final-review branch is still required. Only when exactly one accepted deviation has `requirement_id: exact-final-review` may `final_review.status` be `accepted_deviation`; that closed branch binds the same set digest and may retain only an optional safely hashed `observed_artifact` with a runtime-derived failure class. It records an owner-approved missing requirement and never represents the review as current or complete. There is no `not_required` branch.

The completion transition atomically records the final receipt and its adjacent provenance, sets `goal.status: done`, and clears `active_task` while preserving task-level transition evidence. Every official state mutation is serialized by one stable per-board lock held across the fresh read, digest check, candidate validation, rename, and directory fsync. A competing same-digest writer fails closed and must recover from a fresh resume projection; it cannot overwrite the accepted receipt. Invalid, stale, wrong-task, non-audit, incomplete, duplicate, and replayed completion requests cannot mutate the board.

These hashes prove internal consistency and drift under GoalBuddy's PM-owned local-state trust boundary; they are not cryptographic authorship attestations against another process running as the same operating-system user. Stronger authorship would require an external signing or protected authority and is outside this format.

For a reviewed version 2 board whose only checker errors are frozen completed-task history, the PM may explicitly add `--allow-immutable-history`. Admission requires an identical pre/post checker-error multiset, exactly one already-done task ID per error, and byte-identical raw YAML for every referenced task. Global, live-tail, new, changed, ambiguous, or malformed errors fail closed. A successful report uses `checker_status: immutable_history_compatible` and carries only a compact error digest/count and preserved task IDs; it does not rewrite receipts or claim that the raw checker passed.

`goalbuddy rebind` is the sole typed mutation for `checks.goalbuddy_binding`. It requires the expected board digest, an exact seven-field binding JSON object, a clean source checkout at the accepted commit, matching source-checker bytes, and one or more byte-identical installed checker paths. It changes no task or other control field and uses the same lock, checker, and optional immutable-history proof as receipt transitions.

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
