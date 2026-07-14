# GoalBuddy Plugin (Codex + Claude Code)

GoalBuddy packages the canonical `codex-goal-compiler` front door and `goal-prep` backend for **Codex** and **Claude Code**, with the local CLI providing install, contract, doctor, recovery, and board surfaces.

Version 0.5.0 unifies compiler and runtime ownership without changing the board schema or rewriting existing boards.

## What It Contains

- `.codex-plugin/plugin.json`: Codex plugin manifest and Codex UI copy.
- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `skills/codex-goal-compiler/`: the user-facing route compiler.
- `skills/goal-prep/`: the GoalBuddy board-preparation and execution backend.
- `agents/`: Claude Code task-agent definitions (`goal-scout.md`, `goal-judge.md`, `goal-worker.md`) plus the execution-time `goal-keeper.md` and recovery-only `goal-ledger.md` control-plane agents.
- `skills/codex-goal-compiler/SKILL.md`: canonical `$codex-goal-compiler` / `/codex-goal-compiler` entry point.
- `assets/goalbuddy-icon.svg`: lightweight plugin icon.

## Local Testing

From the repo root:

```bash
npm run check
goalbuddy contract --target codex --json
goalbuddy doctor --target codex --goal-ready
```

## Install Both Targets

```bash
goalbuddy install
```

This installs and enables the native Codex plugin, then installs the same compiler/backend pair, Scout/Judge/Worker task agents, Board Keeper, Ledger recovery auditor, and `/goal` command into Claude Code.

## Install One Target

```bash
goalbuddy install --target codex
goalbuddy install --target claude
```

This installs the GoalBuddy skill, the three Scout/Judge/Worker task agents, the low-reasoning Board Keeper, and the recovery-only Ledger Auditor into `~/.claude/`. Restart Claude Code, then run:

```text
/codex-goal-compiler
```

Install this private package from its local checkout:

```bash
bun add -g "$PWD"
goalbuddy                  # installs for Codex and Claude Code
goalbuddy --target codex   # installs for Codex only
goalbuddy --target claude  # installs for Claude Code only
```

For local CLI testing before activation:

```bash
node internal/cli/goal-maker.mjs
node internal/cli/goal-maker.mjs doctor
node internal/cli/goal-maker.mjs board docs/goals/<slug> --once --json
```

## Release Notes

The plugin is owned by the `Danielalnajjar/goalbuddy` fork and installed from the local checkout. Keep both manifests aligned with `package.json`; do not publish this fork over the upstream npm package.
