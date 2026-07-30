#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";
import { collectReceiptFrontierEvidence } from "./frontier-evidence.mjs";
import { createSemanticFrontier } from "./frontier-projection.mjs";
import {
  assertBoardTreeSnapshotsCurrent,
  createCheckedResumeProjection,
} from "./resume-board.mjs";

if (isDirectRun()) {
  try {
    process.exitCode = runFrontier(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      kind: "goalbuddy_frontier_error_v1",
      error: error.message,
    }, null, 2));
    process.exitCode = 1;
  }
}

export function runFrontier(args, { cwd = process.cwd() } = {}) {
  const options = parseFrontierArgs(args);
  const previousCwd = process.cwd();
  if (cwd !== previousCwd) process.chdir(cwd);
  try {
    const goalRoot = resolve(options.goalRoot);
    const checked = createCheckedResumeProjection(goalRoot, {
      frontier: true,
      planning: true,
    });
    if (!checked.ok) {
      const errors = checked.projectionError
        ? [checked.projectionError]
        : checked.checker.errors;
      console.error(JSON.stringify({
        ok: false,
        kind: "goalbuddy_frontier_error_v1",
        error: errors[0] || "The GoalBuddy board did not pass checked projection.",
        errors,
      }, null, 2));
      return 1;
    }

    const repositoryEvidence = collectCheckedRepositoryEvidence({
      resumeProjection: checked.projection,
      boardSnapshots: checked.boardSnapshots,
      goalRoot,
    });
    const frontier = createSemanticFrontier({
      resumeProjection: checked.projection,
      repositoryEvidence,
    });
    assertBoardTreeSnapshotsCurrent(checked.boardSnapshots);
    console.log(JSON.stringify(frontier, null, 2));
    return 0;
  } finally {
    if (cwd !== previousCwd) process.chdir(previousCwd);
  }
}

function parseFrontierArgs(args) {
  const options = { goalRoot: "", json: false };
  for (const arg of args) {
    if (arg === "--json") {
      if (options.json) throw new Error("Duplicate argument: --json");
      options.json = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else if (!options.goalRoot) {
      options.goalRoot = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.goalRoot) throw new Error("goalbuddy frontier requires one explicit goal root.");
  if (!options.json) throw new Error("goalbuddy frontier is shadow-only and requires --json.");
  return options;
}

export function collectCheckedRepositoryEvidence({
  resumeProjection,
  boardSnapshots,
  goalRoot = "",
}) {
  const changedPaths = [];
  const verification = [];
  const receipts = [];
  const provenance = [];
  const deviations = [];
  const ownerGates = [];
  const unresolvedDecisions = [];
  const queuedPlaceholders = [];
  const reviews = [];
  const scopeAnomalies = [];
  const browser = [];
  const structuredDecisions = [];
  const rootBoardPath = resumeProjection.board.path;
  const drillDown = [{
    purpose: "goal_charter",
    label: "Goal charter and oracle",
    source: {
      kind: "plan_or_note",
      path: `${rootBoardPath}/goal.md`,
    },
  }];
  let deviationAcceptance = null;
  let finalReview = null;

  for (const snapshot of boardSnapshots) {
    const document = parseGoalStateText(snapshot.text, { allowFallback: false });
    const boardPath = joinFrontierPath(rootBoardPath, snapshot.path);
    for (const task of Array.isArray(document.tasks) ? document.tasks : []) {
      const taskId = text(task?.id);
      const source = {
        kind: "board_task",
        board_path: boardPath,
        task_id: taskId,
      };
      if (snapshot.path !== "state.yaml" && text(task?.status) === "queued") {
        const needsHydration = text(task?.type || "pm") === "worker"
          && [task.allowed_files, task.verify, task.stop_if].some((field) => strings(field).length === 0);
        const dependencies = strings(task?.depends_on);
        const childTasks = Array.isArray(document.tasks) ? document.tasks : [];
        const statusById = new Map(childTasks.map((candidate) => [
          text(candidate?.id),
          text(candidate?.status),
        ]));
        queuedPlaceholders.push({
          id: taskId,
          objective: text(task?.objective),
          hydration: needsHydration ? "required" : "complete",
          dependency_ready: dependencies.every((id) => statusById.get(id) === "done"),
          source,
        });
      }
      const brief = projectBrief(task?.brief);
      if (brief && text(task?.status) === "active") {
        drillDown.push({
          purpose: "bound_slice_brief",
          label: `${taskId} bound brief`,
          source: {
            kind: "plan_or_note",
            path: brief.path,
            sha256: brief.sha256,
          },
        });
      }

      if (!task?.receipt || typeof task.receipt !== "object" || Array.isArray(task.receipt)) continue;
      const receipt = task.receipt;
      const receiptProvenance = task?.transition_evidence?.receipt_provenance;
      const receiptSource = {
        kind: "stored_receipt",
        board_path: boardPath,
        task_id: taskId,
      };
      const provenanceSource = {
        kind: "transition_provenance",
        board_path: boardPath,
        task_id: taskId,
      };
      const structuredEvidence = collectReceiptFrontierEvidence({
        goalRoot: goalRoot || resumeProjection.board.state_path,
        taskType: text(task?.type || "pm"),
        taskId,
        boardPath,
        evidence: receipt.evidence,
      });
      reviews.push(...structuredEvidence.reviews);
      scopeAnomalies.push(...structuredEvidence.scope_anomalies);
      browser.push(...structuredEvidence.browser);
      structuredDecisions.push(...structuredEvidence.decisions);
      drillDown.push(...structuredEvidence.drill_down);

      if (text(task?.type) === "worker") {
        for (const path of strings(receipt.changed_files)) {
          changedPaths.push({
            path,
            change: "changed",
            source: receiptSource,
          });
        }
        for (const command of projectVerification(receipt.commands)) {
          verification.push({
            check: command.command,
            status: command.status,
            summary: null,
            source: receiptSource,
          });
        }
      }
      receipts.push({
        task_id: taskId,
        outcome: text(receipt.result),
        authority: text(receiptProvenance?.closeout_authority) || "unknown",
        disposition: text(receiptProvenance?.dispatch_disposition) || "unknown",
        result: text(receipt.result),
        summary: null,
        terminal_completion: receipt.full_outcome_complete === true,
        task_type: text(task?.type || "pm"),
        source: receiptSource,
      });

      if (receiptProvenance && typeof receiptProvenance === "object") {
        provenance.push({
          task_id: taskId,
          application_state: text(receiptProvenance.application_state),
          receipt_transport: text(receiptProvenance.receipt_transport),
          report_transport: text(receiptProvenance.report_transport),
          dispatch_disposition: text(receiptProvenance.dispatch_disposition),
          closeout_authority: text(receiptProvenance.closeout_authority),
          evidence_status: provenanceEvidenceStatus(receiptProvenance),
          source: provenanceSource,
        });
      }

      for (const [index, workerDeviation] of strings(receipt.deviations).entries()) {
        deviations.push({
          id: `${taskId}-worker-${index + 1}`,
          description: workerDeviation,
          status: "worker_reported",
          source: receiptSource,
        });
      }
      for (const accepted of Array.isArray(receipt.accepted_deviations) ? receipt.accepted_deviations : []) {
        deviations.push({
          id: text(accepted?.requirement_id),
          description: text(accepted?.observed_shortfall || accepted?.requirement || accepted?.reason),
          status: "accepted",
          source: receiptSource,
        });
      }
      if (
        snapshot.path === "state.yaml"
        && receipt.deviation_acceptance
        && typeof receipt.deviation_acceptance === "object"
      ) {
        deviationAcceptance = {
          status: "accepted",
          exact_set: true,
          accepted_ids: Array.isArray(receipt.accepted_deviations)
            ? receipt.accepted_deviations.map((entry) => text(entry?.requirement_id)).filter(Boolean)
            : [],
          source: receiptSource,
        };
      }
      if (
        snapshot.path === "state.yaml"
        && receipt.final_review
        && typeof receipt.final_review === "object"
      ) {
        finalReview = projectFinalReview(receipt.final_review, receiptSource);
      }
      if (receipt.final_review && typeof receipt.final_review === "object") {
        for (const entry of finalReviewDrillDown(receipt.final_review)) drillDown.push(entry);
      }

      const note = text(receipt.note);
      if (
        isDurableNotePointer(note)
        && (
          text(task?.status) === "active"
          || text(task?.status) === "blocked"
          || receipt.full_outcome_complete === true
          || Boolean(receipt.final_review)
        )
      ) {
        drillDown.push({
          purpose: "task_note",
          label: `${taskId} note`,
          source: {
            kind: "plan_or_note",
            path: joinBoardRelativePath(boardPath, note),
          },
        });
      }
      const waitingForOwner = receipt.waiting_for_user_approval === true
        || Boolean(text(receipt.required_reply));
      if (waitingForOwner) {
        if (snapshot.path !== "state.yaml") {
          ownerGates.push({
            task_id: taskId,
            status: "awaiting_owner",
            required_reply: text(receipt.required_reply),
            summary: text(receipt.blocked_reason || receipt.summary),
            source,
          });
        }
      } else if (text(task?.status) === "blocked") {
        unresolvedDecisions.push({
          task_id: taskId,
          status: "blocked",
          summary: text(receipt.blocked_reason || receipt.summary),
          source,
        });
      }
    }
  }

  return {
    goal_path: `${rootBoardPath}/goal.md`,
    goal_objective: text(resumeProjection.board.intake?.interpreted_outcome),
    ...(changedPaths.length > 0
      ? { changed_paths: uniqueByLast(changedPaths, (item) => item.path) }
      : {}),
    ...(verification.length > 0
      ? { verification: uniqueByLast(verification, (item) => `${item.check}\u0000${item.status}`) }
      : {}),
    ...(receipts.length > 0 ? { receipts: consequentialReceipts(receipts) } : {}),
    ...(provenance.length > 0 ? { provenance: consequentialProvenance(provenance) } : {}),
    ...(reviews.length > 0 ? { reviews } : {}),
    ...(scopeAnomalies.length > 0 ? { scope_anomalies: scopeAnomalies } : {}),
    final_review: finalReview,
    ...(browser.length > 0 ? { browser } : {}),
    deviations,
    deviation_acceptance: deviationAcceptance,
    owner_gates: ownerGates,
    unresolved_decisions: [...unresolvedDecisions, ...structuredDecisions],
    queued_placeholders: queuedPlaceholders,
    drill_down: drillDown,
  };
}

function consequentialReceipts(receipts) {
  return uniqueByLast(receipts, (receipt) => [
    receipt.source.board_path,
    receipt.task_type,
    receipt.outcome,
    receipt.authority,
    receipt.disposition,
    receipt.terminal_completion,
  ].join("\u0000"));
}

function consequentialProvenance(provenance) {
  return uniqueByLast(provenance, (entry) => [
    entry.source.board_path,
    entry.application_state,
    entry.receipt_transport,
    entry.report_transport,
    entry.dispatch_disposition,
    entry.closeout_authority,
    entry.evidence_status,
  ].join("\u0000"));
}

function uniqueByLast(items, keyFor) {
  const seen = new Set();
  const result = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const key = keyFor(items[index]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(items[index]);
  }
  return result.reverse();
}

function projectBrief(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const path = text(value.path);
  const sha256 = text(value.sha256);
  return path && sha256 ? { path, sha256 } : null;
}

function projectVerification(commands) {
  if (!Array.isArray(commands)) return [];
  return commands
    .filter((command) => command && typeof command === "object" && !Array.isArray(command))
    .map((command) => ({
      command: text(command.cmd),
      status: text(command.status),
    }))
    .filter((command) => command.command && command.status);
}

function provenanceEvidenceStatus(provenance) {
  if (text(provenance.closeout_authority) === "pm_blocked_closeout") return "durable_pm_closeout";
  if (text(provenance.report_transport) === "unavailable") return "retained_dispatch_output";
  if (
    text(provenance.receipt_artifact?.retention_policy) === "cleanup_eligible"
    && text(provenance.receipt_artifact?.root) === "git_common_dir"
    && text(provenance.report_transport) === "ready"
    && text(provenance.dispatch_disposition) === "accepted"
  ) {
    return "durable_after_report_cleanup";
  }
  if (text(provenance.application_state) === "applied") return "durable";
  return "validated";
}

function projectFinalReview(review, fallbackSource) {
  const artifact = review.artifact && typeof review.artifact === "object"
    ? review.artifact
    : review.observed_artifact && typeof review.observed_artifact === "object"
      ? review.observed_artifact
      : null;
  const status = text(review.status) || "unavailable";
  const observedFailure = text(artifact?.observed_failure);
  return {
    status,
    identity_status: status === "complete"
      ? "exact"
      : observedFailure === "stale_identity"
        ? "stale"
        : "unavailable",
    completeness: text(review.completeness_status)
      || (status === "complete" ? "complete" : "unavailable"),
    unresolved_blockers: status === "complete" ? [] : ["Exact current final review is an accepted deviation."],
    source: fallbackSource,
  };
}

function finalReviewDrillDown(review) {
  const entries = [];
  const artifact = review.artifact && typeof review.artifact === "object"
    ? review.artifact
    : review.observed_artifact && typeof review.observed_artifact === "object"
      ? review.observed_artifact
      : null;
  if (artifact) {
    entries.push({
      purpose: "full_final_review",
      label: "Final review artifact",
      source: {
        kind: "review_artifact",
        path: text(artifact.path),
        sha256: text(artifact.sha256),
      },
    });
  }
  if (review.reviewed_identity && typeof review.reviewed_identity === "object") {
    entries.push({
      purpose: "reviewed_diff_identity",
      label: "Reviewed product identity",
      source: {
        kind: "diff_identity",
        identity_kind: text(review.reviewed_identity.kind),
        value: text(review.reviewed_identity.value),
      },
    });
  }
  return entries;
}

function strings(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function joinFrontierPath(root, path) {
  const normalizedRoot = text(root).replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedPath = text(path).replaceAll("\\", "/").replace(/^\/+/, "");
  return normalizedPath === "state.yaml"
    ? `${normalizedRoot}/state.yaml`
    : `${normalizedRoot}/${normalizedPath}`;
}

function joinBoardRelativePath(boardPath, path) {
  const boardRoot = text(boardPath).replace(/\/state\.yaml$/, "");
  return `${boardRoot}/${text(path).replace(/^\/+/, "")}`;
}

function isDurableNotePointer(value) {
  if (!value.startsWith("notes/") || value.endsWith("/") || value.includes("\\")) return false;
  return value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function isDirectRun() {
  return process.argv[1]
    && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}
