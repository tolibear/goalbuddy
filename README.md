# GoalBuddy

<p align="center">
  <a href="https://goalbuddy.dev">
    <img src="internal/assets/goalbuddy-readme-hero.png" alt="GoalBuddy local board and agent workflow." width="100%">
  </a>
</p>

<p align="center">
  <strong>A simple operating loop for long <code>/goal</code> runs.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/goalbuddy"><img alt="npm" src="https://img.shields.io/npm/v/goalbuddy?style=flat-square&color=684cff"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-071236?style=flat-square"></a>
  <a href="https://goalbuddy.dev"><img alt="goalbuddy.dev" src="https://img.shields.io/badge/site-goalbuddy.dev-684cff?style=flat-square"></a>
</p>

GoalBuddy helps Codex and Claude Code stay oriented during long coding tasks by giving native `/goal` a finish line, a live work surface, and a proof loop.

It gives `/goal` a small local workspace: a charter, a goal oracle, a board, notes, receipts, and a clear next task. The work stays in your repo, so a run can pause, resume, verify, and keep going without re-inventing the plan every turn.

## Start Here

Run one command:

```bash
npx goalbuddy
```

Restart Codex or Claude Code.

Then prepare a goal:

```text
$goal-prep
```

In Claude Code, use:

```text
/goal-prep
```

Goal Prep creates the board and prints the exact `/goal` command to run next. That is the whole path.

In Claude Code, GoalBuddy installs a real `/goal` command that runs the execution loop. In Codex, native `/goal` is the separate OpenAI-gated feature GoalBuddy prepares boards for.

## Cross-Harness Goals

<p align="center">
  <img src="internal/assets/goalbuddy-v0.4.0-release.png" alt="GoalBuddy 0.4.0: Cross-Harness Goals — one board, any agent" width="100%">
</p>

Harnesses churn; repos persist. A GoalBuddy board lives in your repo as plain files, so the goal outlives whichever tool started it: begin a goal in Codex, resume it in Claude Code tomorrow — or the other way around — with the same command.

```bash
npx goalbuddy resume
```

`resume` lists every live board in the repo with its status, active task, and the exact `/goal Follow docs/goals/<slug>/goal.md.` command to continue, which is identical in both harnesses. Receipts can record which harness performed each task, so the board's history survives the handoff intact.

When a specific board actually resumes, GoalBuddy validates it and uses the strict parser to render a bounded continuation projection:

```bash
npx goalbuddy resume docs/goals/<slug> --json
```

The PM then invokes GoalBuddy's read-only Ledger Auditor (`goal_ledger` in Codex, `goal-ledger` in Claude Code) with the response's board digest. Ledger independently reruns resume, reads the complete board, and reconciles it with repository, worktree, receipt, verification, approval-gate, and visible Worker evidence. A successful projection permits continuation only on `congruent` with the same pre/post digest. Checker or strict-parser failure returns no partial projection and no continuation authority; it routes the PM to full-board review. Current `version: 2` boards whose errors are confined to immutable completed-task history may remain untouched, but only the PM may make that compatibility decision after direct review. The projection is not a second ledger, and an active task is never treated as proof that its Worker is still alive.

After recovery, GoalBuddy's Board Keeper (`goal_keeper` in Codex, `goal-keeper` in Claude Code) handles full-board inspection and every normal execution-time board mutation. The PM sends only an exact semantic decision and the current digest; Keeper reads the large board in its isolated context, applies the receipt/status/task/gate change, runs the existing checker, and returns a compact `goalbuddy_keeper_receipt_v1`. Keeper uses Sol low in Codex and Opus low in Claude Code. It never selects work or edits product files, and the separately read-only Ledger remains the independent recovery check.

Boards can also mix vendors within a single run — a Claude judge and a Codex worker on the same board:

```bash
npx goalbuddy dispatch docs/goals/<slug> --to codex
```

`dispatch` renders the active task's prompt, runs the target CLI headless (`codex` or `claude-code`), extracts the returned receipt, and verifies write scope mechanically with git: worker changes must stay inside the task's `allowed_files`, and read-only roles must change nothing. The dispatcher never edits the board — the PM gives the stamped receipt and exact successor decision to Keeper for validated recording.

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

The Codex plugin bundles `$goal-prep`; a clean Codex install should not need personal `~/.codex/skills/goalbuddy` or `~/.codex/skills/goal-maker` folders. Native Codex `/goal` is a separate OpenAI-gated feature. GoalBuddy prepares local boards and handoff prompts for it, but it does not enable or replace native `/goal`.

To verify a Codex install:

```bash
npx goalbuddy doctor --target codex --goal-ready
```

To remove GoalBuddy-owned Codex runtime surfaces:

```bash
npx goalbuddy reset --target codex
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

Use `goalbuddy prompt docs/goals/<slug>` to render a compact prompt for the active task without dumping the whole state file. The prompt includes a mandatory `required_spawn_agent_type`; Codex PMs should use that exact GoalBuddy task agent (`goal_scout`, `goal_worker`, or `goal_judge`) instead of a generic role agent. `goal_keeper` and `goal_ledger` are separate control-plane roles: Keeper handles exact board operations during execution, while Ledger runs only at genuine recovery boundaries. Neither receives a board task. Use `goalbuddy parallel-plan docs/goals/<slug>` to inspect read-only or disjoint write-scope work that can be handed to native Codex or Claude Code agent flows. The command reports recommendations only; it does not mutate state or spawn agents.

## Update

When a new GoalBuddy version ships:

```bash
npx goalbuddy update
```

That updates both Codex and Claude Code. If Codex already points its GoalBuddy marketplace at a local checkout, update preserves that source; pass `--source` only when you intentionally want to change it.

## Live Boards

GoalBuddy opens a local board while the work is running, so you can see the plan, active task, receipts, subgoals, and verification status without digging through the chat.

Multiple local boards reuse one readable `goalbuddy.localhost` hub with an in-header board switcher. When sharing a board in chat or docs, use a real Markdown link such as `[Open GoalBuddy board](http://goalbuddy.localhost:41737/<slug>/)` so the URL is clickable. The viewer also supports dark mode, compact mode, completed-task collapse, active-work motion, and reduced-motion handling.

Custom external integrations should be built as ordinary repo work with a concrete implementation plan, not installed from a GoalBuddy catalog.

See [GoalBuddy 0.4.0: Cross-Harness Goals](docs/releases/0.4.0.md) for the latest release notes.

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

GoalBuddy is MIT licensed and published on npm.

The implementation lives in this repo, but the happy path is intentionally tiny: install it, run Goal Prep, then let `/goal` work from the generated files.

For release process details, see [docs/releases](docs/releases/README.md).

## Star History

<a href="https://www.star-history.com/?repos=tolibear%2Fgoalbuddy&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=tolibear/goalbuddy&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=tolibear/goalbuddy&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=tolibear/goalbuddy&type=date&legend=top-left" />
 </picture>
</a>

## License

MIT
