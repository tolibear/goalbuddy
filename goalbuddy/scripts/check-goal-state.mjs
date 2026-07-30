#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isCodexServiceTier, isCodexSolReasoningEffort, isCodexThreadId } from "./codex-exec-contract.mjs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";
import { equalBriefBindings, verifyBrief } from "./brief-binding.mjs";
import {
  artifactIdentity,
  canonicalJson,
  canonicalJsonSha256,
  deriveReceiptSource,
  heldReceiptFromDerivedSource,
  openContainedArtifact,
  provenanceFromDerivedSource,
  resolveArtifactRoots,
  validateHeldReceipt,
  validateReceiptProvenance,
  validateReceiptSourceContext,
} from "./receipt-provenance.mjs";
import {
  validatePmBlockedCloseoutReceipt,
  validateTaskReceipt,
} from "./receipt-contract.mjs";
import { completionEligibility } from "./completion-eligibility.mjs";
import { collectRequiredReviewPaths } from "./completion-review-scope.mjs";
import { validateFinalReviewContract } from "./final-review-contract.mjs";

const inputPath = process.argv[2];
const isChildCheck = process.argv.includes("--child");
const useSnapshotStdin = process.argv.includes("--snapshot-stdin");
const useCandidateStdin = process.argv.includes("--candidate-stdin");
const judgeDecisions = new Set(["approved", "rejected", "approve_subgoal", "reject_subgoal", "not_complete", "complete"]);

if (!inputPath) {
  console.error("Usage: node scripts/check-goal-state.mjs docs/goals/<slug>[/state.yaml]");
  process.exit(2);
}

const statePath = existsSync(inputPath) && statSync(inputPath).isDirectory()
  ? join(inputPath, "state.yaml")
  : inputPath;

if (!existsSync(statePath)) {
  console.error(JSON.stringify({ ok: false, errors: [`state file not found: ${statePath}`], warnings: [] }, null, 2));
  process.exit(1);
}

const root = dirname(statePath);
const stateOnDisk = readFileSync(statePath, "utf8");
const text = useSnapshotStdin || useCandidateStdin ? readFileSync(0, "utf8") : stateOnDisk;
const errors = [];
const warnings = [];
if (useSnapshotStdin && text !== stateOnDisk) {
  errors.push("supplied state snapshot does not match state.yaml on disk");
}

function decodeScalar(value) {
  if (value === undefined || value === null) return null;
  const cleaned = stripInlineComment(String(value).trim()).trim();
  if (cleaned.startsWith("\"")) {
    if (!cleaned.endsWith("\"")) {
      return { value: cleaned, error: "unterminated double-quoted scalar" };
    }
    try {
      return { value: JSON.parse(cleaned), error: null };
    } catch {
      return { value: cleaned, error: "invalid double-quoted scalar" };
    }
  }
  if (cleaned.startsWith("'")) {
    if (!cleaned.endsWith("'")) {
      return { value: cleaned, error: "unterminated single-quoted scalar" };
    }
    return { value: cleaned.slice(1, -1).replace(/''/g, "'"), error: null };
  }
  if (cleaned === "" || cleaned === "null") return { value: null, error: null };
  if (cleaned === "true") return { value: true, error: null };
  if (cleaned === "false") return { value: false, error: null };
  if (/^\d+$/.test(cleaned)) return { value: Number(cleaned), error: null };
  return { value: cleaned, error: null };
}

function stripInlineComment(value) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote === "\"" && escaped) {
      escaped = false;
      continue;
    }
    if (quote === "\"" && char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"" || char === "'") {
      if (quote === char) {
        if (char === "'" && value[index + 1] === "'") {
          index += 1;
          continue;
        }
        quote = null;
      } else if (quote === null) {
        quote = char;
      }
      continue;
    }
    if (char === "#" && quote === null && (index === 0 || /\s/.test(value[index - 1]))) {
      return value.slice(0, index);
    }
  }
  return value;
}

function clean(value) {
  return decodeScalar(value)?.value ?? null;
}

function topScalar(key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function nestedScalar(section, key) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (new RegExp(`^${section}:\\s*$`).test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^\S/.test(line)) break;
    if (inSection) {
      const match = line.match(new RegExp(`^\\s{2}${key}:\\s*(.*?)\\s*$`));
      if (match) return clean(match[1]);
    }
  }
  return null;
}

function pathScalar(path, key) {
  const lines = text.split(/\r?\n/);
  let depth = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^ */)[0].length;
    if (indent < depth * 2) depth = Math.floor(indent / 2);

    if (depth < path.length && indent === depth * 2 && new RegExp(`^\\s{${indent}}${path[depth]}:\\s*$`).test(line)) {
      depth += 1;
      continue;
    }

    if (depth === path.length && indent === depth * 2) {
      const match = line.match(new RegExp(`^\\s{${indent}}${key}:\\s*(.*?)\\s*$`));
      if (match) return clean(match[1]);
    }
  }
  return null;
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

function sectionText(section) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${section}:\\s*$`).test(line));
  if (start === -1) return "";
  const collected = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\S/.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join("\n");
}

function parseTasks() {
  const body = sectionText("tasks");
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const tasks = [];
  let current = null;
  let currentLines = [];

  function finish() {
    if (!current) return;
    current.raw = currentLines.join("\n");
    tasks.push(current);
  }

  for (const line of lines) {
    const idMatch = line.match(/^\s{2}-\s+id:\s*(.+?)\s*$/);
    if (idMatch) {
      finish();
      current = { id: clean(idMatch[1]) };
      currentLines = [line];
      continue;
    }
    if (current) currentLines.push(line);
  }
  finish();
  return tasks.map((task) => ({
    ...task,
    type: taskScalar(task, "type"),
    assignee: taskScalar(task, "assignee"),
    status: taskScalar(task, "status"),
    objective: taskScalar(task, "objective"),
    allowedFiles: taskList(task, "allowed_files"),
    verify: taskList(task, "verify"),
    stopIf: taskList(task, "stop_if"),
    receipt: taskReceipt(task),
    subgoal: taskSubgoal(task),
  }));
}

function taskScalar(task, key) {
  const match = task.raw.match(new RegExp(`^\\s{4}${key}:\\s*(.*?)\\s*$`, "m"));
  return match ? clean(match[1]) : null;
}

function taskList(task, key) {
  const lines = task.raw.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s{4}${key}:\\s*$`).test(line));
  if (start === -1) return [];
  const values = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s{4}\S/.test(lines[i])) break;
    const item = lines[i].match(/^\s{6}-\s*(.+?)\s*$/);
    if (item) values.push(clean(item[1]));
  }
  return values.filter((value) => value !== null);
}

function taskReceipt(task) {
  const lines = task.raw.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s{4}receipt:\s*/.test(line));
  if (start === -1) return { present: false, value: null, raw: "" };

  const inline = clean(lines[start].replace(/^\s{4}receipt:\s*/, ""));
  if (inline === null && !/^(\s{6}|\s{8})/.test(lines[start + 1] || "")) {
    return { present: true, value: null, raw: "" };
  }

  const receiptLines = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s{4}\S/.test(lines[i])) break;
    receiptLines.push(lines[i]);
  }
  const raw = receiptLines.join("\n");
  return {
    present: true,
    value: inline || "object",
    raw,
    has: (key) => new RegExp(`^\\s{6}${key}:`, "m").test(raw),
    list: (key) => receiptList(raw, key),
    commandEntries: () => receiptCommandEntries(raw),
    scalar: (key) => {
      const match = raw.match(new RegExp(`^\\s{6}${key}:\\s*(.*?)\\s*$`, "m"));
      return match ? clean(match[1]) : null;
    },
  };
}

function taskSubgoal(task) {
  const lines = task.raw.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s{4}subgoal:\s*/.test(line));
  if (start === -1) return { present: false };

  const subgoalLines = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s{4}\S/.test(lines[i])) break;
    subgoalLines.push(lines[i]);
  }
  const raw = subgoalLines.join("\n");
  const scalar = (key) => {
    const match = raw.match(new RegExp(`^\\s{6}${key}:\\s*(.*?)\\s*$`, "m"));
    return match ? clean(match[1]) : null;
  };

  return {
    present: true,
    raw,
    status: scalar("status"),
    path: scalar("path"),
    owner: scalar("owner"),
    depth: scalar("depth"),
  };
}

function receiptList(raw, key) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^\\s{6}${key}:\\s*$`).test(line));
  if (start === -1) return [];
  const values = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s{6}\S/.test(lines[i])) break;
    const item = lines[i].match(/^\s{8}-\s*(.+?)\s*$/);
    if (item) values.push(clean(item[1]));
  }
  return values.filter((value) => value !== null);
}

function receiptCommandEntries(raw) {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s{6}commands:\s*$/.test(line));
  if (start === -1) return { commands: [], errors: [] };

  const commands = [];
  let current = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{6}\S/.test(line)) break;

    const item = line.match(/^\s{8}-\s*(.*?)\s*$/);
    if (item) {
      const command = item[1].match(/^cmd:\s*(.*?)\s*$/);
      current = { cmd: null, status: null, errors: [] };
      commands.push(current);
      if (!command) {
        current.errors.push("each commands list item must begin with cmd");
        continue;
      }
      const decoded = decodeScalar(command[1]);
      current.cmd = decoded?.value ?? null;
      if (decoded?.error) current.errors.push(`cmd has ${decoded.error}`);
      if (typeof current.cmd !== "string" || current.cmd.trim() === "") {
        current.errors.push("cmd must be a nonempty string");
      }
      continue;
    }

    const status = line.match(/^\s{10}status:\s*(.*?)\s*$/);
    if (status && current) {
      if (current.status !== null) {
        current.errors.push("status must appear exactly once");
        continue;
      }
      const decoded = decodeScalar(status[1]);
      current.status = decoded?.value ?? null;
      if (decoded?.error) current.errors.push(`status has ${decoded.error}`);
    }
  }

  for (const command of commands) {
    if (command.status === null) command.errors.push("status is required");
  }
  return {
    commands,
    errors: commands.flatMap((command, index) => command.errors.map((error) => `entry ${index + 1}: ${error}`)),
  };
}

function rootEntryErrors() {
  const allowed = new Set(["goal.md", "state.yaml", "notes", ".goalbuddy-board", "subgoals"]);
  const unexpected = [];
  for (const entry of readdirSync(root).filter((item) => item !== ".DS_Store")) {
    const path = join(root, entry);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      unexpected.push(`${entry} (unreadable)`);
      continue;
    }
    if (!allowed.has(entry)) {
      unexpected.push(entry);
    } else if ((entry === "notes" || entry === ".goalbuddy-board" || entry === "subgoals") && !stats.isDirectory()) {
      unexpected.push(`${entry} (must be a directory)`);
    } else if (!["notes", ".goalbuddy-board", "subgoals"].includes(entry) && !stats.isFile()) {
      unexpected.push(`${entry} (must be a file)`);
    }
  }
  return unexpected;
}

const version = topScalar("version");
const goalStatus = nestedScalar("goal", "status");
const activeTask = topScalar("active_task");
const agentStatuses = ["scout", "worker", "judge"].map((agent) => ({
  agent,
  status: nestedScalar("agents", agent),
}));
const allowedAgentStatuses = new Set(["installed", "bundled_not_installed", "missing", "unknown"]);
const continuousUntilFullOutcome = nestedScalar("rules", "continuous_until_full_outcome") === true;
const missingInputOrCredentialsDoNotStopGoal =
  nestedScalar("rules", "missing_input_or_credentials_do_not_stop_goal") === true;
const exactHumanApprovalCanTerminalWait =
  nestedScalar("rules", "exact_human_approval_can_terminal_wait") === true;
const goalPressureRequiresOracle = nestedScalar("rules", "goal_pressure_requires_oracle") !== false;
const noCompletionOnWeakProof = nestedScalar("rules", "no_completion_on_weak_proof") !== false;
const completionProof = pathScalar(["goal", "intake"], "completion_proof");
const oracleSignal = pathScalar(["goal", "oracle"], "signal");
const oracleFinalProof = pathScalar(["goal", "oracle"], "final_proof");
const legacySignals = [
  /^gate:\s*$/m,
  /^artifact_policy:\s*$/m,
  /^active_unit:/m,
  /^evidence\.jsonl/m,
].some((pattern) => pattern.test(text)) || ["units", "artifacts", "evidence.jsonl"].some((entry) => existsSync(join(root, entry)));

if (version !== 2) {
  if (legacySignals) {
    errors.push("legacy v1 goal state detected; GoalBuddy v2 requires version: 2 with a task board. Create a new v2 goal or migrate manually.");
  } else {
    errors.push("state.yaml must declare version: 2");
  }
}

if (!["active", "blocked", "done"].includes(goalStatus)) {
  errors.push(`goal.status must be active, blocked, or done; got ${goalStatus || "<missing>"}`);
}

if (goalPressureRequiresOracle) {
  if (isWeakProof(oracleSignal)) {
    warnings.push("goal.oracle.signal is missing or placeholder-like; weak oracles make /goal finish too early.");
  }
  if (isWeakProof(oracleFinalProof)) {
    warnings.push("goal.oracle.final_proof is missing or placeholder-like; final completion needs receipt-backed proof.");
  }
}

if (isWeakProof(completionProof)) {
  warnings.push("goal.intake.completion_proof is missing or placeholder-like; record the observable signal that proves the full original outcome.");
}

function agentStatusWarning(agent, status) {
  const agentLabel = agent[0].toUpperCase() + agent.slice(1);
  if (status === "bundled_not_installed") {
    return `agents.${agent} is bundled_not_installed; /goal can continue through PM fallback, but dedicated ${agentLabel} delegation is unavailable until installed. If dedicated agents are required before /goal, run the GoalBuddy CLI through the user's install channel with: agents`;
  }
  if (status === "missing") {
    return `agents.${agent} is missing; /goal can continue through PM fallback, but dedicated ${agentLabel} delegation is unavailable. If dedicated agents are required before /goal, run the GoalBuddy CLI through the user's install channel with: install`;
  }
  return `agents.${agent} is unknown; /goal can continue through PM fallback, but dedicated ${agentLabel} delegation was not verified. To check before /goal, run the GoalBuddy CLI through the user's install channel with: doctor`;
}

for (const { agent, status } of agentStatuses) {
  if (!allowedAgentStatuses.has(status)) {
    errors.push(`agents.${agent} must be one of installed, bundled_not_installed, missing, or unknown; got ${status || "<missing>"}`);
  } else if (status !== "installed") {
    warnings.push(agentStatusWarning(agent, status));
  }
}

if (!existsSync(join(root, "goal.md"))) errors.push("missing goal.md");

const unexpected = rootEntryErrors();
if (unexpected.length > 0) {
  errors.push(`unexpected root entries; v2 goal roots may contain only goal.md, state.yaml, notes/, subgoals/, and .goalbuddy-board/: ${unexpected.join(", ")}`);
}

const tasks = parseTasks();
const ids = new Set();
const transitionEvidenceTasks = new Map();
const strictTasks = new Map();
const heldReceiptHandles = new Set();
let strictDocument = null;
if (/^    (?:transition_evidence|brief):/m.test(text)) {
  try {
    strictDocument = parseGoalStateText(text, { allowFallback: false });
    for (const task of strictDocument.tasks || []) {
      strictTasks.set(task.id, task);
      transitionEvidenceTasks.set(task.id, task);
    }
  } catch (error) {
    errors.push(`task brief and transition_evidence require strict YAML parsing: ${error.message}`);
  }
}
for (const task of tasks) {
  if (!task.id || !/^T\d{3}$/.test(task.id)) errors.push(`task id must use T### format; got ${task.id || "<missing>"}`);
  if (ids.has(task.id)) errors.push(`duplicate task id: ${task.id}`);
  ids.add(task.id);
  if (!["scout", "judge", "worker", "pm"].includes(task.type)) {
    errors.push(`task ${task.id} type must be scout, judge, worker, or pm`);
  }
  if (!["Scout", "Judge", "Worker", "PM"].includes(task.assignee)) {
    errors.push(`task ${task.id} assignee must be Scout, Judge, Worker, or PM`);
  }
  const expectedAssignee = {
    scout: "Scout",
    judge: "Judge",
    worker: "Worker",
    pm: "PM",
  }[task.type];
  if (expectedAssignee && task.assignee !== expectedAssignee) {
    errors.push(`task ${task.id} assignee must be ${expectedAssignee} for type ${task.type}`);
  }
  if (!["queued", "active", "blocked", "done"].includes(task.status)) {
    errors.push(`task ${task.id} status must be queued, active, blocked, or done`);
  }
  if (!task.objective) errors.push(`task ${task.id} missing objective`);
}

if (tasks.length === 0) errors.push("tasks must contain at least one task");

const activeTasks = tasks.filter((task) => task.status === "active");
const terminalApprovalWait = isTerminalApprovalWait(tasks, activeTasks, activeTask);
if (goalStatus === "done") {
  if (activeTasks.length !== 0) errors.push("done goals must not have an active task");
  if (activeTask !== null) errors.push("done goals must set active_task: null");
  const unfinishedTasks = tasks
    .filter((task) => task.status !== "done")
    .map((task) => task.id);
  if (unfinishedTasks.length > 0) {
    errors.push(`done goals require every task to be done; unfinished tasks: ${unfinishedTasks.join(", ")}`);
  }
} else if (goalStatus === "blocked") {
  if (activeTasks.length > 1) errors.push("blocked goals may have at most one active task");
  if (continuousUntilFullOutcome && missingInputOrCredentialsDoNotStopGoal && !terminalApprovalWait) {
    errors.push("continuous goals must keep goal.status active; missing input or credentials should block specific tasks, not the whole goal");
  }
} else if (activeTasks.length !== 1) {
  errors.push(`exactly one active task is required while goal.status is active; found ${activeTasks.length}`);
}

if (activeTasks.length === 1 && activeTask !== activeTasks[0].id) {
  errors.push(`active_task must point to active task ${activeTasks[0].id}; got ${activeTask || "null"}`);
}
if (activeTask && !ids.has(activeTask)) errors.push(`active_task points to unknown task: ${activeTask}`);

for (const task of tasks) {
  const persistedBrief = strictTasks.get(task.id)?.brief;
  validateTaskBrief(task, persistedBrief);
  validateTransitionEvidence(task, transitionEvidenceTasks.get(task.id)?.transition_evidence, persistedBrief);
  if (task.subgoal.present) {
    validateSubgoal(task);
  }

  const hasReceipt = task.receipt.present && task.receipt.value !== null;
  validateReceiptNote(task);
  const receiptResult = hasReceipt ? task.receipt.scalar("result") : null;
  if (hasReceipt && (task.receipt.has("waiting_for_user_approval") || task.receipt.has("required_reply"))) {
    const waitingForUserApproval = task.receipt.scalar("waiting_for_user_approval");
    const requiredReply = task.receipt.scalar("required_reply");
    if (receiptResult !== "blocked" || waitingForUserApproval !== true || typeof requiredReply !== "string" || requiredReply.trim().length === 0) {
      errors.push(`receipt for ${task.id} has an incomplete exact human reply wait; require result: blocked, waiting_for_user_approval: true, and nonempty required_reply`);
    }
  }
  if (task.status === "done" && !hasReceipt) {
    errors.push(`done task ${task.id} missing receipt`);
  }
  if (task.status === "done" && hasReceipt && receiptResult !== "done") {
    errors.push(`done task ${task.id} receipt must include result: done`);
  }
  if (task.status === "blocked" && !hasReceipt) {
    errors.push(`blocked task ${task.id} missing receipt`);
  }
  if (task.type === "worker" && task.status === "active") {
    if (task.allowedFiles.length === 0) errors.push(`active Worker task ${task.id} must include allowed_files`);
    if (task.verify.length === 0) errors.push(`active Worker task ${task.id} must include verify`);
    if (task.stopIf.length === 0) errors.push(`active Worker task ${task.id} must include stop_if`);
  }
  if (task.type === "worker" && task.status === "done" && hasReceipt) {
    for (const key of ["changed_files", "commands", "summary"]) {
      if (!task.receipt.has(key)) errors.push(`Worker receipt for ${task.id} missing ${key}`);
    }
    const changedFiles = task.receipt.list("changed_files");
    if (changedFiles.length === 0) {
      errors.push(`Worker receipt for ${task.id} changed_files must list at least one file`);
    }
    for (const changedFile of changedFiles) {
      if (!matchesAllowedFile(changedFile, task.allowedFiles)) {
        errors.push(`Worker receipt for ${task.id} changed file outside allowed_files: ${changedFile}`);
      }
    }
    const commandEntries = task.receipt.commandEntries();
    const receiptCommands = commandEntries.commands;
    const commandStatuses = receiptCommands
      .map((command) => command.status)
      .filter((value) => value !== null);
    for (const commandError of commandEntries.errors) {
      errors.push(`Worker receipt for ${task.id} has invalid commands entry: ${commandError}`);
    }
    if (task.receipt.has("commands") && commandStatuses.length === 0) {
      errors.push(`Worker receipt for ${task.id} commands must include status fields`);
    }
    for (const status of commandStatuses) {
      if (status !== "pass") {
        errors.push(`Worker receipt for ${task.id} has non-passing command status: ${status}`);
      }
    }
    const passingCommands = new Set(
      receiptCommands
        .filter((command) => command.status === "pass")
        .map((command) => command.cmd),
    );
    for (const command of task.verify) {
      if (!passingCommands.has(command)) {
        errors.push(`Worker receipt for ${task.id} missing passing verification command: ${command}`);
      }
    }
    if (task.receipt.scalar("needs_judge") === true) {
      warnings.push(`Worker receipt for ${task.id} requests legacy needs_judge; GoalBuddy now lets the PM continue by default and reviews only at phase, risk, ambiguity, rejected-verification, or final-completion boundaries`);
    }
  }
  if (task.type === "scout" && task.status === "done" && hasReceipt) {
    if (!task.receipt.has("summary")) errors.push(`Scout receipt for ${task.id} missing summary`);
    if (!task.receipt.has("evidence") && !task.receipt.has("note")) {
      errors.push(`Scout receipt for ${task.id} must include evidence or note`);
    }
  }
  if (task.type === "judge" && task.status === "done" && hasReceipt) {
    const decision = task.receipt.scalar("decision");
    if (!task.receipt.has("decision")) {
      errors.push(`Judge receipt for ${task.id} missing decision`);
    } else if (!judgeDecisions.has(decision)) {
      errors.push(`Judge receipt for ${task.id} has unsupported decision ${JSON.stringify(decision)}; expected one of ${[...judgeDecisions].join(", ")}`);
    }
  }
}

function validateTaskBrief(task, binding) {
  if (binding === undefined) return;
  const label = `task ${task.id} brief`;
  if (task.type !== "worker") {
    errors.push(`${label} is allowed only on a Worker task`);
    return;
  }
  try {
    verifyBrief({ goalRoot: statePath, binding });
  } catch (error) {
    errors.push(`${label} is invalid: ${error.message}`);
  }
}

function validateReceiptNote(task) {
  if (!task.receipt.present || task.receipt.value === null || typeof task.receipt.has !== "function" || !task.receipt.has("note")) return;
  const note = task.receipt.scalar("note");
  // Historical boards used receipt.note for prose and external evidence paths.
  // Only the closed notes/... syntax declares a durable board-local pointer.
  // New receipts are held to that syntax by receipt-contract.mjs before install.
  if (typeof note !== "string" || !note.startsWith("notes/")) return;
  if (note.includes("\\") || note.endsWith("/")) {
    errors.push(`receipt note for ${task.id} must be a relative forward-slash path rooted at notes/: ${note}`);
    return;
  }
  const segments = note.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    errors.push(`receipt note for ${task.id} must not contain empty, dot, or traversal segments: ${note}`);
    return;
  }
  const notesRoot = resolve(root, "notes");
  const notePath = resolve(root, note);
  if (notePath === notesRoot || !notePath.startsWith(`${notesRoot}${sep}`)) {
    errors.push(`receipt note for ${task.id} escapes notes/: ${note}`);
    return;
  }
  if (!existsSync(notePath) || !statSync(notePath).isFile()) {
    errors.push(`receipt note for ${task.id} points to missing file: ${note}`);
    return;
  }
  const realRoot = realpathSync(root);
  const realNotesRoot = realpathSync(notesRoot);
  const realNotePath = realpathSync(notePath);
  if (!realNotesRoot.startsWith(`${realRoot}${sep}`) || !realNotePath.startsWith(`${realNotesRoot}${sep}`)) {
    errors.push(`receipt note for ${task.id} resolves outside the owning board notes/: ${note}`);
  }
}

warnings.push(...microSliceWarnings(tasks, activeTask, goalStatus));
warnings.push(...queuedWorkerPackageWarnings(tasks));

function isTerminalApprovalWait(tasks, activeTasks, activeTask) {
  if (goalStatus !== "blocked") return false;
  if (!exactHumanApprovalCanTerminalWait) return false;
  if (activeTask !== null) return false;
  if (activeTasks.length !== 0) return false;

  const unfinishedTasks = tasks.filter((task) => task.status !== "done");
  if (unfinishedTasks.length === 0) return false;
  if (unfinishedTasks.some((task) => !["blocked", "queued"].includes(task.status))) return false;
  const hasCompletionClaim = tasks.some((task) => {
    if (!task.receipt.present || task.receipt.value === null) return false;
    const decision = task.receipt.scalar("decision");
    return task.receipt.scalar("full_outcome_complete") === true
      || decision === "complete";
  });
  if (hasCompletionClaim) return false;

  const exactWaits = unfinishedTasks.filter((task) => {
    if (!task.receipt.present || task.receipt.value === null) return false;
    const requiredReply = task.receipt.scalar("required_reply");
    return task.receipt.scalar("result") === "blocked"
      && task.receipt.scalar("waiting_for_user_approval") === true
      && typeof requiredReply === "string"
      && requiredReply.trim().length > 0;
  });
  return exactWaits.length === 1 && exactWaits[0].status === "blocked";
}

function validateTransitionEvidence(task, evidence, persistedBrief) {
  const persistedReceipt = strictTasks.get(task.id)?.receipt;
  if (hasProspectiveTerminalFields(persistedReceipt)
      && (!evidence || !Object.hasOwn(evidence, "receipt_provenance"))) {
    errors.push(`task ${task.id} prospective terminal completion fields require transition_evidence.receipt_provenance`);
  }
  if (evidence === undefined) return;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    errors.push(`task ${task.id} transition_evidence must be an object`);
    return;
  }
  if (Object.hasOwn(evidence, "receipt_provenance")) {
    validateAppliedReceiptEvidence(task, evidence.receipt_provenance);
  }
  if (Object.hasOwn(evidence, "held_receipts")) {
    validateHeldReceiptEvidence(task, evidence.held_receipts);
  }
  if (Object.hasOwn(evidence, "codex_worker_session")) validateCodexWorkerSession(task, evidence.codex_worker_session, persistedBrief);
  if (!Object.hasOwn(evidence, "exact_human_replies")) return;
  if (!Array.isArray(evidence.exact_human_replies) || evidence.exact_human_replies.length === 0) {
    errors.push(`task ${task.id} transition_evidence.exact_human_replies must be a non-empty array`);
    return;
  }
  for (const [index, entry] of evidence.exact_human_replies.entries()) {
    const label = `task ${task.id} transition_evidence.exact_human_replies[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const waitReceipt = entry.wait_receipt;
    if (!waitReceipt || typeof waitReceipt !== "object" || Array.isArray(waitReceipt)) {
      errors.push(`${label} missing complete wait_receipt`);
      continue;
    }
    if (waitReceipt.result !== "blocked" || waitReceipt.waiting_for_user_approval !== true || typeof waitReceipt.required_reply !== "string" || waitReceipt.required_reply.length === 0) {
      errors.push(`${label}.wait_receipt must preserve the exact-human blocked wait shape`);
    }
    if (waitReceipt.task_id !== task.id || typeof waitReceipt.board_path !== "string" || waitReceipt.board_path.length === 0) {
      errors.push(`${label}.wait_receipt must preserve task_id and board_path identity`);
    }
    for (const key of ["wait_board_digest", "required_reply_sha256", "reply_sha256"]) {
      if (typeof entry[key] !== "string" || !/^[a-f0-9]{64}$/.test(entry[key])) errors.push(`${label}.${key} must be 64 lowercase hex characters`);
    }
    const requiredDigest = createHash("sha256").update(String(waitReceipt.required_reply || "")).digest("hex");
    if (entry.required_reply_sha256 !== requiredDigest) errors.push(`${label}.required_reply_sha256 does not match wait_receipt.required_reply`);
    if (entry.reply_sha256 !== entry.required_reply_sha256) errors.push(`${label}.reply_sha256 must equal required_reply_sha256`);
    if (entry.exact_match !== true) errors.push(`${label}.exact_match must be true`);
    if (waitReceipt.full_outcome_complete === true || ["complete", "done"].includes(waitReceipt.decision)) {
      errors.push(`${label}.wait_receipt must not claim completion`);
    }
  }
}

function hasProspectiveTerminalFields(receipt) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  return [
    "completion_disposition",
    "accepted_deviations",
    "deviation_acceptance",
    "final_review",
  ].some((key) => Object.hasOwn(receipt, key));
}

function validateAppliedReceiptEvidence(task, rawProvenance) {
  const label = `task ${task.id} transition_evidence.receipt_provenance`;
  const persistedTask = strictTasks.get(task.id);
  if (!persistedTask || strictDocument === null) {
    errors.push(`${label} requires one strictly parsed board task`);
    return;
  }
  let provenance;
  try {
    provenance = validateReceiptProvenance(rawProvenance);
  } catch (error) {
    errors.push(`${label} is invalid: ${error.message}`);
    return;
  }
  if (!persistedTask.receipt || typeof persistedTask.receipt !== "object" || Array.isArray(persistedTask.receipt)) {
    errors.push(`${label} requires one persisted task receipt`);
    return;
  }
  try {
    if (canonicalJsonSha256(persistedTask.receipt) !== provenance.receipt_value_sha256) {
      throw new Error("receipt_value_sha256 does not match the exact canonical persisted receipt.");
    }
    validateProspectiveReceiptContract({
      task: persistedTask,
      receipt: persistedTask.receipt,
      closeoutAuthority: provenance.closeout_authority,
      label,
    });
    if (hasProspectiveTerminalFields(persistedTask.receipt)) {
      validatePersistedTerminalReview(persistedTask);
    }
    if (provenance.receipt_artifact.retention_policy === "cleanup_eligible") {
      validateCleanupEligibleLocation(task.id, provenance.receipt_artifact);
    }
    const source = reopenPersistedArtifact(provenance.receipt_artifact, {
      allowMissing: provenance.receipt_artifact.retention_policy === "cleanup_eligible",
      label: `${label}.receipt_artifact`,
    });
    const origin = provenance.origin_artifact === null
      ? null
      : reopenPersistedArtifact(provenance.origin_artifact, {
          allowMissing: false,
          label: `${label}.origin_artifact`,
        });
    if (source === null) return;
    const sourceValue = parseArtifactJson(source, `${label}.receipt_artifact`);
    const originValue = origin === null ? null : parseArtifactJson(origin, `${label}.origin_artifact`);
    const derived = deriveReceiptSource({
      source: sourceValue,
      sourceArtifact: artifactIdentity(source),
      origin: originValue,
      originArtifact: origin === null ? null : artifactIdentity(origin),
      closeoutAuthority: provenance.closeout_authority,
      sourceContext: persistedReceiptSourceContext({
        task: persistedTask,
        sourceValue,
        originValue,
      }),
    });
    const rederived = provenanceFromDerivedSource(derived);
    if (canonicalJson(rederived) !== canonicalJson(provenance)) {
      throw new Error("persisted provenance does not exactly match the safely rederived source descriptor.");
    }
    if (canonicalJson(derived.receipt) !== canonicalJson(persistedTask.receipt)) {
      throw new Error("persisted receipt does not exactly match the safely rederived source receipt.");
    }
  } catch (error) {
    errors.push(`${label} is invalid: ${error.message}`);
  }
}

function validatePersistedTerminalReview(task) {
  const boardSnapshots = [{ path: "state.yaml", state_path: statePath, text }];
  for (const candidate of strictDocument.tasks || []) {
    const childPath = candidate?.subgoal?.path;
    if (typeof childPath !== "string" || childPath.length === 0) continue;
    const childStatePath = resolve(root, childPath);
    const rootPath = resolve(root);
    if (!childStatePath.startsWith(`${rootPath}${sep}`)) {
      throw new Error(`terminal review child board path escapes the goal root: ${childPath}`);
    }
    boardSnapshots.push({
      path: childPath,
      state_path: childStatePath,
      text: readFileSync(childStatePath, "utf8"),
    });
  }
  const requiredReviewPaths = collectRequiredReviewPaths({
    root,
    boardSnapshots,
  });
  validateFinalReviewContract({
    root,
    completionDisposition: task.receipt.completion_disposition,
    acceptedDeviations: task.receipt.accepted_deviations,
    deviationAcceptance: task.receipt.deviation_acceptance,
    finalReview: task.receipt.final_review,
    tasks: strictDocument.tasks || [],
    boardPath: statePath,
    requiredReviewPaths,
    required: true,
  });
}

function validateHeldReceiptEvidence(task, rawEntries) {
  const label = `task ${task.id} transition_evidence.held_receipts`;
  const persistedTask = strictTasks.get(task.id);
  if (!Array.isArray(rawEntries)) {
    errors.push(`${label} must be an array`);
    return;
  }
  if (!persistedTask || strictDocument === null) {
    errors.push(`${label} requires one strictly parsed board task`);
    return;
  }
  if (persistedTask.status === "queued") {
    errors.push(`${label} is not allowed on a queued task`);
  } else if (persistedTask.status === "active"
      && (persistedTask.id !== strictDocument.active_task || persistedTask.receipt !== null)) {
    errors.push(`${label} on an active task requires the current active receipt-free task`);
  } else if (persistedTask.status !== "active" && persistedTask.receipt === null) {
    errors.push(`${label} on closed task history requires the task's persisted receipt`);
  }
  for (const [index, rawEntry] of rawEntries.entries()) {
    const entryLabel = `${label}[${index}]`;
    let entry;
    try {
      entry = validateHeldReceipt(rawEntry);
      if (entry.task_id !== task.id) {
        throw new Error(`held task_id must identify ${task.id}.`);
      }
      if (heldReceiptHandles.has(entry.handle)) {
        throw new Error(`held handle ${entry.handle} must be unique across the board.`);
      }
      heldReceiptHandles.add(entry.handle);
      const source = reopenPersistedArtifact(entry.source_artifact, {
        allowMissing: false,
        label: `${entryLabel}.source_artifact`,
      });
      const origin = entry.origin_artifact === null
        ? null
        : reopenPersistedArtifact(entry.origin_artifact, {
            allowMissing: false,
            label: `${entryLabel}.origin_artifact`,
          });
      const sourceValue = parseArtifactJson(source, `${entryLabel}.source_artifact`);
      const originValue = origin === null ? null : parseArtifactJson(origin, `${entryLabel}.origin_artifact`);
      const closeoutAuthority = origin === null ? "original_role" : "pm_blocked_closeout";
      const taskAuthority = persistedTaskAuthority(persistedTask);
      const actualBoardPath = relative(
        resolveArtifactRoots(root).repository,
        realpathSync(statePath),
      ).split(sep).join("/");
      if (entry.board_path !== actualBoardPath) {
        throw new Error("held board_path does not identify the current board.");
      }
      if (entry.task_authority_sha256 !== canonicalJsonSha256(taskAuthority)) {
        throw new Error("held task_authority_sha256 does not match the current task authority.");
      }
      const workerSession = persistedTask.transition_evidence?.codex_worker_session ?? null;
      const currentDispatchContract = workerSession?.dispatch_contract_sha256 ?? null;
      if (entry.dispatch_contract_sha256 !== currentDispatchContract) {
        throw new Error("held dispatch_contract_sha256 does not match the current task session authority.");
      }
      const derived = deriveReceiptSource({
        source: sourceValue,
        sourceArtifact: artifactIdentity(source),
        origin: originValue,
        originArtifact: origin === null ? null : artifactIdentity(origin),
        closeoutAuthority,
        sourceContext: persistedReceiptSourceContext({
          task: persistedTask,
          sourceValue,
          originValue,
          admissionBinding: entry,
        }),
      });
      const rederived = heldReceiptFromDerivedSource({ taskId: task.id, derived });
      if (canonicalJson(rederived) !== canonicalJson(entry)) {
        throw new Error("held descriptor does not exactly match the safely rederived source.");
      }
      validateProspectiveReceiptContract({
        task: persistedTask,
        receipt: derived.receipt,
        closeoutAuthority,
        label: entryLabel,
      });
    } catch (error) {
      errors.push(`${entryLabel} is invalid: ${error.message}`);
    }
  }
}

function reopenPersistedArtifact(binding, { allowMissing, label }) {
  let roots;
  try {
    roots = resolveArtifactRoots(root);
  } catch (error) {
    throw new Error(`${label} roots cannot be resolved: ${error.message}`);
  }
  try {
    const opened = openContainedArtifact({
      roots,
      root: binding.root,
      path: binding.path,
    });
    if (opened.sha256 !== binding.sha256) {
      throw new Error(`${label} sha256 does not match the exact current file bytes.`);
    }
    return opened;
  } catch (error) {
    if (allowMissing && /Artifact does not exist:/.test(error.message)) return null;
    throw error;
  }
}

function validateCleanupEligibleLocation(taskId, artifact) {
  const roots = resolveArtifactRoots(root);
  const activeGitDir = activeGitDirectory();
  const absolute = resolve(roots[artifact.root], ...artifact.path.split("/"));
  const activeRelative = relative(activeGitDir, absolute).split(sep).join("/");
  const escaped = activeRelative === ".."
    || activeRelative.startsWith("../")
    || isAbsolute(activeRelative);
  const expected = new RegExp(
    `^goalbuddy/dispatch-reports/${escapeRegExp(taskId)}-[^/]+/dispatch-report\\.json$`,
  );
  if (artifact.root !== "git_common_dir" || escaped || !expected.test(activeRelative)) {
    throw new Error("cleanup-eligible receipt artifact must identify the active worktree's exact Git-local dispatch report.");
  }
}

function parseArtifactJson(opened, label) {
  try {
    return JSON.parse(opened.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`);
  }
}

function persistedReceiptSourceContext({
  task,
  sourceValue,
  originValue,
  admissionBinding = null,
}) {
  const roots = resolveArtifactRoots(root);
  const state = realpathSync(statePath);
  const boardPath = relative(roots.repository, state).split(sep).join("/");
  const admittedStateDigest = admissionBinding?.admitted_state_digest
    ?? sourceDigest(sourceValue, originValue);
  const activeGitDir = activeGitDirectory();
  const workerSession = task.transition_evidence?.codex_worker_session ?? null;
  return validateReceiptSourceContext({
    task_id: task.id,
    board_path: boardPath,
    admitted_state_digest: admittedStateDigest,
    digest_kind: "state_yaml_sha256",
    repository_root: roots.repository,
    git_common_dir: roots.git_common_dir,
    active_git_dir: activeGitDir,
    task_authority: persistedTaskAuthority(task),
    expected_dispatch_contract_sha256: workerSession?.dispatch_contract_sha256 ?? null,
    expected_session_binding: workerSession
      ? {
          session_id: workerSession.session_id,
          state_digest: admittedStateDigest,
        }
      : null,
    expected_brief: task.brief ?? null,
  });
}

function persistedTaskAuthority(task) {
  return {
    id: task.id,
    type: String(task.type || "").toLowerCase(),
    assignee: task.assignee || defaultAssignee(task.type),
    status: "active",
    objective: task.objective || "",
    inputs: stringArray(task.inputs),
    constraints: stringArray(task.constraints),
    allowed_files: stringArray(task.allowed_files),
    verify: stringArray(task.verify),
    stop_if: stringArray(task.stop_if),
    reasoning_hint: task.reasoning_hint || null,
    expected_output: stringArray(task.expected_output),
  };
}

function activeGitDirectory() {
  const git = spawnSync("git", ["rev-parse", "--git-dir"], {
    cwd: root,
    encoding: "utf8",
  });
  if (git.status !== 0 || !git.stdout.trim()) {
    throw new Error(`could not resolve active Git directory: ${git.stderr.trim() || "git rev-parse failed"}`);
  }
  const rawGitDir = git.stdout.trim();
  return realpathSync(isAbsolute(rawGitDir) ? rawGitDir : resolve(root, rawGitDir));
}

function sourceDigest(sourceValue, originValue) {
  for (const candidate of [sourceValue?.state_digest, originValue?.state_digest]) {
    if (/^[a-f0-9]{64}$/.test(String(candidate || ""))) return candidate;
  }
  return createHash("sha256").update(text).digest("hex");
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry !== null && entry !== undefined).map(String)
    : [];
}

function defaultAssignee(role) {
  if (role === "scout") return "Scout";
  if (role === "worker") return "Worker";
  if (role === "judge") return "Judge";
  return "PM";
}

function validateProspectiveReceiptContract({
  task,
  receipt,
  closeoutAuthority,
  label,
}) {
  const findings = closeoutAuthority === "pm_blocked_closeout"
    ? validatePmBlockedCloseoutReceipt(receipt, {
        taskId: task.id,
        boardPath: receipt.board_path,
        boundary: label,
      })
    : validateTaskReceipt(receipt, {
        role: String(task.type || "").toLowerCase(),
        taskId: task.id,
        verify: stringArray(task.verify),
        terminalCompletionEligible: prospectiveCompletionEligibility(task),
        boundary: label,
      });
  if (findings.length > 0) {
    throw new Error(findings.map((finding) => `${finding.path}: ${finding.message}`).join("; "));
  }
}

function prospectiveCompletionEligibility(task) {
  if (!["judge", "pm"].includes(String(task.type || "").toLowerCase())) return false;
  const activeVersion = { ...task, status: "active", receipt: null };
  const taskVersions = (strictDocument?.tasks || []).map((candidate) => (
    candidate.id === task.id ? activeVersion : candidate
  ));
  return completionEligibility({
    goalStatus: "active",
    activeTaskId: task.id,
    task: activeVersion,
    tasks: taskVersions,
  }).eligible;
}

function validateCodexWorkerSession(task, session, persistedBrief) {
  const label = `task ${task.id} transition_evidence.codex_worker_session`;
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    errors.push(`${label} must be an object`);
    return;
  }
  const keys = ["harness", "session_id", "task_id", "board_path_sha256", "workspace_root_sha256", "codex_home_sha256", "dispatch_contract_sha256", "model", "reasoning_effort", "service_tier", "sandbox", "brief_path", "brief_sha256", "launch_state_digest"];
  const missing = keys.filter((key) => !Object.hasOwn(session, key));
  const extra = Object.keys(session).filter((key) => !keys.includes(key));
  if (missing.length || extra.length) errors.push(`${label} keys must be exact; missing [${missing.join(", ")}], unexpected [${extra.join(", ")}]`);
  if (session.harness !== "codex") errors.push(`${label}.harness must be codex`);
  if (!isCodexThreadId(session.session_id)) errors.push(`${label}.session_id must be an RFC 9562 UUID`);
  if (session.task_id !== task.id) errors.push(`${label}.task_id must equal ${task.id}`);
  if (typeof session.model !== "string") errors.push(`${label}.model must be a string`);
  if (!isCodexSolReasoningEffort(session.reasoning_effort)) errors.push(`${label}.reasoning_effort is invalid for gpt-5.6-sol`);
  if (!isCodexServiceTier(session.service_tier)) errors.push(`${label}.service_tier is invalid`);
  if (!['workspace-write', 'read-only', 'danger-full-access'].includes(session.sandbox)) errors.push(`${label}.sandbox is invalid`);
  for (const key of ["board_path_sha256", "workspace_root_sha256", "codex_home_sha256", "dispatch_contract_sha256", "launch_state_digest"]) {
    if (!/^[a-f0-9]{64}$/.test(String(session[key] || ""))) errors.push(`${label}.${key} must be 64 lowercase hex characters`);
  }
  const briefAbsent = session.brief_path === null && session.brief_sha256 === null;
  const briefPresent = typeof session.brief_path === "string" && session.brief_path.length > 0 && /^[a-f0-9]{64}$/.test(String(session.brief_sha256 || ""));
  if (!briefAbsent && !briefPresent) errors.push(`${label}.brief_path and brief_sha256 must both be null or a nonempty path plus digest`);
  if (persistedBrief !== undefined) {
    try {
      if (!equalBriefBindings(persistedBrief, { path: session.brief_path, sha256: session.brief_sha256 })) {
        errors.push(`${label} brief identity must equal the task's persisted brief binding`);
      }
    } catch {
      errors.push(`${label} brief identity must equal the task's persisted brief binding`);
    }
  }
  if (task.type !== "worker") errors.push(`${label} is allowed only on a Worker task`);
  const receiptFree = !task.receipt?.present || task.receipt?.value === null;
  if (task.status === "active" && !receiptFree) errors.push(`${label} active task must remain receipt-free`);
  if (task.status === "queued") errors.push(`${label} is not allowed on a queued task`);
}

function validateSubgoal(task) {
  if (isChildCheck) {
    errors.push(`child task ${task.id} must not contain a nested subgoal`);
    return;
  }

  if (!["active", "blocked", "done"].includes(task.subgoal.status)) {
    errors.push(`task ${task.id} subgoal.status must be active, blocked, or done; got ${task.subgoal.status || "<missing>"}`);
  }
  if (task.subgoal.depth !== 1) {
    errors.push(`task ${task.id} subgoal.depth must be 1; got ${task.subgoal.depth || "<missing>"}`);
  }
  if (!task.subgoal.path) {
    errors.push(`task ${task.id} subgoal.path is required`);
    return;
  }

  const rootPath = resolve(root);
  const childStatePath = resolve(rootPath, task.subgoal.path);
  if (childStatePath !== rootPath && !childStatePath.startsWith(`${rootPath}${sep}`)) {
    errors.push(`task ${task.id} subgoal.path must stay inside the goal root: ${task.subgoal.path}`);
    return;
  }
  if (basename(childStatePath) !== "state.yaml") {
    errors.push(`task ${task.id} subgoal.path must point to a state.yaml file`);
    return;
  }
  if (!existsSync(childStatePath)) {
    errors.push(`task ${task.id} subgoal state file not found: ${task.subgoal.path}`);
    return;
  }

  const result = spawnSync(process.execPath, [process.argv[1], childStatePath, "--child"], {
    encoding: "utf8",
  });
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    errors.push(`task ${task.id} subgoal checker produced invalid output for ${task.subgoal.path}`);
    return;
  }
  if (result.status !== 0 || !report.ok) {
    for (const childError of report.errors || ["unknown child state error"]) {
      errors.push(`task ${task.id} subgoal invalid: ${childError}`);
    }
  }
  if (report.goal_status !== task.subgoal.status) {
    errors.push(`task ${task.id} subgoal.status ${task.subgoal.status || "<missing>"} must match child goal.status ${report.goal_status || "<missing>"}`);
  }
  if (goalStatus === "done" && report.goal_status !== "done") {
    errors.push(`done goal must not reference non-done child goal for task ${task.id}; child goal.status is ${report.goal_status || "<missing>"}`);
  }
}

function microSliceWarnings(tasks, activeTaskId, goalStatus) {
  const found = [];
  const guidance = "Board may be micro-slicing. Prefer the largest safe useful slice.";
  const doneTasks = tasks.filter((task) => task.status === "done");
  const workerTasks = tasks.filter((task) => task.type === "worker");
  const recentTinyWorkers = workerTasks.slice(-5).filter((task) => isTinyTask(task));
  const firstMilestoneComplete = nestedScalar("goal", "first_milestone_complete") === true;

  if (recentTinyWorkers.length >= 3) {
    found.push(`${guidance} Three recent Worker tasks look tiny.`);
  }

  for (const task of tasks) {
    if (task.type === "judge" && /pick small reviewable work|select one narrow next task/i.test(task.raw)) {
      found.push(`${guidance} Judge instructions still ask for small or narrow work.`);
      break;
    }
  }

  if (goalStatus !== "active" || !activeTaskId) return [...new Set(found)];
  const activeIndex = tasks.findIndex((task) => task.id === activeTaskId);
  if (activeIndex === -1) return [...new Set(found)];
  const active = tasks[activeIndex];
  if (active.type === "worker") {
    if (doneTasks.length >= 10 && active.allowedFiles.length > 0 && active.allowedFiles.length <= 2) {
      found.push(`${guidance} Active Worker ${active.id} has only ${active.allowedFiles.length} allowed_files after ${doneTasks.length} completed tasks.`);
    }
    if (firstMilestoneComplete && isTinyTask(active)) {
      found.push(`${guidance} The first milestone is complete, so the active Worker should move toward the next real milestone.`);
    }
    if (isMicroWorkerTask(active)) {
      found.push(`${guidance} Active Worker ${active.id} looks like another helper-sized slice.`);
    }
  }
  if (active.type !== "judge") return [...new Set(found)];

  let pairs = 0;
  for (let index = activeIndex; index > 0; index -= 2) {
    const judge = tasks[index];
    const worker = tasks[index - 1];
    if (!isMicroJudgeForWorker(judge, worker)) break;
    pairs += 1;
  }
  if (pairs >= 2) {
    found.push(`${guidance} Micro Worker/Judge loop detected ending at ${active.id}.`);
  }
  return [...new Set(found)];
}

function queuedWorkerPackageWarnings(tasks) {
  const found = [];
  for (const task of tasks) {
    if (task.type !== "worker" || task.status !== "queued") continue;
    const hasAllowedFiles = task.allowedFiles.length > 0;
    const hasVerify = task.verify.length > 0;
    if (hasAllowedFiles !== hasVerify) {
      found.push(`GBW_QUEUED_WORKER_PARTIAL_PACKAGE: queued Worker ${task.id} must be a complete package or an honest empty JIT placeholder`);
    }
    if (hasAllowedFiles === hasVerify && task.stopIf.length === 0) {
      found.push(`GBW_QUEUED_WORKER_MISSING_STOP_IF: queued executable Worker ${task.id} is missing stop_if`);
    }
    for (const pattern of task.allowedFiles) {
      if (String(pattern).trim().endsWith("/")) {
        found.push(`GBW_SCOPE_DIRECTORY_WITHOUT_DESCENDANTS: queued Worker ${task.id} scope ${pattern} ends with /; use an exact file or an explicit descendant glob such as ${pattern}**`);
      }
    }
  }
  return [...new Set(found)];
}

function isMicroJudgeForWorker(judge, worker) {
  if (!judge || !worker) return false;
  if (judge.type !== "judge" || worker.type !== "worker") return false;
  if (!["active", "queued", "done"].includes(judge.status) || worker.status !== "done") return false;
  const objective = String(judge.objective || "").toLowerCase();
  return objective.includes(worker.id.toLowerCase()) && /audit|review|approve/.test(objective) && isMicroWorkerTask(worker);
}

function isMicroWorkerTask(task) {
  if (!task || task.type !== "worker") return false;
  const objective = String(task.objective || "").toLowerCase();
  if (/collapsed|batch|package|tranche/.test(objective)) return false;
  return /one narrow|single helper|one helper|per[- ]helper|per[- ]table|projection helper/.test(objective);
}

function isTinyTask(task) {
  if (!task) return false;
  const text = [task.objective, task.raw, task.receipt?.raw].join(" ").toLowerCase();
  if (/collapsed|batch|package|tranche|vertical slice|milestone/.test(text)) return false;
  return /\b(tiny|narrow|single helper|one helper|projection helper|projection function|contract file|read-only proof|doc note|validator|validation wrapper|pure helper|caller-input)\b/.test(text);
}

function matchesAllowedFile(file, allowedFiles) {
  return allowedFiles.some((pattern) => globMatch(pattern, file));
}

function globMatch(pattern, file) {
  const normalizedPattern = normalizePathPattern(pattern);
  const normalizedFile = normalizePathPattern(file);
  if (normalizedPattern === normalizedFile) return true;
  const token = "__GOALBUDDY_GLOBSTAR__";
  const regexSource = escapeRegExp(normalizedPattern)
    .replace(/\*\*/g, token)
    .replace(/\*/g, "[^/]*")
    .replace(new RegExp(token, "g"), ".*");
  const regex = new RegExp(`^${regexSource}$`);
  return regex.test(normalizedFile);
}

function normalizePathPattern(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeRegExp(value) {
  return String(value).replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

if (goalStatus === "done") {
  if (noCompletionOnWeakProof && (isWeakProof(completionProof) || isWeakProof(oracleSignal) || isWeakProof(oracleFinalProof))) {
    errors.push("done goals require concrete completion proof, goal.oracle.signal, and goal.oracle.final_proof; weak proof cannot close a goal");
  }
  const finalAudit = tasks.some((task) => {
    if (!["judge", "pm"].includes(task.type) || task.status !== "done") return false;
    if (!task.receipt.present || task.receipt.value === null) return false;
    const decision = task.receipt.scalar("decision");
    return decision === "complete" || decision === "done";
  });
  if (!finalAudit) {
    errors.push("completion requires a final done Judge or PM audit receipt with decision: complete");
  }
  if (continuousUntilFullOutcome) {
    const finalFullOutcomeAudit = tasks.some((task) => {
      if (!["judge", "pm"].includes(task.type) || task.status !== "done") return false;
      if (!task.receipt.present || task.receipt.value === null) return false;
      const decision = task.receipt.scalar("decision");
      const fullOutcomeComplete = task.receipt.scalar("full_outcome_complete");
      return (decision === "complete" || decision === "done") && fullOutcomeComplete === true;
    });
    if (!finalFullOutcomeAudit) {
      errors.push("continuous goals require a final done Judge or PM audit receipt with full_outcome_complete: true before goal.status: done");
    }
  }
}

const result = {
  ok: errors.length === 0,
  version,
  state_path: statePath,
  state_digest: createHash("sha256").update(text).digest("hex"),
  goal_status: goalStatus,
  active_task: activeTask,
  agent_statuses: Object.fromEntries(agentStatuses.map(({ agent, status }) => [agent, status])),
  task_count: tasks.length,
  errors,
  warnings,
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
