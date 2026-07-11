# Local GoalBuddy maintenance

This checkout is the machine's GoalBuddy source of truth.

## Runtime ownership

- Source: `/Users/danielalnajjar/Code/goalbuddy`
- Local branch: `local/receipt-coverage`
- Upstream: `origin/main` from `tolibear/goalbuddy`
- Bun global dependency: `/Users/danielalnajjar/Code/goalbuddy`
- Codex marketplace: local source `/Users/danielalnajjar/Code/goalbuddy`
- Claude Code: installed from this checkout with the package CLI

Topgrade may continue running its normal `bun_packages` step. Bun's global
manifest records GoalBuddy as a local filesystem dependency, so `bun -g update`
must preserve the checkout instead of resolving `goalbuddy@latest`. Codex's
marketplace is also local, so `codex plugin marketplace upgrade` does not fetch
GoalBuddy from GitHub. `GOALBUDDY_UPDATE_COMMAND` in `~/.zshenv` makes update
checks report a read-only `git fetch` command instead of a registry or mise
upgrade command.

## Refresh from upstream

Do not auto-merge or auto-install upstream GoalBuddy changes. Refresh manually:

```bash
git fetch origin main
git rebase origin/main
npm run sync:plugin
npm run check
bun add -g /Users/danielalnajjar/Code/goalbuddy --ignore-scripts
node internal/cli/goal-maker.mjs plugin install --source /Users/danielalnajjar/Code/goalbuddy --json
node internal/cli/goal-maker.mjs install --target claude --json
node internal/cli/goal-maker.mjs doctor --target codex --json
node internal/cli/goal-maker.mjs doctor --target claude --json
```

Review the upstream diff before rebasing. If upstream implements receipt-command
coverage equivalently, adjudicate and remove the local patch instead of keeping
two competing implementations.

## Local safeguard

Done Worker receipts must include every command from the task's `verify` list
verbatim with `status: pass`. The checker rejects missing, unrelated, renamed,
or failed verification commands, and `apply-receipt.mjs` reverts the board when
that invariant fails. Extra passing diagnostic commands remain allowed.
