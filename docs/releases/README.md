# Release Process

Historical release notes live next to this process doc:

- [0.3.8: Board Hub Guardrails](0.3.8.md)
- [0.3.7: Goalmaxxed](0.3.7.md)
- [0.3.5: Subgoals, Parallel Agents, and Dark Mode](0.3.5.md)

GoalBuddy publishes the `goalbuddy` npm package from GitHub Actions using npm trusted publishing. This avoids long-lived npm write tokens and lets npm generate provenance for future releases.

## One-Time npm Setup

Configure this on npmjs.com for the `goalbuddy` package:

- Publisher: GitHub Actions
- GitHub owner/user: `tolibear`
- Repository: `goalbuddy`
- Workflow filename: `npm-publish.yml`
- Package: `goalbuddy`

The workflow path in this repo is:

```text
.github/workflows/npm-publish.yml
```

Or configure the same trust relationship from the npm CLI:

```bash
npx --yes npm@11.13.0 trust github goalbuddy \
  --repo tolibear/goalbuddy \
  --file npm-publish.yml \
  --yes
```

This command requires npm owner authentication and may print an `EOTP` browser/OTP URL. Complete that npm authentication step, then rerun the same command if needed. The `npx --yes npm@11.13.0 trust ...` form is intentional; using `npx -p npm@latest npm trust ...` can resolve to an older global npm binary that does not expose the `trust` command.

After the trusted publisher works, use npm package settings to require 2FA and disallow tokens for publishing. Keep `goal-maker` published during the migration window.

Starting in `0.3.0`, the installer is target-aware: `npx goalbuddy` installs into both `~/.codex/` and `~/.claude/`, and `goalbuddy update` refreshes both by default. Use `--target codex` or `--target claude` to narrow a command. Both targets share the same `goalbuddy/` skill payload and are exercised by the test suite under `internal/test/`.

## Release Flow

1. Update `package.json` version.
2. Run local checks:

```bash
npm run check
npm run pack:dry-run
node internal/cli/check-publish-version.mjs
```

3. Commit and push the version change.
4. Create and publish a GitHub release whose tag matches the package version, for example `v0.2.11`.
5. Confirm the GitHub Actions workflow `Publish npm package` completed.
6. Verify npm:

```bash
npm view goalbuddy name version dist-tags repository bin --json
npx goalbuddy --help
npx goalbuddy doctor --target codex
npx goalbuddy doctor --target claude
```

## Provenance Expectations

npm trusted publishing requires a GitHub-hosted runner, Node `22.14.0` or newer, npm `11.5.1` or newer, and `id-token: write` workflow permission. The release workflow uses Node 24 and grants the OIDC permission required by npm.

The same workflow runs the release gate on Node 18 before publishing because `package.json` declares `engines.node >=18`. Keep publish/version checks compatible with that runtime floor even though trusted publishing itself runs on newer Node.

When publishing through trusted publishing from this public repo to the public `goalbuddy` package, npm should generate provenance automatically. The workflow intentionally runs `npm publish` without `NODE_AUTH_TOKEN`; npm exchanges the GitHub OIDC identity for a short-lived publish credential.

## Compatibility Package

Do not unpublish `goal-maker`. During the 60-90 day compatibility window, `npx goal-maker` should continue to work and point users to:

```bash
npx goalbuddy
```

After the compatibility window:

```bash
npm deprecate goal-maker "Renamed to goalbuddy. Use: npx goalbuddy"
```
