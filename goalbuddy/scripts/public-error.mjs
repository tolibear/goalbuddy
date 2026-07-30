const ERROR_CATALOG = Object.freeze({
  STALE_STATE_DIGEST: "Rerun the exact resume command and retry with its current state digest.",
  TASK_NOT_CURRENT_ACTIVE: "Resume the board and use only the projected current active task.",
  CHECKER_FAILED: "Run the GoalBuddy checker and escalate to Ledger or full-board recovery.",
  ADVANCE_OUTPUT_FAILED: "Resume the board from checked state; the receipt was already applied, so do not replay advance.",
  SUCCESSOR_NOT_QUEUED: "Correct or hydrate one queued receipt-free successor before retrying.",
  DISPATCH_SCOPE_FAILED: "Inspect the reported changed paths and do not apply this receipt.",
  DISPATCH_SCOPE_UNSAFE: "Narrow the task scope or hydrate a bounded exact path or directory/** tree, then retry the same digest-bound dispatch.",
  DISPATCH_SESSION_BIND_FAILED: "Stop the captured Codex process, inspect preserved work, and recover from a fresh board projection without advertising the unbound session.",
  CODEX_SESSION_RESUME_FAILED: "Inspect preserved work and the exact task binding; do not launch a fresh replacement session automatically.",
  RECEIPT_MISSING: "Recover the harness result without fabricating a receipt.",
  RECEIPT_SCHEMA_INVALID: "Keep the original proof unchanged and follow the reported receipt-repair action; never infer or normalize proof fields.",
  RECEIPT_IDENTITY_MISMATCH: "Reject the receipt and recover against the admitted task.",
  TRANSITION_LOCK_BUSY: "Wait for the current transition to finish, then resume with a fresh state digest; remove a stale lock only after verifying no writer is live.",
  INVALID_ARGUMENT: "Correct the command arguments and retry the same operation.",
  HARNESS_FAILED: "Inspect the harness failure and recover the task without applying a receipt.",
});

const MAX_ERROR_LENGTH = 600;

export class GoalBuddyPublicError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "GoalBuddyPublicError";
    this.code = ERROR_CATALOG[code] ? code : "INVALID_ARGUMENT";
    this.nextAction = ERROR_CATALOG[this.code];
    this.details = details && typeof details === "object" ? details : {};
  }
}

export function publicError(code, message, details = {}) {
  return new GoalBuddyPublicError(code, message, details);
}

export function classifyPublicError(error) {
  if (error instanceof GoalBuddyPublicError) return error;
  const message = String(error?.message || error || "Unknown GoalBuddy failure.");
  if (/digest drift|state\.yaml changed|expected-state-digest/i.test(message)) {
    return publicError("STALE_STATE_DIGEST", message);
  }
  if (/active_task|current active|unique active|task .* active/i.test(message)) {
    return publicError("TASK_NOT_CURRENT_ACTIVE", message);
  }
  if (/checker|immutable-history|Could not parse|Expected mapping/i.test(message)) {
    return publicError("CHECKER_FAILED", message);
  }
  if (/successor|--activate|queued receipt-free/i.test(message)) {
    return publicError("SUCCESSOR_NOT_QUEUED", message);
  }
  if (/receipt.*identity|task_id|board_path/i.test(message)) {
    return publicError("RECEIPT_IDENTITY_MISMATCH", message);
  }
  if (/transition is already in progress|stale lock/i.test(message)) {
    return publicError("TRANSITION_LOCK_BUSY", message);
  }
  return publicError("INVALID_ARGUMENT", message);
}

export function requiredOptionValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw publicError("INVALID_ARGUMENT", `${flag} requires a value.`);
  }
  return value;
}

export function joinedOptionValue(arg, flag) {
  const value = arg.slice(flag.length + 1);
  if (!value) throw publicError("INVALID_ARGUMENT", `${flag} requires a value.`);
  return value;
}

export function publicFailure(error) {
  const normalized = classifyPublicError(error);
  return {
    ok: false,
    error_code: normalized.code,
    error: bounded(normalized.message),
    next_action: normalized.nextAction,
    ...normalized.details,
  };
}

export function printPublicFailure(error, { json = false } = {}) {
  const failure = publicFailure(error);
  if (json) console.log(JSON.stringify(failure));
  else console.error(`${failure.error_code}: ${failure.error} Next: ${failure.next_action}`);
  return failure;
}

function bounded(value) {
  const text = String(value || "Unknown GoalBuddy failure.").replace(/\s+/g, " ").trim();
  return text.length <= MAX_ERROR_LENGTH ? text : `${text.slice(0, MAX_ERROR_LENGTH - 1)}…`;
}
