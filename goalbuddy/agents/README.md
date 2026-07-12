# GoalBuddy Agents

This directory contains skill metadata and bundled agent definitions for Codex and Claude Code.

## Files

- `openai.yaml` stays with the skill as metadata.
- `goal_scout.toml`, `goal_judge.toml`, `goal_worker.toml` — Codex task-agent configs. `goal_ledger.toml` is the recovery-only Ledger Auditor. Copy them into `.codex/agents/` for project-scoped agents or `~/.codex/agents/` for personal agents.
- Claude Code agent markdown lives in `plugins/goalbuddy/agents/` (installed to `~/.claude/agents/` by `npx goalbuddy --target claude`).

## Agent Matrix

| Agent | Codex file | Claude Code file | Reasoning effort | Write scope |
|---|---|---|---:|---|
| Scout | `goal_scout.toml` | `goal-scout.md` | medium | read-only |
| Worker | `goal_worker.toml` | `goal-worker.md` | high | workspace-write |
| Judge | `goal_judge.toml` | `goal-judge.md` | xhigh | read-only |
| Ledger | `goal_ledger.toml` | `goal-ledger.md` | medium (Codex), high (Claude) | read-only |

## Recommended Codex Config

```toml
[agents]
max_threads = 4
max_depth = 1
job_max_runtime_seconds = 1800
```

## Authority Boundary

Only the main `/goal` PM loop may select the active task, mark tasks done, update board truth, or mark the goal complete.

Scout, Worker, and Judge act only from board task cards and return receipts. Ledger never receives a task card or returns a board receipt; it reconciles recovery state and returns `goalbuddy_ledger_audit_v1` only at genuine recovery boundaries.
