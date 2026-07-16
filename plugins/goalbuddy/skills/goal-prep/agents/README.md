# GoalBuddy Agents

This directory contains skill metadata and bundled agent definitions for Codex and Claude Code.

## Files

- `openai.yaml` stays with the skill as metadata.
- `goal_scout.toml`, `goal_judge.toml`, `goal_worker.toml` — Codex task-agent configs. `goal_keeper.toml` is the execution-time Board Keeper and `goal_ledger.toml` is the recovery-only Ledger Auditor. Copy them into `.codex/agents/` for project-scoped agents or `~/.codex/agents/` for personal agents.
- Claude Code agent markdown lives in `plugins/goalbuddy/agents/` (installed to `~/.claude/agents/` by `goalbuddy install --target claude`).

## Agent Matrix

| Agent | Codex file | Claude Code file | Reasoning effort | Write scope |
|---|---|---|---:|---|
| Scout | `goal_scout.toml` | `goal-scout.md` | medium | read-only |
| Worker | `goal_worker.toml` | `goal-worker.md` | high | workspace-write |
| Judge | `goal_judge.toml` | `goal-judge.md` | xhigh | read-only |
| Keeper | `goal_keeper.toml` | `goal-keeper.md` | low | GoalBuddy control files only |
| Ledger | `goal_ledger.toml` | `goal-ledger.md` | medium (Codex), high (Claude) | read-only |

## Recommended Codex Config

```toml
[agents]
max_threads = 4
max_depth = 1
job_max_runtime_seconds = 1800
```

## Authority Boundary

Only the main `/goal` PM loop may select the active task, decide tasks are done, define board changes, or decide the goal is complete. Complete canonical typed decisions use GoalBuddy's direct digest-bound atomic CLI. Keeper applies only exceptional PM-authorized inspection, repair, rebinding, or noncanonical board operations and returns `goalbuddy_keeper_receipt_v1`; it makes no semantic decisions.

Scout, Worker, and Judge act only from board task cards and return receipts. Keeper and Ledger never receive task cards: Keeper handles execution-time board operations, while Ledger independently reconciles recovery state and returns `goalbuddy_ledger_audit_v1` only at genuine recovery boundaries.
