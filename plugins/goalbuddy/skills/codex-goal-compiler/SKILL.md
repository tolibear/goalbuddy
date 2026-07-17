---
name: codex-goal-compiler
compatibility: "Codex with native /goal support for standalone goals; Python 3 for bundled validators; GoalBuddy compiler contract v1 for board compilation; Claude Code supported for direct/GoalBuddy routing or later Codex handoff."
description: "Turns agreed conversation context, an accepted plan, review findings, or a completed implementation into the correct Codex goal route. Use for: 'turn this into a goal', 'goalize this', 'make a goal.md', 'put this review round in goal mode', 'compile this plan into a goal', 'make a GoalBuddy board', or 'what kind of goal should this be?'. Routes among direct work, planning or Goal Prep, a standalone native /goal goal.md, GoalBuddy, and recurring automation. Do not use merely to execute a small change, invent an unaccepted plan, or create recurring automation unless the user explicitly asks to goalize or route the work."
metadata:
  version: "4.0.0"
  short-description: "Conversation or plan → the right Codex goal route"
---

# Codex Goal Compiler

Use one front door to turn agreed work into the correct execution form. Mine the current conversation, accepted plans, review findings, repository facts, and explicit user decisions before asking the user to restate them.

The compiler may route to:

1. **Direct work** — no goal file.
2. **Planning or Goal Prep first** — the outcome is not yet ready to compile.
3. **Standalone native Codex goal** — one durable `goal.md`, no GoalBuddy board.
4. **GoalBuddy board** — durable tasks, receipts, roles, resumability, and multi-workstream state.
5. **Loop, Automation, or Schedule** — recurring or event-driven work.

The user should not need to remember separate compiler skills or choose the backend before the context has been inspected.

## Trigger boundary and intended use

Use this skill when the user wants agreed work converted into a durable goal form or wants help deciding which goal backend fits. The work may come from the current conversation, an accepted plan, a completed board, a review, a PR or diff, or another owner-approved artifact.

Do not trigger merely because the user asks for a small implementation, a new plan, or recurring automation. Those are outputs this skill may recommend after an explicit goalization or routing request; they are not reasons to intercept ordinary work.

Near-misses:

- A clear one-turn fix with no request for goal mode → direct implementation, not goal compilation.
- A vague outcome with no accepted definition of done → planning or Goal Prep, not a polished goal artifact.
- A recurring procedure with no request to goalize it → loop, automation, or schedule.
- A request to execute an existing goal → the selected runtime executes it; this compiler does not recompile or start it unless explicitly asked.

The skill compiles and validates the route artifact. It does not perform the underlying implementation, start a GoalBuddy board, or invoke `/goal` unless the user explicitly requests execution and the selected route permits it.

## Core invariant

Keep one user-facing skill and two internal compilers:

```text
codex-goal-compiler
├── native-goal compiler
└── GoalBuddy compiler
```

Goal Prep is not a second routing front door. It is the GoalBuddy compiler's explicit internal backend and an optional manual expert surface.

Do not merge their storage or schemas.

- Standalone native goals live at `docs/codex-goals/<slug>/goal.md`.
- GoalBuddy boards live at `docs/goals/<slug>/` and are owned entirely by the installed GoalBuddy runtime.
- Never create `state.yaml`, task cards, receipts, agents, or board metadata for a standalone goal.
- Never imitate a GoalBuddy board with a partial custom schema.

## Read before routing

Read `references/routing.md` first and treat it as the authoritative source for
route selection and context precedence. Do not load backend-specific compiler
references until routing selects that backend:

- Standalone native goal → read `references/native-goal-compiler.md`.
- GoalBuddy → read `references/goalbuddy-compiler.md`,
  `references/adaptive-execution-strategy.md`, and
  `references/handoff-prompts.md`.
- Direct work, planning, or recurring work → do not load compiler-backend
  references.

When Omega is installed and the choice is between Omega and a goal, consult
Omega's installed routing guidance. Skip that optional dependency when absent.

If a repository or configured agent resource provides `PLANS.md`, `plans.md`, or another governing plan contract, read it when relevant. Do not invent its contents when it is absent.

## Routing order

Decide in this order:

1. **Is the work recurring or event-driven?**
   - Route to `/loop`, Codex Automation, or Claude `/schedule`.
   - A recurring procedure is not one perpetual goal.

2. **Is the outcome still vague, contested, or missing measurable completion?**
   - Route to planning or Goal Prep.
   - Ask one focused question only when the answer changes outcome, proof, permission, or route.

3. **Can one normal implementation turn safely finish and verify the work?**
   - Recommend direct work.
   - If the user explicitly wants native goal mode and the outcome is honest in one file, use the standalone route.

4. **Is it a bounded plan-to-branch implementation package that does not need persistent goal state?**
   - Route to Omega when installed rather than forcing either goal backend.
   - If the user explicitly wants native `/goal`, honor that preference when one file can represent the work honestly.

5. **Is there one bounded, coherent outcome that benefits from persistence?**
   - Use a standalone native goal.

6. **Does the work need durable task state, receipts, independently owned workstreams, cross-session or cross-harness continuation, many blocked slices, or board monitoring?**
   - Use GoalBuddy.

Explicit user preference matters:

- Respect an explicit request for a standalone goal when one file can represent the work honestly; warn about lost board capabilities when relevant.
- Respect an explicit GoalBuddy request after confirming runtime readiness and a board-worthy outcome.
- Never silently create or resume a GoalBuddy board.

## Context mining

Use this precedence when sources conflict:

1. Applicable system, host, and repository instructions.
2. Latest explicit user decision in the current conversation.
3. An explicitly accepted plan, review decision, or owner-approved artifact.
4. Current repository facts and executed tool evidence.
5. Earlier conversation context.
6. Clearly labeled model inference.

Extract only load-bearing context:

- intended owner outcome;
- current state and starting point;
- latest accepted decisions;
- accepted sequence or plan reference;
- observable Definition of Done and final proof;
- false-positive completion to avoid;
- constraints, non-goals, permissions, and approval gates;
- fast and final verification;
- material assumptions and blockers;
- whether progress needs one living record or a durable task graph.

Do not copy the full conversation into the goal. Do not reopen accepted decisions merely because alternatives exist. Do not invent files, tests, metrics, authority, budgets, or approvals.

## Default workflow

1. Inspect the current conversation and any named plan, board, review, PR, diff, issue, or artifact.
2. Determine the active harness and intended execution target.
3. Select exactly one route using `references/routing.md`.
4. Report the selected route and one-sentence rationale before writing stateful artifacts.
5. Compile using the selected internal compiler.
6. Run the route-specific deterministic validation.
7. Fix validation failures; do not waive them through prose.
8. Report the artifact created, validation result, and exact start or continuation command.
9. Do not start execution automatically unless the user explicitly asks and the route's start policy permits it.

## Standalone native goal route

Use for:

- bounded or medium-sized work deserving native `/goal` persistence;
- a coherent outcome already agreed in conversation;
- an accepted plan that does not need task slicing or receipts;
- one review, remediation, hardening, cleanup, or follow-up round after a completed board;
- work likely to fit one sustained Codex goal-mode run, even if it survives compaction.

This route is native to Codex. In Claude Code, use direct work or GoalBuddy unless the user explicitly wants a Codex handoff file for later use.

Workflow:

1. Read `references/native-goal-compiler.md`.
2. Choose a lowercase-hyphen slug.
3. Check the future path:

```bash
python3 <compiler-skill>/scripts/check_new_native_goal_path.py docs/codex-goals/<slug> --json
```

4. Render `assets/native-goal.md` without unresolved placeholders.
5. Write exactly one file:

```text
docs/codex-goals/<slug>/goal.md
```

6. Validate it:

```bash
python3 <compiler-skill>/scripts/validate_native_goal.py docs/codex-goals/<slug>/goal.md
```

7. Print:

```text
/goal Follow docs/codex-goals/<slug>/goal.md.
```

Do not create a board server, `state.yaml`, receipts, agents, task cards, or board metadata.

### Post-board review default

When a GoalBuddy board or major implementation is complete and one bounded review/remediation round remains, default to a standalone native goal unless the follow-up itself needs durable multi-task coordination.

The completed board may be read-only evidence. Do not resume, mutate, or replace it unless the user explicitly asks.

## GoalBuddy route

Use for broad, long-running, interruption-prone, multi-workstream, or cross-session work that benefits from GoalBuddy's official task, receipt, role, checker, and resume surfaces.

Read `references/goalbuddy-compiler.md`, `references/adaptive-execution-strategy.md`, and `references/handoff-prompts.md` before compiling.

Key rules:

- Run only the selected harness's GoalBuddy runtime preflight.
- Consume GoalBuddy compiler contract v1 through `scripts/check_goalbuddy_runtime.py`. Require board schema v2 plus the closed safety-capability subset for atomic amendment, atomic placeholder hydration, lossless receipt identity, strict multiline YAML projection, closed Judge decisions, atomic exact-human wait/resume, atomic goal completion, and exact task-bound Codex Worker resume. Treat missing capabilities or mismatched installed/source skill fingerprints as blocked; accept additive contract fields and capabilities.
- Report product version separately from the resolved CLI path, source kind, Git HEAD, dirty state, and installed skill fingerprints; a local dirty checkout is never a pristine published package claim.
- Use a new `docs/goals/<slug>` root and the future-only path guard.
- Retain `contract.skills.compiler.path` and `contract.skills.goal_prep.path` plus their tree fingerprints from the accepted contract. Treat the exact Goal Prep path as an explicit internal dependency whose implicit/model invocation may be disabled. After selecting GoalBuddy, explicitly load and execute that `SKILL.md` directly in the current compiler context. Do not rediscover Goal Prep through harness search paths or rely on implicit skill matching. If either bound tree fingerprint changes, stop and rerun preflight. Goal Prep owns board schema. Never spawn a subagent, collaboration agent, or separate Codex task merely to prepare the board.
- Preserve the five proof expectations through official GoalBuddy surfaces.
- Prepare and validate the board before any start. File-only preparation runs the official board checker plus the compiler's semantic acceptance gates, not unrelated repository-wide product or source suites.
- Return to the compiler immediately after checker and acceptance results are available; do not leave a preparation loop running after the board is accepted.
- Default to a file-only board; do not open the visual board unless requested.
- Print the target-correct start command and stop. GoalBuddy execution begins in a later user-approved turn or session.

Do not bundle GoalBuddy templates, recreate its checker, invent board fields, or route new work through the legacy `goal_worker_ultra` role.

This direct-current-context rule is limited to Goal Prep board preparation. It does not prohibit intended Scout, Judge, Worker, Keeper, Ledger, Council, or other explicitly requested delegation during planning, execution, recovery, or review.

## Direct, planning, and recurring exits

### Direct work

Return a concise routing recommendation rather than manufacturing a goal. If useful, summarize the agreed task and verification expectation so the current agent can proceed immediately.

### Planning or Goal Prep

When a missing decision changes architecture, authority, risk, scope, or final proof, ask the smallest focused question or route to the installed planning/Goal Prep surface. Do not hide uncertainty behind a polished goal file.

### Loop, Automation, or Schedule

Route a stable procedure applied repeatedly to changing inputs to the appropriate recurring system. A single exceptional item may receive its own native goal or GoalBuddy board when independently justified.

## Dependency and runtime fallback

Treat dependencies as route-specific rather than global blockers.

- **Omega unavailable:** do not block goal compilation. Choose direct work when one turn can finish the task, a standalone native goal when persistence helps, or GoalBuddy when durable board state is genuinely required.
- **Native `/goal` unavailable:** create a native goal only as an explicit later-Codex handoff. Otherwise route to direct work, planning, or GoalBuddy according to the outcome.
- **GoalBuddy or Goal Prep unavailable/stale:** block only the GoalBuddy route. Offer a standalone native goal only when one file can represent the work honestly; otherwise report the exact missing dependency and stop. Never reconstruct GoalBuddy schema locally.
- **Recurring runtime unavailable:** recommend the correct loop/automation/schedule route and report the missing capability. Do not manufacture a perpetual native goal or board as a substitute.
- **Governing plan resource unavailable:** continue from accepted conversation and repository evidence when sufficient. Do not invent `PLANS.md`, `plans.md`, or an agent resource.

When a fallback changes durability, resumability, ownership, receipts, or cross-session behavior, state the lost capability before compiling the alternative.

## Permission and safety rules

- Preserve unrelated dirty work.
- Ask before destructive, irreversible, externally visible, credential-sensitive, production, billing, deployment, publication, or material scope-expanding actions.
- Do not request private chain-of-thought or reasoning transcripts.
- Do not weaken tests, alter scorers, hard-code evaluation cases, or fabricate completion evidence.
- Ground completion claims in executed checks or inspected evidence.
- Preserve user-provided time, token, or paid-service limits exactly; do not invent budgets.

## Final checkpoint

```text
Route: <direct | omega | planning | native_goal | goalbuddy | recurring | blocked>
Reason: <one sentence>
Target: <codex | claude | later Codex handoff | n/a>
Source context: <conversation | plan | completed board | review | other>
Artifact: <none | docs/codex-goals/<slug>/goal.md | docs/goals/<slug>/goal.md>
Validation: <pass | blocked: reason | n/a>
Start command: </goal Follow ... | hybrid Codex /goal | n/a>
Start: <not requested | command printed | started | blocked>
Open questions: <none | only material questions>
```

For GoalBuddy, append the detailed checkpoint defined in `references/goalbuddy-compiler.md`.

## Failure handling

- **No clear outcome:** ask one focused question or route to planning.
- **Too small:** recommend direct work; honor explicit native-goal preference when honest.
- **Standalone goal grows beyond one coherent file:** keep it bounded and recommend GoalBuddy or a follow-up goal.
- **GoalBuddy path collision:** stop without inspecting the collision; choose a new slug or ask.
- **Native-goal path collision:** stop without overwriting; choose a new slug or ask.
- **GoalBuddy runtime missing or stale:** block only the GoalBuddy route; do not prevent a valid native-goal route.
- **Recurring work:** route away from goal compilation.
- **Validation failure:** fix the artifact or report the exact blocker; never claim readiness.

## Resources

- `references/routing.md` — unified route selection, overrides, and examples.
- `references/native-goal-compiler.md` — standalone native goal contract and review-follow-up mode.
- `references/goalbuddy-compiler.md` — GoalBuddy runtime, proof, preparation, and start contract.
- `references/adaptive-execution-strategy.md` — GoalBuddy quality-policy compilation contract.
- `references/handoff-prompts.md` — GoalBuddy handoff blocks and target outputs.
- `assets/native-goal.md` — canonical standalone goal template.
- `scripts/check_new_native_goal_path.py` — future-only native-goal path guard.
- `scripts/validate_native_goal.py` — standalone goal validator.
- `scripts/check_goalbuddy_runtime.py` — selected-harness GoalBuddy preflight.
- `scripts/check_new_goal_path.py` — future-only GoalBuddy root guard.
- `scripts/validate_codex_goal_objective.py` — GoalBuddy Codex hybrid-objective validator.
