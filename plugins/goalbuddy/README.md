# GoalBuddy Plugin (Codex + Claude Code)

GoalBuddy packages the canonical `goal-prep` skill as a plugin so teams can install the reusable workflow in **Codex** and **Claude Code**, while keeping the npm CLI for local setup, doctor checks, and the built-in local board surface.

Version 0.4.3 preserves Claude Code's native `/goal` command and installs GoalBuddy execution as `/goalbuddy`.

## What It Contains

- `.codex-plugin/plugin.json`: Codex plugin manifest and Codex UI copy.
- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `skills/goal-prep/`: the installable GoalBuddy skill payload (shared by both platforms).
- `agents/`: Claude Code subagent definitions (`goal-scout.md`, `goal-judge.md`, `goal-worker.md`).
- `commands/goalbuddy.md`: Claude Code's GoalBuddy execution command, kept separate from native `/goal`.
- `skills/goal-prep/SKILL.md`: canonical `$goal-prep` / `/goal-prep` entry point.
- `assets/goalbuddy-icon.svg`: lightweight plugin icon.

## Local Testing

From the repo root:

```bash
npm run check
npx goalbuddy doctor
npx goalbuddy check-update
```

## Install Both Targets

```bash
npx goalbuddy
```

This installs and enables the native Codex plugin in `~/.codex/`, then installs the GoalBuddy skill, `/goalbuddy` command, and Scout/Judge/Worker subagents into `~/.claude/`. The skill surfaces `/goal-prep` in Claude Code.

## Install One Target

```bash
npx goalbuddy --target codex
npx goalbuddy --target claude
```

This installs the GoalBuddy skill and the three Scout/Judge/Worker subagents into `~/.claude/`. Restart Claude Code, then run:

```text
/goal-prep
```

After Goal Prep creates a board, start it with Codex `/goal` or Claude Code `/goalbuddy`, as printed by the tool.

Or install the npm package globally:

```bash
npm i -g goalbuddy
goalbuddy                  # installs for Codex and Claude Code
goalbuddy --target codex   # installs for Codex only
goalbuddy --target claude  # installs for Claude Code only
```

For local CLI testing before npm publish:

```bash
node internal/cli/goal-maker.mjs
node internal/cli/goal-maker.mjs doctor
node internal/cli/goal-maker.mjs board docs/goals/<slug> --once --json
```

## Release Notes

The plugin is prepared for the `tolibear/goalbuddy` repo and `goalbuddy` npm package. Keep `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` aligned with `package.json` before publishing a new package release.
