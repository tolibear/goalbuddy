# Release Process

The repository has one canonical, running release history: [CHANGELOG.md](../../CHANGELOG.md). Add every future release to the top of that file. Do not create a separate `docs/releases/<version>.md` file.

This directory contains the release process only. Published GitHub Releases remain immutable public snapshots and should use the matching section of `CHANGELOG.md` as their source copy.

Keep every changelog section and GitHub Release body client-safe. Describe the observed behavior generically and never include client, customer, company, donor, or private project names. Public contributor attribution is allowed.

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
npx --yes npm@^11.15.0 trust github goalbuddy \
  --repo tolibear/goalbuddy \
  --file npm-publish.yml \
  --allow-publish \
  --yes
```

This command requires npm owner authentication and may print an `EOTP` browser/OTP URL. Complete that npm authentication step, then rerun the same command if needed. npm `11.15.0` or newer is required for `npm trust`, and `--allow-publish` explicitly limits the relationship to package publishing.

After the trusted publisher works, use npm package settings to require 2FA and disallow tokens for publishing. Keep `goal-maker` published during the migration window.

Starting in `0.3.0`, the installer is target-aware: `npx goalbuddy` installs into both `~/.codex/` and `~/.claude/`, and `goalbuddy update` refreshes both by default. Use `--target codex` or `--target claude` to narrow a command. Both targets share the same `goalbuddy/` skill payload and are exercised by the test suite under `internal/test/`.

## Release Flow

1. Update `package.json` and both plugin manifest versions, then add the new release section to the top of `CHANGELOG.md`.
2. Run local checks:

```bash
npm run check
npm run pack:dry-run
node internal/cli/check-publish-version.mjs
```

3. Commit and push the version and changelog changes together.
4. Create and publish a GitHub release whose tag matches the package version, for example `v0.4.3`, using the matching `CHANGELOG.md` section as its release body. The workflow refuses to publish when the release tag and `package.json` version differ.
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
