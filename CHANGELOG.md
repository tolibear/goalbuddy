# Changelog

## 0.4.2: Honest Continuation State (2026-07-31)

- **Machine-checkable stop decisions.** `goalbuddy can-stop <goal>` fails closed while a valid active task remains and permits exit only for a receipt-backed complete outcome or the exact validated terminal approval wait.
- **Receipt transitions expose the continuation contract.** `goalbuddy receipt` now returns `stop_allowed`, `continuation_required`, and `next_action` immediately after activating the next task, closing the handoff gap that left FL Donate active but unattended.
- **The board no longer impersonates an executor.** The local surface identifies itself as a state viewer and reports executor status as `Not observed` unless the goal is complete or waiting. A healthy viewer is no longer presented as evidence that work is running.
- **Regression coverage.** Tests cover active-work stop rejection, complete and approval-wait exits, receipt-to-next-task continuation, and honest board semantics. The canonical and plugin payloads remain byte-identical.

## 0.4.1: Installed Contract Fixes (2026-07-18)

- **npm installs include the full execution contract.** The package now ships the canonical `goalbuddy/` directory as one boundary, including `references/goal-execution.md`. A packed-artifact regression test compares the canonical and plugin skill trees and performs a clean Claude Code install from the generated tarball.
- **Claude Code prompts name the exact GoalBuddy roles.** Rendered task prompts now include exact Claude Code `subagent_type` values alongside Codex `agent_type` values. The execution contract forbids generic `Explore` or `general-purpose` substitution, and an `unknown` agent state now requires one exact-role attempt before PM fallback.
- **Cross-harness routing stays mechanically aligned.** Tests cover Scout, Worker, Judge, and PM prompt metadata and human-readable spawn instructions, while the generated plugin skill remains byte-identical to the canonical payload.

## 0.4.0 — Cross-Harness Goals (2026-07-06)

- **Goals now move between Codex and Claude Code.** The board has always been repo-native (`state.yaml` is the only truth), and 0.4.0 makes the handoff real: start a goal in one harness and resume it in the other with the same `/goal Follow docs/goals/<slug>/goal.md.` command. The new `goalbuddy resume` command discovers live boards in a repo and prints each goal's status, active task, and exact run command; the execution contract now states the handoff rule (resume from recorded state, never from chat history); and receipts may carry an optional `harness` field so a board's history shows which runtime performed each task.
- **Mixed fleets: one board, many vendors.** A PM in any harness can dispatch a single task to a different vendor's agent — a Claude judge and a Codex worker on the same board. `goalbuddy dispatch docs/goals/<slug> --to codex` (also `claude-code`; bundled as a skill script for model-invoked use) renders the task prompt, runs the target CLI headless with role-appropriate sandboxing, extracts the returned receipt, and mechanically verifies write scope with git — worker changes must match `allowed_files`, read-only roles must change nothing. The dispatcher never touches `state.yaml`; the PM records the receipt, stamped with the harness that earned it.
- **Field-tested workflow upgrades.** Lessons from a real multi-day GoalBuddy run are baked in: `goalbuddy init <slug>` scaffolds a valid board from the bundled templates (hand-written boards used to fail with an opaque version error, which now names the missing key), `goalbuddy receipt` applies receipt/status/`active_task` transitions atomically and fail-closed (validated by the checker, reverted on error), worker receipts gain a `deviations` field for in-scope judgment calls, worker templates treat a delivered receipt as the only valid stopping state, judges copy plan file lists into `allowed_files` verbatim, and the contracts pick up idle-race handling, full-oracle verification at boundaries, warm-worker reuse, and prep-time environment scanning.
- **`/goal-prep` now actually surfaces as `/goal-prep` in Claude Code.** Claude Code names skills by directory, so previous installs listed the skill as `/goalbuddy` while every doc said `/goal-prep`. The skill now installs and ships as `goal-prep`; install/update migrates the legacy `~/.claude/skills/goalbuddy` directory away, and `goalbuddy doctor --target claude` reports `legacy_skill_present` until it is gone.
- **Claude Code gets a real `/goal` command.** The plugin ships `commands/goal.md` and the CLI installs `~/.claude/commands/goal.md`, so the printed `/goal Follow docs/goals/<slug>/goal.md.` line runs a real command instead of relying on fuzzy skill matching.
- **The skill contract is split by mode.** `SKILL.md` is now the prep contract plus the shared board model; `references/goal-execution.md` is the `/goal` runtime contract. The `/goal` command, the generated charter's PM loop, and the skill itself all point at the execution contract, and a policy test suite keeps the mode boundary clean.
- **Execution contract closes the receipt gaps found by agent testing.** A `done` Worker receipt must list only passing commands — a red verify means `blocked`, not `done`, with the failure kept visible. New documented shapes: blocked Worker receipts with `blocked_reason`, the Judge `worker_package` slot for the exact next-Worker spec, the strict `T###` task-id format, and a named example for a correct fix whose verify is blocked by an out-of-scope cause.
- **Local board server hardened.** Requests with unexpected Host headers and cross-site POST/PUT requests are rejected (closing DNS-rebinding reads and CSRF file writes), static serving refuses dot segments and directories, degraded YAML parses render a visible warning banner instead of silently dropping tasks, valid odd-indentation boards recover through the fallback parser, settings updates merge instead of wiping unspecified fields, and slug-collision boards report the deduplicated slug their URL uses.
- **State checker fixed.** `check-goal-state.mjs` accepts a goal directory (the form the skill docs use) as well as the `state.yaml` path, no longer truncates quoted values containing `#`, and reports broken symlinks instead of crashing.
- **CLI robustness.** `--target` values are validated, argument errors respect `--json`, repeated flags take the last value, missing option values exit with a clear error instead of consuming the next flag, update checks work on Windows, `~/.codex/config.toml` writes are atomic, prerelease versions order below their release, and `install-agents.mjs` no longer treats `--force` as a destination or defaults to a cwd-relative path.
- **One canonical skill tree with a drift guard.** `goalbuddy/` is canonical; `plugins/goalbuddy/skills/goal-prep/` is a byte-exact mirror maintained by `npm run sync:plugin` and enforced by a test (the two trees had silently drifted apart in prior releases). A new CI workflow runs the full check suite on Node 18 and 24 for every push and PR.
- **Agent-verified.** This release's contracts were exercised end to end by independent Opus and Sonnet agents (prep and execution roleplays against real boards, CLI sweep, board-server abuse probes) with an adversarial judge grading the artifacts; the findings drove the receipt-contract and CLI fixes above.

## 0.3.9 — Marketplace and Board Runtime Polish (2026-06-23)

- **Made Claude marketplace install discoverable.** The repo now ships a root `.claude-plugin/marketplace.json`, keeps it in the npm package allowlist, and validates marketplace install flow alongside the existing plugin manifest checks.
- **Made `/goal-prep` install-channel agnostic.** Model-invoked board, prompt, and parallel-plan commands now use bundled skill scripts instead of assuming a global `goalbuddy` or `npx goalbuddy` binary. Update and agent guidance now points users back to their actual install channel.
- **Stopped local-board flicker during task transitions.** The board watcher now coalesces rapid `state.yaml` writes before streaming updates, avoiding transient “more than one active task” errors during normal multi-step transitions.
- **Let the board render valid parallel work.** The local board now renders multiple active tasks in the In Progress column instead of refusing to parse the whole board, while the stricter `check-goal-state` invariant remains available for board validation.
- **Added exact-approval wait guidance.** GoalBuddy now has a terminal waiting shape for exact human approval gates: ask once, preserve the required reply, set `waiting_for_user_approval: true`, and stop until the user replies.
- **Added PM-owned board health stewardship.** Goal Prep now explains the safe steward model: use the bundled checker and live board API to repair GoalBuddy control files only, without introducing an always-on implementation actor.

## 0.3.8 — Board Hub Guardrails (2026-05-29)

- **Clarified multi-board hub recovery.** Unregistered board URLs now explain that a `/slug/` 404 does not mean the `41737` process is stale; agents should verify `/api/boards` and register the new goal on the same hub before stopping any process. Release checks now include the local board surface tests.
- **Prefer the largest safe useful slice.** GoalBuddy now teaches Judge to pick whole useful slices, Worker to complete the assigned slice, and PM to reorient boards when tasks are safe-looking but outcome-light. `goalbuddy prompt` and the state checker emit non-fatal micro-slicing warnings without breaking old boards.
- **Hardened Codex plugin-only installs.** Codex install/update now use the native plugin path, refresh the bundled Scout/Judge/Worker agents, and leave stale personal `~/.codex/skills/goalbuddy` / `goal-maker` folders out of the expected clean state.
- **Fixed Codex doctor for plugin-only installs.** `goalbuddy doctor --target codex --goal-ready` now validates the plugin cache, bundled `$goal-prep` skill, enabled plugin config, and GoalBuddy agents instead of failing only because standalone personal skill folders are absent. The report also distinguishes native OpenAI-gated Codex `/goal` from GoalBuddy `$goal-prep` and local boards.
- **Made mutating command help safe.** `goalbuddy plugin install --help` and `goalbuddy update --help` print help without installing, updating, or touching global Codex/Claude files.

## 0.3.5 — Subgoals, Parallel Agents, and Dark Mode (2026-05-12)

- **Subgoals for bounded branching work.** Parent tasks can link to depth-1 child `state.yaml` boards under `subgoals/`, the checker validates child shape and containment, and the local board renders the child board inside the parent task detail.
- **Parallel-agent-ready boards.** `goalbuddy parallel-plan` reports safe read-only Scout/Judge handoffs and Worker handoffs only when write scopes are known and disjoint. It does not mutate state or spawn agents.
- **Dark mode and a sharper live board.** The local board now has readable dark mode, global viewer settings, compact mode, completed-task collapse, a site-aligned header, GitHub stars, and active-card motion with reduced-motion handling.
- **Multi-board local hub navigation.** Multiple local boards share one readable `goalbuddy.localhost` hub with an in-header board selector, and parent boards stream updates when linked child subgoal state changes.
- **More durable execution plumbing.** Scout/Judge/Worker contracts are stricter, `goalbuddy prompt` emits compact task prompts, Worker write-scope checks fail closed for ambiguous overlap, and source/plugin tests cover the new branching and parallel-safety surfaces.

## 0.3.2 — Harden Codex plugin cache updates (2026-05-11)

- **Fixed Codex plugin updates when stale preserved-extension folders exist.** The updater now ignores non-version cache directories like `.goalbuddy-preserved-extend-*` while selecting the active plugin skill, so a leftover temporary folder cannot make `npx goalbuddy update` fail with `Unsupported version`.
- **Stopped leaving empty preserved-extension folders during plugin reinstalls.** The updater only creates the temporary preservation directory when there is a custom extension to copy.

## 0.3.1 — Fix duplicate /goal-prep slash entry (2026-05-11)

- **Fixed duplicate `/goal-prep` in the Claude Code slash menu.** Previous installs shipped both a `name: goal-prep` skill and a `commands/goal-prep.md` slash command, so Claude Code listed `/goal-prep` twice with different descriptions. The skill is now the single canonical surface for `/goal-prep`. Existing installs with `~/.claude/commands/goal-prep.md` are migrated automatically: `npx goalbuddy` (and `install` / `update`) removes the legacy file. `goalbuddy doctor --target claude` reports `legacy_command_present` and fails until the legacy file is gone.

## 0.3.0 — Claude Code and Codex targets

GoalBuddy now installs into both **Codex** and **Claude Code** with a single `npx goalbuddy` run. The shared skill payload and `/goal` workflow are unchanged — this release adds a Claude Code target alongside the existing Codex one and reframes the project as "a /goal operating system for Codex and Claude Code."

### Highlights

- **One command installs both targets.** `npx goalbuddy` installs and enables the native Codex plugin in `~/.codex/`, then installs the GoalBuddy skill, three Scout/Judge/Worker subagents, and the `/goal-prep` slash command into `~/.claude/`.
- **Target-specific installs remain available.** Use `npx goalbuddy --target codex` or `npx goalbuddy --target claude` when you only want one side.
- **Claude Code plugin scaffold** at `plugins/goalbuddy/.claude-plugin/plugin.json` with markdown subagents (`agents/goal-scout.md`, `agents/goal-judge.md`, `agents/goal-worker.md`) and a `/goal-prep` command (`commands/goal-prep.md`).
- **`$goal-prep` (Codex) and `/goal-prep` (Claude Code)** are documented as sibling entry points throughout the skill, README, site, and CLI.
- **Reframed README, site, plugin docs, package.json, and SKILL.md** to position the workflow as "a /goal operating system for Codex and Claude Code."
- **CLI is target-aware.** New flags: `--target codex|claude`, `--claude-home <path>`. Existing `--codex-home` and `CODEX_HOME` continue to work unchanged.
- **Update supports both targets.** `goalbuddy update` refreshes the Codex plugin and Claude Code skill/agents/command together unless `--target` narrows it.
- **Doctor checks both targets.** Default is Codex; `goalbuddy doctor --target claude` runs the Claude Code skill/agent/command check.

### Compatibility

- `npx goalbuddy` with no flag now prepares Codex and Claude Code together. Existing Codex-only automation can keep using `--target codex` or `--codex-home`.
- `npx goal-maker` continues to work as a temporary alias and prints the new command.
- The shared `goalbuddy/SKILL.md` payload is unchanged in shape; the framing is now bilingual.

### Tests

- All 46 tests pass.
- Help-text and version-arithmetic tests updated for the bilingual usage and the 0.3.0 bump.

### Adding Or Updating Both

Install or refresh both supported agent environments:

```bash
npx goalbuddy
npx goalbuddy update
```
