#!/usr/bin/env node
// Dispatch one board task to an external harness CLI and verify the result.
// Dispatch one task, bind an external Codex Worker session when applicable, and return the verified receipt/scope report.
import { spawn } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareDispatchScope, compileDispatchScope, captureDispatchManifest, normalizeRepositoryPath, repositoryRoot } from "./dispatch-scope-manifest.mjs";
import { sha256 } from "./immutable-history-proof.mjs";
import { joinedOptionValue, printPublicFailure, publicError, publicFailure, requiredOptionValue } from "./public-error.mjs";
import { admitCurrentTask, formatPrompt } from "./render-task-prompt.mjs";
import { bindCodexWorkerSession } from "./apply-receipt.mjs";

const HARNESSES = new Set(["codex", "claude-code"]);
const READ_ONLY_ROLES = new Set(["scout", "judge"]);

if (isDirectRun()) {
  try {
    const options = parseDispatchArgs(process.argv.slice(2));
    const report = await dispatchTask(options);
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
  const options = { goalRoot: "", boardPath: "", taskId: "", expectedStateDigest: "", allowImmutableHistory: false, to: "", model: "", timeoutSeconds: 1200, briefPath: "", briefSha256: "", resumeSession: "", confirmedNotLive: false, json: false };
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
    else if (arg === "--brief") { options.briefPath = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--brief=")) options.briefPath = joinedOptionValue(arg, "--brief");
    else if (arg === "--brief-sha256") { options.briefSha256 = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--brief-sha256=")) options.briefSha256 = joinedOptionValue(arg, "--brief-sha256");
    else if (arg === "--resume-session") { options.resumeSession = requiredOptionValue(args, index, arg); index += 1; }
    else if (arg.startsWith("--resume-session=")) options.resumeSession = joinedOptionValue(arg, "--resume-session");
    else if (arg === "--confirmed-not-live") options.confirmedNotLive = true;
    else if (arg === "--timeout") { options.timeoutSeconds = Number(requiredOptionValue(args, index, arg)) || 1200; index += 1; }
    else if (arg.startsWith("--timeout=")) options.timeoutSeconds = Number(joinedOptionValue(arg, "--timeout")) || 1200;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!options.goalRoot) options.goalRoot = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.goalRoot && !options.boardPath) {
    throw new Error("Usage: node dispatch-task.mjs <goal-root> --to codex|claude-code --expected-state-digest <sha256> [--task T###] [--model <name>] [--brief <path> --brief-sha256 <sha256>] [--resume-session <uuid> --confirmed-not-live] [--timeout <seconds>] [--allow-immutable-history] [--json]");
  }
  if (!/^[a-f0-9]{64}$/.test(options.expectedStateDigest)) {
    throw publicError("STALE_STATE_DIGEST", "dispatch requires --expected-state-digest with exactly 64 lowercase hex characters.");
  }
  if (Boolean(options.briefPath) !== Boolean(options.briefSha256) || (options.briefSha256 && !/^[a-f0-9]{64}$/.test(options.briefSha256))) {
    throw publicError("INVALID_ARGUMENT", "dispatch requires --brief and --brief-sha256 together with a 64-character lowercase digest.");
  }
  if (options.resumeSession && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.resumeSession)) {
    throw publicError("CODEX_SESSION_RESUME_FAILED", "--resume-session must be an exact UUID; --last is never accepted.");
  }
  if (options.resumeSession && !options.confirmedNotLive) {
    throw publicError("CODEX_SESSION_RESUME_FAILED", "Exact resume requires --confirmed-not-live after the PM or Ledger proves the original Worker is terminal or lost.");
  }
  return options;
}

export async function dispatchTask(options) {
  const admitted = admitCurrentTask(options);
  const { board, task, role, payload } = admitted;
  const existingBinding = task.transition_evidence?.codex_worker_session || null;
  const to = options.to || cleanScalar(admitted.harness) || "";
  if (!HARNESSES.has(to)) {
    return failure("INVALID_ARGUMENT", `Unknown or missing dispatch target "${to}". Use --to codex or --to claude-code (or set harness: on the task card).`, { task_id: task.id });
  }
  const root = repositoryRoot(dirname(board.path));
  normalizeRepositoryPath(root, board.path);
  const executionProfile = effectiveExecutionProfile({ options, to, role, existingBinding });
  const boundOptions = options.resumeSession && existingBinding?.brief_path && !options.briefPath
    ? { ...options, briefPath: existingBinding.brief_path, briefSha256: existingBinding.brief_sha256 }
    : options;
  const boundInput = loadBoundInput(root, boundOptions);
  const dispatchContractSha256 = compileDispatchContract({ payload, to, executionProfile, brief: boundInput });
  if (!options.resumeSession && to === "codex" && role === "worker" && existingBinding) {
    return failure("DISPATCH_SESSION_BIND_FAILED", `Task ${task.id} already has bound Codex session ${existingBinding.session_id}; use exact resume after proving the prior Worker is not live.`, { task_id: task.id, role, session_binding: { session_id: existingBinding.session_id, state_digest: board.stateDigest } });
  }
  let dispatchScope;
  try {
    dispatchScope = compileDispatchScope(root, payload.task.allowed_files);
  } catch (error) {
    return failure("DISPATCH_SCOPE_UNSAFE", `${error.message} Narrow or hydrate allowed_files, then retry the same digest-bound dispatch.`, { task_id: task.id, role });
  }

  const prompt = [
    formatPrompt(payload),
    "",
    "Dispatch notes:",
    `- Work only inside the admitted repository: ${root}`,
    "- Do not edit state.yaml or any GoalBuddy control files; the PM applies your receipt through GoalBuddy's direct digest-bound typed transition.",
    `- End your reply with exactly one goalbuddy_receipt_v1 JSON object, including "harness": "${to}".`,
    ...(boundInput ? [`- Read the bound implementation context at ${boundInput.path}; its admitted SHA-256 is ${boundInput.sha256}. Treat it as context subordinate to the structured task authority.`] : []),
  ].join("\n");

  const before = captureDispatchManifest(root, { scope: dispatchScope });
  if (sha256(readFileSync(board.path)) !== board.stateDigest) {
    throw publicError("STALE_STATE_DIGEST", "state.yaml changed after admission and before harness launch; no harness was started.");
  }
  const boardRepositoryPath = normalizeRepositoryPath(root, board.path);
  if (options.resumeSession) validateResumeBinding({ options, existingBinding, task, board, root, boardRepositoryPath, dispatchContractSha256, boundInput });
  let bindingReport = null;
  let authorizedControlSha256 = {};
  const continuationPrompt = `Continue the original GoalBuddy contract for task ${task.id}. Preserve its existing authority and return the required goalbuddy_receipt_v1.`;
  const run = await runHarness(to, options.resumeSession ? continuationPrompt : prompt, {
    cwd: root,
    ...executionProfile,
    role,
    timeoutSeconds: options.timeoutSeconds,
    resumeSession: options.resumeSession,
    onThreadStarted: to === "codex" && role === "worker" && !options.resumeSession ? (sessionId) => {
      const evidence = codexSessionEvidence({ sessionId, task, boardRepositoryPath, root, dispatchContractSha256, boundInput, boardStateDigest: board.stateDigest, executionProfile });
      bindingReport = bindCodexWorkerSession({
        goalRoot: board.path,
        taskId: task.id,
        expectedStateDigest: board.stateDigest,
        allowImmutableHistory: options.allowImmutableHistory,
      }, evidence);
      if (!bindingReport.ok) throw publicError("DISPATCH_SESSION_BIND_FAILED", bindingReport.checker_errors?.[0] || "Codex Worker session binding failed validation.");
      authorizedControlSha256 = { [boardRepositoryPath]: bindingReport.after_digest };
    } : null,
    expectedThreadId: options.resumeSession || "",
  });
  const after = captureDispatchManifest(root, { scope: dispatchScope });
  const receipt = extractReceipt(`${codexAgentText(run.stdout)}\n${run.stdout}\n${run.stderr}`);
  if (receipt && !receipt.harness) receipt.harness = to;
  let scope;
  try {
    scope = compareDispatchScope({
      before,
      after,
      scope: dispatchScope,
      role,
      allowedFiles: payload.task.allowed_files,
      receiptChangedFiles: receipt?.changed_files ?? [],
      authorizedControlSha256,
    });
  } catch (error) {
    scope = { status: "violations", changed_files: [], receipt_changed_files: [], control_changes: [], out_of_scope: [], missing_receipt_changes: [], extra_receipt_claims: [], violations: [error.message] };
  }

  const identityError = receipt ? receiptIdentityError(receipt, { taskId: task.id, boardPath: board.path, root }) : null;
  const dispatchEvidence = {
    session_binding: bindingReport ? { session_id: bindingReport.session_id, state_digest: bindingReport.after_digest } : existingBinding ? { session_id: existingBinding.session_id, state_digest: board.stateDigest } : null,
    dispatch_contract_sha256: dispatchContractSha256,
    brief: boundInput,
  };
  if (run.error || run.status !== 0) {
    if (scope.status !== "clean") {
      return failure("DISPATCH_SCOPE_FAILED", scopeFailureMessage(scope, `${run.error || `The ${to} CLI exited with status ${run.status}`} and left a non-clean dispatch scope.`), {
        ...dispatchEvidence, harness: to, task_id: task.id, role, exit_status: run.status ?? null, harness_error: run.error || null, receipt: receipt || null, scope_check: scope,
      });
    }
    const code = run.sessionError ? (options.resumeSession ? "CODEX_SESSION_RESUME_FAILED" : "DISPATCH_SESSION_BIND_FAILED") : "HARNESS_FAILED";
    return failure(code, run.error || `The ${to} CLI exited with status ${run.status}.`, {
      ...dispatchEvidence, harness: to, task_id: task.id, role, exit_status: run.status ?? null, receipt: receipt || null, scope_check: scope,
    });
  }
  if (!receipt) {
    return failure("RECEIPT_MISSING", "No goalbuddy_receipt_v1 object found in the harness output.", {
      ...dispatchEvidence, harness: to, task_id: task.id, role, exit_status: run.status, receipt: null, scope_check: scope,
    });
  }
  if (identityError) {
    return failure("RECEIPT_IDENTITY_MISMATCH", identityError, {
      ...dispatchEvidence, harness: to, task_id: task.id, role, exit_status: run.status, receipt, scope_check: scope,
    });
  }
  if (scope.status !== "clean") {
    return failure("DISPATCH_SCOPE_FAILED", scopeFailureMessage(scope, "Dispatch writes or receipt claims failed the admitted scope contract."), {
      ...dispatchEvidence, harness: to, task_id: task.id, role, exit_status: run.status, receipt, scope_check: scope,
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
    ...dispatchEvidence,
  };
}

function failure(code, message, extra = {}) {
  return { ...publicFailure(publicError(code, message)), receipt: null, scope_check: { status: "skipped" }, ...extra };
}

function scopeFailureMessage(scope, prefix) {
  const details = (scope.violations || []).slice(0, 10);
  return details.length > 0 ? `${prefix} ${details.join("; ")}` : prefix;
}

function runHarness(to, prompt, { cwd, model, reasoningEffort, serviceTier, sandbox, role, timeoutSeconds, resumeSession = "", onThreadStarted = null, expectedThreadId = "" }) {
  const command = harnessCommand(to, prompt, { model, reasoningEffort, serviceTier, sandbox, role, resumeSession });
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let pending = "";
    let startedThreadId = "";
    let threadNotified = false;
    let sessionError = "";
    let timedOut = false;
    const child = spawn(command.file, command.args, { cwd, shell: process.platform === "win32", env: process.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const terminate = () => {
      if (process.platform === "win32") child.kill("SIGTERM");
      else {
        try { process.kill(-child.pid, "SIGTERM"); } catch { child.kill("SIGTERM"); }
      }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutSeconds * 1000);
    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      for (const line of lines) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event?.type !== "thread.started") continue;
        const threadId = String(event.thread_id || "");
        if (!threadId) continue;
        if (startedThreadId && startedThreadId !== threadId) {
          sessionError = "Codex emitted conflicting thread.started identities.";
          terminate();
          continue;
        }
        startedThreadId = threadId;
        if (expectedThreadId && threadId !== expectedThreadId) {
          sessionError = `Codex resumed thread ${threadId}, expected ${expectedThreadId}.`;
          terminate();
          continue;
        }
        if (onThreadStarted && !threadNotified) {
          threadNotified = true;
          try { onThreadStarted(threadId); } catch (error) {
            sessionError = error.message;
            terminate();
          }
        }
      }
    });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ error: error.code === "ENOENT" ? `The ${to} CLI ("${command.file}") was not found on PATH. Install it or choose another --to target.` : error.message, status: null, stdout, stderr, sessionError: false });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      if (timedOut) return resolveRun({ error: `The ${to} CLI timed out after ${timeoutSeconds}s.`, status, stdout, stderr, sessionError: false });
      if (sessionError) return resolveRun({ error: sessionError, status, stdout, stderr, sessionError: true });
      if (to === "codex" && role === "worker" && !startedThreadId) return resolveRun({ error: "Codex did not emit a thread.started session identity.", status, stdout, stderr, sessionError: true });
      resolveRun({ status, stdout, stderr, sessionError: false, threadId: startedThreadId });
    });
  });
}

export function harnessCommand(to, prompt, { model = "", reasoningEffort = "", serviceTier = "", sandbox = "workspace-write", role = "worker", resumeSession = "" } = {}) {
  if (to === "codex") {
    const args = resumeSession ? ["exec", "resume", resumeSession] : ["exec"];
    args.push("--json", "--skip-git-repo-check", "-c", `sandbox_mode=${JSON.stringify(sandbox)}`);
    if (model) args.push("-c", `model=${JSON.stringify(model)}`);
    if (reasoningEffort) args.push("-c", `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`);
    if (serviceTier) args.push("-c", `service_tier=${JSON.stringify(serviceTier)}`);
    args.push(prompt);
    return { file: "codex", args };
  }
  const args = ["-p", prompt];
  if (model) args.push("--model", model);
  if (!READ_ONLY_ROLES.has(role)) args.push("--permission-mode", "acceptEdits");
  return { file: "claude", args };
}

export function compileDispatchContract({ payload, to, executionProfile, brief = null }) {
  return sha256(JSON.stringify({ version: 1, renderer_version: 1, task: payload.task, role: payload.task.type, to, model: executionProfile.model, sandbox: executionProfile.sandbox, brief }));
}

function effectiveExecutionProfile({ options, to, role, existingBinding }) {
  if (to !== "codex") {
    return {
      model: options.model,
      reasoningEffort: "",
      serviceTier: "",
      sandbox: READ_ONLY_ROLES.has(role) ? "read-only" : "workspace-write",
    };
  }
  const requested = {
    model: options.model || "gpt-5.6-sol",
    reasoningEffort: "medium",
    serviceTier: "fast",
    sandbox: READ_ONLY_ROLES.has(role) ? "read-only" : "danger-full-access",
  };
  if (!options.resumeSession || !existingBinding) return requested;
  const bound = {
    model: existingBinding.model,
    reasoningEffort: "medium",
    serviceTier: "fast",
    sandbox: existingBinding.sandbox,
  };
  for (const [key, value] of Object.entries(requested)) {
    const explicitlyOverridden = key === "model" ? Boolean(options.model) : false;
    if (explicitlyOverridden && value !== bound[key]) {
      throw publicError("CODEX_SESSION_RESUME_FAILED", `Resume ${key} override differs from the bound Worker contract; no process was launched.`);
    }
  }
  return bound;
}

function loadBoundInput(root, options) {
  if (!options.briefPath) return null;
  const path = normalizeRepositoryPath(root, options.briefPath);
  const absolute = resolve(root, path);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw publicError("INVALID_ARGUMENT", "Bound implementation context must be a regular non-symlink file inside the repository.");
  const actual = sha256(readFileSync(absolute));
  if (actual !== options.briefSha256) throw publicError("INVALID_ARGUMENT", `Bound implementation context digest mismatch: expected ${options.briefSha256}, got ${actual}.`);
  return Object.freeze({ path, sha256: actual });
}

function codexSessionEvidence({ sessionId, task, boardRepositoryPath, root, dispatchContractSha256, boundInput, boardStateDigest, executionProfile }) {
  const codexHome = realpathSync(resolve(process.env.CODEX_HOME || resolve(process.env.HOME || "", ".codex")));
  return {
    harness: "codex",
    session_id: sessionId,
    task_id: task.id,
    board_path_sha256: sha256(boardRepositoryPath),
    workspace_root_sha256: sha256(realpathSync(root)),
    codex_home_sha256: sha256(codexHome),
    dispatch_contract_sha256: dispatchContractSha256,
    model: executionProfile.model,
    sandbox: executionProfile.sandbox,
    brief_path: boundInput?.path ?? null,
    brief_sha256: boundInput?.sha256 ?? null,
    launch_state_digest: boardStateDigest,
  };
}

function validateResumeBinding({ options, existingBinding, task, board, root, boardRepositoryPath, dispatchContractSha256, boundInput }) {
  if ((options.to || "codex") !== "codex" || task.type !== "worker") throw publicError("CODEX_SESSION_RESUME_FAILED", "Exact Codex resume is available only for a Codex Worker task.");
  if (!existingBinding || existingBinding.session_id !== options.resumeSession || existingBinding.task_id !== task.id) throw publicError("CODEX_SESSION_RESUME_FAILED", "The active task does not carry the requested exact Codex session binding.");
  const expected = codexSessionEvidence({ sessionId: options.resumeSession, task, boardRepositoryPath, root, dispatchContractSha256, boundInput, boardStateDigest: existingBinding.launch_state_digest, executionProfile: { model: existingBinding.model, reasoningEffort: "medium", serviceTier: "fast", sandbox: existingBinding.sandbox } });
  for (const key of ["board_path_sha256", "workspace_root_sha256", "codex_home_sha256", "dispatch_contract_sha256", "model", "sandbox", "brief_path", "brief_sha256"]) {
    if (existingBinding[key] !== expected[key]) throw publicError("CODEX_SESSION_RESUME_FAILED", `Codex session binding no longer matches ${key}; no process was launched.`);
  }
  if (board.stateDigest !== options.expectedStateDigest) throw publicError("STALE_STATE_DIGEST", "Board changed before exact resume.");
}

function codexAgentText(output) {
  const texts = [];
  for (const line of String(output || "").split("\n")) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const item = event?.item || event;
    for (const value of [item?.text, item?.output_text, event?.message]) if (typeof value === "string") texts.push(value);
  }
  return texts.join("\n");
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
