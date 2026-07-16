# Release Process

Historical release notes live next to this process doc:

- [0.5.0: Focused Compiler, Quiet Runtime](0.5.0.md)
- [0.4.0: Cross-Harness Goals](0.4.0.md)
- [0.3.9: Marketplace and Board Runtime Polish](0.3.9.md)
- [0.3.8: Board Hub Guardrails](0.3.8.md)
- [0.3.7: Goalmaxxed](0.3.7.md)
- [0.3.5: Subgoals, Parallel Agents, and Dark Mode](0.3.5.md)

This fork is released as a reviewed local Git checkpoint and installed as Bun's existing filesystem dependency. It must never publish over the upstream `goalbuddy` npm package.

The installer is target-aware: `goalbuddy install` installs into both `~/.codex/` and `~/.claude/`, and `goalbuddy update` refreshes both by default. Use `--target codex` or `--target claude` to narrow a command. Version 0.5.0 owns two canonical skill payloads—Codex Goal Compiler and Goal Prep—and exercises both through the repository test suite.

## Release Flow

1. Update `package.json` version.
2. Run local checks in an isolated worktree:

```bash
npm run check
npm run pack:dry-run
```

3. Install with one disposable `HOME` plus isolated `CODEX_HOME` and `CLAUDE_HOME`, then run both `goalbuddy contract` targets and doctors. The disposable `HOME` is required because Codex also discovers shared skills below `~/.agents`.
4. Verify representative current boards remain byte-identical after read-only resume/prompt checks.
5. Commit and push the candidate to the personal fork.
6. Activate locally only after explicit owner approval, then rerun the same gates against the live surfaces.

## Package proof

The tarball dry run remains a packaging boundary check even though the package is private:

```bash
npm run pack:dry-run
goalbuddy contract --target codex --json
goalbuddy contract --target claude --json
goalbuddy doctor --target codex --goal-ready
goalbuddy doctor --target claude
```

The inherited `goal-maker` aliases are compatibility debt, not a second product surface. Retire them only through a separate explicit cutover; do not extend them for new functionality.
