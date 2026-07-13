#!/usr/bin/env node
// Apply a receipt, task status, and active_task transition to state.yaml atomically.
// Fail-closed: the result is validated with check-goal-state.mjs and reverted on errors.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

if (isDirectRun()) {
  try {
    const options = parseApplyArgs(process.argv.slice(2));
    const report = applyTransition(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (report.mode === "reply" && report.no_change) {
      console.log(`Reply did not match ${report.task_id}; state.yaml was not changed.`);
    } else if (report.mode === "reply") {
      console.log(`Exact reply matched ${report.task_id}; the task is active again.`);
    } else if (report.mode === "wait") {
      console.log(`Recorded exact-human wait for ${report.task_id}; the goal is blocked.`);
    } else if (report.ok) {
      console.log(`Recorded ${report.task_id} as ${report.status}; active_task is now ${report.active_task}.`);
    } else {
      console.log(`Transition rejected and reverted. Checker errors:\n- ${report.checker_errors.join("\n- ")}`);
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export function parseApplyArgs(args) {
  const modes = new Set(["receipt", "wait", "reply"]);
  const options = { mode: modes.has(args[0]) ? args[0] : "receipt", goalRoot: "", taskId: "", receiptPath: "", replyPath: "", addTasksPath: "", hydrateTaskId: "", taskCardPath: "", taskCardSha256: "", expectedStateDigest: "", status: "", activate: "", json: false };
  for (let index = modes.has(args[0]) ? 1 : 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--task") options.taskId = args[++index] || "";
    else if (arg.startsWith("--task=")) options.taskId = arg.slice("--task=".length);
    else if (arg === "--receipt") options.receiptPath = args[++index] || "";
    else if (arg.startsWith("--receipt=")) options.receiptPath = arg.slice("--receipt=".length);
    else if (arg === "--reply-file") options.replyPath = args[++index] || "";
    else if (arg.startsWith("--reply-file=")) options.replyPath = arg.slice("--reply-file=".length);
    else if (arg === "--add-tasks") options.addTasksPath = args[++index] || "";
    else if (arg.startsWith("--add-tasks=")) options.addTasksPath = arg.slice("--add-tasks=".length);
    else if (arg === "--hydrate-task") options.hydrateTaskId = args[++index] || "";
    else if (arg.startsWith("--hydrate-task=")) options.hydrateTaskId = arg.slice("--hydrate-task=".length);
    else if (arg === "--task-card") options.taskCardPath = args[++index] || "";
    else if (arg.startsWith("--task-card=")) options.taskCardPath = arg.slice("--task-card=".length);
    else if (arg === "--task-card-sha256") options.taskCardSha256 = args[++index] || "";
    else if (arg.startsWith("--task-card-sha256=")) options.taskCardSha256 = arg.slice("--task-card-sha256=".length);
    else if (arg === "--expected-state-digest") options.expectedStateDigest = args[++index] || "";
    else if (arg.startsWith("--expected-state-digest=")) options.expectedStateDigest = arg.slice("--expected-state-digest=".length);
    else if (arg === "--status") options.status = args[++index] || "";
    else if (arg.startsWith("--status=")) options.status = arg.slice("--status=".length);
    else if (arg === "--activate") options.activate = args[++index] || "";
    else if (arg.startsWith("--activate=")) options.activate = arg.slice("--activate=".length);
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot || !options.taskId || (options.mode !== "reply" && !options.receiptPath) || (options.mode === "reply" && !options.replyPath)) {
    throw new Error("Usage: node apply-receipt.mjs <goal-root> --task T### --receipt <file> [--add-tasks <json-file> | --hydrate-task T### [--task-card <json-file> --task-card-sha256 <hex>]] [--expected-state-digest <hex>] [--status done|blocked] [--activate T###|none] [--json]");
  }
  if (["wait", "reply"].includes(options.mode) && !options.expectedStateDigest) throw new Error(`${options.mode} requires --expected-state-digest with exactly 64 lowercase hex characters.`);
  if (options.mode !== "receipt" && (options.addTasksPath || options.hydrateTaskId || options.taskCardPath || options.taskCardSha256 || options.status || options.activate)) {
    throw new Error(`${options.mode} does not accept receipt-transition task, status, or activation options.`);
  }
  if (options.mode === "reply" && options.receiptPath) throw new Error("reply accepts --reply-file, not --receipt.");
  if (options.mode !== "reply" && options.replyPath) throw new Error(`${options.mode} does not accept --reply-file.`);
  if (options.addTasksPath && options.hydrateTaskId) throw new Error("--add-tasks and --hydrate-task are mutually exclusive atomic transitions.");
  if (options.taskCardPath && !options.hydrateTaskId) throw new Error("--task-card requires --hydrate-task T###.");
  if (options.taskCardPath && !/^[a-f0-9]{64}$/.test(options.taskCardSha256)) throw new Error("--task-card requires --task-card-sha256 with exactly 64 lowercase hex characters.");
  if (options.taskCardSha256 && !options.taskCardPath) throw new Error("--task-card-sha256 requires --task-card.");
  if (options.hydrateTaskId && options.activate !== options.hydrateTaskId) throw new Error("--hydrate-task must name the same task as --activate.");
  if (options.expectedStateDigest && !/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) throw new Error("--expected-state-digest must contain exactly 64 lowercase hex characters.");
  return options;
}

export function applyTransition(options) {
  if (options.mode === "wait") return enterExactHumanWait(options);
  if (options.mode === "reply") return resumeExactHumanReply(options);
  return applyReceipt(options);
}

export function applyReceipt(options) {
  const goalRoot = resolve(options.goalRoot);
  const statePath = basename(goalRoot) === "state.yaml" ? goalRoot : join(goalRoot, "state.yaml");
  if (!existsSync(statePath)) throw new Error(`state file not found: ${statePath}`);
  const receipt = loadReceipt(options.receiptPath);
  validateReceiptIdentity(receipt, options.taskId, statePath);
  const taskCards = options.addTasksPath ? loadTaskCards(options.addTasksPath) : [];
  const hydration = options.hydrateTaskId ? loadHydration(options, receipt) : null;
  const status = options.status || (receipt.result === "done" ? "done" : "blocked");
  if (!["done", "blocked"].includes(status)) throw new Error(`Unsupported --status: ${status}`);

  const original = readFileSync(statePath, "utf8");
  const originalDigest = sha256(original);
  if (options.expectedStateDigest && options.expectedStateDigest !== originalDigest) throw new Error(`state.yaml digest drift: expected ${options.expectedStateDigest}, got ${originalDigest}.`);
  let lines = original.replace(/\r\n/g, "\n").split("\n");

  if (taskCards.length) lines = appendTaskCards(lines, taskCards);
  if (hydration) lines = hydratePlaceholderTask(lines, options.hydrateTaskId, hydration);
  lines = setTaskField(lines, options.taskId, "status", status);
  lines = setTaskReceipt(lines, options.taskId, receipt);
  if (options.activate && options.activate !== "none") {
    lines = setTaskField(lines, options.activate, "status", "active");
  }
  const nextActive = options.activate === "none" || !options.activate ? "null" : options.activate;
  lines = setTopLevel(lines, "active_task", nextActive);

  const candidate = withFinalNewline(lines.join("\n"));
  const candidatePath = `${statePath}.goalbuddy-candidate-${process.pid}`;
  const check = spawnSync(process.execPath, [join(scriptDir, "check-goal-state.mjs"), statePath, "--candidate-stdin"], { encoding: "utf8", input: candidate });
  let checkerReport = null;
  try {
    checkerReport = JSON.parse(check.stdout);
  } catch {
    checkerReport = { ok: false, errors: [`checker produced unreadable output: ${(check.stderr || check.stdout || "").slice(0, 300)}`] };
  }

  if (!checkerReport.ok) {
    return { ok: false, task_id: options.taskId, added_task_ids: taskCards.map((task) => task.id), hydrated_task_id: hydration ? options.hydrateTaskId : null, hydration_source: hydration?.source ?? null, hydration_sha256: hydration?.sha256 ?? null, status, active_task: nextActive, reverted: true, checker_errors: checkerReport.errors || [] };
  }
  if (sha256(readFileSync(statePath)) !== originalDigest) {
    throw new Error("state.yaml changed during atomic receipt transition; candidate was not installed.");
  }
  writeAtomic(candidatePath, candidate);
  renameSync(candidatePath, statePath);
  fsyncDirectory(dirname(statePath));
  return { ok: true, task_id: options.taskId, added_task_ids: taskCards.map((task) => task.id), hydrated_task_id: hydration ? options.hydrateTaskId : null, hydration_source: hydration?.source ?? null, hydration_sha256: hydration?.sha256 ?? null, status, active_task: nextActive, reverted: false, before_digest: originalDigest, after_digest: sha256(candidate), checker_warnings: checkerReport.warnings || [] };
}

export function enterExactHumanWait(options) {
  const context = loadTransitionContext(options);
  const receipt = loadReceipt(options.receiptPath);
  validateExactHumanWaitReceipt(receipt, options.taskId, context.statePath);
  if (context.document.goal?.status !== "active") throw new Error("wait requires goal.status active.");
  if (context.document.active_task !== options.taskId) throw new Error(`wait requires active_task ${options.taskId}.`);
  if (context.document.rules?.exact_human_approval_can_terminal_wait !== true) {
    throw new Error("wait requires rules.exact_human_approval_can_terminal_wait: true.");
  }
  const task = selectedTask(context.document, options.taskId);
  if (task.status !== "active") throw new Error(`wait requires task ${options.taskId} to be active.`);
  if (task.receipt !== null) throw new Error(`wait requires task ${options.taskId} to have receipt: null.`);
  if (liveExactHumanWaitTasks(context.document).length > 0) throw new Error("wait requires no existing live exact-human wait.");

  let lines = context.original.replace(/\r\n/g, "\n").split("\n");
  lines = setTaskField(lines, options.taskId, "status", "blocked");
  lines = setTaskReceipt(lines, options.taskId, receipt);
  lines = setTopLevel(lines, "active_task", "null");
  lines = setNestedScalar(lines, "goal", "status", "blocked");
  const candidate = withFinalNewline(lines.join("\n"));
  return installValidatedCandidate(context, candidate, {
    mode: "wait",
    task_id: options.taskId,
    status: "blocked",
    active_task: null,
    no_change: false,
  });
}

export function resumeExactHumanReply(options) {
  const context = loadTransitionContext(options);
  const reply = loadExactReply(options.replyPath);
  if (context.document.goal?.status !== "blocked") throw new Error("reply requires goal.status blocked.");
  if (context.document.active_task !== null) throw new Error("reply requires active_task: null.");
  if (context.document.rules?.exact_human_approval_can_terminal_wait !== true) {
    throw new Error("reply requires rules.exact_human_approval_can_terminal_wait: true.");
  }
  const task = selectedTask(context.document, options.taskId);
  const waitingTasks = liveExactHumanWaitTasks(context.document);
  if (waitingTasks.length !== 1 || waitingTasks[0].id !== options.taskId) {
    throw new Error(`reply requires ${options.taskId} to be the unique live exact-human wait.`);
  }
  if (task.status !== "blocked") throw new Error(`reply requires task ${options.taskId} to be blocked.`);
  validateExactHumanWaitReceipt(task.receipt, options.taskId, context.statePath);

  if (reply !== task.receipt.required_reply) {
    if (sha256(readFileSync(context.statePath)) !== context.originalDigest) {
      throw new Error("state.yaml changed while checking an exact reply; no transition was installed.");
    }
    return {
      ok: true,
      mode: "reply",
      task_id: options.taskId,
      exact_match: false,
      no_change: true,
      before_digest: context.originalDigest,
      after_digest: context.originalDigest,
    };
  }

  const transitionEvidence = task.transition_evidence && typeof task.transition_evidence === "object" && !Array.isArray(task.transition_evidence)
    ? JSON.parse(JSON.stringify(task.transition_evidence))
    : {};
  const priorReplies = Array.isArray(transitionEvidence.exact_human_replies)
    ? transitionEvidence.exact_human_replies
    : [];
  transitionEvidence.exact_human_replies = [...priorReplies, {
    wait_board_digest: context.originalDigest,
    required_reply_sha256: sha256(task.receipt.required_reply),
    reply_sha256: sha256(reply),
    exact_match: true,
    wait_receipt: task.receipt,
  }];

  let lines = context.original.replace(/\r\n/g, "\n").split("\n");
  lines = upsertTaskNode(lines, options.taskId, "transition_evidence", transitionEvidence, { beforeKey: "receipt" });
  lines = setTaskField(lines, options.taskId, "status", "active");
  lines = setTaskReceipt(lines, options.taskId, null);
  lines = setTopLevel(lines, "active_task", options.taskId);
  lines = setNestedScalar(lines, "goal", "status", "active");
  const candidate = withFinalNewline(lines.join("\n"));
  return installValidatedCandidate(context, candidate, {
    mode: "reply",
    task_id: options.taskId,
    status: "active",
    active_task: options.taskId,
    exact_match: true,
    no_change: false,
    wait_board_digest: context.originalDigest,
    required_reply_sha256: sha256(task.receipt.required_reply),
    reply_sha256: sha256(reply),
  });
}

function loadTransitionContext(options) {
  const goalRoot = resolve(options.goalRoot);
  const statePath = basename(goalRoot) === "state.yaml" ? goalRoot : join(goalRoot, "state.yaml");
  if (!existsSync(statePath)) throw new Error(`state file not found: ${statePath}`);
  const original = readFileSync(statePath, "utf8");
  const originalDigest = sha256(original);
  if (options.expectedStateDigest !== originalDigest) {
    throw new Error(`state.yaml digest drift: expected ${options.expectedStateDigest}, got ${originalDigest}.`);
  }
  const document = parseGoalStateText(original, { allowFallback: false });
  return { statePath, original, originalDigest, document };
}

function selectedTask(document, taskId) {
  const task = document.tasks?.find((candidate) => candidate?.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found in state.yaml.`);
  return task;
}

function liveExactHumanWaitTasks(document) {
  return (document.tasks || []).filter((task) => task?.status === "blocked" && isExactHumanWaitReceipt(task.receipt));
}

function isExactHumanWaitReceipt(receipt) {
  return Boolean(receipt && typeof receipt === "object" && !Array.isArray(receipt)
    && receipt.result === "blocked"
    && receipt.waiting_for_user_approval === true
    && typeof receipt.required_reply === "string"
    && receipt.required_reply.length > 0);
}

function validateExactHumanWaitReceipt(receipt, taskId, statePath) {
  if (!isExactHumanWaitReceipt(receipt)) {
    throw new Error("Exact-human wait receipt requires result blocked, waiting_for_user_approval true, and a nonempty required_reply string.");
  }
  if (!Object.hasOwn(receipt, "task_id") || !Object.hasOwn(receipt, "board_path")) {
    throw new Error("Exact-human wait receipt requires task_id and board_path identity.");
  }
  validateReceiptIdentity(receipt, taskId, statePath);
  if (receipt.full_outcome_complete === true || ["complete", "done"].includes(receipt.decision)) {
    throw new Error("Exact-human wait receipt must not claim completion.");
  }
}

function loadExactReply(replyPath) {
  const parsed = JSON.parse(readFileSync(resolve(replyPath), "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 1 || typeof parsed.reply !== "string") {
    throw new Error(`${replyPath} must contain exactly one string field named reply.`);
  }
  return parsed.reply;
}

function installValidatedCandidate(context, candidate, report) {
  const check = spawnSync(process.execPath, [join(scriptDir, "check-goal-state.mjs"), context.statePath, "--candidate-stdin"], { encoding: "utf8", input: candidate });
  let checkerReport = null;
  try {
    checkerReport = JSON.parse(check.stdout);
  } catch {
    checkerReport = { ok: false, errors: [`checker produced unreadable output: ${(check.stderr || check.stdout || "").slice(0, 300)}`] };
  }
  if (!checkerReport.ok) {
    return { ...report, ok: false, reverted: true, before_digest: context.originalDigest, after_digest: context.originalDigest, checker_errors: checkerReport.errors || [] };
  }
  if (sha256(readFileSync(context.statePath)) !== context.originalDigest) {
    throw new Error("state.yaml changed during atomic exact-human transition; candidate was not installed.");
  }
  const candidatePath = `${context.statePath}.goalbuddy-candidate-${process.pid}`;
  writeAtomic(candidatePath, candidate);
  renameSync(candidatePath, context.statePath);
  fsyncDirectory(dirname(context.statePath));
  return { ...report, ok: true, reverted: false, before_digest: context.originalDigest, after_digest: sha256(candidate), checker_warnings: checkerReport.warnings || [] };
}

function loadReceipt(receiptPath) {
  const parsed = JSON.parse(readFileSync(resolve(receiptPath), "utf8"));
  const candidate = parsed.receipt && parsed.scope_check ? parsed.receipt : parsed.goalbuddy_receipt_v1 ?? parsed;
  if (!candidate || typeof candidate !== "object" || typeof candidate.result !== "string") {
    throw new Error(`${receiptPath} does not contain a receipt (need a JSON object with a "result" field, a goalbuddy_receipt_v1 envelope, or a dispatch report).`);
  }
  return { ...candidate };
}

function validateReceiptIdentity(receipt, taskId, statePath) {
  if (Object.hasOwn(receipt, "task_id") && receipt.task_id !== taskId) {
    throw new Error(`Receipt task_id ${JSON.stringify(receipt.task_id)} does not match --task ${taskId}.`);
  }
  if (Object.hasOwn(receipt, "board_path")) {
    if (typeof receipt.board_path !== "string" || !existsSync(resolve(receipt.board_path)) || realpathSync(resolve(receipt.board_path)) !== realpathSync(statePath)) {
      throw new Error(`Receipt board_path ${JSON.stringify(receipt.board_path)} does not resolve to ${statePath}.`);
    }
  }
}

function loadTaskCards(taskCardsPath) {
  const parsed = JSON.parse(readFileSync(resolve(taskCardsPath), "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`${taskCardsPath} must contain a non-empty JSON array of complete task objects.`);
  }
  const seen = new Set();
  for (const [index, task] of parsed.entries()) {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error(`${taskCardsPath} task at index ${index} must be an object.`);
    }
    if (typeof task.id !== "string" || !/^T\d{3}$/.test(task.id)) {
      throw new Error(`${taskCardsPath} task at index ${index} must have a strict T### id.`);
    }
    if (seen.has(task.id)) throw new Error(`${taskCardsPath} contains duplicate task id ${task.id}.`);
    seen.add(task.id);
  }
  return parsed;
}

function loadHydration(options, receipt) {
  if (options.taskCardPath) {
    const raw = readFileSync(resolve(options.taskCardPath), "utf8");
    const actualSha256 = sha256(raw);
    if (actualSha256 !== options.taskCardSha256) {
      throw new Error(`${options.taskCardPath} SHA-256 mismatch: expected ${options.taskCardSha256}, got ${actualSha256}.`);
    }
    const task = JSON.parse(raw);
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error(`${options.taskCardPath} must contain exactly one complete task object.`);
    }
    if (task.id !== options.hydrateTaskId) {
      throw new Error(`${options.taskCardPath} task id ${task.id ?? "<missing>"} does not match --hydrate-task ${options.hydrateTaskId}.`);
    }
    return { source: "task_card", value: task, sha256: actualSha256 };
  }

  const workerPackage = receipt.worker_package;
  if (!workerPackage || typeof workerPackage !== "object" || Array.isArray(workerPackage)) {
    throw new Error("--hydrate-task without --task-card requires receipt.worker_package.");
  }
  const exact = JSON.stringify(workerPackage);
  return { source: "receipt_worker_package", value: workerPackage, sha256: sha256(exact) };
}

function hydratePlaceholderTask(lines, taskId, hydration) {
  const [start, end] = taskBlockRange(lines, taskId);
  const type = taskScalarValue(lines, start, end, "type");
  const status = taskScalarValue(lines, start, end, "status");
  const receipt = taskScalarValue(lines, start, end, "receipt");
  if (type !== "worker" || status !== "queued" || receipt !== null) {
    throw new Error(`Task ${taskId} is not a queued receipt-free Worker placeholder.`);
  }
  for (const key of ["allowed_files", "verify"]) {
    if (taskSequenceLength(lines, start, end, key) !== 0) {
      throw new Error(`Task ${taskId} is not a placeholder: ${key} is already populated.`);
    }
  }

  if (hydration.source === "task_card") return replacePlaceholderFromCard(lines, taskId, hydration.value, start, end);
  return replacePlaceholderFromWorkerPackage(lines, taskId, hydration.value);
}

function replacePlaceholderFromCard(lines, taskId, task, start, end) {
  const allowed = new Set(["id", "type", "assignee", "status", "reasoning_hint", "harness", "objective", "inputs", "constraints", "allowed_files", "verify", "stop_if", "expected_output", "receipt"]);
  const extras = Object.keys(task).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`Task card for ${taskId} has unsupported fields: ${extras.join(", ")}.`);
  const required = ["id", "type", "assignee", "status", "objective", "allowed_files", "verify", "stop_if", "receipt"];
  for (const key of required) {
    if (!(key in task)) throw new Error(`Task card for ${taskId} is incomplete: missing ${key}.`);
  }
  if (task.id !== taskId || task.type !== "worker" || task.status !== "queued" || task.receipt !== null) {
    throw new Error(`Task card for ${taskId} must preserve id, type=worker, status=queued, and receipt=null.`);
  }
  const existingAssignee = taskScalarValue(lines, start, end, "assignee");
  if (task.assignee !== existingAssignee) throw new Error(`Task card for ${taskId} must preserve assignee ${existingAssignee}.`);
  validateWorkerPackage(task, `Task card for ${taskId}`);
  const serialized = toYamlLines({ tasks: [task] }, 0).slice(1);
  return [...lines.slice(0, start), ...serialized, ...lines.slice(end)];
}

function replacePlaceholderFromWorkerPackage(lines, taskId, workerPackage) {
  const allowed = new Set(["objective", "allowed_files", "verify", "stop_if"]);
  const extras = Object.keys(workerPackage).filter((key) => !allowed.has(key));
  if (extras.length) throw new Error(`receipt.worker_package has unsupported fields: ${extras.join(", ")}.`);
  validateWorkerPackage(workerPackage, "receipt.worker_package");
  let next = lines;
  for (const key of ["objective", "allowed_files", "verify", "stop_if"]) {
    next = replaceTaskNode(next, taskId, key, workerPackage[key]);
  }
  return next;
}

function validateWorkerPackage(value, label) {
  if (typeof value.objective !== "string" || !value.objective.trim()) throw new Error(`${label} must include a non-empty objective.`);
  for (const key of ["allowed_files", "verify", "stop_if"]) {
    if (!Array.isArray(value[key]) || value[key].length === 0 || value[key].some((entry) => typeof entry !== "string" || !entry.trim())) {
      throw new Error(`${label} must include a non-empty string array for ${key}.`);
    }
  }
}

function taskScalarValue(lines, start, end, key) {
  const line = lines.slice(start, end).find((candidate) => new RegExp(`^    ${key}:`).test(candidate));
  if (!line) return undefined;
  const raw = line.slice(line.indexOf(":") + 1).trim();
  if (raw === "null") return null;
  if (raw.startsWith('"')) return JSON.parse(raw);
  return raw;
}

function taskSequenceLength(lines, start, end, key) {
  const field = lines.slice(start, end).findIndex((candidate) => new RegExp(`^    ${key}:`).test(candidate));
  if (field === -1) return 0;
  const absolute = start + field;
  if (/\[\]\s*$/.test(lines[absolute])) return 0;
  let count = 0;
  for (let index = absolute + 1; index < end && !/^    \S/.test(lines[index]); index += 1) {
    if (/^      - /.test(lines[index])) count += 1;
  }
  return count;
}

function replaceTaskNode(lines, taskId, key, value) {
  const [start, end] = taskBlockRange(lines, taskId);
  const field = lines.slice(start, end).findIndex((candidate) => new RegExp(`^    ${key}:`).test(candidate));
  if (field === -1) throw new Error(`Task ${taskId} has no "${key}" field to hydrate.`);
  const absolute = start + field;
  let nodeEnd = absolute + 1;
  while (nodeEnd < end && !/^    \S/.test(lines[nodeEnd])) nodeEnd += 1;
  const serialized = serializeMappingEntry(key, value, 4);
  return [...lines.slice(0, absolute), ...serialized, ...lines.slice(nodeEnd)];
}

function upsertTaskNode(lines, taskId, key, value, { beforeKey = "receipt" } = {}) {
  const [start, end] = taskBlockRange(lines, taskId);
  const field = lines.slice(start, end).findIndex((candidate) => new RegExp(`^    ${key}:`).test(candidate));
  const serialized = serializeMappingEntry(key, value, 4);
  if (field !== -1) {
    const absolute = start + field;
    let nodeEnd = absolute + 1;
    while (nodeEnd < end && !/^    \S/.test(lines[nodeEnd])) nodeEnd += 1;
    return [...lines.slice(0, absolute), ...serialized, ...lines.slice(nodeEnd)];
  }
  const before = lines.slice(start, end).findIndex((candidate) => new RegExp(`^    ${beforeKey}:`).test(candidate));
  const insertion = before === -1 ? end : start + before;
  return [...lines.slice(0, insertion), ...serialized, ...lines.slice(insertion)];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function appendTaskCards(lines, taskCards) {
  const existing = new Set(
    lines
      .map((line) => line.match(/^  - id:\s*"?(T\d+)"?\s*$/)?.[1])
      .filter(Boolean),
  );
  for (const task of taskCards) {
    if (existing.has(task.id)) throw new Error(`Task ${task.id} already exists in state.yaml.`);
  }

  const tasksStart = lines.findIndex((line) => /^tasks:\s*$/.test(line));
  if (tasksStart === -1) throw new Error('state.yaml has no top-level "tasks" sequence.');
  let tasksEnd = lines.length;
  for (let index = tasksStart + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index])) {
      tasksEnd = index;
      break;
    }
  }
  while (tasksEnd > tasksStart + 1 && lines[tasksEnd - 1].trim() === "") tasksEnd -= 1;
  const serialized = toYamlLines({ tasks: taskCards }, 0).slice(1);
  const separator = lines[tasksEnd]?.trim() === "" ? [] : [""];
  return [...lines.slice(0, tasksEnd), ...serialized, ...separator, ...lines.slice(tasksEnd)];
}

function taskBlockRange(lines, taskId) {
  const start = lines.findIndex((line) => new RegExp(`^  - id:\\s*"?${taskId}"?\\s*$`).test(line));
  if (start === -1) throw new Error(`Task ${taskId} not found in state.yaml`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  - id:/.test(lines[index]) || /^\S/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return [start, end];
}

function setTaskField(lines, taskId, key, value) {
  const [start, end] = taskBlockRange(lines, taskId);
  for (let index = start; index < end; index += 1) {
    if (new RegExp(`^    ${key}:`).test(lines[index])) {
      lines[index] = `    ${key}: ${value}`;
      return lines;
    }
  }
  throw new Error(`Task ${taskId} has no "${key}" field to update.`);
}

function setTaskReceipt(lines, taskId, receipt) {
  const [start, end] = taskBlockRange(lines, taskId);
  let receiptLine = -1;
  for (let index = start; index < end; index += 1) {
    if (/^    receipt:/.test(lines[index])) {
      receiptLine = index;
      break;
    }
  }
  if (receiptLine === -1) throw new Error(`Task ${taskId} has no "receipt" field.`);

  let receiptEnd = receiptLine + 1;
  while (receiptEnd < end && (/^\s{5,}/.test(lines[receiptEnd]) || lines[receiptEnd].trim() === "")) {
    receiptEnd += 1;
  }

  const serialized = receipt === null ? ["    receipt: null"] : ["    receipt:", ...toYamlLines(receipt, 6)];
  return [...lines.slice(0, receiptLine), ...serialized, ...lines.slice(receiptEnd)];
}

function setTopLevel(lines, key, value) {
  const index = lines.findIndex((line) => new RegExp(`^${key}:`).test(line));
  if (index === -1) throw new Error(`state.yaml has no top-level "${key}" field.`);
  lines[index] = `${key}: ${value}`;
  return lines;
}

function setNestedScalar(lines, section, key, value) {
  const sectionStart = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (sectionStart === -1) throw new Error(`state.yaml has no top-level "${section}" section.`);
  for (let index = sectionStart + 1; index < lines.length && !/^\S/.test(lines[index]); index += 1) {
    if (new RegExp(`^  ${key}:`).test(lines[index])) {
      lines[index] = `  ${key}: ${value}`;
      return lines;
    }
  }
  throw new Error(`state.yaml ${section} has no "${key}" field.`);
}

export function toYamlLines(value, indent) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("toYamlLines requires an object root.");
  }
  return serializeMapping(value, indent);
}

function serializeMapping(value, indent) {
  const lines = [];
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    lines.push(...serializeMappingEntry(key, entry, indent));
  }
  return lines;
}

function serializeMappingEntry(key, value, indent) {
  const pad = " ".repeat(indent);
  if (isScalar(value)) return [`${pad}${key}: ${scalar(value)}`];
  if (Array.isArray(value) && value.length === 0) return [`${pad}${key}: []`];
  if (!Array.isArray(value) && Object.keys(value).length === 0) return [`${pad}${key}: {}`];
  return [`${pad}${key}:`, ...serializeNode(value, indent + 2)];
}

function serializeNode(value, indent) {
  if (Array.isArray(value)) return serializeSequence(value, indent);
  return serializeMapping(value, indent);
}

function serializeSequence(values, indent) {
  const pad = " ".repeat(indent);
  const lines = [];
  for (const value of values) {
    if (isScalar(value)) {
      lines.push(`${pad}- ${scalar(value)}`);
      continue;
    }
    if (Array.isArray(value)) {
      lines.push(`${pad}-`);
      lines.push(...serializeSequence(value, indent + 2));
      continue;
    }
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    if (entries.length === 0) {
      lines.push(`${pad}- {}`);
      continue;
    }
    const [[firstKey, firstValue], ...rest] = entries;
    if (isScalar(firstValue)) {
      lines.push(`${pad}- ${firstKey}: ${scalar(firstValue)}`);
    } else if (Array.isArray(firstValue) && firstValue.length === 0) {
      lines.push(`${pad}- ${firstKey}: []`);
    } else if (!Array.isArray(firstValue) && Object.keys(firstValue).length === 0) {
      lines.push(`${pad}- ${firstKey}: {}`);
    } else {
      lines.push(`${pad}- ${firstKey}:`);
      lines.push(...serializeNode(firstValue, indent + 4));
    }
    for (const [key, entry] of rest) lines.push(...serializeMappingEntry(key, entry, indent + 2));
  }
  return lines;
}

function isScalar(value) {
  return value === null || typeof value !== "object";
}

function scalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (/^[A-Za-z0-9_.\/-]+$/.test(String(value)) && !["null", "true", "false"].includes(String(value))) return String(value);
  return JSON.stringify(String(value));
}

function writeAtomic(path, content) {
  const tempPath = `${path}.goalbuddy-tmp-${process.pid}`;
  writeFileSync(tempPath, content.endsWith("\n") ? content : `${content}\n`);
  renameSync(tempPath, path);
}

function withFinalNewline(content) { return content.endsWith("\n") ? content : `${content}\n`; }

function fsyncDirectory(path) {
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
