#!/usr/bin/env node
// Dispatch one board task to an external harness CLI and verify the result.
// Read-only toward state.yaml: prints the receipt and scope verdict; the PM records them.
import { spawnSync } from "node:child_process";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatPrompt, loadBoard, renderTaskPrompt, resolveBoardPath, selectTask } from "./render-task-prompt.mjs";

const HARNESSES = new Set(["codex", "claude-code"]);
const READ_ONLY_ROLES = new Set(["scout", "judge"]);

if (isDirectRun()) {
  try {
    const options = parseDispatchArgs(process.argv.slice(2));
    const report = dispatchTask(options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHumanReport(report);
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

export function parseDispatchArgs(args) {
  const options = { goalRoot: "", taskId: "", to: "", model: "", timeoutSeconds: 1200, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--task") options.taskId = args[++index] || "";
    else if (arg.startsWith("--task=")) options.taskId = arg.slice("--task=".length);
    else if (arg === "--to") options.to = args[++index] || "";
    else if (arg.startsWith("--to=")) options.to = arg.slice("--to=".length);
    else if (arg === "--model") options.model = args[++index] || "";
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--timeout") options.timeoutSeconds = Number(args[++index] || 0) || 1200;
    else if (arg.startsWith("--timeout=")) options.timeoutSeconds = Number(arg.slice("--timeout=".length)) || 1200;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot) {
    throw new Error("Usage: node dispatch-task.mjs <goal-root> --to codex|claude-code [--task T###] [--model <name>] [--timeout <seconds>] [--json]");
  }
  return options;
}

export function dispatchTask(options) {
  const boardPath = resolveBoardPath({ goalRoot: options.goalRoot });
  const board = loadBoard(boardPath);
  const task = selectTask(board, options.taskId);
  const to = options.to || cleanScalar(task.harness) || "";
  if (!HARNESSES.has(to)) {
    return failure(`Unknown or missing dispatch target "${to}". Use --to codex or --to claude-code (or set harness: on the task card).`, { task_id: task.id });
  }

  const rendered = renderTaskPrompt({ goalRoot: options.goalRoot, taskId: options.taskId, json: false });
  const role = rendered.payload.task.type;
  const prompt = [
    formatPrompt(rendered.payload, { includePmObservationContract: false }),
    "",
    "Dispatch notes:",
    `- Work only inside the current directory: ${process.cwd()}`,
    "- Do not edit state.yaml or any GoalBuddy control files; the PM records your receipt.",
    `- End your reply with exactly one goalbuddy_receipt_v1 JSON object, including "harness": "${to}".`,
  ].join("\n");

  const before = gitChangedFiles();
  const run = runHarness(to, prompt, { model: options.model, sandbox: rendered.payload.metadata.sandbox, role, timeoutSeconds: options.timeoutSeconds });
  const after = gitChangedFiles();
  const scope = scopeCheck({ before, after, role, allowedFiles: rendered.payload.task.allowed_files });
  if (run.error) {
    return failure(run.error, {
      task_id: task.id,
      harness: to,
      role,
      exit_status: run.status ?? null,
      timeout_semantics: run.timedOut ? "hard_execution_deadline" : null,
      scope_check: scope,
    });
  }

  const receipt = extractReceipt(`${run.stdout}\n${run.stderr}`);
  if (receipt && !receipt.harness) receipt.harness = to;

  const report = {
    ok: Boolean(receipt) && scope.status !== "violations" && run.status === 0,
    harness: to,
    task_id: task.id,
    role,
    exit_status: run.status,
    receipt: receipt || null,
    scope_check: scope,
  };
  if (!receipt) {
    report.error = "No goalbuddy_receipt_v1 object found in the harness output.";
    report.output_tail = `${run.stdout}`.slice(-2000);
  }
  return report;
}

function failure(message, extra = {}) {
  return { ok: false, error: message, receipt: null, scope_check: { status: "skipped" }, ...extra };
}

function runHarness(to, prompt, { model, sandbox, role, timeoutSeconds }) {
  const command = harnessCommand(to, prompt, { model, sandbox, role });
  const result = spawnSync(command.file, command.args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: timeoutSeconds * 1000,
    shell: process.platform === "win32",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    return { error: `The ${to} CLI ("${command.file}") was not found on PATH. Install it or choose another --to target.` };
  }
  if (result.error?.code === "ETIMEDOUT") {
    return {
      error: `The ${to} CLI hit its hard execution timeout after ${timeoutSeconds}s. Inspect the scope check and working tree for partial writes before fallback.`,
      status: result.status,
      timedOut: true,
    };
  }
  if (result.error) return { error: result.error.message };
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

function gitChangedFiles() {
  const check = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (check.status !== 0) return null;
  const tracked = spawnSync("git", ["diff", "--name-only", "HEAD"], { encoding: "utf8" });
  const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" });
  const files = new Set();
  for (const output of [tracked.stdout, untracked.stdout]) {
    for (const line of String(output || "").split("\n")) {
      if (line.trim()) files.add(line.trim());
    }
  }
  return files;
}

export function scopeCheck({ before, after, role, allowedFiles }) {
  if (!before || !after) return { status: "skipped_not_git", changed_files: [], violations: [] };
  const changed = [...after].filter((file) => !before.has(file)).sort();
  const goalControl = (file) => /(^|\/)docs\/goals\//.test(file);
  const relevant = changed.filter((file) => !goalControl(file));
  if (READ_ONLY_ROLES.has(role)) {
    return relevant.length
      ? { status: "violations", changed_files: changed, violations: relevant, reason: `Read-only role "${role}" modified files.` }
      : { status: "clean", changed_files: changed, violations: [] };
  }
  const violations = relevant.filter((file) => !allowedFiles.some((pattern) => matchesPattern(file, pattern)));
  return violations.length
    ? { status: "violations", changed_files: changed, violations, reason: "Files changed outside allowed_files." }
    : { status: "clean", changed_files: changed, violations: [] };
}

export function matchesPattern(file, pattern) {
  const normalized = String(pattern || "").replace(/\\/g, "/").trim();
  if (!normalized) return false;
  if (normalized === file) return true;
  if (normalized.endsWith("/**")) return file.startsWith(normalized.slice(0, -2));
  if (!normalized.includes("*")) return false;
  const source = normalized.split("*").map(escapeRegExp).join("[^/]*");
  return new RegExp(`^${source}$`).test(file);
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function cleanScalar(value) {
  return typeof value === "string" ? value.trim() : "";
}

function printHumanReport(report) {
  if (report.error) console.log(`Dispatch failed: ${report.error}`);
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
  console.log(report.ok
    ? "Dispatch ok. Record the receipt on the task card (state.yaml) as the PM."
    : "Dispatch NOT ok. Inspect the working tree and receipt before recording anything.");
}
