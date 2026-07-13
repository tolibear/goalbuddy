import { createHash } from "node:crypto";

export function immutableHistoryCompatibility({ original, candidate, baselineReport, candidateReport }) {
  if (baselineReport?.ok === true) {
    return { ok: false, reason: "The current board is checker-green, so candidate checker errors cannot be grandfathered." };
  }
  if (baselineReport?.version !== 2 || candidateReport?.version !== 2) {
    return { ok: false, reason: "Immutable-history compatibility requires version 2 before and after the transition." };
  }
  if (baselineReport?.state_digest !== sha256(original)) {
    return { ok: false, reason: "The baseline checker report is not bound to the exact pre-transition bytes." };
  }
  if (candidateReport?.state_digest !== sha256(candidate)) {
    return { ok: false, reason: "The candidate checker report is not bound to the exact candidate bytes." };
  }

  const baselineErrors = Array.isArray(baselineReport.errors) ? baselineReport.errors : [];
  const candidateErrors = Array.isArray(candidateReport.errors) ? candidateReport.errors : [];
  if (baselineErrors.length === 0 || !sameStringMultiset(baselineErrors, candidateErrors)) {
    return { ok: false, reason: "Candidate checker errors differ from the exact pre-transition error set." };
  }

  const historicalTaskIds = new Set();
  for (const error of baselineErrors) {
    const taskIds = [...new Set(String(error).match(/\bT\d{3}\b/g) || [])];
    if (taskIds.length !== 1) {
      return { ok: false, reason: `Checker error is not confined to exactly one task: ${error}` };
    }
    const taskId = taskIds[0];
    if (rawTaskStatus(original, taskId) !== "done" || rawTaskStatus(candidate, taskId) !== "done") {
      return { ok: false, reason: `Checker error touches live or missing task ${taskId}.` };
    }
    if (rawTaskBlock(original, taskId) !== rawTaskBlock(candidate, taskId)) {
      return { ok: false, reason: `Historical task ${taskId} changed byte content.` };
    }
    historicalTaskIds.add(taskId);
  }

  return {
    ok: true,
    used: true,
    proof: {
      baseline_error_count: baselineErrors.length,
      baseline_error_digest: sha256(JSON.stringify([...baselineErrors].sort())),
      preserved_task_ids: [...historicalTaskIds].sort(),
      historical_task_bytes_unchanged: true,
      live_tail_checker_errors: 0,
    },
  };
}

export function rawTaskBlock(text, taskId) {
  const startPattern = new RegExp(`^  - id:\\s*"?${taskId}"?\\s*(?:\\r?\\n|$)`, "m");
  const start = startPattern.exec(text);
  if (!start) return null;
  const contentStart = start.index + start[0].length;
  const nextBoundary = /^(?:  - id:|\S)/m.exec(text.slice(contentStart));
  const end = nextBoundary ? contentStart + nextBoundary.index : text.length;
  return text.slice(start.index, end);
}

export function rawTaskStatus(text, taskId) {
  const block = rawTaskBlock(text, taskId);
  if (block === null) return null;
  const matches = [...block.matchAll(/^    status:\s*"?([A-Za-z_]+)"?\s*$/gm)];
  return matches.length === 1 ? matches[0][1] : null;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sameStringMultiset(left, right) {
  if (left.length !== right.length) return false;
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}
