#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const json = process.argv.includes("--json");

if (!inputPath) {
  failUsage("Usage: goalbuddy can-stop <docs/goals/slug> [--json]");
}

const goalPath = resolve(inputPath);
const statePath = existsSync(goalPath) && statSync(goalPath).isDirectory()
  ? join(goalPath, "state.yaml")
  : goalPath;
const checker = join(__dirname, "check-goal-state.mjs");
const checked = spawnSync(process.execPath, [checker, statePath], {
  encoding: "utf8",
});

let state;
try {
  state = JSON.parse(checked.stdout || "{}");
} catch {
  emit({
    ok: false,
    can_stop: false,
    reason: "state_check_failed",
    state_path: statePath,
    errors: [checked.stderr.trim() || "Goal state checker returned unreadable output."],
  }, 1);
}

if (checked.status !== 0 || !state.ok) {
  emit({
    ok: false,
    can_stop: false,
    reason: "invalid_goal_state",
    state_path: statePath,
    goal_status: state.goal_status || null,
    active_task: state.active_task || null,
    errors: state.errors || [],
  }, 1);
}

if (state.goal_status === "active") {
  emit({
    ok: true,
    can_stop: false,
    reason: "runnable_work_remains",
    state_path: statePath,
    goal_status: state.goal_status,
    active_task: state.active_task,
    next: `Continue the active task ${state.active_task}. Do not report the goal as complete.`,
  }, 1);
}

if (state.goal_status === "blocked") {
  emit({
    ok: true,
    can_stop: true,
    reason: "validated_terminal_block",
    state_path: statePath,
    goal_status: state.goal_status,
    active_task: state.active_task,
  }, 0);
}

emit({
  ok: true,
  can_stop: true,
  reason: "full_outcome_complete",
  state_path: statePath,
  goal_status: state.goal_status,
  active_task: state.active_task,
}, 0);

function emit(result, code) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.can_stop) {
    console.log(`GoalBuddy can stop: ${result.reason}.`);
  } else {
    console.error(`GoalBuddy cannot stop: ${result.reason}.`);
    if (result.next) console.error(result.next);
    for (const error of result.errors || []) console.error(`- ${error}`);
  }
  process.exit(code);
}

function failUsage(message) {
  if (json) console.error(JSON.stringify({ ok: false, can_stop: false, error: message }, null, 2));
  else console.error(message);
  process.exit(2);
}
