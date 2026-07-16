---
name: goal-prep
description: "Explicit Goal Prep backend for GoalBuddy. Use only when the user explicitly invokes $goal-prep or /goal-prep, or when Codex Goal Compiler explicitly loads it after accepting a decision-complete source contract. Prepares or repairs structured /goal intake, goal.md, state.yaml, notes, role-tagged tasks, receipts, and the starter command. Decision-complete new-board compilation belongs to Codex Goal Compiler; generic route selection is outside Goal Prep."
disable-model-invocation: true
user-invocable: true
---

# Goal Prep

`$goal-prep` (Codex) or `/goal-prep` (Claude Code) prepares a GoalBuddy board. It does not start `/goal` automatically, but the board and starter `/goal` command must be shaped so the next run continues into safe execution by default.

GoalBuddy is for autonomous, long-running Codex or Claude Code work where the PM thread may need to discover the work, define tasks, sequence them, delegate them, execute them, verify them, and keep going without the human decomposing every step.

The loop is:

```text
raw user intent -> intake compiler -> goal oracle -> local work surface -> one active task -> receipt -> proof loop -> repeat
```

GoalBuddy's core invariant is:

```text
Intent -> Oracle -> Surface -> Loop -> Proof
```

No oracle, no serious goal. A goal oracle is the observable signal that tells the PM whether the original owner outcome is actually true yet. It may be a test suite, browser walkthrough, demo transcript, generated artifact, benchmark, source-backed answer, release check, or final human decision. Weak proof creates weak goals, so record the oracle before shaping tasks and keep testing against it until final completion.

## Invocation Boundary

Goal Prep is an explicit or compiler-internal backend, not a general routing or compilation front door. Do not select it implicitly for generic goalization, route selection, or board-compilation requests. Decision-complete new-board compilation belongs to Codex Goal Compiler. After the compiler accepts its source contract, it may explicitly load this `SKILL.md` as its declared board-preparation dependency. Direct `$goal-prep` or `/goal-prep` invocation remains supported for users who intentionally want interactive GoalBuddy intake or board repair.

There are two different modes:

- `$goal-prep`: prepare intake, `goal.md`, `state.yaml`, and the starter `/goal` command, then stop.
- `/goal Follow docs/goals/<slug>/goal.md.`: execute the board, including Scout/Judge/Worker work.

This boundary is strict. `$goal-prep` is not a lightweight `/goal` or a competing public compiler; it is GoalBuddy's schema-bound board-preparation and repair backend.

This document is the prep-mode contract plus the shared board model. The `/goal` execution contract lives in `references/goal-execution.md` next to this file; read it at the start of every `/goal` run. If it cannot be read, these execution invariants still hold: `state.yaml` is board truth; each board has at most one active task; explicitly requested parallel lanes use depth-one child boards and the bundled `parallel-plan` safety projection; Scout and Judge tasks are read-only; Worker tasks write only inside `allowed_files` and run their `verify` commands; the PM owns semantic board decisions, complete canonical decisions use the direct digest-bound atomic CLI, and Board Keeper handles exceptional inspection, repair, rebinding, ambiguity, and noncanonical mutations; every completed, blocked, or escalated task gets a receipt; the goal completes only through a final Judge or PM audit that maps receipts and verification back to the original outcome (recording `full_outcome_complete: true` for continuous execution goals). Routine successful board, Keeper, Ledger, digest, receipt, checker, prompt-rendering, and polling mechanics stay out of user-facing updates; report product progress instead, and surface mechanics only when the user asks, recovery is incongruent, the runtime is the real blocker, an exact board action is required, or final harness completion needs one concise proof marker.

During a `$goal-prep` turn, do not perform the user's requested work, even if the work looks read-only, preparatory, or obviously useful. Do not refresh or load named skills, inspect implementation files, browse reference repos, research design inspiration, generate design plans, generate images/assets, run app-specific checks, or edit product files. Put those actions into Scout, Judge, Worker, or PM tasks for the later `/goal` run.

Allowed `$goal-prep` actions:

- run the GoalBuddy CLI provenance check to confirm verified local-checkout ownership;
- ask diagnostic intake questions and wait when required;
- create or repair only `docs/goals/<slug>/goal.md`, `docs/goals/<slug>/state.yaml`, `docs/goals/<slug>/notes/`, and the generated `.goalbuddy-board/` visual board artifact;
- create and open the built-in local GoalBuddy board surface for the goal unless the user opts out;
- optionally run the GoalBuddy board checker against that `state.yaml`;
- verify GoalBuddy agent availability, if this can be done without touching implementation work, and record `installed`, `bundled_not_installed`, `missing`, or `unknown` truthfully;
- print exactly `/goal Follow docs/goals/<slug>/goal.md.`;
- for direct invocation, ask whether to start `/goal`, refine the board, or stop; for compiler-internal invocation, return the board result to the compiler without another question or user-facing checkpoint.

If the prompt names another skill or tool, such as "use the taste skill", "refresh the taste skill", "look at this repo", "use browser", or "generate assets", record that requirement in the charter and seed tasks. Do not load that skill, browse that repo, or generate those assets during `$goal-prep`.

## Update Check

At the start of a `$goal-prep` turn, read GoalBuddy's update ownership. Run the GoalBuddy CLI when available:

```bash
goalbuddy check-update --json
```

This personal distribution is bound to a local checkout. The checker must report `check_status: managed_local`, `source.verified: true`, and `source.installed_bytes_match: true`; it must not consult or recommend the upstream npm package. Continue without an update message during ordinary Goal Prep. If provenance does not match, mention the mismatch once without changing the installation.

```text
GoalBuddy update ownership does not match the verified-local-checkout policy. Preserve the current installation and inspect the local GoalBuddy source before updating.
```

Do not block intake or board creation on update checking. If the checker is missing or fails, continue silently unless the user asked about updates.

## Intake Compiler

Before creating, repairing, or running a board, privately translate the user's input into a Goal Intake. The input may be vague, specific, or detailed with an existing plan. Do not dump the intake to the user unless they ask for it.

Extract:

- original request: the shortest faithful user wording;
- interpreted outcome: what must become true;
- input shape: `vague | specific | existing_plan | recovery | audit`;
- audience or beneficiary;
- non-goals and hard constraints;
- authority: `requested | approved | inferred | needs_approval | blocked`;
- proof type: `test | demo | artifact | metric | review | source_backed_answer | decision`;
- completion proof: the observable signal for full outcome completion;
- goal oracle: the live check, walkthrough, artifact, metric, or decision that will keep pressure on the goal and prevent early completion;
- likely misfire: how `/goal` could succeed at the wrong thing;
- blind spots: important risks, choices, or success dimensions the user may not have named yet;
- existing plan facts: user-provided steps, files, constraints, or sequencing that must be preserved but still validated.

Choose the board surface from the invocation boundary before asking anything:

- **Compiler-internal invocation:** obey the compiler handoff exactly. Its default is file-only; do not ask a board-surface question, start the local server, or open a browser unless the handoff explicitly requests visual tracking.
- **Direct `$goal-prep` or `/goal-prep` invocation:** use the local GoalBuddy board as the default work surface for broad runs. Ask only when the user has not already implied they want the default local surface, the goal is unusually quick/private, or board setup would materially distract from the requested prep:

```text
Do you want the local GoalBuddy board for this goal?
```

Recommended options:

1. Local live board (Recommended) - starts immediately, requires no credentials, and lets the user watch tasks populate inside Codex or Claude Code.
2. No visual board - best for quick or private goals where the file board is enough.

If the user chooses the local live board, create the goal directory, `notes/`, and an initial minimal `state.yaml` as soon as the slug is known, then run `node <skill-path>/surfaces/local-goal-board/scripts/local-goal-board.mjs --goal docs/goals/<slug>` and open the printed local URL in the AI coding agent's in-app browser (the Codex in-app Browser, the Claude Code preview, or the user's regular browser). The default local hub is `http://goalbuddy.localhost:41737/`, and board URLs normally look like `http://goalbuddy.localhost:41737/<slug>/`. In short: start the local board before filling the task list so the board pops up right away and cards populate live as `state.yaml` changes. Include the printed board URL in the final prep response as an actual clickable Markdown link, for example `[Open GoalBuddy board](http://goalbuddy.localhost:41737/<slug>/)`. Do not put the board URL only in a code block, quote, HTML comment, or prose that the UI cannot click.

If `http://goalbuddy.localhost:41737/<slug>/` returns 404, do not assume the existing process is stale and do not stop it. First check `http://127.0.0.1:41737/api/boards`. If that endpoint returns board JSON, the port is the shared multi-board hub; rerun `node <skill-path>/surfaces/local-goal-board/scripts/local-goal-board.mjs --goal <absolute-goal-path>` if needed so the new goal registers on the same port. Only stop a specific process on 41737 when `/api/boards` is missing, returns 404, or otherwise proves the listener is not a current GoalBuddy multi-board hub.

If the user wants an external board, GitHub sync, Slack digest, Linear handoff, or any other custom integration, do not install a GoalBuddy catalog item. Treat it as normal implementation work: create a concrete task that designs and verifies that integration inside the target repo or asks the operator for the required credentials and scope.

Ask before board creation when the request is vague, strategic, improvement-oriented, or open-ended and the user has not explicitly said to use defaults. Ask one guided question at a time with 2-3 options and a recommended default, then wait. Continue the diagnostic intake until the user's answers are sufficient to choose the board shape. Do not create or repair `docs/goals/<slug>/` until the diagnostic intake is complete or the user explicitly accepts defaults.

For vague or strategic goals, one answer is rarely enough. After each answer, reflect what it implies, name one likely blind spot, and ask the next material question. The goal is to help the user discover what they mean, not merely collect a form value.

Proceed with labeled assumptions and seed a safe board only when at least one is true:

- the user provides a specific outcome and enough completion proof to choose the first phase;
- the user provides an existing plan or concrete artifact to validate;
- the request is clearly recovery or audit with a target path, error, failing command, or stale board;
- the user says to proceed, use defaults, or prepare the board now.

If a missing answer materially changes outcome, authority, scope, risk, owner, completion proof, or board-handling choice, ask even if the user provided details.

Examples:

- Vague input: start with Scout, then Judge, bounded Worker, final audit.
- Specific input with incomplete evidence: start with Scout or Judge before Worker.
- Existing plan: preserve the plan as facts, start with PM or Judge plan validation, then queue bounded Worker slices from the validated plan.
- Recovery: start with Scout evidence mapping or Judge triage before writes.
- Audit: keep the board read-only unless the user approves follow-up execution.

The intake compiler is an internal strut for `/goal`: it exists to make the first board correct, not to create process theater.

## Guided Intake Surface

For interactive vague or improvement-oriented input, run a diagnostic intake. Show only the current turn of the diagnostic, not the private intake:

```markdown
I read this as: [one-sentence interpreted outcome].

One possible blind spot: [a risk, unstated choice, or success dimension the user may not have named].

[One material question?]

1. [Recommended direction] (Recommended) - [when it wins]
2. [Second direction] - [when it wins]
3. [Third direction, only if genuinely useful] - [when it wins]

My default would be [option] because [short reason].
```

Stop after each question. Do not create files, repair an existing board, run checks, or print `/goal` until the diagnostic intake is complete. Do not dump the private intake.

Minimum diagnostic ladder for vague, strategic, or improvement-oriented goals:

1. Goal surface: use the compiler-supplied surface for compiler-internal preparation; otherwise use the local live board by default or ask "Do you want the local GoalBuddy board for this goal?" when direct-invocation board handling is unresolved.
2. Intent target: what kind of improvement or outcome matters most?
3. Success proof: what evidence would convince the user this worked?
4. Scope and non-goals: what should remain untouched or explicitly out of scope?
5. Goal handling: reuse an existing goal, create a fresh goal, or inspect first?

Ask these one at a time. Skip a step only when the user's words already answer it clearly. After the user answers one step, do not assume the remaining steps; ask the next unresolved material question.

For "make GoalBuddy better", a good first question is which improvement target matters most: intake clarity, board/execution reliability, completion proof/eval coverage, or user experience during long-running goals. A good second question asks what proof would convince the user it improved. A good third question asks whether to reuse an existing goal, create a fresh goal, or inspect first.

## What `$goal-prep` Does

When invoked directly, run intake first. For vague, strategic, improvement-oriented, or open-ended input, run the diagnostic intake and stop before creating or repairing the board until enough material answers are known. For sufficiently clear, planned, recovery, audit, or explicitly-defaulted input, prepare or repair the board and stop for user choice.

Do:

- check for a newer GoalBuddy version once at the start and mention it without blocking;
- clarify or infer the goal title and slug;
- run the Intake Compiler;
- ask diagnostic intake questions when clarity would materially improve the board;
- classify the goal as `specific`, `open_ended`, `existing_plan`, `recovery`, or `audit`;
- scan environment reality before seeding: existing worktrees, branches, or goal directories matching the slug, so the first task starts from what exists instead of assuming a fresh workspace;
- inventory the repo's verify-style scripts once and record which are gate suites for this goal versus pre-existing red repo-health suites, so the oracle is honest about what this goal owns;
- create or repair `docs/goals/<slug>/`;
- create `goal.md`, `state.yaml`, and `notes/`;
- for direct invocation, start the local board immediately and open it in the AI coding agent's in-app browser before filling the task list unless the user opts out; for compiler-internal invocation, preserve the compiler-supplied surface and default to file-only;
- seed a role-tagged task board that matches the input shape;
- make the first active task safe;
- verify Scout, Worker, and Judge agent availability or record an explicit truthful state;
- print the exact command `/goal Follow docs/goals/<slug>/goal.md.`;
- for direct invocation, ask whether to start now, refine `goal.md`, or stop; for compiler-internal invocation, return the board result to the compiler without another question or user-facing checkpoint.

Do not:

- start `/goal` automatically;
- use, refresh, inspect, or load named skills requested by the goal; schedule that as `/goal` work instead;
- browse links, inspect reference repos, read implementation files, generate design plans, generate images, or create assets for the requested outcome;
- create or repair a board from vague/open-ended input before diagnostic intake is complete;
- create `evidence.jsonl`, `units/`, or `artifacts/` for new v2 goals;
- edit implementation files before the board exists;
- invent implementation tasks from vibes when the intake requires Scout, Judge, or plan validation first;
- discard a user-provided plan; preserve it as facts and validate it before execution;
- treat `goal.md` as board truth when it conflicts with `state.yaml`.

## Slice Sizing Policy

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

Safe does not mean small. Safe means bounded, explicit, verified, and reversible.

A good Worker task usually produces a working screen, a working API path, a working data pipeline step, a working backend vertical slice, a real bug fix, or a milestone review. A bad Worker task is one more tiny helper, projection function, contract file, read-only proof, or doc note unless that tiny task is truly blocking progress.

Judge specs the largest safe useful next slice and the PM activates it. Worker completes the whole assigned slice. Judge reviews the whole slice.

After two tiny tasks in a row, PM or Judge should reorient the board. If a demo milestone is complete, the next task should move toward the next real milestone.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

## When To Use

Use this skill for goals that are broad, multi-hour, ambiguous, high-risk, already planned, already stale, already red, or likely to need Scout/Judge/Worker delegation.

For a one-change task, do not create a GoalBuddy board.

If the user explicitly invokes `$goal-prep` on a one-change task anyway, ask one guided question offering the direct change without a board (Recommended) or a minimal board. If the user has already said to proceed or use defaults, prepare the smallest valid board and note the tradeoff in the prep response.

Scout and Judge tasks may identify optional publishing, reporting, integration, plugin, or channel opportunities as improvement candidates. Treat those as normal board tasks with concrete implementation plans. `state.yaml` remains board truth.

## The Four Primitives

1. **Charter**: `goal.md` says what the current tranche is trying to accomplish and what constraints matter.
2. **Board**: `state.yaml` is the rolling task list and machine truth.
3. **Task**: exactly one active task may be worked at a time on each board; explicitly requested parallel lanes live on depth-one child boards, never as multiple active tasks on one board.
4. **Receipt**: every completed, blocked, or escalated task leaves a compact durable result on the task card.

Agents are not a separate primitive. They are the assignee type on a task.

## Control Files

For a v2 goal, create only:

```text
docs/goals/<slug>/
  goal.md
  state.yaml
  notes/
```

The goal root may contain only `goal.md`, `state.yaml`, `notes/`, optional depth-1 `subgoals/` child boards, and generated `.goalbuddy-board/` files when the local visual board is enabled.

Most results live inline as task receipts in `state.yaml`. Only create `notes/<task-id>-<slug>.md` when Scout, Judge, or PM output is too large to fit on the task card.

Always start `state.yaml` from `templates/state.yaml`. The template carries required top-level keys (`version: 2`, `rules`, `oracle`, `visual_board`) that hand-written boards routinely miss, and the tooling rejects boards without them.

Use:

- `templates/goal.md`
- `templates/state.yaml`
- `templates/note.md`

## Charter

The charter answers:

```text
What did the user originally ask for?
What are we trying to improve?
What input shape did the intake identify?
What is the goal oracle?
What constraints are non-negotiable?
Is this goal specific, open-ended, existing-plan, recovery, or audit?
What likely misfire must the PM avoid?
What counts as enough for the current tranche?
```

Avoid forever goals. A broad goal should define an execution tranche, for example:

```text
Discover the highest-leverage local improvements, complete successive safe verified work packages, review only at risk or phase boundaries, and keep advancing until the full outcome is complete.
```

## Board

`state.yaml` is the board and machine truth. A task card has:

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

Worker tasks additionally require:

```yaml
allowed_files: []
verify: []
stop_if: []
```

Task ids must match the `T###` shape (for example `T001`, `T999`). The bundled checker rejects other formats such as `T001b`; a sibling or follow-up task gets the next free number.

The PM owns board meaning. Scout, Judge, and Worker return receipts; they do not select the next active task or mark the goal complete. During `/goal` execution, complete canonical typed decisions go directly through GoalBuddy's digest-bound atomic CLI; Board Keeper handles exceptional inspection, repair, rebinding, ambiguity, and noncanonical control work so the full board stays out of PM context. Receipt shapes and all other runtime rules live in `references/goal-execution.md`.

## Seed Boards

If the goal is vague, the first active task is Scout, but the seeded board should still lead toward execution. Queue Judge selection, a bounded Worker slot, and a final audit.

If the user provides an existing plan, do not ignore it and do not execute it blindly. Preserve the plan in `goal.intake.existing_plan_facts`, make the first active task PM or Judge validation, and queue Worker slices only after the plan is checked for evidence, risk, allowed files, verification, and stop conditions.

Example open-ended seed:

```yaml
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: active
    objective: "Map repo health and identify improvement candidates."
    receipt: null
  - id: T002
    type: scout
    assignee: Scout
    status: queued
    objective: "Find verification commands, flaky tests, stale docs, dependency risks, and easy safety wins."
    receipt: null
  - id: T003
    type: judge
    assignee: Judge
    status: queued
    objective: "Choose the first safe implementation task by impact, confidence, reversibility, and verification strength."
    expected_output:
      - "Decision"
      - "Exact Worker objective"
      - "allowed_files"
      - "verify"
      - "stop_if"
    receipt: null
  - id: T004
    type: worker
    assignee: Worker
    status: queued
    objective: "Execute the first safe implementation task selected by Judge."
    allowed_files: []
    verify: []
    stop_if:
      - "Need files outside allowed_files."
      - "Behavior is ambiguous."
      - "Verification fails twice."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit whether the implemented slice satisfies the original user outcome for this tranche."
    receipt: null
```

If the goal is specific but evidence is incomplete, start with Scout. If risk or priority is unclear, queue Judge before Worker. If evidence is adequate and implementation is bounded, the first active task may be Worker.

If the goal is audit, keep the active task read-only. Queue execution only if the user asks for fixes or approves follow-up implementation.

## Agents

Scout, Worker, and Judge task templates are bundled with GoalBuddy. Two control-plane agents are also bundled: a low-reasoning Board Keeper for execution-time board inspection and mutation, and a separate read-only Ledger Auditor for recovery-only reconciliation. They may also be installed as user or project agent configs, but a board must not claim Scout/Worker/Judge `installed` unless the preparer verified the matching task-agent files.

Use these `state.yaml` values:

| State | Meaning | Next action |
|---|---|---|
| `installed` | Matching Scout/Worker/Judge agent configs were found in the expected user or project agent location. | Continue. |
| `bundled_not_installed` | The bundled `goal_*.toml` template exists with the skill, but no matching installed agent config was verified. | `/goal` can proceed through PM fallback. If dedicated agents are required before `/goal`, run the GoalBuddy CLI through the user's install channel with `agents`. |
| `missing` | Neither an installed config nor the bundled template was verified. | `/goal` can proceed through PM fallback. If dedicated agents are required before `/goal`, run the GoalBuddy CLI through the user's install channel with `install`. |
| `unknown` | Agent availability could not be checked. | `/goal` can proceed through PM fallback. To check before `/goal`, run the GoalBuddy CLI through the user's install channel with `doctor`. |

Non-`installed` task-agent states are warnings, not false failures, because the main `/goal` PM can perform Scout/Judge/Worker-shaped tasks directly when those dedicated task agents are unavailable. Keeper and Ledger are required control-plane install surfaces verified by `goalbuddy doctor`; they are not represented in this board mapping.

| Agent | Thinking level | Write access | Use for |
|---|---:|---:|---|
| Scout | medium | no | targeted source/spec/repo evidence mapping |
| Worker | high | yes, bounded | one coherent bounded useful slice |
| Judge | xhigh | no | phase/risk/final review, ambiguity, scope, completion skepticism |

Keeper and Ledger are not represented in `state.yaml` agent availability or task cards. During execution, the PM invokes the direct digest-bound atomic CLI for complete canonical typed transitions: receipt closeout/activation, amendments, hydration, exact-human wait/reply, and final completion. Invoke `goal_keeper` (Codex, Sol low) or `goal-keeper` (Claude Code, Opus low) whenever the PM must or may need to read board content beyond the compact projection, the state is ambiguous, repair or runtime rebinding is required, or no typed transition represents the complete decision. One already-known one-location scalar or one-line annotation may be edited directly under the execution contract's digest, exact-context, and checker rules without reading the board. Give Keeper an exact `goalbuddy_keeper_request_v1`, the current board digest, authorized control files, expected before/after facts, and the bundled checker command. It returns `goalbuddy_keeper_receipt_v1` and makes no semantic decisions. Checker-red immutable history requires explicit PM authorization after full-board review; direct typed transitions then use the bundled proof path. Runtime rebinding uses Keeper's typed `rebind_goalbuddy` operation, never a hand edit.

At a genuine recovery boundary, `/goal` runs the bundled `scripts/resume-board.mjs` entrypoint, then invokes `goal_ledger` (Codex, Sol medium) or `goal-ledger` (Claude Code, Opus high) with the board path, resume-response digest, checker status, and returned `commands.resume` command. Ledger independently reruns that same bundled entrypoint and compares the complete board with independent repo/worktree/receipt/verification/gate/Worker evidence; it never depends on a globally installed GoalBuddy CLI. It returns `goalbuddy_ledger_audit_v1`, never a task receipt, and never mutates the board. Only `congruent` with matching pre/post digests after an `ok: true` projection permits automatic continuation. Checker or strict-parser failure routes to full-board PM review without rewriting immutable completed-task history merely for checker conformance. After that review explicitly authorizes immutable-history compatibility, render only the current active task with the bundled prompt script plus `--expected-state-digest <sha256> --allow-immutable-history`; this digest-bound path reuses the transition proof and strict-parses exact active-task and top-level control bytes rather than the lossy UI fallback. The exact Keeper and recovery contracts live in `references/goal-execution.md`.

A task's `assignee` determines the agent. The task card is the order. The receipt is the return format.

Only the main `/goal` PM may choose the active task, decide board changes, decide that a task is done, or decide that the goal is complete. The PM applies complete canonical typed decisions through the deterministic transition CLI; Keeper reads the execution board only for exceptional inspection, repair, rebinding, ambiguity, or noncanonical control work. The PM thinking policy and the execution quality commands (including digest-bound pointer dispatch) live in `references/goal-execution.md`.

## Default `/goal` Shape

```text
/goal Follow docs/goals/<slug>/goal.md.
```

When that command runs, the PM follows `references/goal-execution.md`.
