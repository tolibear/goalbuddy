# GoalBuddy Agents
updated: 2026-07-26

Use three generic agents. The main `/goal` thread remains PM and owns the board.

| Agent | model_reasoning_effort | sandbox_mode | Purpose |
|---|---:|---|---|
| goal_scout | low | read-only | Targeted evidence mapping and candidate facts |
| goal_worker | medium | workspace-write | One coherent bounded implementation/recovery slice |
| goal_judge | high | read-only | Strategic review, escalation, completion skepticism |

## PM Thinking Policy

The main `/goal` thread is the PM. It owns board truth, chooses active tasks, and decides when receipts are sufficient.

| Goal mode | PM thinking |
|---|---:|
| specific, bounded | medium |
| open-ended | high |
| recovery | high |
| audit | high |
| high-risk or multi-day final audit | xhigh optional |

Do not use `xhigh` by default. Use it only when a wrong board, scope, or completion decision would be materially more expensive than latency and cost.

Tasks may include optional `reasoning_hint: default | low | medium | high | xhigh`. Treat it as PM guidance, not permission to widen scope.

Recommended project config:

```toml
[agents]
max_threads = 4
max_depth = 1
job_max_runtime_seconds = 1800
```

Install:

```bash
mkdir -p .codex/agents
cp .codex/skills/goalbuddy/agents/goal_*.toml .codex/agents/
```

Rules:

- Only the PM loop chooses active tasks, marks tasks done, or completes the goal.
- Keep at most one write-capable Worker active unless disjoint write scopes are explicit in `state.yaml`.
- Worker defaults to medium reasoning for implementation tasks and should complete the whole assigned slice.
- Scout and Judge are read-only and safe to parallelize when their board inputs are clear.
- Judge is high thinking and should choose the largest safe useful slice, not the narrowest helper.
