# GoalBuddy Agents

Use three task agents plus two control-plane agents: a low-reasoning Board Keeper and a recovery-only Ledger Auditor. The main `/goal` thread remains PM and owns board meaning.

| Agent | model_reasoning_effort | sandbox_mode | Purpose |
|---|---:|---|---|
| goal_scout | medium | read-only | Targeted evidence mapping and candidate facts |
| goal_worker | medium | workspace-write | One coherent bounded implementation/recovery slice |
| goal_judge | xhigh | read-only | Strategic review, escalation, completion skepticism |
| goal_keeper | low | workspace-write | Exceptional PM-authorized board inspection, repair, rebinding, and noncanonical validation |
| goal_ledger | medium | read-only | Recovery-only board/projection/repository reconciliation |

## PM Thinking Policy

The main `/goal` thread is the PM. It owns board meaning, chooses active tasks, and decides when receipts are sufficient. Complete canonical typed decisions go directly through GoalBuddy's digest-bound atomic transition CLI. Keeper reads the board only for exceptional inspection, repair, rebinding, ambiguity, or noncanonical control work; an already-known one-location edit may still use the execution contract's exact-context path.

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

- Only the PM loop chooses active tasks, decides tasks are done, or decides the goal is complete; deterministic typed transitions record complete canonical decisions without a model wrapper.
- Keep at most one active task and one write-capable Worker per board. Represent each additional concurrent product-writing lane as a depth-one child board, require pairwise-disjoint structured `allowed_files`, and run the bundled `parallel-plan` projection. Worktrees isolate bytes but never replace board recovery identity or those checks.
- Keep at most one Keeper on a board. Use it whenever the PM must or may need to read board content, state is ambiguous, repair or rebinding is required, or no typed transition represents the complete decision. Receipt closeout/activation, amendment, hydration, exact-human wait/reply, and completion use the direct digest-bound atomic CLI. A one-location PM edit remains limited to an already-known location requiring no board read and still requires the current digest plus a passing checker.
- Worker defaults to high reasoning for implementation tasks and should complete the whole assigned slice.
- Scout and Judge are read-only and safe to parallelize when their board inputs are clear.
- Judge is xhigh thinking and should choose the largest safe useful slice, not the narrowest helper.
- Keeper is not a task agent. It is Sol low in Codex, applies only exact PM-authorized exceptional control-file operations, runs the checker, and emits `goalbuddy_keeper_receipt_v1`.
- Ledger is not a task agent. Run it only at genuine recovery boundaries; it never edits state, chooses work, or emits a task receipt.
