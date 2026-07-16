#!/usr/bin/env node
// Dispatch one board task to an external harness CLI and verify the result.
// Read-only toward state.yaml: prints the receipt and scope verdict; the PM applies them through a direct digest-bound typed transition.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDispatchScope, captureDispatchManifest, normalizeRepositoryPath, repositoryRoot } from "./dispatch-scope-manifest.mjs";
import { sha256 } from "./immutable-history-proof.mjs";
import { joinedOptionValue, printPublicFailure, publicError, publicFailure, requiredOptionValue } from "./public-error.mjs";
import { admitCurrentTask, formatPrompt } from "./render-task-prompt.mjs";

const HARNESSES = new Set(["codex", "claude-code"]);
const READ_ONLY_ROLES = new Set(["scout", "judge"]);

if (isDirectRun()) {
  try {
    const options = parseDispatchArgs(process.argv.slice(2));
    const report = dispatchTask(options);
    if (options.json) {
      console.log(report.ok ? JSON.stringify(report, null, 2) : JSON.stringify(report));
    } else {
      printHumanReport(report);
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

export function parseDispatchArgs(args) {
  const options = { goalRoot: "", boardPath: "", taskId: "", expectedStateDigest: "", allowImmutableHistory: false, to: "", model: "", timeoutSeconds: 1200, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--allow-immutable-history") options.allowImmutableHistory = true;
    else if (arg === "--task") { options.taskId = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--task=")) options.taskId = joinedOptionValue(arg, "--task");
    else if (arg === "--board") { options.boardPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--board=")) options.boardPath = joinedOptionValue(arg, "--board");
    else if (arg === "--expected-state-digest") { options.expectedStateDigest = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--expected-state-digest=")) options.expectedStateDigest = joinedOptionValue(arg, "--expected-state-digest");
    else if (arg === "--to") { options.to = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--to=")) options.to = joinedOptionValue(arg, "--to");
    else if (arg === "--model") { options.model = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--model=")) options.model = joinedOptionValue(arg, "--model");
    else if (arg === "--timeout") { options.timeoutSeconds = Number(requiredOptionValue(args, index, arg)) || 1200; index += 1; }
    else if (arg.startsWith("--timeout=")) options.timeoutSeconds = Number(joinedOptionValue(arg, "--timeout")) || 1200;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot && !options.boardPath) {
    throw new Error("Usage: node dispatch-task.mjs <goal-root> --to codex|claude-code --expected-state-digest <sha256> [--task T###] [--model <name>] [--timeout <seconds>] [--allow-immutable-history] [--json]");
  }
  if (!/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) {
    throw publicError("STALE_STATE_DIGEST", "dispatch requires --expected-state-digest with exactly 64 lowercase hex characters.");
  }
  return options;
}

export function dispatchTask(options) {
  const admitted = admitCurrentTask(options);
  const { board, task, role, payload } = admitted;
  const to = options.to || cleanScalar(admitted.harness) || "";
  if (!HARNESSES.has(to)) {
    return failure("INVALID_ARGUMENT", `Unknown or missing dispatch target "${to}". Use --to codex or --to claude-code (or set harness: on the task card).`, { task_id: task.id });
  }
  const root = repositoryRoot(dirname(board.path));
  normalizeRepositoryPath(root, board.path);

  const prompt = [
    formatPrompt(payload),
    "",
    "Dispatch notes:",
    `- Work only inside the admitted repository: ${root}`,
    "- Do not edit state.yaml or any GoalBuddy control files; the PM applies your receipt through GoalBuddy's direct digest-bound typed transition.",
    `- End your reply with exactly one goalbuddy_receipt_v1 JSON object, including "harness": "${to}".`,
  ].join("\n");

  const before = captureDispatchManifest(root);
  if (sha256(readFileSync(board.path)) !== board.stateDigest) {
    throw publicError("STALE_STATE_DIGEST", "state.yaml changed after admission and before harness launch; no harness was started.");
  }
  const run = runHarness(to, prompt, { cwd: root, model: options.model, sandbox: payload.metadata.sandbox, role, timeoutSeconds: options.timeoutSeconds });
  const after = captureDispatchManifest(root);
  const receipt = extractReceipt(`${run.stdout}\n${run.stderr}`);
  if (receipt && !receipt.harness) receipt.harness = to;
  let scope;
  try {
    scope = compareDispatchScope({
      before,
      after,
      role,
      allowedFiles: payload.task.allowed_files,
      receiptChangedFiles: receipt?.changed_files ?? [],
    });
  } catch (error) {
    scope = { status: "violations", changed_files: [], receipt_changed_files: [], control_changes: [], out_of_scope: [], missing_receipt_changes: [], extra_receipt_claims: [], violations: [error.message] };
  }

  const identityError = receipt ? receiptIdentityError(receipt, { taskId: task.id, boardPath: board.path, root }) : null;
  if (run.error || run.status !== 0) {
    if (scope.status !== "clean") {
      return failure("DISPATCH_SCOPE_FAILED", scopeFailureMessage(scope, `${run.error || `The ${to} CLI exited with status ${run.status}`} and left a non-clean dispatch scope.`), {
        harness: to, task_id: task.id, role, exit_status: run.status ?? null, harness_error: run.error || null, receipt: receipt || null, scope_check: scope,
      });
    }
    return failure("HARNESS_FAILED", run.error || `The ${to} CLI exited with status ${run.status}.`, {
      harness: to, task_id: task.id, role, exit_status: run.status ?? null, receipt: receipt || null, scope_check: scope,
    });
  }
  if (!receipt) {
    return failure("RECEIPT_MISSING", "No goalbuddy_receipt_v1 object found in the harness output.", {
      harness: to, task_id: task.id, role, exit_status: run.status, receipt: null, scope_check: scope,
    });
  }
  if (identityError) {
    return failure("RECEIPT_IDENTITY_MISMATCH", identityError, {
      harness: to, task_id: task.id, role, exit_status: run.status, receipt, scope_check: scope,
    });
  }
  if (scope.status !== "clean") {
    return failure("DISPATCH_SCOPE_FAILED", scopeFailureMessage(scope, "Dispatch writes or receipt claims failed the admitted scope contract."), {
      harness: to, task_id: task.id, role, exit_status: run.status, receipt, scope_check: scope,
    });
  }

  return {
    ok: true,
    harness: to,
    task_id: task.id,
    role,
    exit_status: run.status,
    receipt: receipt || null,
    scope_check: scope,
  };
}

function failure(code, message, extra = {}) {
  return { ...publicFailure(publicError(code, message)), receipt: null, scope_check: { status: "skipped" }, ...extra };
}

function scopeFailureMessage(scope, prefix) {
  const details = (scope.violations || []).slice(0, 10);
  return details.length > 0 ? `${prefix} ${details.join("; ")}` : prefix;
}

function runHarness(to, prompt, { cwd, model, sandbox, role, timeoutSeconds }) {
  const command = harnessCommand(to, prompt, { model, sandbox, role });
  const result = spawnSync(command.file, command.args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
    shell: process.platform === "win32",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    return { error: `The ${to} CLI ("${command.file}") was not found on PATH. Install it or choose another --to target.`, status: null, stdout: result.stdout || "", stderr: result.stderr || "" };
  }
  if (result.error?.code === "ETIMEDOUT") {
    return { error: `The ${to} CLI timed out after ${timeoutSeconds}s.`, status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
  }
  if (result.error) return { error: result.error.message, status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

export function harnessCommand(to, prompt, { model = "", sandbox = "workspace-write", role = "worker" } = {}) {
  if (to === "codex") {
    const args = ["exec", "--skip-git-repo-check", "-c", `sandbox_mode=${JSON.stringify(sandbox)}`];
    if (model) args.push("-c", `model=${JSON.stringify(model)}`);
    args.push(prompt);
    return { file: "codex", args };
  }
  const args = ["-p", prompt];
  if (model) args.push("--model", model);
  if (!READ_ONLY_ROLES.has(role)) args.push("--permission-mode", "acceptEdits");
  return { file: "claude", args };
}

export function extractReceipt(output) {
  const text = String(output || "").replace(/```[a-z]*\n?/gi, "");
  const key = '"goalbuddy_receipt_v1"';
  let searchFrom = 0;
  while (true) {
    const keyIndex = text.indexOf(key, searchFrom);
    if (keyIndex === -1) break;
    const start = text.lastIndexOf("{", keyIndex);
    if (start !== -1) {
      const candidate = parseBalancedObject(text, start);
      const receipt = candidate ? candidate.goalbuddy_receipt_v1 ?? candidate : null;
      if (isReceiptShaped(receipt)) return receipt;
    }
    searchFrom = keyIndex + key.length;
  }

  // Fallback: models often return the receipt bare, without the envelope.
  // Scan candidate objects from the end of the output (receipts come last).
  const starts = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "{" && (index === 0 || /[\s`:>]/.test(text[index - 1]))) starts.push(index);
  }
  for (let attempt = starts.length - 1, tried = 0; attempt >= 0 && tried < 50; attempt -= 1, tried += 1) {
    const candidate = parseBalancedObject(text, starts[attempt]);
    if (isReceiptShaped(candidate)) return candidate;
  }
  return null;
}

function parseBalancedObject(text, start) {
  let depth = 0;
  let inString = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isReceiptShaped(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
  if (typeof candidate.result !== "string") return false;
  return ["task_id", "decision", "summary", "changed_files", "evidence"].some((field) => field in candidate);
}

function receiptIdentityError(receipt, { taskId, boardPath, root }) {
  if (receipt.task_id !== taskId) return `Receipt task_id ${JSON.stringify(receipt.task_id)} does not match admitted task ${taskId}.`;
  if (typeof receipt.board_path !== "string") return "Receipt must include board_path identity.";
  try {
    if (normalizeRepositoryPath(root, receipt.board_path) !== normalizeRepositoryPath(root, boardPath)) {
      return `Receipt board_path ${JSON.stringify(receipt.board_path)} does not match admitted board ${boardPath}.`;
    }
  } catch (error) {
    return error.message;
  }
  return null;
}

function cleanScalar(value) {
  return typeof value === "string" ? value.trim() : "";
}

function printHumanReport(report) {
  if (!report.ok) {
    console.error(`${report.error_code}: ${report.error} Next: ${report.next_action}`);
    return;
  }
  if (report.receipt) {
    console.log(`Receipt from ${report.harness} for ${report.task_id} (${report.role}): result ${report.receipt.result}`);
    console.log(JSON.stringify(report.receipt, null, 2));
  }
  if (report.scope_check) {
    console.log(`Scope check: ${report.scope_check.status}`);
    if (report.scope_check.violations?.length) {
      console.log(`Violations: ${report.scope_check.violations.join(", ")}`);
    }
  }
  console.log("Dispatch ok. Apply this receipt once with the direct digest-bound goalbuddy receipt transition and an explicit queued successor.");
}
