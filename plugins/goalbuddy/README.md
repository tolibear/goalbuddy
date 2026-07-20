# GoalBuddy Plugin (Codex + Claude Code)

GoalBuddy packages the canonical `goal-prep` skill as a plugin so teams can install the reusable workflow in **Codex** and **Claude Code**, while keeping the npm CLI for local setup, doctor checks, and the built-in local board surface.

On both platforms the workflow installs as a native plugin. Claude Code is plugin-only (it needs the `claude` CLI, or `/plugin` from inside Claude Code); there is no loose-file fallback.

## What It Contains

- `.codex-plugin/plugin.json`: Codex plugin manifest and Codex UI copy.
- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `skills/goal-prep/`: the installable GoalBuddy skill payload (shared by both platforms).
- `agents/`: Claude Code subagent definitions (`goal-scout.md`, `goal-judge.md`, `goal-worker.md`).
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

This installs and enables the native plugin on both Codex (`~/.codex/`) and Claude Code (`~/.claude/plugins/`), each surfacing the `$goal-prep` skill, the Scout/Judge/Worker subagents, and the `/goal` command from the plugin cache. On Claude Code, if the `claude` CLI is not on `PATH`, the installer writes no loose files: it reports an `unmanaged` result and prints how to finish from inside Claude Code (`/plugin marketplace add tolibear/goalbuddy` then `/plugin install goalbuddy@goalbuddy`).

## Install One Target

```bash
npx goalbuddy --target codex
npx goalbuddy --target claude
```

This installs the native GoalBuddy plugin (the skill, the Scout/Judge/Worker subagents, and the `/goal` command) for the chosen target. Restart Claude Code, then run:

```text
/goal-prep
```

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

The plugin ships from the `tolibear/goalbuddy` repo and the `goalbuddy` npm package. An `npm version` lifecycle hook stamps both `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` from `package.json`, so a release keeps all three versions in lockstep. See [docs/releases](../../docs/releases/README.md).
