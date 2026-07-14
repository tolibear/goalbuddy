#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BOARD_TREE_VERSION,
  boardTreeDigest,
  normalizeBoardTreeEntries,
  normalizeBoardTreePath,
} from "./board-tree.mjs";
import {
  createBoardPayload,
  normalizeGoalBoard,
  parseGoalStateText,
} from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (isDirectRun()) {
  try {
    process.exitCode = runResume(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

export function runResume(args, { cwd = process.cwd() } = {}) {
  const options = parseResumeArgs(args);
  const previousCwd = process.cwd();
  if (cwd !== previousCwd) process.chdir(cwd);
  try {
    if (options.goalRoot) return resumeBoard(resolve(options.goalRoot), options);
    return discoverBoards(options);
  } finally {
    if (cwd !== previousCwd) process.chdir(previousCwd);
  }
}

function parseResumeArgs(args) {
  const options = { goalRoot: "", json: false };
  for (const arg of args) {
    if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!options.goalRoot) {
      options.goalRoot = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

function resumeBoard(goalDir, options) {
  const validation = runResumeChecker(goalDir);
  if (!validation.checker.ok) {
    printResumeFailure(goalDir, validation.checker, options, { stateText: validation.stateText });
    return 1;
  }
  if (validation.boardTreeError) {
    printResumeFailure(goalDir, validation.checker, options, {
      stateText: validation.stateText,
      projectionError: validation.boardTreeError,
    });
    return 1;
  }

  try {
    const projection = createResumeProjection(goalDir, validation.checker, validation.boardSnapshots);
    assertBoardTreeSnapshotsCurrent(validation.boardSnapshots);
    if (options.json) printJson(projection);
    else printResumeProjection(projection);
    return 0;
  } catch (error) {
    printResumeFailure(goalDir, validation.checker, options, {
      stateText: validation.stateText,
      projectionError: error.message,
    });
    return 1;
  }
}

function discoverBoards(options) {
  const goalDirs = listGoalDirs(resolve("docs", "goals"));
  const boards = goalDirs.map(describeBoard);
  if (options.json) {
    printJson({ boards });
    return 0;
  }
  if (!boards.length) {
    console.log("No GoalBuddy boards found under docs/goals.");
    console.log("Prepare one with $goal-prep (Codex) or /goal-prep (Claude Code).");
    return 0;
  }
  console.log("GoalBuddy boards:");
  for (const board of boards) {
    console.log("");
    console.log(`${board.title} — ${board.status} (${board.path})`);
    if (board.active_task) {
      console.log(`  Active task: ${board.active_task.id} (${board.active_task.type}) ${board.active_task.objective}`);
      console.log("  Resume in any harness (Codex or Claude Code):");
      console.log(`    ${board.run_command}`);
      console.log(`  Full task prompt: goalbuddy prompt ${board.path}`);
    } else {
      console.log("  No active task.");
    }
  }
  return 0;
}

export function runResumeChecker(goalDir) {
  const statePath = join(goalDir, "state.yaml");
  let stateBefore = null;
  try {
    stateBefore = readFileSync(statePath, "utf8");
  } catch {
    // The canonical checker produces the user-facing missing/unreadable-state error below.
  }

  const checkerScript = join(skillRoot, "scripts", "check-goal-state.mjs");
  const checkerArgs = [checkerScript, goalDir];
  if (stateBefore !== null) checkerArgs.push("--snapshot-stdin");
  const result = spawnSync(process.execPath, checkerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    input: stateBefore ?? undefined,
  });

  let report = null;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    // The synthesized failure below preserves output without trusting malformed checker JSON.
  }

  const errors = [];
  if (result.error) errors.push(result.error.message);
  if (Array.isArray(report?.errors)) errors.push(...report.errors);
  if (!report && result.stderr?.trim()) errors.push(result.stderr.trim());
  if (!report && result.stdout?.trim()) errors.push(`Unparseable checker output: ${result.stdout.trim()}`);
  if (!report && errors.length === 0) errors.push("GoalBuddy checker returned no report.");

  const stateBeforeDigest = stateBefore === null ? null : sha256(stateBefore);
  if (report && stateBeforeDigest !== null && report.state_digest !== stateBeforeDigest) {
    errors.push("GoalBuddy checker did not validate the exact state.yaml snapshot supplied by resume.");
  }

  let stateAfter = null;
  try {
    stateAfter = readFileSync(statePath, "utf8");
  } catch {
    // Missing state is already represented by the checker or synthesized below.
  }
  if (stateBefore !== null && stateAfter !== null && stateBefore !== stateAfter) {
    errors.push("state.yaml changed while GoalBuddy was validating it; rerun resume after the board write completes.");
  }
  if (report?.ok === true && stateAfter === null) {
    errors.push("state.yaml disappeared after GoalBuddy validated it.");
  }
  const stateAfterDigest = stateAfter === null ? null : sha256(stateAfter);
  if (report && stateAfterDigest !== null && report.state_digest !== stateAfterDigest) {
    errors.push("state.yaml no longer matches the snapshot GoalBuddy validated; rerun resume after the board write completes.");
  }

  let boardTree = null;
  let boardTreeError = "";
  if (
    report?.ok === true
    && stateBefore !== null
    && stateAfter !== null
    && stateBefore === stateAfter
    && report.state_digest === stateBeforeDigest
  ) {
    try {
      boardTree = captureBoardTreeSnapshots(goalDir, report, stateAfter, { checkerScript });
    } catch (error) {
      boardTreeError = error.message;
    }
  }

  return {
    checker: {
      ok: result.status === 0 && report?.ok === true && errors.length === 0,
      exit_code: result.status ?? 1,
      version: report?.version ?? null,
      state_path: report?.state_path || statePath,
      state_digest: report?.state_digest || null,
      board_tree_version: boardTree?.version ?? null,
      board_tree_digest: boardTree?.digest ?? null,
      board_tree: boardTree?.entries ?? [],
      goal_status: report?.goal_status || "",
      active_task: report?.active_task ?? null,
      task_count: report?.task_count ?? null,
      warnings: Array.isArray(report?.warnings) ? report.warnings : [],
      errors,
    },
    stateText: stateBefore !== null
      && stateBefore === stateAfter
      && report?.state_digest === stateBeforeDigest
      ? stateAfter
      : null,
    boardSnapshots: errors.length === 0 && !boardTreeError ? (boardTree?.snapshots ?? []) : [],
    boardTreeError,
  };
}

export function captureBoardTreeSnapshots(goalDir, rootReport, rootStateText, { checkerScript = join(skillRoot, "scripts", "check-goal-state.mjs") } = {}) {
  const root = resolve(goalDir);
  const rootDigest = sha256(rootStateText);
  if (rootReport?.ok !== true || rootReport?.version !== 2 || rootReport?.state_digest !== rootDigest) {
    throw new Error("GoalBuddy board tree requires the exact checker-valid root state snapshot.");
  }

  let rootDocument;
  try {
    rootDocument = parseGoalStateText(rootStateText, { allowFallback: false });
  } catch (error) {
    throw new Error(`GoalBuddy board tree could not strictly parse root state.yaml: ${error.message}`);
  }
  if (!Array.isArray(rootDocument.tasks)) {
    throw new Error("GoalBuddy board tree root state.yaml has no tasks array.");
  }

  const snapshots = [{
    path: "state.yaml",
    state_path: join(root, "state.yaml"),
    state_digest: rootDigest,
    goal_status: rootReport.goal_status,
    active_task: rootReport.active_task,
    task_count: rootReport.task_count,
    text: rootStateText,
  }];
  const childPaths = rootDocument.tasks
    .map((task) => task?.subgoal?.path)
    .filter((path) => path !== undefined && path !== null && path !== "")
    .map(normalizeBoardTreePath);

  for (const childPath of childPaths) {
    if (childPath === "state.yaml") {
      throw new Error("GoalBuddy child board path may not reuse the root state.yaml.");
    }
    const statePath = resolve(root, childPath);
    if (!statePath.startsWith(`${root}${sep}`)) {
      throw new Error(`GoalBuddy board tree path escapes the goal root: ${childPath}`);
    }
    let stateBefore;
    try {
      stateBefore = readFileSync(statePath, "utf8");
    } catch (error) {
      throw new Error(`GoalBuddy child board state is unreadable: ${childPath}: ${error.message}`);
    }
    const stateDigest = sha256(stateBefore);
    const result = spawnSync(process.execPath, [checkerScript, statePath, "--child", "--snapshot-stdin"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      input: stateBefore,
    });
    let report = null;
    try {
      report = JSON.parse(result.stdout || "");
    } catch {
      // The fail-closed error below preserves the relevant process output.
    }
    if (result.error) {
      throw new Error(`GoalBuddy child board checker failed for ${childPath}: ${result.error.message}`);
    }
    if (result.status !== 0 || report?.ok !== true) {
      const detail = Array.isArray(report?.errors) && report.errors.length > 0
        ? report.errors.join("; ")
        : result.stderr?.trim() || result.stdout?.trim() || "checker returned no valid report";
      throw new Error(`GoalBuddy child board is not checker-valid: ${childPath}: ${detail}`);
    }
    if (report.version !== 2 || report.state_digest !== stateDigest) {
      throw new Error(`GoalBuddy child checker did not validate the exact version 2 snapshot: ${childPath}`);
    }
    let stateAfter;
    try {
      stateAfter = readFileSync(statePath, "utf8");
    } catch (error) {
      throw new Error(`GoalBuddy child board disappeared after validation: ${childPath}: ${error.message}`);
    }
    if (stateAfter !== stateBefore) {
      throw new Error(`GoalBuddy child board changed while being validated: ${childPath}.`);
    }
    try {
      parseGoalStateText(stateBefore, { allowFallback: false });
    } catch (error) {
      throw new Error(`GoalBuddy child board could not be strictly projected: ${childPath}: ${error.message}`);
    }
    snapshots.push({
      path: childPath,
      state_path: statePath,
      state_digest: stateDigest,
      goal_status: report.goal_status,
      active_task: report.active_task,
      task_count: report.task_count,
      text: stateBefore,
    });
  }

  const entries = normalizeBoardTreeEntries(snapshots.map(({ text: _text, state_path: _statePath, ...entry }) => entry));
  const snapshotsByPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  return {
    version: BOARD_TREE_VERSION,
    digest: boardTreeDigest(entries),
    entries,
    snapshots: entries.map((entry) => ({ ...entry, ...snapshotsByPath.get(entry.path) })),
  };
}

export function assertBoardTreeSnapshotsCurrent(snapshots) {
  for (const snapshot of snapshots) {
    let current;
    try {
      current = readFileSync(snapshot.state_path, "utf8");
    } catch (error) {
      throw new Error(`GoalBuddy board tree state is unavailable before projection output: ${snapshot.path}: ${error.message}`);
    }
    if (sha256(current) !== snapshot.state_digest) {
      throw new Error(`GoalBuddy board tree changed while rendering recovery state: ${snapshot.path}.`);
    }
  }
}

function printResumeFailure(goalDir, checker, options, { stateText = null, projectionError = "" } = {}) {
  const stateDigest = checker.state_digest || (stateText === null ? null : sha256(stateText));
  const digestStatus = stateDigest === null
    ? "unavailable"
    : checker.ok
      ? "checker_validated"
      : "observed_unvalidated";
  const errors = projectionError ? [projectionError] : checker.errors;
  const failure = {
    ok: false,
    schema_version: 1,
    board: {
      path: displayGoalPath(goalDir),
      state_path: checker.state_path || join(goalDir, "state.yaml"),
      goal_path: join(goalDir, "goal.md"),
      state_digest: stateDigest,
      state_digest_status: digestStatus,
    },
    checker,
    errors,
    recovery: {
      mode: "full_board_review",
      audit_required: true,
      main_agent_action: "inspect_full_board",
      continuation_allowed: false,
      reason: projectionError
        ? "The board passed the checker, but a strict compact projection could not be rendered. Full-board review is required."
        : "The authoritative board did not pass validation. Full-board review is required before any continuation decision.",
      instructions: [
        "Do not continue, dispatch, or apply a receipt from this response.",
        "Read the complete goal.md and state.yaml and reconcile the active task, latest transition, verification, owner gates, worktrees, and possible Worker liveness.",
        "Give the Ledger Auditor this board path and state digest when available; a checker or projection failure must remain a PM escalation.",
        "Repair and rerun resume when an error affects live state or the continuation point.",
        "If every error is confined to immutable completed-task history on a current version: 2 board, preserve that history. The PM may continue only after direct full-board review proves the live continuation exact; never fabricate or rewrite historical receipts merely to make the checker green.",
      ],
    },
  };

  if (options.json) {
    printJson(failure);
    return;
  }
  console.error(`GoalBuddy resume requires full-board review: ${failure.board.state_path}`);
  if (stateDigest) console.error(`State digest (${digestStatus}): ${stateDigest}`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error("Do not continue from compact state. Inspect the complete board and independent evidence.");
}

function createResumeProjection(goalDir, checker, boardSnapshots) {
  const root = resolve(goalDir);
  const statePath = join(root, "state.yaml");
  const goalPath = join(root, "goal.md");
  const rootSnapshot = boardSnapshots.find((snapshot) => snapshot.path === "state.yaml");
  if (!rootSnapshot) throw new Error("Validated root state snapshot is unavailable.");
  const stateText = rootSnapshot.text;
  const document = parseGoalStateText(stateText, { allowFallback: false });
  const board = normalizeGoalBoard(document, root);
  const rawTasks = Array.isArray(document.tasks) ? document.tasks : [];
  const normalizedTasks = new Map(board.tasks.map((task) => [task.id, task]));
  const activeRaw = rawTasks.find((task) => resumeText(task?.id) === resumeText(document.active_task))
    || rawTasks.find((task) => resumeText(task?.status) === "active")
    || null;
  const activeTask = activeRaw
    ? projectResumeTask(activeRaw, normalizedTasks.get(resumeText(activeRaw.id)))
    : null;
  const recentReceiptTask = findRecentReceiptTask(rawTasks, activeRaw);
  const approvalGates = rawTasks
    .filter((task) => resumeText(task?.status) === "blocked" && isApprovalGate(task?.receipt))
    .map(projectApprovalGate);
  const blockedTasks = rawTasks
    .filter((task) => resumeText(task?.status) === "blocked")
    .map(projectBlockedTask);
  const queuedTasks = rawTasks
    .filter((task) => resumeText(task?.status) === "queued")
    .map((task) => ({
      id: resumeText(task.id),
      type: resumeText(task.type || "pm"),
      objective: boundedResumeText(task.objective, 60).text,
    }));
  const goal = document.goal && typeof document.goal === "object" ? document.goal : {};
  const oracle = goal.oracle && typeof goal.oracle === "object" ? goal.oracle : {};
  const intake = goal.intake && typeof goal.intake === "object" ? goal.intake : {};
  const checks = document.checks && typeof document.checks === "object" ? document.checks : {};
  const lastVerification = checks.last_verification && typeof checks.last_verification === "object"
    ? checks.last_verification
    : {};
  const path = displayGoalPath(root);
  const activeLanes = boardSnapshots
    .map((snapshot) => projectActiveLane(snapshot))
    .filter(Boolean);

  return {
    ok: true,
    schema_version: 1,
    checker,
    board: {
      path,
      state_path: statePath,
      state_digest: sha256(stateText),
      state_digest_status: "checker_validated",
      tree: {
        version: checker.board_tree_version,
        digest: checker.board_tree_digest,
        digest_status: "checker_validated",
        boards: boardSnapshots.map(({ text: _text, ...snapshot }) => snapshot),
      },
      goal_path: goalPath,
      title: resumeText(goal.title || board.title),
      slug: resumeText(goal.slug || board.slug),
      kind: resumeText(goal.kind || board.kind),
      status: resumeText(goal.status || board.status),
      tranche: resumeText(goal.tranche || board.tranche),
      oracle: {
        signal: resumeText(oracle.signal),
        cadence: resumeText(oracle.cadence),
        final_proof: resumeText(oracle.final_proof),
      },
      intake: {
        original_request: resumeText(intake.original_request),
        interpreted_outcome: resumeText(intake.interpreted_outcome),
        authority: resumeText(intake.authority),
        proof_type: resumeText(intake.proof_type),
        completion_proof: resumeText(intake.completion_proof),
        likely_misfire: resumeText(intake.likely_misfire),
      },
      counts: {
        total: board.tasks.length,
        todo: board.tasks.filter((task) => task.status === "queued").length,
        inProgress: board.tasks.filter((task) => task.status === "active").length,
        blocked: board.tasks.filter((task) => task.status === "blocked").length,
        completed: board.tasks.filter((task) => task.status === "done").length,
      },
      active_task: activeTask,
      active_lanes: activeLanes,
      recent_receipt: recentReceiptTask ? projectRecentReceipt(recentReceiptTask) : null,
      last_verification: {
        result: resumeText(lastVerification.result || "unknown"),
        task: resumeText(lastVerification.task) || null,
        commands: projectCommands(lastVerification.commands),
      },
      dirty_fingerprint: resumeText(checks.dirty_fingerprint || "unknown"),
      approval_gates: approvalGates,
      blocked_tasks: blockedTasks,
      queued_tasks: queuedTasks,
    },
    recovery: {
      audit_required: true,
      audit_agent: { codex: "goal_ledger", claude_code: "goal-ledger" },
      continue_only_on: "congruent",
      on_discrepant: "main_agent_review",
      on_uncertain: "main_agent_review",
      on_timeout_or_unavailable: "main_agent_review",
      worker_liveness: "unknown",
      active_lane_count: activeLanes.length,
      continuation_allowed_after_audit: Boolean(activeTask && resumeText(goal.status) === "active"),
      instructions: [
        "Run the read-only Goal Ledger Auditor at this genuine recovery boundary.",
        "The Auditor must rerun resume, match board.tree.digest, and reconcile every board.active_lanes entry against independent repository, worktree, receipt, verification, gate, and visible Worker evidence.",
        "An active lane does not prove its Worker is alive; never auto-redispatch any root or child lane during recovery.",
        "Do not load the full board into the main PM unless the Auditor reports discrepant or uncertain, times out, is unavailable, or names evidence requiring direct review.",
      ],
    },
    commands: {
      resume: `node ${shellArgument(join(skillRoot, "scripts", "resume-board.mjs"))} ${shellArgument(path)} --json`,
      run: `/goal Follow ${path}/goal.md.`,
      prompt: activeTask ? `goalbuddy prompt ${path}` : null,
      parallel_plan: activeLanes.length > 1 ? `goalbuddy parallel-plan ${path}` : null,
    },
  };
}

function projectActiveLane(snapshot) {
  const document = parseGoalStateText(snapshot.text, { allowFallback: false });
  const board = normalizeGoalBoard(document, dirname(snapshot.state_path));
  const rawTasks = Array.isArray(document.tasks) ? document.tasks : [];
  const activeRaw = rawTasks.find((task) => resumeText(task?.id) === resumeText(document.active_task))
    || rawTasks.find((task) => resumeText(task?.status) === "active")
    || null;
  if (!activeRaw) return null;
  const normalized = board.tasks.find((task) => task.id === resumeText(activeRaw.id));
  const activeTask = projectResumeTask(activeRaw, normalized);
  return {
    kind: snapshot.path === "state.yaml" ? "root" : "child",
    path: snapshot.path,
    board_path: displayGoalPath(dirname(snapshot.state_path)),
    state_path: snapshot.state_path,
    state_digest: snapshot.state_digest,
    goal_status: resumeText(document.goal?.status),
    active_task: activeTask,
    prompt: `goalbuddy prompt --board ${shellArgument(snapshot.state_path)} --task ${activeTask.id}`,
  };
}

function projectResumeTask(raw, normalized) {
  return {
    id: resumeText(raw.id),
    type: resumeText(raw.type || normalized?.type || "pm"),
    assignee: resumeText(raw.assignee || normalized?.assignee),
    status: resumeText(raw.status || normalized?.status),
    reasoning_hint: resumeText(raw.reasoning_hint || "default"),
    objective: resumeText(raw.objective || normalized?.objective),
    inputs: resumeList(raw.inputs || normalized?.inputs),
    constraints: resumeList(raw.constraints || normalized?.constraints),
    expected_output: resumeList(raw.expected_output || normalized?.expectedOutput),
    allowed_files: resumeList(raw.allowed_files || normalized?.allowedFiles),
    verify: resumeList(raw.verify || normalized?.verify),
    stop_if: resumeList(raw.stop_if || normalized?.stopIf),
    transition_evidence: projectTransitionEvidence(raw.transition_evidence),
  };
}

function projectTransitionEvidence(evidence) {
  const replies = evidence && typeof evidence === "object" && !Array.isArray(evidence) && Array.isArray(evidence.exact_human_replies)
    ? evidence.exact_human_replies
    : [];
  if (replies.length === 0) return null;
  const latest = replies[replies.length - 1] || {};
  return {
    exact_human_reply_count: replies.length,
    latest_exact_human_reply: {
      wait_board_digest: resumeText(latest.wait_board_digest),
      required_reply_sha256: resumeText(latest.required_reply_sha256),
      reply_sha256: resumeText(latest.reply_sha256),
      exact_match: latest.exact_match === true,
    },
  };
}

function findRecentReceiptTask(tasks, activeTask) {
  const activeIndex = activeTask ? tasks.indexOf(activeTask) : tasks.length;
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (tasks[index]?.receipt) return tasks[index];
  }
  return null;
}

function projectRecentReceipt(task) {
  const receipt = task.receipt && typeof task.receipt === "object" ? task.receipt : {};
  const summary = boundedResumeText(receipt.summary || receipt.rationale || receipt.decision || receipt.result, 120);
  return {
    task_id: resumeText(task.id),
    task_status: resumeText(task.status),
    result: resumeText(receipt.result),
    decision: resumeText(receipt.decision),
    summary: summary.text,
    summary_truncated: summary.truncated,
    note: resumeText(receipt.note),
  };
}

function isApprovalGate(receipt) {
  return Boolean(receipt && typeof receipt === "object"
    && (receipt.waiting_for_user_approval === true || resumeText(receipt.required_reply)));
}

function projectApprovalGate(task) {
  const receipt = task.receipt;
  return {
    task_id: resumeText(task.id),
    objective: boundedResumeText(task.objective, 60).text,
    required_reply: resumeText(receipt.required_reply),
    waiting_for_user_approval: receipt.waiting_for_user_approval === true,
    note: resumeText(receipt.note),
  };
}

function projectBlockedTask(task) {
  const receipt = task.receipt && typeof task.receipt === "object" ? task.receipt : {};
  const reason = boundedResumeText(
    receipt.blocked_reason
      || receipt.stopped_because
      || receipt.summary
      || receipt.rationale
      || receipt.required_reply
      || "Blocked; inspect the receipt or note.",
    60,
  );
  return {
    id: resumeText(task.id),
    type: resumeText(task.type || "pm"),
    objective: boundedResumeText(task.objective, 60).text,
    reason: reason.text,
    reason_truncated: reason.truncated,
    note: resumeText(receipt.note),
    waiting_for_user_approval: receipt.waiting_for_user_approval === true,
    required_reply: resumeText(receipt.required_reply),
  };
}

function projectCommands(commands) {
  if (!commands) return [];
  const values = Array.isArray(commands) ? commands : [commands];
  return values.map((command) => {
    if (typeof command === "string") return { cmd: resumeText(command), status: "" };
    return { cmd: resumeText(command?.cmd), status: resumeText(command?.status) };
  }).filter((command) => command.cmd || command.status);
}

function resumeList(value) {
  if (value === null || value === undefined || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(resumeText).filter(Boolean);
}

function resumeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function boundedResumeText(value, maxWords) {
  const text = resumeText(value);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return { text, truncated: false };
  return { text: `${words.slice(0, maxWords).join(" ")}…`, truncated: true };
}

function printResumeProjection(projection) {
  const { board, checker, recovery, commands } = projection;
  console.log("GoalBuddy continuation projection:");
  console.log("");
  console.log(`${board.title} — ${board.status} (${board.path})`);
  console.log(`  Checker: pass (${checker.task_count} tasks)`);
  console.log(`  State digest: ${board.state_digest}`);
  console.log(`  Board tree digest: ${board.tree.digest} (${board.tree.boards.length} board(s))`);
  if (board.active_task) {
    console.log(`  Active task: ${board.active_task.id} (${board.active_task.type}) ${board.active_task.objective}`);
    console.log(`  Verify: ${board.active_task.verify.length} command(s); stop_if: ${board.active_task.stop_if.length}; allowed_files: ${board.active_task.allowed_files.length}`);
  } else {
    console.log("  Active task: none");
  }
  if (board.active_lanes.length > 1) {
    console.log("  Active child lanes:");
    for (const lane of board.active_lanes.filter((candidate) => candidate.kind === "child")) {
      console.log(`    ${lane.path}: ${lane.active_task.id} (${lane.active_task.type}) ${lane.active_task.objective}`);
    }
  }
  if (board.approval_gates.length) {
    console.log("  Approval gates:");
    for (const gate of board.approval_gates) console.log(`    ${gate.task_id}: ${gate.required_reply}`);
  }
  console.log("");
  console.log("Recovery audit required before continuation:");
  console.log(`  Codex agent: ${recovery.audit_agent.codex}`);
  console.log(`  Claude Code agent: ${recovery.audit_agent.claude_code}`);
  console.log("  Continue only on: congruent");
  console.log("  discrepant | uncertain | timeout | unavailable -> main agent review");
  console.log("");
  console.log(`Resume projection: ${commands.resume}`);
  if (commands.prompt) console.log(`Active task prompt: ${commands.prompt}`);
  if (commands.parallel_plan) console.log(`Parallel plan: ${commands.parallel_plan}`);
  console.log(`Run command: ${commands.run}`);
}

function listGoalDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .filter((dir) => existsSync(join(dir, "state.yaml")))
    .sort();
}

function describeBoard(goalDir) {
  const path = displayGoalPath(goalDir);
  try {
    const payload = createBoardPayload(goalDir);
    const activeTask = payload.tasks.find((task) => task.id === payload.goal.activeTask && task.active)
      || payload.tasks.find((task) => task.active)
      || null;
    return {
      path,
      slug: payload.goal.slug,
      title: payload.goal.title,
      status: payload.goal.status,
      active_task: activeTask ? { id: activeTask.id, type: activeTask.type, objective: activeTask.objective } : null,
      run_command: `/goal Follow ${path}/goal.md.`,
    };
  } catch (error) {
    return { path, slug: "", title: path, status: "unreadable", active_task: null, run_command: "", error: error.message };
  }
}

function displayGoalPath(goalDir) {
  return relative(process.cwd(), goalDir).split(sep).join("/") || ".";
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function shellArgument(value) {
  return JSON.stringify(String(value));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function isDirectRun() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
