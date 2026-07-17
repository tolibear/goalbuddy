#!/usr/bin/env node
// Apply a receipt, task status, and active_task transition to state.yaml atomically.
// Fail-closed: the result is validated with check-goal-state.mjs and reverted on errors.
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { immutableHistoryCompatibility, rawTaskBlock, sha256 } from "./immutable-history-proof.mjs";
import { joinedOptionValue, printPublicFailure, publicError, requiredOptionValue } from "./public-error.mjs";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OUT_OF_SCOPE_RECOVERY_GUIDANCE = "Do not widen or retry the active task after this rejection. Produce a truthful blocked receipt, then have the PM run GoalBuddy's direct digest-bound apply_amendment transition to atomically record the current task as blocked and create and activate a fully scoped successor, or apply_hydration when a queued successor already exists.";

if (isDirectRun()) {
  try {
    const options = parseApplyArgs(process.argv.slice(2));
    const report = applyTransition(options);
    if (!report.ok) {
      const compatibilityDetail = report.immutable_history_rejection?.startsWith("Checker-red history requires") && report.baseline_checker_ok !== false
        ? null
        : report.immutable_history_rejection;
      const detail = report.recovery_guidance?.[0] || compatibilityDetail || report.checker_errors?.[0] || report.immutable_history_rejection || "Transition candidate failed GoalBuddy validation.";
      throw publicError("CHECKER_FAILED", `${detail} state.yaml remained unchanged.`);
    }
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (report.mode === "reply" && report.no_change) {
      console.log(`Reply did not match ${report.task_id}; state.yaml was not changed.`);
    } else if (report.mode === "reply") {
      console.log(`Exact reply matched ${report.task_id}; the task is active again.`);
    } else if (report.mode === "wait") {
      console.log(`Recorded exact-human wait for ${report.task_id}; the goal is blocked.`);
    } else if (report.mode === "complete") {
      console.log(`Recorded final completion for ${report.task_id}; the goal is done.`);
    } else if (report.mode === "rebind") {
      console.log(`Rebound checks.goalbuddy_binding at ${report.after_digest}.`);
    } else if (report.ok) {
      console.log(`Recorded ${report.task_id} as ${report.status}; active_task is now ${report.active_task}.`);
    } else {
      const recovery = report.recovery_guidance?.length
        ? `\nRecovery guidance:\n- ${report.recovery_guidance.join("\n- ")}`
        : "";
      console.log(`Transition rejected and reverted. Checker errors:\n- ${report.checker_errors.join("\n- ")}${recovery}`);
    }
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) {
    printPublicFailure(error, { json: process.argv.slice(2).includes("--json") });
    process.exitCode = 1;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export function parseApplyArgs(args) {
  const modes = new Set(["receipt", "wait", "reply", "complete", "rebind"]);
  const options = { mode: modes.has(args[0]) ? args[0] : "receipt", goalRoot: "", taskId: "", receiptPath: "", replyPath: "", bindingPath: "", installedCheckerPaths: [], addTasksPath: "", hydrateTaskId: "", taskCardPath: "", taskCardSha256: "", expectedStateDigest: "", activate: "", allowImmutableHistory: false, json: false };
  for (let index = modes.has(args[0]) ? 1 : 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--allow-immutable-history") options.allowImmutableHistory = true;
    else if (arg === "--task") { options.taskId = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--task=")) options.taskId = joinedOptionValue(arg, "--task");
    else if (arg === "--receipt") { options.receiptPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--receipt=")) options.receiptPath = joinedOptionValue(arg, "--receipt");
    else if (arg === "--reply-file") { options.replyPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--reply-file=")) options.replyPath = joinedOptionValue(arg, "--reply-file");
    else if (arg === "--binding") { options.bindingPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--binding=")) options.bindingPath = joinedOptionValue(arg, "--binding");
    else if (arg === "--installed-checker") { options.installedCheckerPaths.push(requiredOptionValue(args, index, arg)); index += 1; }
    else if (arg.startsWith("--installed-checker=")) options.installedCheckerPaths.push(joinedOptionValue(arg, "--installed-checker"));
    else if (arg === "--add-tasks") { options.addTasksPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--add-tasks=")) options.addTasksPath = joinedOptionValue(arg, "--add-tasks");
    else if (arg === "--hydrate-task") { options.hydrateTaskId = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--hydrate-task=")) options.hydrateTaskId = joinedOptionValue(arg, "--hydrate-task");
    else if (arg === "--task-card") { options.taskCardPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--task-card=")) options.taskCardPath = joinedOptionValue(arg, "--task-card");
    else if (arg === "--task-card-sha256") { options.taskCardSha256 = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--task-card-sha256=")) options.taskCardSha256 = joinedOptionValue(arg, "--task-card-sha256");
    else if (arg === "--expected-state-digest") { options.expectedStateDigest = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--expected-state-digest=")) options.expectedStateDigest = joinedOptionValue(arg, "--expected-state-digest");
    else if (arg === "--activate") { options.activate = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--activate=")) options.activate = joinedOptionValue(arg, "--activate");
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot) {
    throw new Error("Usage: node apply-receipt.mjs <goal-root> --task T### --receipt <file> --expected-state-digest <hex> [--json]");
  }
  if (options.mode === "rebind") {
    if (!options.bindingPath || options.installedCheckerPaths.length === 0 || options.installedCheckerPaths.some((path) => !path) || options.taskId || options.receiptPath || options.replyPath) {
      throw new Error("Usage: node apply-receipt.mjs rebind <goal-root> --binding <binding.json> --installed-checker <path> [--installed-checker <path> ...] --expected-state-digest <hex> [--allow-immutable-history] [--json]");
    }
  } else if (!options.taskId || (options.mode !== "reply" && !options.receiptPath) || (options.mode === "reply" && !options.replyPath)) {
    throw new Error("Usage: node apply-receipt.mjs <goal-root> --task T### --receipt <file> --expected-state-digest <hex> --activate T### [--add-tasks <json-file> | --hydrate-task T### [--task-card <json-file> --task-card-sha256 <hex>]] [--json]");
  }
  if (!options.expectedStateDigest) throw new Error(`${options.mode} requires --expected-state-digest with exactly 64 lowercase hex characters.`);
  if (options.mode !== "receipt" && (options.addTasksPath || options.hydrateTaskId || options.taskCardPath || options.taskCardSha256 || options.activate)) {
    throw new Error(`${options.mode} does not accept receipt-transition task or activation options.`);
  }
  if (options.mode === "receipt" && (!options.activate || options.activate === "none")) {
    throw publicError("SUCCESSOR_NOT_QUEUED", "receipt requires one explicit --activate T### successor; use wait or complete for successorless terminal transitions.");
  }
  if (options.mode === "receipt" && options.activate === options.taskId) {
    throw publicError("SUCCESSOR_NOT_QUEUED", "receipt successor must be distinct from the source task.");
  }
  if (options.mode === "reply" && options.receiptPath) throw new Error("reply accepts --reply-file, not --receipt.");
  if (options.mode !== "reply" && options.replyPath) throw new Error(`${options.mode} does not accept --reply-file.`);
  if (options.mode !== "rebind" && options.bindingPath) throw new Error(`${options.mode} does not accept --binding.`);
  if (options.mode !== "rebind" && options.installedCheckerPaths.length > 0) throw new Error(`${options.mode} does not accept --installed-checker.`);
  if (options.addTasksPath && options.hydrateTaskId) throw new Error("--add-tasks and --hydrate-task are mutually exclusive atomic transitions.");
  if (options.taskCardPath && !options.hydrateTaskId) throw new Error("--task-card requires --hydrate-task T###.");
  if (options.taskCardPath && !/^[a-f0-9]{64}$/.test(options.taskCardSha256)) throw new Error("--task-card requires --task-card-sha256 with exactly 64 lowercase hex characters.");
  if (options.taskCardSha256 && !options.taskCardPath) throw new Error("--task-card-sha256 requires --task-card.");
  if (options.hydrateTaskId && options.activate !== options.hydrateTaskId) throw new Error("--hydrate-task must name the same task as --activate.");
  if (options.expectedStateDigest && !/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) throw new Error("--expected-state-digest must contain exactly 64 lowercase hex characters.");
  if (options.allowImmutableHistory && !options.expectedStateDigest) throw new Error("--allow-immutable-history requires --expected-state-digest.");
  return options;
}

export function applyTransition(options) {
  if (options.mode === "wait") return enterExactHumanWait(options);
  if (options.mode === "reply") return resumeExactHumanReply(options);
  if (options.mode === "complete") return completeGoal(options);
  if (options.mode === "rebind") return rebindGoalbuddy(options);
  return applyReceipt(options);
}

export function applyReceipt(options) {
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => applyReceiptUnderLock(options, statePath));
}

export function bindCodexWorkerSession(options, sessionEvidence) {
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => {
    const context = loadReceiptAdmissionContext(options, statePath);
    authorizeReceiptSource(context.document, options.taskId);
    const task = selectedTask(context.document, options.taskId);
    if (String(task.type || "").toLowerCase() !== "worker") {
      throw publicError("TASK_NOT_CURRENT_ACTIVE", `Codex session binding requires active Worker ${options.taskId}.`);
    }
    const transitionEvidence = task.transition_evidence && typeof task.transition_evidence === "object" && !Array.isArray(task.transition_evidence)
      ? JSON.parse(JSON.stringify(task.transition_evidence))
      : {};
    if (transitionEvidence.codex_worker_session !== undefined) {
      throw publicError("DISPATCH_SESSION_BIND_FAILED", `Task ${options.taskId} already has a Codex Worker session binding.`);
    }
    transitionEvidence.codex_worker_session = sessionEvidence;
    let lines = context.original.replace(/\r\n/g, "\n").split("\n");
    lines = upsertTaskNode(lines, options.taskId, "transition_evidence", transitionEvidence, { beforeKey: "receipt" });
    const candidate = withFinalNewline(lines.join("\n"));
    return installValidatedCandidate(context, candidate, {
      mode: "bind_codex_worker_session",
      task_id: options.taskId,
      active_task: options.taskId,
      session_id: sessionEvidence.session_id,
    });
  });
}

function applyReceiptUnderLock(options, statePath) {
  const receipt = loadReceipt(options.receiptPath);
  if (!Object.hasOwn(receipt, "task_id") || !Object.hasOwn(receipt, "board_path")) {
    throw publicError("RECEIPT_IDENTITY_MISMATCH", "receipt requires exact task_id and board_path identity.");
  }
  validateReceiptIdentity(receipt, options.taskId, statePath);
  if (!["done", "blocked"].includes(receipt.result)) {
    throw new Error(`Receipt result must be exactly done or blocked; got ${JSON.stringify(receipt.result)}.`);
  }
  const taskCards = options.addTasksPath ? loadTaskCards(options.addTasksPath) : [];
  const hydration = options.hydrateTaskId ? loadHydration(options, receipt) : null;
  const status = receipt.result;

  const context = loadReceiptAdmissionContext(options, statePath);
  authorizeReceiptSource(context.document, options.taskId);
  let lines = context.original.replace(/\r\n/g, "\n").split("\n");

  if (taskCards.length) lines = appendTaskCards(lines, taskCards);
  if (hydration) lines = hydratePlaceholderTask(lines, options.hydrateTaskId, hydration);
  const preTransition = withFinalNewline(lines.join("\n"));
  const transitionDocument = parseExactTaskProjection(preTransition, [options.taskId, options.activate], "receipt transition");
  authorizeReceiptSuccessor(transitionDocument, options.activate);
  lines = setTaskField(lines, options.taskId, "status", status);
  lines = setTaskReceipt(lines, options.taskId, receipt);
  lines = setTaskField(lines, options.activate, "status", "active");
  const nextActive = options.activate;
  lines = setTopLevel(lines, "active_task", nextActive);

  const candidate = withFinalNewline(lines.join("\n"));
  return installValidatedCandidate(context, candidate, {
    task_id: options.taskId,
    added_task_ids: taskCards.map((task) => task.id),
    hydrated_task_id: hydration ? options.hydrateTaskId : null,
    hydration_source: hydration?.source ?? null,
    hydration_sha256: hydration?.sha256 ?? null,
    status,
    active_task: nextActive,
  });
}

export function enterExactHumanWait(options) {
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => enterExactHumanWaitUnderLock(options, statePath));
}

function enterExactHumanWaitUnderLock(options, statePath) {
  const context = loadTransitionContext(options, statePath);
  const receipt = loadReceipt(options.receiptPath);
  validateExactHumanWaitReceipt(receipt, options.taskId, context.statePath);
  if (context.document.goal?.status !== "active") throw new Error("wait requires goal.status active.");
  if (context.document.active_task !== options.taskId) throw new Error(`wait requires active_task ${options.taskId}.`);
  if (context.document.rules?.exact_human_approval_can_terminal_wait !== true) {
    throw new Error("wait requires rules.exact_human_approval_can_terminal_wait: true.");
  }
  const task = selectedTask(context.document, options.taskId);
  if (task.status !== "active") throw new Error(`wait requires task ${options.taskId} to be active.`);
  if (!isReceiptFree(task)) throw new Error(`wait requires task ${options.taskId} to be receipt-free.`);
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
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => resumeExactHumanReplyUnderLock(options, statePath));
}

function resumeExactHumanReplyUnderLock(options, statePath) {
  const context = loadTransitionContext(options, statePath);
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

export function completeGoal(options) {
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => completeGoalUnderLock(options, statePath));
}

function completeGoalUnderLock(options, statePath) {
  const context = loadTransitionContext(options, statePath);
  const receipt = loadReceipt(options.receiptPath);
  if (!Object.hasOwn(receipt, "task_id") || !Object.hasOwn(receipt, "board_path")) {
    throw new Error("complete requires receipt task_id and board_path identity.");
  }
  validateReceiptIdentity(receipt, options.taskId, context.statePath);
  if (context.document.goal?.status !== "active") throw new Error("complete requires goal.status active.");
  if (context.document.active_task !== options.taskId) throw new Error(`complete requires active_task ${options.taskId}.`);
  const task = selectedTask(context.document, options.taskId);
  if (task.status !== "active") throw new Error(`complete requires task ${options.taskId} to be active.`);
  if (!["judge", "pm"].includes(task.type)) throw new Error("complete requires a Judge or PM audit task.");
  if (!isReceiptFree(task)) throw new Error(`complete requires task ${options.taskId} to be receipt-free.`);
  if (receipt.result !== "done" || receipt.decision !== "complete" || receipt.full_outcome_complete !== true) {
    throw new Error("complete requires result done, decision complete, and full_outcome_complete true.");
  }
  const unfinishedOtherTasks = (context.document.tasks || [])
    .filter((candidate) => candidate.id !== options.taskId && ["queued", "active"].includes(candidate.status))
    .map((candidate) => candidate.id);
  if (unfinishedOtherTasks.length > 0) {
    throw new Error(`complete requires no other queued or active tasks; found ${unfinishedOtherTasks.join(", ")}.`);
  }

  let lines = context.original.replace(/\r\n/g, "\n").split("\n");
  lines = setTaskField(lines, options.taskId, "status", "done");
  lines = setTaskReceipt(lines, options.taskId, receipt);
  lines = setTopLevel(lines, "active_task", "null");
  lines = setNestedScalar(lines, "goal", "status", "done");
  const candidate = withFinalNewline(lines.join("\n"));
  return installValidatedCandidate(context, candidate, {
    mode: "complete",
    task_id: options.taskId,
    status: "done",
    active_task: null,
    no_change: false,
  });
}

export function rebindGoalbuddy(options) {
  const statePath = resolveStatePath(options.goalRoot);
  return withStateTransitionLock(statePath, () => rebindGoalbuddyUnderLock(options, statePath));
}

function rebindGoalbuddyUnderLock(options, statePath) {
  const context = loadTransitionContext(options, statePath, { parseDocument: false });
  const binding = loadGoalbuddyBinding(options.bindingPath, options.installedCheckerPaths);
  let lines = context.original.replace(/\r\n/g, "\n").split("\n");
  lines = replaceSectionNode(lines, "checks", "goalbuddy_binding", binding);
  const candidate = withFinalNewline(lines.join("\n"));
  return installValidatedCandidate(context, candidate, {
    mode: "rebind",
    active_task: stateTopScalar(context.original, "active_task"),
    binding: {
      accepted_commit: binding.accepted_commit,
      checker_sha256: binding.checker_sha256,
      installed_checker_count: options.installedCheckerPaths.length,
    },
  });
}

function resolveStatePath(goalRootValue) {
  const goalRoot = resolve(goalRootValue);
  const statePath = basename(goalRoot) === "state.yaml" ? goalRoot : join(goalRoot, "state.yaml");
  if (!existsSync(statePath)) throw new Error(`state file not found: ${statePath}`);
  return statePath;
}

function withStateTransitionLock(statePath, transition) {
  const lockPath = `${dirname(realpathSync(statePath))}.goalbuddy-transition-lock`;
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw publicError("TRANSITION_LOCK_BUSY", `Another GoalBuddy transition is already in progress for ${statePath}.`);
    }
    throw error;
  }

  try {
    holdTransitionLockForTest();
    return transition();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function holdTransitionLockForTest() {
  const raw = process.env.GOALBUDDY_TEST_HOLD_LOCK_MS;
  if (raw === undefined) return;
  if (!/^\d+$/.test(raw) || Number(raw) > 5000) {
    throw new Error("GOALBUDDY_TEST_HOLD_LOCK_MS must be an integer from 0 through 5000.");
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(raw));
}

function loadTransitionContext(options, statePath, { parseDocument = true } = {}) {
  const original = readFileSync(statePath, "utf8");
  const originalDigest = sha256(original);
  if (options.expectedStateDigest && options.expectedStateDigest !== originalDigest) {
    throw new Error(`state.yaml digest drift: expected ${options.expectedStateDigest}, got ${originalDigest}.`);
  }
  const document = parseDocument ? parseGoalStateText(original, { allowFallback: false }) : null;
  return { statePath, original, originalDigest, document, allowImmutableHistory: options.allowImmutableHistory === true };
}

function loadReceiptAdmissionContext(options, statePath) {
  const context = loadTransitionContext(options, statePath, { parseDocument: false });
  const checker = runChecker(statePath, context.original);
  if (checker.state_digest !== context.originalDigest) {
    throw publicError("CHECKER_FAILED", "GoalBuddy checker did not validate the exact pre-transition state.yaml bytes.");
  }
  if (checker.ok) {
    context.document = parseGoalStateText(context.original, { allowFallback: false });
    return context;
  }
  if (!context.allowImmutableHistory) {
    const detail = checker.errors?.slice(0, 3).join("; ") || "checker rejected the board";
    throw publicError("CHECKER_FAILED", `Receipt admission requires a checker-valid board: ${detail}`);
  }
  const compatibility = immutableHistoryCompatibility({
    original: context.original,
    candidate: context.original,
    baselineReport: checker,
    candidateReport: checker,
  });
  if (!compatibility.ok) {
    throw publicError("CHECKER_FAILED", `Immutable-history receipt admission rejected: ${compatibility.reason}`);
  }
  context.document = parseExactTaskProjection(context.original, [options.taskId], "immutable-history receipt admission");
  context.immutableHistoryAdmission = compatibility.proof;
  return context;
}

function authorizeReceiptSource(document, taskId) {
  if (document.goal?.status !== "active") {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `receipt requires goal.status active; got ${document.goal?.status || "null"}.`);
  }
  if (document.active_task !== taskId) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `receipt requires active_task ${taskId}; got ${document.active_task || "null"}.`);
  }
  const activeTasks = (document.tasks || []).filter((task) => task?.status === "active");
  if (activeTasks.length !== 1 || activeTasks[0]?.id !== taskId) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `receipt requires ${taskId} to be the unique active task.`);
  }
  const source = selectedTask(document, taskId);
  if (source.status !== "active" || !isReceiptFree(source)) {
    throw publicError("TASK_NOT_CURRENT_ACTIVE", `receipt requires task ${taskId} to be active and receipt-free.`);
  }
}

function authorizeReceiptSuccessor(document, taskId) {
  const successor = selectedTask(document, taskId);
  if (successor.status !== "queued" || !isReceiptFree(successor)) {
    throw publicError("SUCCESSOR_NOT_QUEUED", `Successor ${taskId} must be queued and receipt-free.`);
  }
}

function parseExactTaskProjection(stateText, taskIds, label) {
  const uniqueTaskIds = [...new Set(taskIds)];
  if (uniqueTaskIds.length !== taskIds.length || uniqueTaskIds.some((taskId) => !/^T\d{3}$/.test(taskId || ""))) {
    throw new Error(`${label} requires distinct valid T### task ids.`);
  }
  const taskSections = [...stateText.matchAll(/^tasks:\s*$/gm)];
  if (taskSections.length !== 1) {
    throw publicError("CHECKER_FAILED", `${label} requires exactly one top-level tasks section; found ${taskSections.length}.`);
  }
  const tasksHeader = taskSections[0];
  const headerEnd = stateText.indexOf("\n", tasksHeader.index + tasksHeader[0].length);
  if (headerEnd === -1) throw publicError("CHECKER_FAILED", `${label} found an empty tasks section.`);
  const taskContentStart = headerEnd + 1;
  const nextTopLevel = /^\S/m.exec(stateText.slice(taskContentStart));
  const taskSectionEnd = nextTopLevel ? taskContentStart + nextTopLevel.index : stateText.length;
  const blocks = uniqueTaskIds.map((taskId) => {
    const block = rawTaskBlock(stateText, taskId);
    if (block === null) throw publicError("SUCCESSOR_NOT_QUEUED", `${label} could not locate exact raw task block ${taskId}.`);
    const offset = stateText.indexOf(block);
    if (offset < taskContentStart || offset >= taskSectionEnd) {
      throw publicError("CHECKER_FAILED", `${label} found ${taskId} outside the unique tasks section.`);
    }
    return block;
  });
  const projectedText = `${stateText.slice(0, tasksHeader.index)}tasks:\n${blocks.join("")}${stateText.slice(taskSectionEnd)}`;
  const document = parseGoalStateText(projectedText, { allowFallback: false });
  if (!Array.isArray(document.tasks) || document.tasks.length !== uniqueTaskIds.length) {
    throw publicError("CHECKER_FAILED", `${label} did not strictly parse the exact requested task blocks.`);
  }
  const parsedIds = document.tasks.map((task) => task?.id);
  if (parsedIds.some((taskId, index) => taskId !== uniqueTaskIds[index])) {
    throw publicError("CHECKER_FAILED", `${label} task identity changed during strict projection.`);
  }
  return document;
}

function selectedTask(document, taskId) {
  const task = document.tasks?.find((candidate) => candidate?.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found in state.yaml.`);
  return task;
}

function isReceiptFree(task) {
  return task?.receipt === null || !Object.hasOwn(task || {}, "receipt");
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

function loadGoalbuddyBinding(bindingPath, installedCheckerPaths) {
  const binding = JSON.parse(readFileSync(resolve(bindingPath), "utf8"));
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
    throw new Error(`${bindingPath} must contain exactly one GoalBuddy binding object.`);
  }
  const requiredKeys = [
    "source_root",
    "accepted_commit",
    "checker_path",
    "checker_sha256",
    "installed_checker_sha256",
    "runtime_doctor_goal_ready",
    "cached_marketplace_checker_authoritative",
  ];
  const actualKeys = Object.keys(binding);
  const missing = requiredKeys.filter((key) => !actualKeys.includes(key));
  const extras = actualKeys.filter((key) => !requiredKeys.includes(key));
  if (missing.length > 0 || extras.length > 0) {
    throw new Error(`GoalBuddy binding keys must be exact; missing [${missing.join(", ")}], unexpected [${extras.join(", ")}].`);
  }
  if (!isAbsolute(binding.source_root) || !existsSync(binding.source_root) || !statSync(binding.source_root).isDirectory()) {
    throw new Error("GoalBuddy binding source_root must be an existing absolute directory.");
  }
  if (!isAbsolute(binding.checker_path) || !existsSync(binding.checker_path) || !statSync(binding.checker_path).isFile()) {
    throw new Error("GoalBuddy binding checker_path must be an existing absolute file.");
  }
  const sourceRoot = realpathSync(binding.source_root);
  const checkerPath = realpathSync(binding.checker_path);
  if (checkerPath !== sourceRoot && !checkerPath.startsWith(`${sourceRoot}${sep}`)) {
    throw new Error("GoalBuddy binding checker_path must resolve inside source_root.");
  }
  const head = spawnSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) throw new Error("GoalBuddy binding source_root must be a readable Git checkout.");
  const actualCommit = head.stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(binding.accepted_commit) || binding.accepted_commit !== actualCommit) {
    throw new Error(`GoalBuddy binding accepted_commit must equal source HEAD ${actualCommit}.`);
  }
  const sourceStatus = spawnSync("git", ["-C", sourceRoot, "status", "--porcelain=v1"], { encoding: "utf8" });
  if (sourceStatus.status !== 0 || sourceStatus.stdout.trim() !== "") {
    throw new Error("GoalBuddy binding source_root must be clean before it can be accepted.");
  }
  if (!/^[a-f0-9]{64}$/.test(binding.checker_sha256) || sha256(readFileSync(checkerPath)) !== binding.checker_sha256) {
    throw new Error("GoalBuddy binding checker_sha256 does not match checker_path bytes.");
  }
  if (binding.installed_checker_sha256 !== binding.checker_sha256) {
    throw new Error("GoalBuddy binding installed_checker_sha256 must equal checker_sha256.");
  }
  for (const installedPath of installedCheckerPaths) {
    if (!isAbsolute(installedPath) || !existsSync(installedPath) || !statSync(installedPath).isFile()) {
      throw new Error(`Installed checker must be an existing absolute file: ${installedPath}.`);
    }
    if (sha256(readFileSync(realpathSync(installedPath))) !== binding.installed_checker_sha256) {
      throw new Error(`Installed checker bytes do not match binding: ${installedPath}.`);
    }
  }
  if (binding.runtime_doctor_goal_ready !== true || binding.cached_marketplace_checker_authoritative !== false) {
    throw new Error("GoalBuddy binding requires runtime_doctor_goal_ready true and cached_marketplace_checker_authoritative false.");
  }
  return binding;
}

function installValidatedCandidate(context, candidate, report) {
  const checkerReport = runChecker(context.statePath, candidate);
  const baselineReport = checkerReport.ok ? null : runChecker(context.statePath, context.original);
  const compatibility = checkerReport.ok
    ? { ok: true, used: false }
    : context.allowImmutableHistory
      ? immutableHistoryCompatibility({
        original: context.original,
        candidate,
        baselineReport,
        candidateReport: checkerReport,
      })
      : { ok: false, reason: "Checker-red history requires explicit --allow-immutable-history after PM full-board review." };
  if (!checkerReport.ok && !compatibility.ok) {
    const checkerErrors = checkerReport.errors || [];
    return {
      ...report,
      ok: false,
      reverted: true,
      before_digest: context.originalDigest,
      after_digest: context.originalDigest,
      checker_errors: checkerErrors,
      baseline_checker_ok: baselineReport?.ok === true,
      recovery_guidance: checkerRecoveryGuidance(checkerErrors),
      immutable_history_rejection: compatibility.reason,
    };
  }
  if (sha256(readFileSync(context.statePath)) !== context.originalDigest) {
    throw new Error("state.yaml changed during the serialized transition; candidate was not installed.");
  }
  const candidatePath = `${context.statePath}.goalbuddy-candidate-${process.pid}`;
  writeAtomic(candidatePath, candidate);
  renameSync(candidatePath, context.statePath);
  fsyncDirectory(dirname(context.statePath));
  return {
    ...report,
    ok: true,
    reverted: false,
    before_digest: context.originalDigest,
    after_digest: sha256(candidate),
    checker_status: checkerReport.ok ? "pass" : "immutable_history_compatible",
    checker_warnings: checkerReport.warnings || [],
    immutable_history: compatibility.used ? compatibility.proof : null,
  };
}

function runChecker(statePath, candidate) {
  const check = spawnSync(process.execPath, [join(scriptDir, "check-goal-state.mjs"), statePath, "--candidate-stdin"], { encoding: "utf8", input: candidate });
  try {
    return JSON.parse(check.stdout);
  } catch {
    return { ok: false, errors: [`checker produced unreadable output: ${(check.stderr || check.stdout || "").slice(0, 300)}`], warnings: [] };
  }
}

function checkerRecoveryGuidance(errors) {
  return errors.some((error) => /changed file outside allowed_files:/.test(error))
    ? [OUT_OF_SCOPE_RECOVERY_GUIDANCE]
    : [];
}

function stateTopScalar(text, key) {
  const matches = [...text.matchAll(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "gm"))];
  if (matches.length !== 1) throw new Error(`state.yaml must contain exactly one top-level ${key}.`);
  const value = matches[0][1];
  if (value === "null") return null;
  if (value.startsWith('"')) return JSON.parse(value);
  return value;
}

function loadReceipt(receiptPath) {
  const parsed = JSON.parse(readFileSync(resolve(receiptPath), "utf8"));
  const isDispatchReport = Object.hasOwn(parsed, "receipt") || Object.hasOwn(parsed, "scope_check") || Object.hasOwn(parsed, "ok");
  if (isDispatchReport && (parsed.ok !== true || parsed.scope_check?.status !== "clean" || !parsed.receipt)) {
    throw publicError("DISPATCH_SCOPE_FAILED", "Dispatch report is not authoritative: require ok: true, scope_check.status: clean, and one receipt.");
  }
  const candidate = isDispatchReport ? parsed.receipt : parsed.goalbuddy_receipt_v1 ?? parsed;
  if (!candidate || typeof candidate !== "object" || typeof candidate.result !== "string") {
    throw publicError("RECEIPT_MISSING", `${receiptPath} does not contain a receipt with a result field.`);
  }
  return { ...candidate };
}

function validateReceiptIdentity(receipt, taskId, statePath) {
  if (receipt.task_id !== taskId) {
    throw publicError("RECEIPT_IDENTITY_MISMATCH", `Receipt task_id ${JSON.stringify(receipt.task_id)} does not match --task ${taskId}.`);
  }
  if (typeof receipt.board_path !== "string" || !existsSync(resolve(receipt.board_path)) || realpathSync(resolve(receipt.board_path)) !== realpathSync(statePath)) {
    throw publicError("RECEIPT_IDENTITY_MISMATCH", `Receipt board_path ${JSON.stringify(receipt.board_path)} does not resolve to ${statePath}.`);
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
    if (task.status !== "queued" || task.receipt !== null) {
      throw publicError("SUCCESSOR_NOT_QUEUED", `${taskCardsPath} task ${task.id} must enter queued with receipt: null.`);
    }
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
  if (type !== "worker" || status !== "queued" || (receipt !== null && receipt !== undefined)) {
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
  if (receiptLine === -1) {
    let insertion = end;
    while (insertion > start && lines[insertion - 1].trim() === "") insertion -= 1;
    const serialized = receipt === null ? ["    receipt: null"] : ["    receipt:", ...toYamlLines(receipt, 6)];
    return [...lines.slice(0, insertion), ...serialized, ...lines.slice(insertion)];
  }

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

function replaceSectionNode(lines, section, key, value) {
  const sectionStart = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (sectionStart === -1) throw new Error(`state.yaml has no top-level "${section}" section.`);
  let sectionEnd = lines.length;
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
  }
  const fieldOffset = lines.slice(sectionStart + 1, sectionEnd).findIndex((line) => new RegExp(`^  ${key}:`).test(line));
  if (fieldOffset === -1) throw new Error(`state.yaml ${section} has no "${key}" field to rebind.`);
  const fieldStart = sectionStart + 1 + fieldOffset;
  let fieldEnd = fieldStart + 1;
  while (fieldEnd < sectionEnd && !/^  \S/.test(lines[fieldEnd])) fieldEnd += 1;
  return [...lines.slice(0, fieldStart), ...serializeMappingEntry(key, value, 2), ...lines.slice(fieldEnd)];
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
