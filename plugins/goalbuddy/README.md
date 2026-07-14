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

This runs one rollback-safe transaction: it snapshots GoalBuddy-owned surfaces, installs and verifies both harnesses, retires only a recognized standalone compiler symlink, and restores the snapshot if any stage fails.

## Install One Target

```bash
goalbuddy install --target codex
goalbuddy install --target claude
```

The Claude target installs the compiler/backend pair, Scout/Judge/Worker task agents, the low-reasoning Board Keeper, the recovery-only Ledger Auditor, and `/goal`. Restart Claude Code, then run:

```text
/codex-goal-compiler
```

Install this private package from its local checkout:

```bash
bun add -g "$PWD" --ignore-scripts
goalbuddy install                  # installs both targets transactionally
goalbuddy install --target codex   # installs Codex only
goalbuddy install --target claude  # installs Claude Code only
```

The package step has no install lifecycle hook and cannot activate either harness. Bare `goalbuddy` shows help only.

For local CLI testing before activation:

```bash
node internal/cli/goal-maker.mjs
node internal/cli/goal-maker.mjs doctor --target codex
node internal/cli/goal-maker.mjs board docs/goals/<slug> --once --json
```

## Release Notes

The plugin is owned by the `Danielalnajjar/goalbuddy` fork and installed from the local checkout. Keep both manifests aligned with `package.json`; do not publish this fork over the upstream npm package.
