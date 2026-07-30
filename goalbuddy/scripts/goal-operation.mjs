#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyReceipt,
  applyTaskTransitionEvidence,
  openSuppliedReceiptArtifact,
} from "./apply-receipt.mjs";
import {
  artifactIdentity,
  canonicalJson,
  createReceiptSourceContext,
  deriveReceiptSource,
  heldReceiptFromDerivedSource,
  resolveArtifactRoots,
  validateHeldReceipt,
} from "./receipt-provenance.mjs";
import {
  assertPmBlockedCloseoutReceipt,
  assertTaskReceipt,
} from "./receipt-contract.mjs";
import { createCheckedSemanticFrontier } from "./frontier.mjs";
import {
  joinedOptionValue,
  printPublicFailure,
  publicError,
  requiredOptionValue,
} from "./public-error.mjs";
import { completionEligibility } from "./completion-eligibility.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

if (isDirectRun()) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    printHelp();
  } else {
    runCli(args);
  }
}

export function holdReceipt({
  goalRoot,
  taskId,
  sourcePath,
  originArtifactPath = "",
  expectedStateDigest,
}) {
  const options = {
    goalRoot,
    taskId,
    expectedStateDigest,
    allowImmutableHistory: false,
  };
  let held;
  const mutation = applyTaskTransitionEvidence(options, ({
    context,
    task,
    transitionEvidence,
    statePath,
  }) => {
    const source = openOperationArtifact({
      cwd: dirname(statePath),
      sourcePath,
    });
    const sourceValue = parseExactJson(source.bytes, sourcePath);
    const origin = originArtifactPath
      ? openOperationArtifact({ cwd: dirname(statePath), sourcePath: originArtifactPath })
      : null;
    const originValue = origin ? parseExactJson(origin.bytes, originArtifactPath) : null;
    const sourceContext = createReceiptSourceContext({
      cwd: dirname(statePath),
      statePath,
      taskId,
      admittedStateDigest: context.originalDigest,
    });
    const closeoutAuthority = origin ? "pm_blocked_closeout" : "original_role";
    let derived;
    try {
      derived = deriveReceiptSource({
        source: sourceValue,
        sourceArtifact: artifactIdentity(source),
        origin: originValue,
        originArtifact: origin ? artifactIdentity(origin) : null,
        closeoutAuthority,
        sourceContext,
      });
      if (closeoutAuthority === "pm_blocked_closeout") {
        assertPmBlockedCloseoutReceipt(derived.receipt, {
          taskId,
          boardPath: derived.receipt.board_path,
          boundary: "hold receipt PM blocked closeout",
        });
      } else {
        const terminal = completionEligibility({
          goalStatus: context.document.goal?.status,
          activeTaskId: context.document.active_task,
          task,
          tasks: context.document.tasks || [],
        });
        assertTaskReceipt(derived.receipt, {
          role: String(task.type || "").toLowerCase(),
          taskId,
          verify: Array.isArray(task.verify) ? task.verify : [],
          terminalCompletionEligible: terminal.eligible,
          boundary: "hold receipt",
        });
      }
    } catch (error) {
      throw publicError("RECEIPT_SCHEMA_INVALID", error.message, {
        receipt_findings: error.findings || [],
      });
    }

    held = heldReceiptFromDerivedSource({ taskId, derived });
    const existing = transitionEvidence.held_receipts === undefined
      ? []
      : transitionEvidence.held_receipts;
    if (!Array.isArray(existing)) {
      throw publicError("RECEIPT_SCHEMA_INVALID", `Task ${taskId} transition_evidence.held_receipts must be an array.`);
    }
    const checked = existing.map((entry) => validateHeldReceipt(entry));
    if (checked.some((entry) => (
      entry.handle === held.handle
      || sameHeldCandidate(entry, held)
    ))) {
      throw publicError("RECEIPT_SCHEMA_INVALID", `Held receipt ${held.handle} already exists on task ${taskId}.`);
    }
    transitionEvidence.held_receipts = [...checked, held];
    return {
      transitionEvidence,
      report: {
        mode: "hold",
        task_id: taskId,
        active_task: taskId,
        handle: held.handle,
      },
    };
  });

  if (!mutation.ok) {
    const detail = mutation.recovery_guidance?.[0]
      || mutation.checker_errors?.[0]
      || "Held-receipt candidate failed GoalBuddy validation.";
    throw publicError("CHECKER_FAILED", `${detail} state.yaml remained unchanged.`, {
      mutation: mutation.mutation,
      before_digest: mutation.before_digest,
      after_digest: mutation.after_digest,
      digest_kind: mutation.digest_kind,
    });
  }
  const projection = checkedProjection(goalRoot, mutation.after_digest);
  return { ok: true, handle: held.handle, projection };
}

export function advanceGoal({
  goalRoot,
  taskId,
  sourcePath = "",
  heldReceipt = "",
  closeoutAuthority,
  originArtifactPath = "",
  activateTaskId,
  taskCardPath = "",
}) {
  validateAdvanceSelection({
    taskId,
    sourcePath,
    heldReceipt,
    closeoutAuthority,
    originArtifactPath,
    activateTaskId,
  });
  const admitted = checkedProjection(goalRoot);
  const taskCard = taskCardPath
    ? bindAdvanceTaskCard({
        statePath: admitted.board.state_path,
        taskCardPath,
      })
    : null;
  const receiptSelection = sourcePath
    ? {
        kind: "explicit",
        sourcePath,
        originArtifactPath,
        closeoutAuthority,
        strictOperationSource: true,
      }
    : {
        kind: "held",
        handle: heldReceipt,
        closeoutAuthority,
      };
  const applied = applyReceipt({
    goalRoot,
    taskId,
    expectedStateDigest: admitted.board.state_digest,
    allowImmutableHistory: false,
    receiptSelection,
    receiptPath: "",
    activate: activateTaskId,
    addTasksPath: "",
    hydrateTaskId: taskCard ? activateTaskId : "",
    taskCardPath: taskCard?.path || "",
    taskCardSha256: taskCard?.sha256 || "",
  });
  if (!applied.ok) {
    const detail = applied.recovery_guidance?.[0]
      || applied.checker_errors?.[0]
      || "Advance candidate failed GoalBuddy validation.";
    throw publicError("CHECKER_FAILED", `${detail} state.yaml remained unchanged.`, {
      mutation: applied.mutation,
      before_digest: applied.before_digest,
      after_digest: applied.after_digest,
      digest_kind: applied.digest_kind,
    });
  }

  const outcome = {
    task_id: taskId,
    result: applied.status,
    next_task_id: applied.active_task,
    hydrated_task_id: applied.hydrated_task_id || null,
  };
  try {
    return {
      ok: true,
      outcome,
      frontier: checkedFrontier(goalRoot, applied.after_digest),
    };
  } catch (error) {
    throw publicError(
      "ADVANCE_OUTPUT_FAILED",
      `Advance installed the receipt and activated ${applied.active_task}, but the next semantic frontier was unavailable: ${error.message}`,
      {
        operation_applied: true,
        mutation: {
          board: "changed",
          product: "none_observed",
          receipt_applied: true,
        },
        outcome,
      },
    );
  }
}

function validateAdvanceSelection({
  taskId,
  sourcePath,
  heldReceipt,
  closeoutAuthority,
  originArtifactPath,
  activateTaskId,
}) {
  if (!/^T\d{3}$/.test(taskId || "")) {
    throw publicError("INVALID_ARGUMENT", "advance requires --task with one strict T### task id.");
  }
  if (!/^T\d{3}$/.test(activateTaskId || "")) {
    throw publicError("INVALID_ARGUMENT", "advance requires --activate with one strict T### successor id.");
  }
  if (taskId === activateTaskId) {
    throw publicError("SUCCESSOR_NOT_QUEUED", "advance successor must be distinct from the source task.");
  }
  const hasSource = typeof sourcePath === "string" && sourcePath.trim() !== "";
  const hasHeldReceipt = typeof heldReceipt === "string" && heldReceipt.trim() !== "";
  if (hasSource === hasHeldReceipt) {
    throw publicError("INVALID_ARGUMENT", "advance requires exactly one of --source or --held-receipt.");
  }
  if (hasHeldReceipt && !/^[a-f0-9]{64}$/.test(heldReceipt)) {
    throw publicError("INVALID_ARGUMENT", "--held-receipt must contain exactly 64 lowercase hex characters.");
  }
  if (!["original_role", "pm_blocked_closeout"].includes(closeoutAuthority)) {
    throw publicError("INVALID_ARGUMENT", "advance requires --closeout-authority original_role or pm_blocked_closeout.");
  }
  if (typeof originArtifactPath !== "string") {
    throw publicError("INVALID_ARGUMENT", "advance origin artifact path must be a string.");
  }
  if (hasHeldReceipt && originArtifactPath) {
    throw publicError("INVALID_ARGUMENT", "--origin-artifact is allowed only with --source.");
  }
  if (hasSource && closeoutAuthority === "original_role" && originArtifactPath) {
    throw publicError("INVALID_ARGUMENT", "--origin-artifact requires --closeout-authority pm_blocked_closeout.");
  }
  if (hasSource && closeoutAuthority === "pm_blocked_closeout" && !originArtifactPath) {
    throw publicError("INVALID_ARGUMENT", "--closeout-authority pm_blocked_closeout requires --origin-artifact.");
  }
}

function bindAdvanceTaskCard({ statePath, taskCardPath }) {
  if (typeof taskCardPath !== "string" || taskCardPath.trim() === "") {
    throw publicError("INVALID_ARGUMENT", "--task-card requires one nonempty exact path.");
  }
  try {
    const cwd = dirname(statePath);
    const roots = resolveArtifactRoots(cwd);
    const opened = openSuppliedReceiptArtifact({
      cwd,
      sourcePath: taskCardPath,
    });
    if (opened.root !== "repository") {
      throw new Error("Task card must be a repository artifact.");
    }
    return {
      path: join(roots.repository, ...opened.path.split("/")),
      sha256: opened.sha256,
    };
  } catch (error) {
    throw publicError("INVALID_ARGUMENT", `Could not bind --task-card: ${error.message}`);
  }
}

function sameHeldCandidate(left, right) {
  return left.task_id === right.task_id
    && left.receipt_value_sha256 === right.receipt_value_sha256
    && canonicalJson(left.source_artifact) === canonicalJson(right.source_artifact)
    && canonicalJson(left.origin_artifact) === canonicalJson(right.origin_artifact);
}

function openOperationArtifact({ cwd, sourcePath }) {
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    throw publicError("INVALID_ARGUMENT", "hold requires one nonempty exact source path.");
  }
  return openSuppliedReceiptArtifact({
    cwd,
    sourcePath,
    absoluteGitReportOnly: isAbsolute(sourcePath),
  });
}

function parseExactJson(bytes, sourcePath) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw publicError("RECEIPT_MISSING", `${sourcePath} is not exact JSON: ${error.message}`);
  }
}

function checkedProjection(goalRoot, expectedDigest = "") {
  const result = spawnSync(process.execPath, [join(scriptDir, "resume-board.mjs"), resolve(goalRoot), "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw publicError("CHECKER_FAILED", `Checked projection failed: ${operationFailureDetail(result)}.`);
  }
  let projection;
  try {
    projection = JSON.parse(result.stdout);
  } catch {
    throw publicError("CHECKER_FAILED", "Checked projection returned unreadable JSON.");
  }
  if (projection?.ok !== true
      || projection?.board?.state_digest_status !== "checker_validated"
      || (expectedDigest && projection?.board?.state_digest !== expectedDigest)) {
    throw publicError("CHECKER_FAILED", "Checked projection did not bind the exact admitted GoalBuddy state.");
  }
  return projection;
}

function checkedFrontier(goalRoot, expectedStateDigest) {
  try {
    const frontier = createCheckedSemanticFrontier(resolve(goalRoot), {
      expectedStateDigest,
    });
    if (frontier?.kind !== "goalbuddy_frontier_v1") {
      throw new Error("Semantic frontier did not return goalbuddy_frontier_v1.");
    }
    return frontier;
  } catch (error) {
    throw publicError("CHECKER_FAILED", `Semantic frontier failed after advance: ${error.message}`);
  }
}

function operationFailureDetail(result) {
  const raw = (result.stdout || result.stderr || "").trim();
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.errors?.[0]
      || parsed?.error
      || parsed?.projection_error
      || parsed?.recovery?.reason;
    if (typeof detail === "string" && detail.trim()) return detail.trim().slice(0, 400);
  } catch {
    // The child may emit a compact text error rather than JSON.
  }
  return raw.slice(0, 400) || "unknown checked-operation failure";
}

function parseHoldArgs(args) {
  if (args[0] !== "hold") {
    throw publicError("INVALID_ARGUMENT", "Usage: node goal-operation.mjs hold <goal-root> --task T### --source <path> [--origin-artifact <path>] --expected-state-digest <sha256> [--json]");
  }
  const options = {
    goalRoot: "",
    taskId: "",
    sourcePath: "",
    originArtifactPath: "",
    expectedStateDigest: "",
    json: false,
  };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--task") { options.taskId = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--task=")) options.taskId = joinedOptionValue(arg, "--task");
    else if (arg === "--source") { options.sourcePath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--source=")) options.sourcePath = joinedOptionValue(arg, "--source");
    else if (arg === "--origin-artifact") { options.originArtifactPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--origin-artifact=")) options.originArtifactPath = joinedOptionValue(arg, "--origin-artifact");
    else if (arg === "--expected-state-digest") { options.expectedStateDigest = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--expected-state-digest=")) options.expectedStateDigest = joinedOptionValue(arg, "--expected-state-digest");
    else if (arg.startsWith("-")) throw publicError("INVALID_ARGUMENT", `Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw publicError("INVALID_ARGUMENT", `Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot || !/^T\d{3}$/.test(options.taskId)
      || !options.sourcePath || !/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) {
    throw publicError("INVALID_ARGUMENT", "Usage: node goal-operation.mjs hold <goal-root> --task T### --source <path> [--origin-artifact <path>] --expected-state-digest <sha256> [--json]");
  }
  return options;
}

function parseAdvanceArgs(args) {
  const usage = "Usage: node goal-operation.mjs advance <goal-root> --task T### (--source <exact-path> [--origin-artifact <exact-path>] | --held-receipt <handle>) --closeout-authority original_role|pm_blocked_closeout --activate T### [--task-card <path>] [--json]";
  if (args[0] !== "advance") {
    throw publicError("INVALID_ARGUMENT", usage);
  }
  const options = {
    goalRoot: "",
    taskId: "",
    sourcePath: "",
    heldReceipt: "",
    closeoutAuthority: "",
    originArtifactPath: "",
    activateTaskId: "",
    taskCardPath: "",
    json: false,
  };
  const seen = new Set();
  const assign = (flag, value, field) => {
    if (seen.has(flag)) throw publicError("INVALID_ARGUMENT", `Duplicate argument: ${flag}`);
    seen.add(flag);
    options[field] = value;
  };
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      if (seen.has("--json")) throw publicError("INVALID_ARGUMENT", "Duplicate argument: --json");
      seen.add("--json");
      options.json = true;
    } else if (arg === "--task") {
      assign("--task", requiredOptionValue(args, index, arg), "taskId");
      index += 1;
    } else if (arg.startsWith("--task=")) {
      assign("--task", joinedOptionValue(arg, "--task"), "taskId");
    } else if (arg === "--source") {
      assign("--source", requiredOptionValue(args, index, arg), "sourcePath");
      index += 1;
    } else if (arg.startsWith("--source=")) {
      assign("--source", joinedOptionValue(arg, "--source"), "sourcePath");
    } else if (arg === "--held-receipt") {
      assign("--held-receipt", requiredOptionValue(args, index, arg), "heldReceipt");
      index += 1;
    } else if (arg.startsWith("--held-receipt=")) {
      assign("--held-receipt", joinedOptionValue(arg, "--held-receipt"), "heldReceipt");
    } else if (arg === "--closeout-authority") {
      assign("--closeout-authority", requiredOptionValue(args, index, arg), "closeoutAuthority");
      index += 1;
    } else if (arg.startsWith("--closeout-authority=")) {
      assign("--closeout-authority", joinedOptionValue(arg, "--closeout-authority"), "closeoutAuthority");
    } else if (arg === "--origin-artifact") {
      assign("--origin-artifact", requiredOptionValue(args, index, arg), "originArtifactPath");
      index += 1;
    } else if (arg.startsWith("--origin-artifact=")) {
      assign("--origin-artifact", joinedOptionValue(arg, "--origin-artifact"), "originArtifactPath");
    } else if (arg === "--activate") {
      assign("--activate", requiredOptionValue(args, index, arg), "activateTaskId");
      index += 1;
    } else if (arg.startsWith("--activate=")) {
      assign("--activate", joinedOptionValue(arg, "--activate"), "activateTaskId");
    } else if (arg === "--task-card") {
      assign("--task-card", requiredOptionValue(args, index, arg), "taskCardPath");
      index += 1;
    } else if (arg.startsWith("--task-card=")) {
      assign("--task-card", joinedOptionValue(arg, "--task-card"), "taskCardPath");
    } else if (arg.startsWith("-")) {
      throw publicError("INVALID_ARGUMENT", `Unknown argument: ${arg}`);
    } else if (!options.goalRoot) {
      options.goalRoot = arg;
    } else {
      throw publicError("INVALID_ARGUMENT", `Unexpected argument: ${arg}`);
    }
  }
  if (!options.goalRoot) throw publicError("INVALID_ARGUMENT", usage);
  validateAdvanceSelection(options);
  return options;
}

function runCli(args) {
  let json = args.includes("--json");
  try {
    const options = args[0] === "advance"
      ? parseAdvanceArgs(args)
      : parseHoldArgs(args);
    json = options.json;
    if (args[0] === "advance") {
      const result = advanceGoal(options);
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Advanced ${options.taskId} as ${result.outcome.result}; ${result.outcome.next_task_id} is now active.`);
    } else {
      const result = holdReceipt(options);
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Held receipt ${result.handle} for ${options.taskId}.`);
    }
  } catch (error) {
    printPublicFailure(error, { json });
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log("Usage:");
  console.log("  node goal-operation.mjs hold <goal-root> --task T### --source <path> [--origin-artifact <path>] --expected-state-digest <sha256> [--json]");
  console.log("  node goal-operation.mjs advance <goal-root> --task T### (--source <exact-path> [--origin-artifact <exact-path>] | --held-receipt <handle>) --closeout-authority original_role|pm_blocked_closeout --activate T### [--task-card <path>] [--json]");
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}
