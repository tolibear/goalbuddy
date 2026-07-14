#!/usr/bin/env node
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBoardTreeSnapshotsCurrent, runResumeChecker } from "./resume-board.mjs";
import { loadBoardSnapshot, parseArgs, resolveBoardPath, selectTask } from "./render-task-prompt.mjs";

if (isDirectRun()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const plan = createParallelPlan(options);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(formatPlan(plan));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export function createParallelPlan(options) {
  const rootBoardPath = resolveBoardPath(options);
  const validation = runResumeChecker(dirname(rootBoardPath));
  if (!validation.checker.ok || validation.boardTreeError) {
    const detail = validation.boardTreeError || validation.checker.errors.join("; ") || "checker rejected the board tree";
    throw new Error(`GoalBuddy parallel plan requires a checker-valid board tree: ${detail}`);
  }
  const boards = validation.boardSnapshots
    .map((snapshot) => loadBoardSnapshot(snapshot.state_path, snapshot.text))
    .filter((board) => board.activeTask);

  const candidates = boards.map((board) => candidateForBoard(board));
  const workerCandidates = candidates.filter((candidate) => candidate.role === "worker");
  const plan = {
    root_board_path: rootBoardPath,
    board_tree_version: validation.checker.board_tree_version,
    board_tree_digest: validation.checker.board_tree_digest,
    boards: validation.boardSnapshots.map(({ text: _text, ...snapshot }) => snapshot),
    mutated: false,
    spawned_agents: false,
    candidates: candidates.map((candidate) => ({
      ...candidate,
      safe_to_parallelize: isSafeCandidate(candidate, workerCandidates),
      reason: safetyReason(candidate, workerCandidates),
      render_prompt_command: promptCommand(candidate),
    })),
  };
  assertBoardTreeSnapshotsCurrent(validation.boardSnapshots);
  return plan;
}

function candidateForBoard(board) {
  const task = selectTask(board);
  const role = normalizeRole(task.type);
  return {
    board_path: board.path,
    task_id: task.id,
    role,
    recommended_agent: role === "scout" ? "goal_scout" : role === "judge" ? "goal_judge" : role === "worker" ? "goal_worker" : "PM",
    reasoning_hint: reasoningHint(task, role),
    allowed_files: Array.isArray(task.allowed_files) ? task.allowed_files.map(String) : [],
  };
}

function isSafeCandidate(candidate, workers) {
  if (candidate.role === "scout" || candidate.role === "judge") return true;
  if (candidate.role !== "worker") return false;
  if (workers.length < 2) return false;
  if (candidate.allowed_files.length === 0) return false;
  return workers
    .filter((worker) => worker !== candidate)
    .every((worker) => worker.allowed_files.length > 0 && areDisjoint(candidate.allowed_files, worker.allowed_files));
}

function safetyReason(candidate, workers) {
  if (candidate.role === "scout") return "Scout is read-only.";
  if (candidate.role === "judge") return "Judge is read-only.";
  if (candidate.role !== "worker") return "PM tasks mutate board truth and should stay serial.";
  if (candidate.allowed_files.length === 0) return "Worker has no allowed_files, so write scope is unknown.";
  const overlapping = workers
    .filter((worker) => worker !== candidate)
    .filter((worker) => worker.allowed_files.length === 0 || !areDisjoint(candidate.allowed_files, worker.allowed_files));
  if (overlapping.length === 0) return workers.length > 1 ? "Worker write scope is disjoint from other active Workers." : "Only one active Worker candidate; parallel Worker safety needs a disjoint peer.";
  return `Worker write scope overlaps or cannot be compared with ${overlapping.map((worker) => `${relative(process.cwd(), worker.board_path)}:${worker.task_id}`).join(", ")}.`;
}

function promptCommand(candidate) {
  return `goalbuddy prompt --board ${quote(candidate.board_path)} --task ${candidate.task_id}`;
}

function areDisjoint(left, right) {
  return left.every((leftPattern) => right.every((rightPattern) => !patternsOverlap(leftPattern, rightPattern)));
}

function patternsOverlap(left, right) {
  const a = normalizePattern(left);
  const b = normalizePattern(right);
  const aHasGlob = hasGlob(a);
  const bHasGlob = hasGlob(b);
  if (a === b) return true;
  if (a.endsWith("/**") && b.startsWith(a.slice(0, -3))) return true;
  if (b.endsWith("/**") && a.startsWith(b.slice(0, -3))) return true;
  if (!aHasGlob && !bHasGlob) return false;
  if (!aHasGlob) return globToRegExp(b).test(a);
  if (!bHasGlob) return globToRegExp(a).test(b);
  return literalPrefixesMayOverlap(a, b);
}

function literalPrefixesMayOverlap(left, right) {
  const a = literalPrefix(left);
  const b = literalPrefix(right);
  if (!a || !b) return true;
  return a.startsWith(b) || b.startsWith(a);
}

function literalPrefix(pattern) {
  const match = /[*?[\]]/.exec(pattern);
  return match ? pattern.slice(0, match.index) : pattern;
}

function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function hasGlob(pattern) {
  return /[*?[\]]/.test(pattern);
}

function normalizePattern(pattern) {
  return String(pattern || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeRole(value) {
  const role = String(value || "pm").toLowerCase();
  return ["scout", "judge", "worker", "pm"].includes(role) ? role : "pm";
}

function reasoningHint(task, role) {
  const hint = String(task.reasoning_hint || "").toLowerCase();
  if (["low", "medium", "high", "xhigh"].includes(hint)) return hint;
  if (role === "judge") return "xhigh";
  if (role === "worker") return "high";
  return "medium";
}

function quote(value) {
  return JSON.stringify(resolve(value));
}

function formatPlan(plan) {
  const lines = [
    "GoalBuddy parallel plan",
    "",
    `Root board: ${plan.root_board_path}`,
    `Board tree digest: ${plan.board_tree_digest} (${plan.boards.length} board(s))`,
    "Mutates state: no",
    "Spawns agents: no",
    "",
  ];
  for (const candidate of plan.candidates) {
    lines.push(
      `${candidate.board_path}:${candidate.task_id}`,
      `- role: ${candidate.role}`,
      `- recommended_agent: ${candidate.recommended_agent}`,
      `- reasoning_hint: ${candidate.reasoning_hint}`,
      `- safe_to_parallelize: ${candidate.safe_to_parallelize}`,
      `- reason: ${candidate.reason}`,
      `- render_prompt_command: ${candidate.render_prompt_command}`,
      "",
    );
  }
  return lines.join("\n").trimEnd();
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
