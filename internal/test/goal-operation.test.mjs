import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalStateText } from "../../goalbuddy/surfaces/local-goal-board/scripts/lib/goal-board.mjs";
import {
  canonicalJsonSha256,
  createReceiptSourceContext,
} from "../../goalbuddy/scripts/receipt-provenance.mjs";

const script = resolve("goalbuddy/scripts/goal-operation.mjs");
const applyScript = resolve("goalbuddy/scripts/apply-receipt.mjs");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeBoard() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "goalbuddy-hold-")));
  const goalDir = join(root, "docs", "goals", "one");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  mkdirSync(join(root, "receipts"), { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), "# one\n");
  writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "one goal"
  slug: "one"
  kind: specific
  tranche: "test"
  status: active
rules:
  exact_human_approval_can_terminal_wait: true
agents:
  scout: unknown
  worker: unknown
  judge: unknown
active_task: T001
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: active
    objective: "Adjust the widget."
    allowed_files:
      - src/widget.mjs
    verify:
      - npm test
      - npm run lint
      - git diff --check
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the outcome."
    receipt: null
`);
  git(root, ["init", "-q"]);
  return { root, goalDir, statePath: join(goalDir, "state.yaml") };
}

function receipt(statePath, overrides = {}) {
  return {
    result: "done",
    task_id: "T001",
    board_path: statePath,
    changed_files: ["src/widget.mjs"],
    commands: [
      { cmd: "npm test", status: "pass" },
      { cmd: "npm run lint", status: "pass" },
      { cmd: "git diff --check", status: "pass" },
    ],
    summary: "widget adjusted",
    harness: "codex",
    ...overrides,
  };
}

function mutation(stateDigest) {
  return {
    board: "unchanged",
    product: "none_observed",
    receipt_applied: false,
    before_digest: stateDigest,
    after_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    session_binding_preserved: null,
  };
}

function sourceBinding(statePath, stateDigest) {
  const root = resolve(join(statePath, "../../../.."));
  const context = createReceiptSourceContext({
    cwd: root,
    statePath,
    taskId: "T001",
    admittedStateDigest: stateDigest,
  });
  const executionProfile = {
    model: "gpt-5.6-sol",
    reasoning_effort: "medium",
    service_tier: "default",
    sandbox: "danger-full-access",
  };
  const dispatchContractSha256 = sha256(JSON.stringify({
    version: 1,
    renderer_version: 1,
    task: context.task_authority,
    role: context.task_authority.type,
    to: "codex",
    model: executionProfile.model,
    reasoning_effort: executionProfile.reasoning_effort,
    service_tier: executionProfile.service_tier,
    sandbox: executionProfile.sandbox,
    brief: context.expected_brief,
  }));
  return {
    task_role: context.task_authority.type,
    harness: "codex",
    task_authority_sha256: canonicalJsonSha256(context.task_authority),
    scope_authority_sha256: canonicalJsonSha256(context.task_authority.allowed_files),
    dispatch_contract_sha256: dispatchContractSha256,
    execution_profile: executionProfile,
    brief: context.expected_brief,
    session_binding: context.expected_session_binding,
  };
}

function applyCommand(statePath, taskId, stateDigest, receiptPath, unresolved) {
  return {
    operation: "apply_receipt",
    board_path: statePath,
    task_id: taskId,
    expected_state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    receipt_path: receiptPath,
    activate_task_id: null,
    unresolved,
    command_template: "goalbuddy receipt fixture",
  };
}

function acceptedDispatch({ statePath, stateDigest, value, reportPath = null, transport = "unavailable" }) {
  const ready = transport === "ready";
  const binding = sourceBinding(statePath, stateDigest);
  return {
    ok: true,
    board_path: statePath,
    harness: "codex",
    task_id: "T001",
    role: "worker",
    exit_status: 0,
    receipt: value,
    scope_check: { status: "clean", violations: [] },
    repair: { attempted: false, succeeded: false, failure: null },
    state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    mutation: mutation(stateDigest),
    commands: {
      apply_receipt: applyCommand(
        statePath,
        "T001",
        stateDigest,
        ready ? reportPath : null,
        ready ? ["activate_task_id"] : ["receipt_path", "activate_task_id"],
      ),
    },
    session_binding: null,
    dispatch_contract_sha256: binding.dispatch_contract_sha256,
    source_binding: binding,
    brief: null,
    report_path: ready ? reportPath : null,
    report_transport: ready
      ? { kind: "git_local_ephemeral_v1", status: "ready", path: reportPath, authority: "transport_only" }
      : { kind: "git_local_ephemeral_v1", status: "unavailable", error: "transport unavailable" },
  };
}

function rejectedDispatch({ statePath, stateDigest }) {
  const binding = sourceBinding(statePath, stateDigest);
  return {
    ok: false,
    error_code: "DISPATCH_SCOPE_FAILED",
    board_path: statePath,
    state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    harness: "codex",
    task_id: "T001",
    role: "worker",
    exit_status: 0,
    receipt: null,
    scope_check: { status: "violations", violations: ["out of scope"] },
    brief: null,
    session_binding: null,
    dispatch_contract_sha256: binding.dispatch_contract_sha256,
    source_binding: binding,
    report_transport: { kind: "not_applicable", status: "not_applicable" },
    mutation: mutation(stateDigest),
  };
}

function runHold(root, {
  source = "receipts/source.json",
  origin = "",
  digest = sha256(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))),
  taskId = "T001",
} = {}) {
  const args = [
    script,
    "hold",
    "docs/goals/one",
    "--task",
    taskId,
    "--source",
    source,
    "--expected-state-digest",
    digest,
    "--json",
  ];
  if (origin) args.splice(args.indexOf("--expected-state-digest"), 0, "--origin-artifact", origin);
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

function heldEntries(statePath) {
  const state = parseGoalStateText(readFileSync(statePath, "utf8"), { allowFallback: false });
  return state.tasks.find((task) => task.id === "T001").transition_evidence?.held_receipts || [];
}

test("hold stores a clean ready dispatch report without applying it and returns the exact checked projection", () => {
  const fixture = makeBoard();
  try {
    const before = readFileSync(fixture.statePath, "utf8");
    const digest = sha256(before);
    const reportDir = join(fixture.root, ".git", "goalbuddy", "dispatch-reports", "T001-fixture");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "dispatch-report.json");
    writeFileSync(reportPath, JSON.stringify(acceptedDispatch({
      statePath: fixture.statePath,
      stateDigest: digest,
      value: receipt(fixture.statePath),
      reportPath,
      transport: "ready",
    })));

    const result = runHold(fixture.root, { source: reportPath, digest });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    const entries = heldEntries(fixture.statePath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].handle, output.handle);
    assert.equal(entries[0].receipt_transport, "git_local_report");
    assert.equal(entries[0].report_transport, "ready");
    assert.equal(entries[0].dispatch_disposition, "accepted");
    assert.equal(output.projection.board.state_digest, sha256(readFileSync(fixture.statePath)));
    assert.equal(output.projection.board.state_digest_status, "checker_validated");
    assert.equal(output.projection.board.active_task.id, "T001");
    assert.equal(existsSync(reportPath), true);
    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const task = state.tasks.find((candidate) => candidate.id === "T001");
    assert.equal(task.status, "active");
    assert.equal(task.receipt, null);
    assert.equal(state.active_task, "T001");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("hold accepts bare receipts and transport-unavailable dispatch output as retained explicit files", () => {
  for (const kind of ["bare", "unavailable"]) {
    const fixture = makeBoard();
    try {
      const digest = sha256(readFileSync(fixture.statePath));
      const value = kind === "bare"
        ? receipt(fixture.statePath)
        : acceptedDispatch({ statePath: fixture.statePath, stateDigest: digest, value: receipt(fixture.statePath) });
      writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify(value));
      const result = runHold(fixture.root, { digest });
      assert.equal(result.status, 0, `${kind}: ${result.stderr || result.stdout}`);
      const held = heldEntries(fixture.statePath)[0];
      assert.equal(held.receipt_transport, "explicit_file");
      assert.equal(held.report_transport, kind === "bare" ? "not_applicable" : "unavailable");
      assert.equal(held.dispatch_disposition, kind === "bare" ? "not_applicable" : "accepted");
      assert.equal(existsSync(join(fixture.root, "receipts", "source.json")), true);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("hold admits only the separate PM blocked closeout for a rejected origin", () => {
  const fixture = makeBoard();
  try {
    const digest = sha256(readFileSync(fixture.statePath));
    const closeout = {
      result: "blocked",
      task_id: "T001",
      board_path: fixture.statePath,
      authored_by: "pm",
      summary: "Preserved rejected dispatch evidence.",
      blocked_reason: "Worker dispatch was rejected after launch.",
      remaining_blockers: ["A bounded successor is required."],
      evidence: ["receipts/rejected.json"],
    };
    const rejected = rejectedDispatch({ statePath: fixture.statePath, stateDigest: digest });
    writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify(closeout));
    writeFileSync(join(fixture.root, "receipts", "rejected.json"), JSON.stringify(rejected));
    const result = runHold(fixture.root, { digest, origin: "receipts/rejected.json" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const held = heldEntries(fixture.statePath)[0];
    assert.equal(held.dispatch_disposition, "rejected");
    assert.equal(held.origin_artifact.path, "receipts/rejected.json");

    const forbidden = { ...closeout, result: "done" };
    writeFileSync(join(fixture.root, "receipts", "forbidden.json"), JSON.stringify(forbidden));
    const secondDigest = sha256(readFileSync(fixture.statePath));
    writeFileSync(join(fixture.root, "receipts", "rejected-next.json"), JSON.stringify({
      ...rejected,
      state_digest: secondDigest,
      mutation: mutation(secondDigest),
    }));
    const before = readFileSync(fixture.statePath);
    const denied = runHold(fixture.root, {
      source: "receipts/forbidden.json",
      digest: secondDigest,
      origin: "receipts/rejected-next.json",
    });
    assert.equal(denied.status, 1);
    assert.match(JSON.parse(denied.stdout).error, /only a blocked receipt/);
    assert.deepEqual(readFileSync(fixture.statePath), before);

    writeFileSync(join(fixture.root, "receipts", "relative.json"), JSON.stringify({
      ...closeout,
      board_path: "docs/goals/one/state.yaml",
    }));
    const relativeIdentity = runHold(fixture.root, {
      source: "receipts/relative.json",
      digest: secondDigest,
      origin: "receipts/rejected-next.json",
    });
    assert.equal(relativeIdentity.status, 0, relativeIdentity.stderr || relativeIdentity.stdout);
    const relativeHeld = heldEntries(fixture.statePath);
    assert.equal(relativeHeld.length, 2);
    assert.equal(relativeHeld[1].board_path, "docs/goals/one/state.yaml");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("hold rejects duplicate, stale, changed, malformed, unsafe, wrong-task, and wrong-board sources byte-identically", () => {
  const scenarios = [
    ["malformed", "{", {}, /exact JSON/],
    ["unsafe", JSON.stringify(receipt("unused")), { source: "../outside.json" }, /traversal|contained|does not exist/],
    ["wrong task", JSON.stringify(receipt("unused", { task_id: "T002" })), {}, /task_id/],
    ["wrong board", JSON.stringify(receipt("/tmp/not-this-board")), {}, /board_path|does not exist|ENOENT/],
  ];
  for (const [name, contents, options, expected] of scenarios) {
    const fixture = makeBoard();
    try {
      writeFileSync(join(fixture.root, "receipts", "source.json"), contents.replaceAll("unused", fixture.statePath));
      const before = readFileSync(fixture.statePath);
      const result = runHold(fixture.root, options);
      assert.equal(result.status, 1, `${name}: ${result.stdout}`);
      assert.match(JSON.parse(result.stdout).error, expected, name);
      assert.deepEqual(readFileSync(fixture.statePath), before, name);
      assert.equal(existsSync(join(fixture.root, "receipts", "source.json")), true, name);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }

  const stale = makeBoard();
  try {
    writeFileSync(join(stale.root, "receipts", "source.json"), JSON.stringify(receipt(stale.statePath)));
    const before = readFileSync(stale.statePath);
    const result = runHold(stale.root, { digest: "0".repeat(64) });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /digest drift/);
    assert.deepEqual(readFileSync(stale.statePath), before);
  } finally {
    rmSync(stale.root, { recursive: true, force: true });
  }

  const wrongActive = makeBoard();
  try {
    writeFileSync(join(wrongActive.root, "receipts", "source.json"), JSON.stringify(receipt(wrongActive.statePath, { task_id: "T999" })));
    const before = readFileSync(wrongActive.statePath);
    const result = runHold(wrongActive.root, { taskId: "T999" });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /current active|active task|active_task/i);
    assert.deepEqual(readFileSync(wrongActive.statePath), before);
  } finally {
    rmSync(wrongActive.root, { recursive: true, force: true });
  }

  const absoluteRepositorySource = makeBoard();
  try {
    const sourcePath = join(absoluteRepositorySource.root, "receipts", "source.json");
    writeFileSync(sourcePath, JSON.stringify(receipt(absoluteRepositorySource.statePath)));
    const before = readFileSync(absoluteRepositorySource.statePath);
    const result = runHold(absoluteRepositorySource.root, { source: sourcePath });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /absolute receipt source.*Git-local dispatch report/i);
    assert.deepEqual(readFileSync(absoluteRepositorySource.statePath), before);
    assert.equal(existsSync(sourcePath), true);
  } finally {
    rmSync(absoluteRepositorySource.root, { recursive: true, force: true });
  }

  const changedSource = makeBoard();
  try {
    writeFileSync(join(changedSource.root, "receipts", "source.json"), JSON.stringify(acceptedDispatch({
      statePath: changedSource.statePath,
      stateDigest: "0".repeat(64),
      value: receipt(changedSource.statePath),
    })));
    const before = readFileSync(changedSource.statePath);
    const result = runHold(changedSource.root);
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /state digest/);
    assert.deepEqual(readFileSync(changedSource.statePath), before);
    assert.equal(existsSync(join(changedSource.root, "receipts", "source.json")), true);
  } finally {
    rmSync(changedSource.root, { recursive: true, force: true });
  }

  const changed = makeBoard();
  try {
    writeFileSync(join(changed.root, "receipts", "source.json"), JSON.stringify(receipt(changed.statePath)));
    const first = runHold(changed.root);
    assert.equal(first.status, 0, first.stdout);
    const beforeDuplicate = readFileSync(changed.statePath);
    const duplicate = runHold(changed.root);
    assert.equal(duplicate.status, 1);
    assert.match(JSON.parse(duplicate.stdout).error, /already exists/);
    assert.deepEqual(readFileSync(changed.statePath), beforeDuplicate);

    writeFileSync(join(changed.root, "receipts", "changed.json"), JSON.stringify(receipt(changed.statePath, { summary: "changed" })));
    const changedResult = runHold(changed.root, {
      source: "receipts/changed.json",
      digest: sha256(beforeDuplicate),
    });
    assert.equal(changedResult.status, 0, changedResult.stdout);
    assert.equal(heldEntries(changed.statePath).length, 2);
  } finally {
    rmSync(changed.root, { recursive: true, force: true });
  }
});

test("hold rejects symlink sources and forbidden PM Worker claims while preserving artifacts", () => {
  const fixture = makeBoard();
  try {
    const real = join(fixture.root, "receipts", "real.json");
    writeFileSync(real, JSON.stringify(receipt(fixture.statePath)));
    symlinkSync("real.json", join(fixture.root, "receipts", "source.json"));
    const before = readFileSync(fixture.statePath);
    const linked = runHold(fixture.root);
    assert.equal(linked.status, 1);
    assert.match(JSON.parse(linked.stdout).error, /symlinks/);
    assert.deepEqual(readFileSync(fixture.statePath), before);
    assert.equal(existsSync(real), true);

    rmSync(join(fixture.root, "receipts", "source.json"));
    writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify({
      result: "blocked",
      task_id: "T001",
      board_path: fixture.statePath,
      authored_by: "pm",
      summary: "blocked",
      blocked_reason: "rejected",
      remaining_blockers: ["repair"],
      evidence: ["rejected"],
      commands: [{ cmd: "npm test", status: "pass" }],
    }));
    writeFileSync(join(fixture.root, "receipts", "rejected.json"), JSON.stringify(rejectedDispatch({
      statePath: fixture.statePath,
      stateDigest: sha256(before),
    })));
    const claims = runHold(fixture.root, { origin: "receipts/rejected.json" });
    assert.equal(claims.status, 1);
    assert.match(JSON.parse(claims.stdout).error, /keys must be exact|unexpected/);
    assert.deepEqual(readFileSync(fixture.statePath), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("hold rejects a receipt authored for the wrong current task role", () => {
  const fixture = makeBoard();
  try {
    writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify({
      result: "done",
      task_id: "T001",
      board_path: fixture.statePath,
      decision: "approved",
      full_outcome_complete: false,
      rationale: "This is Judge proof, not Worker proof.",
      evidence: ["review"],
      blocked_tasks: [],
      missing_evidence: [],
      required_board_updates: [],
      summary: "wrong role",
    }));
    const before = readFileSync(fixture.statePath);
    const result = runHold(fixture.root);
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /reserved for another task role|commands|changed_files/);
    assert.deepEqual(readFileSync(fixture.statePath), before);
    assert.equal(existsSync(join(fixture.root, "receipts", "source.json")), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("an unselected held receipt remains checked history after the task closes", () => {
  const fixture = makeBoard();
  try {
    writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify(receipt(fixture.statePath)));
    const held = runHold(fixture.root);
    assert.equal(held.status, 0, held.stderr || held.stdout);

    writeFileSync(join(fixture.root, "receipts", "current.json"), JSON.stringify(receipt(fixture.statePath, {
      summary: "A separately admitted current receipt closed the task.",
    })));
    const currentDigest = sha256(readFileSync(fixture.statePath));
    const applied = spawnSync(process.execPath, [
      applyScript,
      "receipt",
      "docs/goals/one",
      "--task",
      "T001",
      "--receipt",
      "receipts/current.json",
      "--activate",
      "T999",
      "--expected-state-digest",
      currentDigest,
      "--json",
    ], {
      cwd: fixture.root,
      encoding: "utf8",
    });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const closed = state.tasks.find((task) => task.id === "T001");
    assert.equal(closed.status, "done");
    assert.equal(closed.transition_evidence.held_receipts.length, 1);
    assert.equal(closed.transition_evidence.receipt_provenance.kind, "goalbuddy_receipt_provenance_v1");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
