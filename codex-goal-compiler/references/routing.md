# Unified Goal Routing

## Contents

- [Purpose](#purpose)
- [Routing table](#routing-table)
- [Standalone-goal indicators](#standalone-goal-indicators)
- [GoalBuddy indicators](#goalbuddy-indicators)
- [Review-round routing](#review-round-routing)
- [Explicit user preference](#explicit-user-preference)
- [Context precedence](#context-precedence)
- [Existing plans](#existing-plans)
- [Minimal question rule](#minimal-question-rule)
- [Examples](#examples)

## Purpose

`codex-goal-compiler` is one user-facing entry point. It chooses the execution form after inspecting the current context. The user may request a route explicitly, but does not need to know the backend in advance.

## Routing table

| Work shape | Route | Produced state |
|---|---|---|
| One clear change that fits a normal implementation turn | Direct work | None |
| Outcome still vague, contested, or missing verifiable completion | Planning or Goal Prep | Plan/intake, not execution state |
| One bounded coherent outcome benefiting from persistence | Standalone native goal | `docs/codex-goals/<slug>/goal.md` |
| Completed board or implementation needs one bounded review/remediation round | Standalone native goal | One review-focused `goal.md` |
| Broad, long-running, multi-workstream, interruption-prone work | GoalBuddy | `docs/goals/<slug>/goal.md`, `state.yaml`, tasks, receipts |
| Repeated procedure triggered by time, events, inbox items, alerts, or changing inputs | Loop / Automation / Schedule | Recurring runtime state |
| One bounded plan-to-branch implementation package | Direct work or Omega | Branch/package state |

## Standalone-goal indicators

Use the native route when most of these are true:

- one owner outcome;
- one coherent implementation or review loop;
- accepted context or plan already exists;
- one file can preserve progress and decisions honestly;
- no durable task ownership or task DAG is needed;
- one sustained goal-mode run is plausible;
- interruption recovery requires a living record, but not receipts or board coordination;
- final verification can be expressed in one Definition of Done.

## GoalBuddy indicators

Use GoalBuddy when several are true:

- execution spans many days or frequent interruptions;
- several independently scheduled, blocked, or parallel workstreams exist;
- multiple agents need durable ownership and receipts;
- cross-harness continuation is expected;
- approvals or credentials block different slices at different times;
- task status needs board rendering or monitoring;
- completion requires many independently verified packages;
- one Markdown file would become a disguised, unreliable task graph.

## Review-round routing

A completed GoalBuddy board does not imply that every follow-up needs a new board.

Default to a standalone native goal when the remaining work is one bounded:

- final review;
- remediation pass;
- hardening pass;
- cleanup pass;
- verification pass;
- documentation reconciliation;
- or post-launch follow-up.

Use a new GoalBuddy board only when the follow-up itself has multiple durable workstreams, receipts, blocked slices, or long-horizon coordination.

The completed board may be listed under Source of Truth. Treat it as read-only unless the user explicitly requests resumption or mutation.

## Explicit user preference

- If the user explicitly requests native `/goal`, use it when one file can represent the outcome honestly. Warn when GoalBuddy capabilities are being declined.
- If the user explicitly requests GoalBuddy, confirm the task is not recurring and the runtime is ready. Respect the request even when a native goal would be lighter, after noting the overhead.
- If the user explicitly asks not to create a board, never create board state silently.
- If the chosen route would be dishonest or unsafe, ask one focused route question.

## Context precedence

1. System, host, and repository instructions.
2. Latest explicit user decision.
3. Explicitly accepted plan, review decision, or owner-approved artifact.
4. Current repository facts and executed tool evidence.
5. Earlier conversation context.
6. Labeled model inference.

Do not convert an inference into an owner decision.

## Existing plans

When an accepted plan file exists:

- reference it under Source of Truth;
- preserve decisions, non-goals, sequence, interfaces, and verification expectations;
- summarize only what the selected artifact needs to remain usable after compaction;
- do not re-plan from scratch;
- record evidence-backed amendments in the goal's Decision Log or GoalBuddy notes.

When the plan exists only in conversation, distill its accepted sequence and omit rejected exploratory branches.

When `PLANS.md`, `plans.md`, or a configured agent plans resource exists, follow its applicable living-plan conventions. Do not fabricate the resource when absent.

## Minimal question rule

Ask one focused question only when a missing answer changes:

- the outcome;
- final proof;
- authority or permission;
- destructive or irreversible action;
- or route between native goal and GoalBuddy.

Otherwise proceed with the narrowest labeled assumption.

## Dependency and runtime fallback

Dependencies are route-specific. A missing backend must not block unrelated routes.

| Missing capability | Required response |
|---|---|
| Omega | Re-evaluate direct work versus standalone native goal; use GoalBuddy only when board-worthy. |
| Native `/goal` | Create a file only as an explicit later-Codex handoff; otherwise choose direct, planning, or GoalBuddy. |
| GoalBuddy or Goal Prep | Block board creation. Use a native goal only when one living file is an honest representation of the work. |
| Loop/Automation/Schedule | Recommend the recurring route and report the missing runtime; do not create a perpetual goal as a substitute. |
| Governing plans resource | Use accepted conversation/repository evidence when sufficient; do not invent the resource. |

Whenever fallback removes receipts, board monitoring, cross-session continuation, durable task ownership, or another material capability, disclose that loss before compiling the alternative.

## Examples

### Native goal

```text
The board is complete. Turn the final review and remediation we agreed on into goal mode, but do not create another board.
```

### GoalBuddy

```text
Compile the accepted multi-quarter migration plan into a new GoalBuddy board with independent workstreams and durable receipts.
```

### Direct

```text
Make this one-line config edit and run the targeted test.
```

### Planning first

```text
I want to improve onboarding somehow, but I have not decided what success means.
```

### Recurring

```text
Check this inbox every morning and triage new incidents.
```

## Difficult near-misses

### Execute an existing goal

```text
Follow docs/codex-goals/final-review/goal.md and make the changes.
```

This is execution, not compilation. Do not recompile unless the user asks to revise or replace the goal.

### Small direct task

```text
Rename this config key and run the targeted test.
```

Use direct implementation unless the user explicitly asks for native goal mode.

### Vague planning request

```text
I want to improve onboarding. Turn it into a complete goal.
```

If outcome and proof are unsettled, route to planning or Goal Prep first.

### Recurring task

```text
Check these reports every Friday and flag regressions.
```

Route to a loop, automation, or schedule rather than creating one perpetual goal.
