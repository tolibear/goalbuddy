# GoalBuddy

<p align="center">
  <img src="internal/assets/goalbuddy-readme-hero.png" alt="GoalBuddy local board and agent workflow." width="100%">
</p>

<p align="center">
  <strong>A simple operating loop for long <code>/goal</code> runs.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-071236?style=flat-square"></a>
</p>

GoalBuddy helps Codex and Claude Code stay oriented during long coding tasks by giving native `/goal` a finish line, a live work surface, and a proof loop. This repository is Daniel Alnajjar's private local distribution, derived from [tolibear's original GoalBuddy](https://github.com/tolibear/goalbuddy).

It gives `/goal` a small local workspace: a charter, a goal oracle, a board, notes, receipts, and a clear next task. The work stays in your repo, so a run can pause, resume, verify, and keep going without re-inventing the plan every turn.

## Start Here

Install this checkout as the local Bun-owned package, then install both harness surfaces:

```bash
bun add -g "$PWD" --ignore-scripts
goalbuddy install
```

The package has no install lifecycle hook, so the package step cannot change Codex or Claude Code. Bare `goalbuddy` only shows help. `goalbuddy install` and `goalbuddy update` are the explicit mutation boundary: they snapshot GoalBuddy-owned surfaces, verify the resulting target set, and restore the snapshot on failure.

Restart Codex or Claude Code.

Then compile a decision-complete plan, specification, or agreed conversation contract into a new GoalBuddy board:

```text
$codex-goal-compiler
```

In Claude Code, use:

```text
/codex-goal-compiler
```

Codex Goal Compiler is the one goal-routing front door. It inspects the accepted source and chooses direct work, planning, a standalone native Codex goal, a GoalBuddy board, Omega, or recurring automation. When GoalBuddy is the right route, its focused backend preserves accepted decisions, compiles an adaptive execution strategy, creates one checker-valid board, prints the target-correct start command, and stops. If material product decisions are missing, it returns `not_compilable` and creates nothing. Goal Prep is non-model-invocable by default and remains the compiler's exact schema backend plus an intentional manual intake/repair surface.

In Claude Code, GoalBuddy installs a real `/goal` command that runs the execution loop. In Codex, native `/goal` is the separate OpenAI-gated feature GoalBuddy prepares boards for.

## Cross-Harness Goals

<p align="center">
  <img src="internal/assets/goalbuddy-v0.4.0-release.png" alt="GoalBuddy 0.4.0: Cross-Harness Goals — one board, any agent" width="100%">
</p>

Harnesses churn; repos persist. A GoalBuddy board lives in your repo as plain files, so the goal outlives whichever tool started it: begin a goal in Codex, resume it in Claude Code tomorrow — or the other way around — with the same command.

```bash
goalbuddy resume
```

`resume` lists every live board in the repo with its status, active task, and the exact `/goal Follow docs/goals/<slug>/goal.md.` command to continue, which is identical in both harnesses. Receipts can record which harness performed each task, so the board's history survives the handoff intact.

When a specific board actually resumes, GoalBuddy validates it and uses the strict parser to render a bounded continuation projection:

```bash
goalbuddy resume docs/goals/<slug> --json
```

The PM then invokes GoalBuddy's read-only Ledger Auditor (`goal_ledger` in Codex, `goal-ledger` in Claude Code) with the response's board digest. Ledger independently reruns resume, reads the complete board, and reconciles it with repository, worktree, receipt, verification, approval-gate, and visible Worker evidence. A successful projection permits continuation only on `congruent` with the same pre/post digest. Checker or strict-parser failure returns no partial projection and no continuation authority; it routes the PM to full-board review. Current `version: 2` boards whose checker errors are confined to immutable completed-task history may remain untouched, but only the PM may authorize that compatibility path after direct review. Once authorized, `goalbuddy prompt <board> --expected-state-digest <sha256> --allow-immutable-history` reuses the transition layer's exact compatibility proof and strictly parses only the exact active-task block plus unchanged top-level goal/control sections. It rejects digest drift, changed or live-tail errors, malformed active bytes, and task mismatch; it never invokes the board UI's lossy fallback or rewrites history. The projection is not a second ledger, and an active task is never treated as proof that its Worker is still alive.

After recovery, the PM applies complete canonical decisions through GoalBuddy's digest-bound typed transition CLI. Receipt closeout plus successor activation, exact task-card amendments, placeholder hydration, exact-human wait/reply, and final completion validate and install atomically under the per-board lock. GoalBuddy's Board Keeper (`goal_keeper` in Codex, `goal-keeper` in Claude Code) is reserved for full-board inspection, repair, runtime rebinding, ambiguous state, and noncanonical control work. A single already-known scalar or one-line annotation may still use the narrow exact-context path with the current digest and an immediate checker run. Keeper uses Sol low in Codex and Opus low in Claude Code, never selects work or edits product files, and the separately read-only Ledger remains the independent recovery check.

Boards can also mix vendors within a single run — a Claude judge and a Codex worker on the same board:

```bash
goalbuddy dispatch docs/goals/<slug> --to codex --expected-state-digest <sha256>
```

`dispatch` admits the checker-validated active task at the expected digest, rereads that board immediately before launch, runs the target CLI headless (`codex` or `claude-code`), and extracts the returned receipt. A content-aware manifest detects new changes, second edits to pre-dirty paths, and declared ignored exact paths or bounded `dir/**` trees; worker changes must stay inside `allowed_files` and match receipt `changed_files` exactly. For an external Codex Worker, the dispatcher makes one typed atomic board mutation after `thread.started`: it binds the exact session ID so an interrupted run can resume without guessing. The PM still owns receipt closeout and successor activation.

## Codex Install Model

For Codex, the canonical install is the native plugin plus bundled agents:

```text
~/.codex/plugins/cache/goalbuddy/goalbuddy/<version>/
~/.codex/agents/goal_judge.toml
~/.codex/agents/goal_keeper.toml
~/.codex/agents/goal_ledger.toml
~/.codex/agents/goal_scout.toml
~/.codex/agents/goal_worker.toml
```

The Codex plugin bundles both `$codex-goal-compiler` and `$goal-prep`; a clean install has no standalone compiler or personal `~/.codex/skills/goalbuddy` / `goal-maker` folders. Claude receives the same compiler and backend as personal skills. Native Codex `/goal` is a separate OpenAI-gated feature. GoalBuddy prepares local boards and handoff prompts for it, but it does not enable or replace native `/goal`.

To verify a Codex install:

```bash
goalbuddy contract --target codex --json
goalbuddy doctor --target codex --goal-ready
```

To remove GoalBuddy-owned Codex runtime surfaces:

```bash
goalbuddy reset --target codex
```

Native `codex plugin remove goalbuddy@goalbuddy` only removes the native plugin surface. GoalBuddy also owns the `goal_*.toml` agent files it installed, its Codex plugin cache, its marketplace entry, and old personal skill folders from earlier installs. Use `goalbuddy reset --target codex` when you want those GoalBuddy-owned files removed too.

## What It Creates

```text
docs/goals/<your-goal>/
  goal.md
  state.yaml
  notes/
  .goalbuddy-board/ # generated local board files
  subgoals/        # optional depth-1 child boards
```

`goal.md` says what you want.

`state.yaml` tracks the board.

`notes/` keeps longer findings out of the main thread.

`subgoals/` holds optional child boards when one parent task needs a bounded branch of work.

## How It Thinks

```text
Intent -> Oracle -> Surface -> Loop -> Proof
```

The oracle is the observable signal that says whether the original owner outcome is actually true: a test suite, browser walkthrough, demo transcript, generated artifact, benchmark, source-backed answer, release check, or final human decision.

No oracle, no serious goal.

The local board is the default work surface. It is not an extension marketplace; it is the built-in view of the `state.yaml` truth.

The receipt and task-card format is specified in [docs/spec/receipt-v1.md](docs/spec/receipt-v1.md) — harness-neutral, plain YAML, machine-validated.

Scout maps the repo.

Judge chooses the largest safe useful slice.

Worker completes the whole assigned slice and leaves a receipt.

Ledger audits board congruence only when a run genuinely resumes; it is not a task actor or always-on steward.

`/goal` keeps the loop honest until a final Judge/PM audit maps receipts and verification back to the oracle and records the full outcome complete.

## Slice Sizing

Safe does not mean small. Safe means bounded, explicit, verified, and reversible.

GoalBuddy should not optimize for tiny safe tasks. It should optimize for the largest safe useful slice: a working screen, working API path, data pipeline step, backend vertical slice, real bug fix, or milestone review. The board warns when it sees safe-looking work that keeps adding helpers, contracts, proof files, or doc notes without moving the outcome.

## Goalmaxxed

GoalBuddy keeps the model small:

- `state.yaml` is the source of truth.
- `goalbuddy resume <board> --json` is a validated recovery projection, not another state file.
- A board is a view of one `state.yaml`.
- The local hub is a switchboard for many boards.
- A subgoal is one depth-1 `state.yaml` linked from a parent task.
- Settings are viewer preferences, not workflow state.

Use subgoals for bounded child work that belongs to a parent task. Use multiple local boards when parallel agents or separate goal runs are active at the same time. Keep the board open in light or dark mode while the work moves.

## Execution Quality

GoalBuddy can prepare safe parallel work; it does not run a parallel org chart or install arbitrary extension packs.

Routine control-plane work stays quiet. Successful resume checks, Ledger audits, Keeper mutations, digest chaining, receipt application, checker passes, prompt rendering, and polling remain internal. User updates describe the product milestone, review, real blocker, required decision, and completion evidence. GoalBuddy mechanics surface only when the user asks, recovery is incongruent, the runtime itself blocks safe work, an exact board action is required, or final harness completion needs one concise proof marker.

Use `goalbuddy resume docs/goals/<slug> --json` to obtain the current state digest, then `goalbuddy prompt docs/goals/<slug> --expected-state-digest <sha256>` to render a compact prompt for the one checker-admitted active task without dumping the whole state file. The prompt includes a mandatory `required_spawn_agent_type`; Codex PMs should use that exact GoalBuddy task agent (`goal_scout`, `goal_worker`, or `goal_judge`) instead of a generic role agent. `goal_keeper` and `goal_ledger` are separate control-plane roles: Keeper handles exceptional inspection, repair, rebinding, and noncanonical control work, while Ledger runs only at genuine recovery boundaries. Neither receives a board task. Use `goalbuddy parallel-plan docs/goals/<slug>` to inspect depth-one child-board lanes that can be handed to native Codex or Claude Code agent flows. The command reports recommendations only; it does not mutate state or spawn agents.

## Product Boundary

GoalBuddy owns both canonical skill trees, installation topology, execution agents, board schema, runtime commands, and a stable compiler-facing contract:

```text
codex-goal-compiler  -> selects the goal route; compiles native goals or new GoalBuddy boards when selected
goal-prep            -> owns board schema and explicit manual intake/repair
goalbuddy contract   -> reports target readiness and runtime capabilities
```

The compiler requires contract v1, board schema v2, and a named capability subset. It accepts additive capabilities, so GoalBuddy may evolve internally without forcing the compiler to learn file paths, agent counts, doctor output, or exact product versions again.

## Update

Updates are reviewed and activated from this local checkout; registry GoalBuddy is not the authority for this fork:

```bash
goalbuddy update
```

That updates both Codex and Claude Code and rewrites the GoalBuddy marketplace binding to the verified local checkout that owns the installed package. `--source` is accepted only when it resolves to that same checkout; another local path or a remote repository is rejected.

## Live Boards

GoalBuddy opens a local board while the work is running, so you can see the plan, active task, receipts, subgoals, and verification status without digging through the chat.

Multiple local boards reuse one readable `goalbuddy.localhost` hub with an in-header board switcher. When sharing a board in chat or docs, use a real Markdown link such as `[Open GoalBuddy board](http://goalbuddy.localhost:41737/<slug>/)` so the URL is clickable. The viewer also supports dark mode, compact mode, completed-task collapse, active-work motion, and reduced-motion handling.

Custom external integrations should be built as ordinary repo work with a concrete implementation plan, not installed from a GoalBuddy catalog.

See [GoalBuddy 0.5.0: Focused Compiler, Quiet Runtime](docs/releases/0.5.0.md) for the latest release notes.

<p align="center">
  <img src="internal/assets/goalbuddy-live-board.jpg" alt="GoalBuddy local live board open next to Codex while Scout, Judge, and Worker tasks populate." width="100%">
</p>

## Good For

- broad project improvements
- release prep
- bug hunts that need evidence
- refactors with verification steps
- anything too large for one prompt

## For This Repo

GoalBuddy is MIT licensed. This personal distribution is installed from the local Git checkout and is deliberately marked private so it cannot overwrite the upstream npm package.

The implementation lives in this repo, but the happy path is intentionally tiny: install it, run Codex Goal Compiler on agreed work, accept its route, and—when it creates a GoalBuddy board—start `/goal` with the printed command.

For release process details, see [docs/releases](docs/releases/README.md).

## License

MIT
