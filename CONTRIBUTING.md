# Contributing

Thanks for improving `goalbuddy`.

## Local Setup

Clone the repo and run the checks:

```bash
git clone https://github.com/tolibear/goalbuddy.git
cd goalbuddy
npm run check
```

## Skill Tree Sync

`goalbuddy/` is the canonical skill tree. `plugins/goalbuddy/skills/goal-prep/` is a generated mirror; never edit it directly. After changing anything under `goalbuddy/`, run:

```bash
npm run sync:plugin
```

The test suite fails if the two trees differ.

## Local Install Test

GoalBuddy installs into Codex and Claude Code by default. Use temporary home directories so local testing does not overwrite your real install:

```bash
# Both targets
root=$(mktemp -d)
node internal/cli/goal-maker.mjs --codex-home "$root/codex" --claude-home "$root/claude"
node internal/cli/goal-maker.mjs doctor --target codex --codex-home "$root/codex"
node internal/cli/goal-maker.mjs doctor --target claude --claude-home "$root/claude"
rm -rf "$root"

# One target
tmp=$(mktemp -d)
node internal/cli/goal-maker.mjs install --target claude --claude-home "$tmp"
node internal/cli/goal-maker.mjs doctor --target claude --claude-home "$tmp"
rm -rf "$tmp"
```

## Package Check

Before opening a PR, verify the npm package contents:

```bash
npm pack --dry-run
```

The package should include `README.md`, `CHANGELOG.md`, `docs/releases/`, `internal/assets/`, `package.json`, `internal/cli/`, the canonical `goalbuddy/` skill directory, and `plugins/goalbuddy/` (with both `.codex-plugin/` and `.claude-plugin/` manifests).

## Releases

GoalBuddy publishes from GitHub Actions with npm trusted publishing. See [docs/releases](docs/releases/README.md) before creating a release.

## Contribution Guidelines

- Keep the runtime dependency-free unless there is a strong reason.
- Keep `goalbuddy/` installable as the canonical skill directory.
- Keep installation working for both Codex and Claude Code.
- Keep `$goal-maker` working as a generated compatibility alias until the migration window ends.
- Prefer small, reviewable changes.
- Update README or templates when behavior changes.
- Run `npm run check` before submitting changes.
