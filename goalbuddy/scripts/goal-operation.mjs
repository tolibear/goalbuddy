#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyTaskTransitionEvidence,
  openSuppliedReceiptArtifact,
} from "./apply-receipt.mjs";
import {
  artifactIdentity,
  canonicalJson,
  createReceiptSourceContext,
  deriveReceiptSource,
  heldReceiptFromDerivedSource,
  validateHeldReceipt,
} from "./receipt-provenance.mjs";
import {
  assertPmBlockedCloseoutReceipt,
  assertTaskReceipt,
} from "./receipt-contract.mjs";
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

function checkedProjection(goalRoot, expectedDigest) {
  const result = spawnSync(process.execPath, [join(scriptDir, "resume-board.mjs"), resolve(goalRoot), "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw publicError("CHECKER_FAILED", `Checked projection failed after hold: ${(result.stderr || result.stdout || "").trim().slice(0, 400)}.`);
  }
  let projection;
  try {
    projection = JSON.parse(result.stdout);
  } catch {
    throw publicError("CHECKER_FAILED", "Checked projection returned unreadable JSON after hold.");
  }
  if (projection?.ok !== true
      || projection?.board?.state_digest !== expectedDigest
      || projection?.board?.state_digest_status !== "checker_validated") {
    throw publicError("CHECKER_FAILED", "Checked projection did not bind the exact installed held-receipt state.");
  }
  return projection;
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

function runCli(args) {
  let json = args.includes("--json");
  try {
    const options = parseHoldArgs(args);
    json = options.json;
    const result = holdReceipt(options);
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Held receipt ${result.handle} for ${options.taskId}.`);
  } catch (error) {
    printPublicFailure(error, { json });
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log("Usage:");
  console.log("  node goal-operation.mjs hold <goal-root> --task T### --source <path> [--origin-artifact <path>] --expected-state-digest <sha256> [--json]");
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}
