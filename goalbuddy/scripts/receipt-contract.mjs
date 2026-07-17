const ROLES = new Set(["worker", "judge", "scout", "pm"]);
const RESULTS = new Set(["done", "blocked"]);
const JUDGE_DECISIONS = new Set(["approved", "rejected", "approve_subgoal", "reject_subgoal", "not_complete", "complete"]);
const BLOCKED_COMMAND_STATUSES = new Set(["pass", "fail", "blocked", "error", "not_run", "skipped"]);
const RESERVED_BY_ROLE = Object.freeze({
  worker: new Set(["decision", "full_outcome_complete", "worker_package", "facts", "contradictions", "ambiguity_requiring_judge"]),
  judge: new Set(["changed_files", "commands", "deviations", "verification_attempts", "facts", "contradictions", "ambiguity_requiring_judge"]),
  scout: new Set(["changed_files", "deviations", "verification_attempts", "decision", "full_outcome_complete", "worker_package"]),
  pm: new Set(["changed_files", "deviations", "verification_attempts", "worker_package", "facts", "contradictions", "ambiguity_requiring_judge"]),
});

export function receiptExample({ role, result }) {
  assertRoleAndResult(role, result);
  const common = {
    result,
    task_id: "T001",
    board_path: "docs/goals/example/state.yaml",
    harness: "codex",
  };
  if (role === "worker" && result === "done") {
    return {
      ...common,
      changed_files: ["src/example.mjs"],
      commands: [{ cmd: "npm test", status: "pass" }],
      summary: "Implemented and verified the authorized task.",
      deviations: [],
    };
  }
  if (role === "worker") {
    return {
      ...common,
      blocked_reason: "Verification failed outside the task's authority.",
      changed_files: [],
      commands: [{ cmd: "npm test", status: "fail" }],
      summary: "Preserved the attempted work and the failing verification evidence.",
      remaining_blockers: ["The failure requires authority outside allowed_files."],
    };
  }
  if (role === "judge" && result === "done") {
    return {
      ...common,
      decision: "approved",
      full_outcome_complete: false,
      rationale: "The supplied evidence satisfies this review boundary.",
      worker_package: null,
      evidence: ["Reviewed the bound artifact and verification results."],
      blocked_tasks: [],
      missing_evidence: [],
      required_board_updates: [],
    };
  }
  if (role === "judge") {
    return {
      ...common,
      blocked_reason: "The required evidence is unavailable.",
      evidence: [],
      missing_evidence: ["A current verification result."],
      required_board_updates: [],
    };
  }
  if (role === "scout" && result === "done") {
    return {
      ...common,
      summary: "Mapped the relevant evidence and remaining ambiguity.",
      evidence: ["src/example.mjs"],
      facts: [],
      contradictions: [],
      ambiguity_requiring_judge: [],
      note_needed: false,
    };
  }
  if (role === "scout") {
    return {
      ...common,
      blocked_reason: "The evidence required for a reliable map is unavailable.",
      summary: "Stopped without inferring the missing facts.",
      evidence: [],
      ambiguity_requiring_judge: ["The missing evidence changes the safe next step."],
      note_needed: false,
    };
  }
  if (result === "done") {
    return {
      ...common,
      summary: "Completed the authorized PM control task.",
      evidence: ["Recorded the deterministic transition result."],
    };
  }
  return {
    ...common,
    blocked_reason: "The PM task requires an owner decision.",
    summary: "Preserved the current state without inventing authority.",
    evidence: [],
    remaining_blockers: ["Owner decision required."],
  };
}

export function validateTaskReceipt(receipt, { role, taskId, boardPath, verify = [], boundary = "receipt" } = {}) {
  const findings = [];
  const add = (path, message, value, code = "RECEIPT_SCHEMA_INVALID") => findings.push({
    code,
    path,
    value: boundedValue(value),
    message: `${boundary}: ${message}`,
  });

  if (!ROLES.has(role)) add("role", `role must be one of ${[...ROLES].join(", ")}`, role);
  if (!isPlainObject(receipt)) {
    add("$", "receipt must be a JSON object", receipt);
    return findings;
  }
  if (!RESULTS.has(receipt.result)) add("result", "result must be exactly done or blocked", receipt.result);
  if (!/^T\d{3}$/.test(receipt.task_id || "")) add("task_id", "task_id must use T### format", receipt.task_id);
  else if (taskId && receipt.task_id !== taskId) add("task_id", `task_id must identify ${taskId}`, receipt.task_id);
  if (typeof receipt.board_path !== "string" || receipt.board_path.trim() === "") add("board_path", "board_path must be a nonempty string", receipt.board_path);
  else if (boardPath && receipt.board_path !== boardPath) add("board_path", `board_path must identify ${boardPath}`, receipt.board_path);
  if (Object.hasOwn(receipt, "harness") && (typeof receipt.harness !== "string" || receipt.harness.trim() === "")) {
    add("harness", "harness must be a nonempty string when present", receipt.harness);
  }
  if (Object.hasOwn(receipt, "note")) validateNotePointer(receipt.note, add);
  if (!isJsonSafe(receipt)) add("$", "receipt must contain only JSON-safe data", receipt);

  for (const field of RESERVED_BY_ROLE[role] || []) {
    if (Object.hasOwn(receipt, field)) add(field, `${field} is reserved for another task role`, receipt[field]);
  }

  if (role === "worker") validateWorker(receipt, verify, add);
  else if (role === "judge") validateJudge(receipt, add);
  else if (role === "scout") validateScout(receipt, add);
  else if (role === "pm") validatePm(receipt, add);
  return findings;
}

export function assertTaskReceipt(receipt, context = {}) {
  const findings = validateTaskReceipt(receipt, context);
  if (findings.length === 0) return receipt;
  const first = findings[0];
  const error = new Error(`${first.path}: ${first.message}`);
  error.code = "RECEIPT_SCHEMA_INVALID";
  error.findings = findings;
  throw error;
}

function validateWorker(receipt, verify, add) {
  requireString(receipt, "summary", add);
  requireStringArray(receipt, "changed_files", add, { required: receipt.result === "done" });
  requireCommands(receipt, add);
  duplicateStrings(receipt.changed_files, "changed_files", add);
  if (receipt.result === "done") {
    if (receipt.changed_files?.length === 0) add("changed_files", "completed Worker receipt must list at least one changed file", receipt.changed_files);
    for (const [index, command] of (receipt.commands || []).entries()) {
      if (command?.status !== "pass") add(`commands[${index}].status`, "completed Worker command status must be pass", command?.status);
    }
    const passing = new Set((receipt.commands || []).filter((entry) => entry?.status === "pass").map((entry) => entry.cmd));
    for (const command of stringArray(verify)) {
      if (!passing.has(command)) add("commands", `missing passing declared verification command ${JSON.stringify(command)}`, receipt.commands);
    }
    if (Object.hasOwn(receipt, "deviations")) requireStringArray(receipt, "deviations", add);
  } else if (receipt.result === "blocked") {
    requireString(receipt, "blocked_reason", add);
    for (const [index, command] of (receipt.commands || []).entries()) {
      if (isPlainObject(command) && !BLOCKED_COMMAND_STATUSES.has(command.status)) {
        add(`commands[${index}].status`, `blocked Worker status must be one of ${[...BLOCKED_COMMAND_STATUSES].join(", ")}`, command.status);
      }
    }
  }
}

function validateJudge(receipt, add) {
  if (receipt.result === "done") {
    if (!JUDGE_DECISIONS.has(receipt.decision)) add("decision", `Judge decision must be one of ${[...JUDGE_DECISIONS].join(", ")}`, receipt.decision);
    requireString(receipt, "rationale", add);
    requireArray(receipt, "evidence", add);
    if (Object.hasOwn(receipt, "full_outcome_complete") && typeof receipt.full_outcome_complete !== "boolean") {
      add("full_outcome_complete", "full_outcome_complete must be boolean", receipt.full_outcome_complete);
    }
    if (Object.hasOwn(receipt, "worker_package") && receipt.worker_package !== null) validateWorkerPackage(receipt.worker_package, add);
  } else if (receipt.result === "blocked") {
    requireString(receipt, "blocked_reason", add);
    requireStringArray(receipt, "missing_evidence", add, { required: true });
    if (Object.hasOwn(receipt, "decision") && !JUDGE_DECISIONS.has(receipt.decision)) add("decision", "blocked Judge decision uses unsupported vocabulary", receipt.decision);
  }
}

function validateScout(receipt, add) {
  requireString(receipt, "summary", add);
  if (receipt.result === "done") {
    const hasEvidence = Array.isArray(receipt.evidence) && receipt.evidence.length > 0;
    const hasNote = typeof receipt.note === "string" && receipt.note.trim() !== "";
    if (!hasEvidence && !hasNote) add("evidence", "completed Scout receipt requires evidence or note", receipt.evidence);
  } else {
    requireString(receipt, "blocked_reason", add);
  }
  for (const field of ["evidence", "facts", "contradictions", "ambiguity_requiring_judge"]) {
    if (Object.hasOwn(receipt, field)) requireArray(receipt, field, add);
  }
  if (Object.hasOwn(receipt, "note_needed") && typeof receipt.note_needed !== "boolean") add("note_needed", "note_needed must be boolean", receipt.note_needed);
}

function validatePm(receipt, add) {
  requireString(receipt, "summary", add);
  if (Object.hasOwn(receipt, "evidence")) requireArray(receipt, "evidence", add);
  if (receipt.result === "blocked") requireString(receipt, "blocked_reason", add);
  if (Object.hasOwn(receipt, "decision") && !JUDGE_DECISIONS.has(receipt.decision)) add("decision", "PM decision uses unsupported vocabulary", receipt.decision);
  if (Object.hasOwn(receipt, "full_outcome_complete") && typeof receipt.full_outcome_complete !== "boolean") {
    add("full_outcome_complete", "full_outcome_complete must be boolean", receipt.full_outcome_complete);
  }
}

function validateNotePointer(note, add) {
  if (typeof note !== "string" || note.trim() === "") {
    add("note", "note must be a nonempty relative notes/ path when present", note);
    return;
  }
  if (note.includes("\\") || !note.startsWith("notes/") || note.endsWith("/") || note.startsWith("/") || /^[A-Za-z]:/.test(note)) {
    add("note", "note must be a relative forward-slash path rooted at notes/", note);
    return;
  }
  const segments = note.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    add("note", "note must not contain empty, dot, or traversal segments", note);
  }
}

function requireCommands(receipt, add) {
  if (!Array.isArray(receipt.commands)) {
    add("commands", "commands must be an array", receipt.commands);
    return;
  }
  for (const [index, command] of receipt.commands.entries()) {
    if (!isPlainObject(command)) {
      add(`commands[${index}]`, "command must be an object with cmd and status", command);
      continue;
    }
    if (typeof command.cmd !== "string" || command.cmd.trim() === "") add(`commands[${index}].cmd`, "cmd must be a nonempty string", command.cmd);
    if (typeof command.status !== "string" || command.status.trim() === "") add(`commands[${index}].status`, "status must be a nonempty string", command.status);
  }
}

function validateWorkerPackage(value, add) {
  if (!isPlainObject(value)) {
    add("worker_package", "worker_package must be null or an object", value);
    return;
  }
  requireString(value, "objective", add, "worker_package.");
  for (const field of ["allowed_files", "verify", "stop_if"]) requireStringArray(value, field, add, { required: true, prefix: "worker_package." });
}

function requireString(object, field, add, prefix = "") {
  if (typeof object?.[field] !== "string" || object[field].trim() === "") add(`${prefix}${field}`, `${field} must be a nonempty string`, object?.[field]);
}

function requireArray(object, field, add) {
  if (!Array.isArray(object?.[field])) add(field, `${field} must be an array`, object?.[field]);
}

function requireStringArray(object, field, add, options = {}) {
  const path = `${options.prefix || ""}${field}`;
  if (!Array.isArray(object?.[field])) {
    add(path, `${field} must be an array`, object?.[field]);
    return;
  }
  if (options.required && object[field].length === 0) add(path, `${field} must not be empty`, object[field]);
  for (const [index, value] of object[field].entries()) {
    if (typeof value !== "string" || value.trim() === "") add(`${path}[${index}]`, `${field} entries must be nonempty strings`, value);
  }
}

function duplicateStrings(values, field, add) {
  if (!Array.isArray(values)) return;
  const seen = new Set();
  values.forEach((value, index) => {
    if (typeof value !== "string") return;
    if (seen.has(value)) add(`${field}[${index}]`, `${field} must not contain duplicate paths`, value);
    seen.add(value);
  });
}

function assertRoleAndResult(role, result) {
  if (!ROLES.has(role) || !RESULTS.has(result)) throw new TypeError(`receiptExample requires role ${[...ROLES].join("|")} and result done|blocked.`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function isJsonSafe(value, seen = new Set()) {
  if (value === null || ["string", "boolean"].includes(typeof value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype && Object.entries(value).every(([key, item]) => typeof key === "string" && isJsonSafe(item, seen));
  seen.delete(value);
  return valid;
}

function boundedValue(value) {
  let rendered;
  try { rendered = JSON.stringify(value); } catch { rendered = String(value); }
  if (rendered === undefined) rendered = String(value);
  return rendered.length <= 160 ? rendered : `${rendered.slice(0, 159)}…`;
}
