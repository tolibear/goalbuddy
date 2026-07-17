#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { immutableHistoryCompatibility, rawTaskBlock, sha256 } from "./immutable-history-proof.mjs";
import { joinedOptionValue, printPublicFailure, publicError, requiredOptionValue } from "./public-error.mjs";
import { receiptExample } from "./receipt-contract.mjs";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const WORKER_SCOPE_CHANGE_RECOVERY = "If a stop_if condition fires because work needs files or authority outside allowed_files, stop before those writes and return a blocked receipt. Do not widen or retry the active task. The PM must use GoalBuddy's direct digest-bound apply_amendment transition to atomically record it as blocked and create and activate a fully scoped successor, or apply_hydration when a queued successor already exists.";

const ROLE_DEFAULTS = {
  scout: { agent: "goal_scout", reasoning: "medium", sandbox: "read-only" },
  judge: { agent: "goal_judge", reasoning: "xhigh", sandbox: "read-only" },
  worker: { agent: "goal_worker", reasoning: "high", sandbox: "workspace-write" },
  pm: { agent: "PM", reasoning: "medium", sandbox: "workspace-write" },
};

if (isDirectRun()) {
  try {
    const result = renderTaskPrompt(parseArgs(process.argv.slice(2)));
    if (result.json) {
      console.log(JSON.stringify(result.payload, null, 2));
    } else {
      console.log(formatPrompt(result.payload));
    }
  } catch (error) {
    printPublicFailure(error, { json: process.argv.slice(2).includes("--json") });
    process.exitCode = 1;
  }
}

export function renderTaskPrompt(options) {
  const admitted = admitCurrentTask(options);
  return { json: options.json, payload: admitted.payload };
}

export function admitCurrentTask(options) {
  if (!/^[a-f0-9]{64}$/.test(options.expectedStateDigest || "")) {
    throw publicError("STALE_STATE_DIGEST", "prompt requires --expected-state-digest with exactly 64 lowercase hex characters.");
  }
  const boardPath = resolveBoardPath(options);
  const board = loadBoard(boardPath, options);
  const task = selectTask(board, options.taskId);
  const activeTasks = board.tasks.filter((candidate) => candidate?.status === "active");
  if (board.goal?.status !== "active") {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `Prompt requires goal.status active; got ${board.goal?.status || "null"}.`);
  }
  if (activeTasks.length !== 1 || activeTasks[0]?.id !== board.activeTask) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `Prompt requires exactly one active task matching active_task ${board.activeTask || "null"}; found ${activeTasks.map((candidate) => candidate?.id).filter(Boolean).join(", ") || "none"}.`);
  }
  if (options.taskId && options.taskId !== board.activeTask) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `Task ${options.taskId} is not the current active task ${board.activeTask}.`);
  }
  if (task.id !== board.activeTask || task.status !== "active" || !isReceiptFree(task)) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `Prompt requires current active receipt-free task ${board.activeTask}; got ${task.id} (${task.status}, receipt ${isReceiptFree(task) ? "empty" : "present"}).`);
  }
  const role = normalizeRole(task.type);
  const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.pm;
  const reasoning = normalizeReasoning(task.reasoning_hint, defaults.reasoning);
  const warnings = promptWarnings(board, task);
  const allowedFiles = stringList(task.allowed_files);

  const payload = {
      metadata: {
        recommended_agent: defaults.agent,
        required_spawn_agent_type: defaults.agent === "PM" ? null : defaults.agent,
        recommended_reasoning: reasoning,
        sandbox: defaults.sandbox,
        fork_context_allowed: role !== "worker",
        board_path: board.path,
        state_digest: board.stateDigest,
        projection_mode: board.projection.mode,
        checker_status: board.projection.checkerStatus,
        immutable_history: board.projection.immutableHistory,
        child_board_paths: childBoardPaths(board),
        goal_oracle: board.goal.oracle || null,
        slice_policy: board.document.rules?.slice_policy || null,
        changed_files_path_style: changedFilesPathStyle(allowedFiles),
        scope_change_recovery: role === "worker" ? WORKER_SCOPE_CHANGE_RECOVERY : null,
        warnings,
      },
      task: {
        id: task.id,
        type: role,
        assignee: task.assignee || defaults.agent,
        status: task.status,
        objective: task.objective || "",
        inputs: stringList(task.inputs),
        constraints: stringList(task.constraints),
        allowed_files: allowedFiles,
        verify: stringList(task.verify),
        stop_if: stringList(task.stop_if),
        reasoning_hint: task.reasoning_hint || null,
        expected_output: stringList(task.expected_output),
      },
      receipt_schema: taskReceiptExample(role, "done", task, board.path),
      receipt_schemas: {
        done: taskReceiptExample(role, "done", task, board.path),
        blocked: taskReceiptExample(role, "blocked", task, board.path),
      },
    };
  return {
    board,
    task,
    role,
    harness: typeof task.harness === "string" ? task.harness.trim() : "",
    payload,
  };
}

export function parseArgs(args) {
  const options = {
    goalRoot: "",
    boardPath: "",
    taskId: "",
    expectedStateDigest: "",
    expectedBoardTreeDigest: "",
    allowImmutableHistory: false,
    json: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--task") {
      options.taskId = requiredOptionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--task=")) {
      options.taskId = joinedOptionValue(arg, "--task");
    } else if (arg === "--board") {
      options.boardPath = requiredOptionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--board=")) {
      options.boardPath = joinedOptionValue(arg, "--board");
    } else if (arg === "--expected-state-digest") {
      options.expectedStateDigest = requiredOptionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--expected-state-digest=")) {
      options.expectedStateDigest = joinedOptionValue(arg, "--expected-state-digest");
    } else if (arg === "--expected-board-tree-digest") {
      options.expectedBoardTreeDigest = requiredOptionValue(args, index, arg);
      index += 1;
    } else if (arg.startsWith("--expected-board-tree-digest=")) {
      options.expectedBoardTreeDigest = joinedOptionValue(arg, "--expected-board-tree-digest");
    } else if (arg === "--allow-immutable-history") {
      options.allowImmutableHistory = true;
    } else if (arg === "--parallel-plan") {
      options.parallelPlan = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!options.goalRoot) {
      options.goalRoot = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.goalRoot && !options.boardPath) {
    throw new Error(promptUsage());
  }
  if (options.allowImmutableHistory && !/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) {
    throw new Error("--allow-immutable-history requires --expected-state-digest with exactly 64 lowercase hex characters.");
  }
  if (options.expectedStateDigest && !/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) {
    throw new Error("--expected-state-digest must contain exactly 64 lowercase hex characters.");
  }
  if (options.expectedBoardTreeDigest && !/^[a-f0-9]{64}$/.test(options.expectedBoardTreeDigest)) {
    throw new Error("--expected-board-tree-digest must contain exactly 64 lowercase hex characters.");
  }
  return options;
}

export function loadBoard(boardPath, options = {}) {
  if (!existsSync(boardPath)) throw new Error(`state file not found: ${boardPath}`);
  const stateText = readFileSync(boardPath, "utf8");
  const stateDigest = sha256(stateText);
  if (options.expectedStateDigest && options.expectedStateDigest !== stateDigest) {
    throw publicError("STALE_STATE_DIGEST", `state.yaml digest drift: expected ${options.expectedStateDigest}, got ${stateDigest}.`);
  }
  const checker = checkExactSnapshot(boardPath, stateText);
  if (checker.state_digest !== stateDigest) {
    throw publicError("CHECKER_FAILED", "GoalBuddy checker did not validate the exact state.yaml snapshot supplied to prompt rendering.");
  }
  const stateAfterCheck = readFileSync(boardPath, "utf8");
  if (stateAfterCheck !== stateText) {
    throw publicError("STALE_STATE_DIGEST", "state.yaml changed while GoalBuddy was validating the prompt snapshot.");
  }

  if (checker.ok === true) {
    return boardFromDocument(boardPath, stateText, parseGoalStateText(stateText, { allowFallback: false }), {
      mode: "strict_full_state",
      checkerStatus: "pass",
      immutableHistory: null,
    });
  }

  if (!options.allowImmutableHistory) {
    const detail = checker.errors?.slice(0, 3).join("; ") || "checker rejected the board";
    throw publicError("CHECKER_FAILED", `GoalBuddy checker rejected the exact prompt snapshot: ${detail}`);
  }

  const compatibility = immutableHistoryCompatibility({
    original: stateText,
    candidate: stateAfterCheck,
    baselineReport: checker,
    candidateReport: checker,
  });
  if (!compatibility.ok) {
    throw publicError("CHECKER_FAILED", `Immutable-history prompt projection rejected: ${compatibility.reason}`);
  }
  if (options.taskId && options.taskId !== checker.active_task) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `Immutable-history prompt projection may render only active task ${checker.active_task}; got ${options.taskId}.`);
  }

  const document = parseActiveTaskProjection(stateText, checker.active_task);
  return boardFromDocument(boardPath, stateText, document, {
    mode: "immutable_history_active_task",
    checkerStatus: "immutable_history_compatible",
    immutableHistory: compatibility.proof,
  });
}

export function loadBoardSnapshot(boardPath, stateText) {
  return boardFromDocument(boardPath, stateText, parseGoalStateText(stateText, { allowFallback: false }), {
    mode: "checker_validated_snapshot",
    checkerStatus: "pass",
    immutableHistory: null,
  });
}

function boardFromDocument(boardPath, stateText, document, projection) {
  if (!document || Number(document.version) !== 2) {
    throw new Error(`unsupported GoalBuddy state version in ${boardPath}: expected top-level "version: 2". Start from templates/state.yaml bundled with the goal-prep skill.`);
  }
  if (!Array.isArray(document.tasks)) throw new Error(`state file has no tasks: ${boardPath}`);
  return {
    path: boardPath,
    root: dirname(boardPath),
    document,
    tasks: document.tasks,
    goal: document.goal || {},
    activeTask: document.active_task || "",
    stateDigest: sha256(stateText),
    projection,
  };
}

function checkExactSnapshot(boardPath, stateText) {
  const checkerPath = resolve(scriptDir, "check-goal-state.mjs");
  const result = spawnSync(process.execPath, [checkerPath, boardPath, "--snapshot-stdin"], {
    encoding: "utf8",
    input: stateText,
  });
  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    throw new Error(`GoalBuddy checker produced unreadable output: ${(result.stderr || result.stdout || "").slice(0, 300)}`);
  }
  if (!report || typeof report !== "object" || !Array.isArray(report.errors)) {
    throw new Error("GoalBuddy checker returned an incomplete immutable-history report.");
  }
  return report;
}

function parseActiveTaskProjection(stateText, activeTaskId) {
  if (!/^T\d{3}$/.test(activeTaskId || "")) {
    throw new Error(`Immutable-history prompt projection requires one valid active T### task; got ${activeTaskId || "null"}.`);
  }
  const taskSections = [...stateText.matchAll(/^tasks:\s*$/gm)];
  if (taskSections.length !== 1) {
    throw new Error(`Immutable-history prompt projection requires exactly one top-level tasks section; found ${taskSections.length}.`);
  }
  const tasksHeader = taskSections[0];
  const contentStart = stateText.indexOf("\n", tasksHeader.index + tasksHeader[0].length);
  if (contentStart === -1) throw new Error("Immutable-history prompt projection found an empty tasks section.");
  const taskContentStart = contentStart + 1;
  const nextTopLevel = /^\S/m.exec(stateText.slice(taskContentStart));
  const taskSectionEnd = nextTopLevel ? taskContentStart + nextTopLevel.index : stateText.length;
  const activeTaskBlock = rawTaskBlock(stateText, activeTaskId);
  if (activeTaskBlock === null) {
    throw new Error(`Immutable-history prompt projection could not locate exact raw task block ${activeTaskId}.`);
  }
  const activeTaskOffset = stateText.indexOf(activeTaskBlock);
  if (activeTaskOffset < taskContentStart || activeTaskOffset >= taskSectionEnd) {
    throw new Error(`Immutable-history prompt projection found ${activeTaskId} outside the unique tasks section.`);
  }

  const projectedText = `${stateText.slice(0, tasksHeader.index)}tasks:\n${activeTaskBlock}${stateText.slice(taskSectionEnd)}`;
  const document = parseGoalStateText(projectedText, { allowFallback: false });
  if (!Array.isArray(document.tasks) || document.tasks.length !== 1) {
    throw new Error("Immutable-history prompt projection did not strictly parse exactly one active task.");
  }
  const task = document.tasks[0];
  if (document.active_task !== activeTaskId || task?.id !== activeTaskId || task?.status !== "active") {
    throw new Error(`Immutable-history prompt projection active-task mismatch for ${activeTaskId}.`);
  }
  return document;
}

function promptUsage() {
  return "Usage: goalbuddy prompt <goal-root> [--task T###] [--board path/to/state.yaml] --expected-state-digest <sha256> [--allow-immutable-history]";
}

export function resolveBoardPath(options) {
  const candidate = options.boardPath || options.goalRoot;
  if (!candidate) throw new Error("Missing goal root or board path.");
  const resolved = resolve(candidate);
  if (basename(resolved) === "state.yaml") return resolved;
  return resolve(resolved, "state.yaml");
}

export function selectTask(board, taskId = "") {
  const id = taskId || board.activeTask;
  if (!id) throw new Error(`No task selected and active_task is empty in ${board.path}`);
  const task = board.tasks.find((candidate) => candidate?.id === id);
  if (!task) throw new Error(`Task ${id} not found in ${board.path}`);
  return task;
}

function isReceiptFree(task) {
  return task?.receipt === null || !Object.hasOwn(task || {}, "receipt");
}

export function childBoardPaths(board) {
  return board.tasks
    .map((task) => task?.subgoal?.path)
    .filter(Boolean)
    .map((childPath) => resolve(board.root, childPath));
}

function promptWarnings(board, task) {
  const warnings = [];
  const role = normalizeRole(task.type);
  if (task.id !== board.activeTask) warnings.push(`Task ${task.id} is not the active task on this board.`);
  if (isWeakProof(board.goal.oracle?.signal)) {
    warnings.push("goal.oracle.signal is missing or placeholder-like; keep the goal pressured by a concrete completion oracle.");
  }
  if (isWeakProof(board.goal.oracle?.final_proof)) {
    warnings.push("goal.oracle.final_proof is missing or placeholder-like; do not mark the goal complete without receipt-backed proof.");
  }
  if (role === "worker") {
    if (stringList(task.allowed_files).length === 0) warnings.push(`Worker task ${task.id} has no allowed_files.`);
    if (stringList(task.verify).length === 0) warnings.push(`Worker task ${task.id} has no verify commands.`);
    if (stringList(task.stop_if).length === 0) warnings.push(`Worker task ${task.id} has no stop_if conditions.`);
    if (isFalse(board.goal.full_outcome_complete)) {
      warnings.push(`full_outcome_complete is false and ${task.id} is an active Worker; do not stop after rendering or repairing the board. Execute the Worker unless a stop_if condition applies.`);
    }
  }
  for (const candidate of board.tasks) {
    if (candidate?.subgoal && Number(candidate.subgoal.depth) !== 1) {
      warnings.push(`Task ${candidate.id} has subgoal.depth ${candidate.subgoal.depth || "<missing>"}; only depth 1 is supported.`);
    }
  }
  warnings.push(...microSliceWarnings(board, task));
  return warnings;
}

function microSliceWarnings(board, task) {
  const warnings = [];
  const doneTasks = board.tasks.filter((candidate) => candidate?.status === "done");
  const recentWorkers = board.tasks
    .filter((candidate) => normalizeRole(candidate?.type) === "worker")
    .slice(-5);
  const recentTinyWorkers = recentWorkers.filter((candidate) => isTinyTask(candidate));
  const activeRole = normalizeRole(task.type);
  const activeAllowedFiles = stringList(task.allowed_files);
  const firstMilestoneComplete = isTrue(board.goal.first_milestone_complete);
  const microWarning = "Board may be micro-slicing. Prefer the largest safe useful slice.";

  if (recentTinyWorkers.length >= 3) warnings.push(microWarning);
  if (doneTasks.length >= 10 && activeRole === "worker" && activeAllowedFiles.length > 0 && activeAllowedFiles.length <= 2) {
    warnings.push(`${microWarning} Active Worker ${task.id} has only ${activeAllowedFiles.length} allowed_files after ${doneTasks.length} completed tasks.`);
  }
  if (firstMilestoneComplete && activeRole === "worker" && isTinyTask(task)) {
    warnings.push(`${microWarning} The first milestone is complete, so the active Worker should move toward the next real milestone.`);
  }
  if (activeRole === "judge" && /pick small reviewable work|select one narrow next task/i.test(String(task.objective || "") + "\n" + stringList(task.constraints).join("\n"))) {
    warnings.push(`${microWarning} Judge instructions still ask for small or narrow work.`);
  }
  return [...new Set(warnings)];
}

function isTinyTask(task) {
  const text = [
    task?.objective,
    stringList(task?.constraints).join(" "),
    task?.receipt?.summary,
  ].join(" ").toLowerCase();
  return /\b(tiny|narrow|single helper|one helper|projection helper|projection function|contract file|read-only proof|doc note|validator|validation wrapper|pure helper|caller-input)\b/.test(text);
}

function normalizeRole(value) {
  const role = String(value || "pm").toLowerCase();
  return ROLE_DEFAULTS[role] ? role : "pm";
}

function normalizeReasoning(value, fallback) {
  const hint = String(value || "").toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(hint)) return hint;
  return fallback;
}

function isFalse(value) {
  return value === false || String(value).toLowerCase() === "false";
}

function isTrue(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function isWeakProof(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  return normalized === ""
    || normalized === "unknown"
    || normalized === "tbd"
    || normalized === "todo"
    || normalized === "none"
    || /^<.*>$/.test(normalized);
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined).map(String) : [];
}

function changedFilesPathStyle(allowedFiles) {
  if (!allowedFiles.length) return "repository-relative";
  const absoluteCount = allowedFiles.filter((path) => /^\//.test(path)).length;
  if (absoluteCount === allowedFiles.length) return "absolute";
  if (absoluteCount === 0) return "repository-relative";
  return "mirror-each-allowed-file";
}

function taskReceiptExample(role, result, task, boardPath) {
  const example = {
    ...receiptExample({ role, result }),
    task_id: task.id,
    board_path: boardPath,
  };
  if (role !== "worker") return example;
  const verify = stringList(task.verify);
  example.commands = verify.map((cmd, index) => ({
    cmd,
    status: result === "done" ? "pass" : (index === 0 ? "fail" : "not_run"),
  }));
  example.changed_files = result === "done"
    ? ["<every actually changed path inside allowed_files>"]
    : [];
  return example;
}

export function formatPrompt(payload) {
  const lines = [
    "GoalBuddy task prompt",
    "",
    "Metadata:",
    `- recommended_agent: ${payload.metadata.recommended_agent}`,
    `- required_spawn_agent_type: ${payload.metadata.required_spawn_agent_type || "PM fallback"}`,
    `- recommended_reasoning: ${payload.metadata.recommended_reasoning}`,
    `- sandbox: ${payload.metadata.sandbox}`,
    `- fork_context_allowed: ${payload.metadata.fork_context_allowed}`,
    `- board_path: ${payload.metadata.board_path}`,
    `- changed_files_path_style: ${payload.metadata.changed_files_path_style}`,
  ];
  if (payload.metadata.child_board_paths.length) {
    lines.push("- child_board_paths:");
    for (const path of payload.metadata.child_board_paths) lines.push(`  - ${path}`);
  }
  if (payload.metadata.goal_oracle) {
    lines.push(`- goal_oracle: ${JSON.stringify(payload.metadata.goal_oracle)}`);
  }
  if (payload.metadata.slice_policy) {
    lines.push(`- slice_policy: ${JSON.stringify(payload.metadata.slice_policy)}`);
  }
  if (payload.metadata.warnings.length) {
    lines.push("- warnings:");
    for (const warning of payload.metadata.warnings) lines.push(`  - ${warning}`);
  }

  lines.push(
    "",
    "Spawn contract:",
    `- Codex spawn_agent agent_type: ${payload.metadata.required_spawn_agent_type || "do not spawn; run as PM"}`,
    "- Do not substitute generic scout, worker, or judge agents for GoalBuddy agents.",
    "- If the required GoalBuddy agent is unavailable, stop spawning and continue as PM fallback or install agents.",
    "- A wait_agent polling timeout while the target agent is still running is only a polling interval expiry. Keep waiting on the same agent; do not interrupt, replace, redispatch, declare a task timeout, or trigger PM fallback.",
    "- Continue polling while liveness is confirmed. Under the Quiet Control Plane, do not narrate polling or internal agent management; when a user update is due, report only product-level progress, review status, a real blocker, or a required decision. Visible allowed-file changes are useful progress evidence, but their absence is not evidence of inactivity; read-only Judge/Ledger work and inspection-only Keeper work may never create diffs.",
    "- Recover deterministically only when the agent reaches a terminal timeout, failed, or unavailable state; liveness cannot be established; the configured job/runtime deadline is actually exceeded; or an explicit task stop condition fires. Preserve one-agent/no-duplicate dispatch.",
    `- In the receipt, changed_files must use ${payload.metadata.changed_files_path_style} paths, matching the path form recorded in allowed_files; do not convert absolute paths to relative paths or relative paths to absolute paths.`,
    "",
    "Task:",
    `- id: ${payload.task.id}`,
    `- type: ${payload.task.type}`,
    `- assignee: ${payload.task.assignee}`,
    `- status: ${payload.task.status}`,
    `- objective: ${payload.task.objective}`,
  );
  addList(lines, "inputs", payload.task.inputs);
  addList(lines, "constraints", payload.task.constraints);
  addList(lines, "allowed_files", payload.task.allowed_files);
  addList(lines, "verify", payload.task.verify);
  addList(lines, "stop_if", payload.task.stop_if);
  if (payload.metadata.scope_change_recovery) {
    lines.push(`- scope_change_recovery: ${payload.metadata.scope_change_recovery}`);
  }
  addList(lines, "expected_output", payload.task.expected_output);
  lines.push(
    "",
    "Expected receipt JSON shapes (return exactly one, matching the actual result; replace illustrative values with truthful evidence):",
    JSON.stringify(payload.receipt_schemas, null, 2),
  );
  return lines.join("\n");
}

function addList(lines, label, values) {
  if (!values.length) return;
  lines.push(`- ${label}:`);
  for (const value of values) lines.push(`  - ${value}`);
}

function isDirectRun() {
  return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}
