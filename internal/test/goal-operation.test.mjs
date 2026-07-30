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

function runAdvance(root, {
  source = "receipts/source.json",
  heldReceipt = "",
  closeoutAuthority = "original_role",
  origin = "",
  taskId = "T001",
  activate = "T999",
  taskCard = "",
  extraArgs = [],
} = {}) {
  const args = [
    script,
    "advance",
    "docs/goals/one",
    "--task",
    taskId,
  ];
  if (heldReceipt) args.push("--held-receipt", heldReceipt);
  else if (source) args.push("--source", source);
  args.push(
    "--closeout-authority",
    closeoutAuthority,
    "--activate",
    activate,
  );
  if (origin) args.push("--origin-artifact", origin);
  if (taskCard) args.push("--task-card", taskCard);
  args.push(...extraArgs, "--json");
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

test("advance applies a bare receipt atomically and returns only the activated semantic frontier", () => {
  const fixture = makeBoard();
  try {
    const sourcePath = join(fixture.root, "receipts", "source.json");
    writeFileSync(sourcePath, JSON.stringify(receipt(fixture.statePath)));

    const result = runAdvance(fixture.root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(output).sort(), ["frontier", "ok", "outcome"]);
    assert.deepEqual(output.outcome, {
      task_id: "T001",
      result: "done",
      next_task_id: "T999",
      hydrated_task_id: null,
    });
    assert.equal(output.frontier.kind, "goalbuddy_frontier_v1");
    assert.equal(output.frontier.slice.id, "T999");
    assert.equal(output.frontier.slice.status, "active");
    assert.doesNotMatch(JSON.stringify(output), /state_digest|before_digest|after_digest/);

    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const closed = state.tasks.find((task) => task.id === "T001");
    assert.equal(closed.status, "done");
    assert.equal(closed.receipt.summary, "widget adjusted");
    assert.equal(closed.transition_evidence.receipt_provenance.closeout_authority, "original_role");
    assert.equal(state.tasks.find((task) => task.id === "T999").status, "active");
    assert.equal(state.active_task, "T999");
    assert.equal(existsSync(sourcePath), true);

    const after = readFileSync(fixture.statePath);
    const replay = runAdvance(fixture.root);
    assert.equal(replay.status, 1);
    assert.match(JSON.parse(replay.stdout).error, /current active|active task|active_task/i);
    assert.deepEqual(readFileSync(fixture.statePath), after);
    assert.equal(existsSync(sourcePath), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance accepts unavailable transport and cleans only an eligible ready report", () => {
  for (const transport of ["unavailable", "ready"]) {
    const fixture = makeBoard();
    try {
      const before = readFileSync(fixture.statePath);
      const digest = sha256(before);
      let source;
      if (transport === "ready") {
        const reportDir = join(fixture.root, ".git", "goalbuddy", "dispatch-reports", "T001-advance");
        mkdirSync(reportDir, { recursive: true });
        source = join(reportDir, "dispatch-report.json");
        writeFileSync(source, JSON.stringify(acceptedDispatch({
          statePath: fixture.statePath,
          stateDigest: digest,
          value: receipt(fixture.statePath),
          reportPath: source,
          transport,
        })));
      } else {
        source = join(fixture.root, "receipts", "source.json");
        writeFileSync(source, JSON.stringify(acceptedDispatch({
          statePath: fixture.statePath,
          stateDigest: digest,
          value: receipt(fixture.statePath),
        })));
      }

      const result = runAdvance(fixture.root, {
        source: transport === "ready" ? source : "receipts/source.json",
      });
      assert.equal(result.status, 0, `${transport}: ${result.stderr || result.stdout}`);
      assert.equal(existsSync(source), transport === "unavailable", transport);
      const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
      const provenance = state.tasks.find((task) => task.id === "T001").transition_evidence.receipt_provenance;
      assert.equal(provenance.report_transport, transport);
      assert.equal(provenance.dispatch_disposition, "accepted");
      assert.equal(provenance.receipt_artifact.retention_policy, transport === "ready" ? "cleanup_eligible" : "retained");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("advance installs an explicit PM blocked closeout only with its exact rejected origin", () => {
  const fixture = makeBoard();
  try {
    const digest = sha256(readFileSync(fixture.statePath));
    const closeoutPath = join(fixture.root, "receipts", "source.json");
    const originPath = join(fixture.root, "receipts", "rejected.json");
    writeFileSync(closeoutPath, JSON.stringify({
      result: "blocked",
      task_id: "T001",
      board_path: fixture.statePath,
      authored_by: "pm",
      summary: "Preserved rejected dispatch evidence.",
      blocked_reason: "Worker dispatch was rejected after launch.",
      remaining_blockers: ["A bounded successor is required."],
      evidence: ["receipts/rejected.json"],
    }));
    writeFileSync(originPath, JSON.stringify(rejectedDispatch({
      statePath: fixture.statePath,
      stateDigest: digest,
    })));

    const result = runAdvance(fixture.root, {
      closeoutAuthority: "pm_blocked_closeout",
      origin: "receipts/rejected.json",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const closed = state.tasks.find((task) => task.id === "T001");
    assert.equal(closed.status, "blocked");
    assert.equal(closed.transition_evidence.receipt_provenance.closeout_authority, "pm_blocked_closeout");
    assert.equal(closed.transition_evidence.receipt_provenance.dispatch_disposition, "rejected");
    assert.equal(state.active_task, "T999");
    assert.equal(existsSync(closeoutPath), true);
    assert.equal(existsSync(originPath), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance reopens and applies a held PM blocked closeout with its rejected origin", () => {
  const fixture = makeBoard();
  try {
    const digest = sha256(readFileSync(fixture.statePath));
    const sourcePath = join(fixture.root, "receipts", "source.json");
    const originPath = join(fixture.root, "receipts", "rejected.json");
    writeFileSync(sourcePath, JSON.stringify({
      result: "blocked",
      task_id: "T001",
      board_path: fixture.statePath,
      authored_by: "pm",
      summary: "Preserved rejected dispatch evidence.",
      blocked_reason: "Worker dispatch was rejected after launch.",
      remaining_blockers: ["A bounded successor is required."],
      evidence: ["receipts/rejected.json"],
    }));
    writeFileSync(originPath, JSON.stringify(rejectedDispatch({
      statePath: fixture.statePath,
      stateDigest: digest,
    })));
    const held = runHold(fixture.root, {
      digest,
      origin: "receipts/rejected.json",
    });
    assert.equal(held.status, 0, held.stderr || held.stdout);
    const handle = JSON.parse(held.stdout).handle;

    const result = runAdvance(fixture.root, {
      source: "",
      heldReceipt: handle,
      closeoutAuthority: "pm_blocked_closeout",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const closed = state.tasks.find((task) => task.id === "T001");
    assert.equal(closed.status, "blocked");
    assert.equal(closed.transition_evidence.receipt_provenance.dispatch_disposition, "rejected");
    assert.deepEqual(closed.transition_evidence.held_receipts, []);
    assert.equal(existsSync(sourcePath), true);
    assert.equal(existsSync(originPath), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance consumes exactly one held handle and preserves all rejected evidence byte-identically", () => {
  const fixture = makeBoard();
  try {
    const firstPath = join(fixture.root, "receipts", "source.json");
    const secondPath = join(fixture.root, "receipts", "second.json");
    writeFileSync(firstPath, JSON.stringify(receipt(fixture.statePath)));
    writeFileSync(secondPath, JSON.stringify(receipt(fixture.statePath, { summary: "alternate receipt" })));
    const first = JSON.parse(runHold(fixture.root).stdout);
    const second = JSON.parse(runHold(fixture.root, {
      source: "receipts/second.json",
      digest: sha256(readFileSync(fixture.statePath)),
    }).stdout);
    assert.notEqual(first.handle, second.handle);

    const beforeRejected = readFileSync(fixture.statePath);
    const missing = runAdvance(fixture.root, {
      source: "",
      heldReceipt: "0".repeat(64),
    });
    assert.equal(missing.status, 1);
    assert.match(JSON.parse(missing.stdout).error, /held receipt|handle/i);
    assert.deepEqual(readFileSync(fixture.statePath), beforeRejected);
    assert.equal(existsSync(firstPath), true);
    assert.equal(existsSync(secondPath), true);

    const applied = runAdvance(fixture.root, {
      source: "",
      heldReceipt: first.handle,
    });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    const remaining = heldEntries(fixture.statePath);
    assert.deepEqual(remaining.map((entry) => entry.handle), [second.handle]);
    assert.equal(existsSync(firstPath), true);
    assert.equal(existsSync(secondPath), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance cannot bypass a held ready report through a fresh source selection", () => {
  const fixture = makeBoard();
  try {
    const digest = sha256(readFileSync(fixture.statePath));
    const reportDir = join(fixture.root, ".git", "goalbuddy", "dispatch-reports", "T001-held-ready");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "dispatch-report.json");
    writeFileSync(reportPath, JSON.stringify(acceptedDispatch({
      statePath: fixture.statePath,
      stateDigest: digest,
      value: receipt(fixture.statePath),
      reportPath,
      transport: "ready",
    })));
    const held = runHold(fixture.root, { source: reportPath, digest });
    assert.equal(held.status, 0, held.stderr || held.stdout);
    const handle = JSON.parse(held.stdout).handle;
    const boardBefore = readFileSync(fixture.statePath);
    const reportBefore = readFileSync(reportPath);

    const bypass = runAdvance(fixture.root, { source: reportPath });
    assert.equal(bypass.status, 1);
    const failure = JSON.parse(bypass.stdout);
    assert.equal(failure.error_code, "INVALID_ARGUMENT");
    assert.match(failure.error, new RegExp(`already held as ${handle}`));
    assert.deepEqual(readFileSync(fixture.statePath), boardBefore);
    assert.deepEqual(readFileSync(reportPath), reportBefore);

    const applied = runAdvance(fixture.root, {
      source: "",
      heldReceipt: handle,
    });
    assert.equal(applied.status, 0, applied.stderr || applied.stdout);
    assert.equal(existsSync(reportPath), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance computes an exact task-card binding and hydrates the approved Worker successor atomically", () => {
  const fixture = makeBoard();
  try {
    const placeholder = readFileSync(fixture.statePath, "utf8").replace(
      `  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the outcome."
    receipt: null
`,
      `  - id: T999
    type: worker
    assignee: Worker
    status: queued
    reasoning_hint: high
    objective: "Provisional Worker; approved task card required."
    inputs:
      - T001 receipt
    constraints:
      - "Keep the operation local."
    allowed_files: []
    verify: []
    stop_if:
      - "The provisional card has not been replaced."
    expected_output:
      - "Exact implementation receipt"
    receipt: null
`,
    );
    writeFileSync(fixture.statePath, placeholder);
    writeFileSync(join(fixture.root, "receipts", "source.json"), JSON.stringify(receipt(fixture.statePath)));
    const taskCard = {
      id: "T999",
      type: "worker",
      assignee: "Worker",
      status: "queued",
      reasoning_hint: "high",
      objective: "Implement the approved bounded successor.",
      inputs: ["T001 receipt"],
      constraints: ["Keep the operation local."],
      allowed_files: ["src/successor.mjs"],
      verify: ["npm test", "git diff --check"],
      stop_if: ["Need files outside allowed_files."],
      expected_output: ["Exact implementation receipt"],
      receipt: null,
    };
    const cardPath = join(fixture.root, "receipts", "task-card.json");
    writeFileSync(cardPath, JSON.stringify(taskCard));

    const result = runAdvance(fixture.root, {
      taskCard: "receipts/task-card.json",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.outcome.hydrated_task_id, "T999");
    assert.equal(output.frontier.slice.id, "T999");
    assert.equal(output.frontier.slice.objective, taskCard.objective);
    const state = parseGoalStateText(readFileSync(fixture.statePath, "utf8"), { allowFallback: false });
    const active = state.tasks.find((task) => task.id === "T999");
    assert.equal(active.status, "active");
    assert.equal(active.objective, taskCard.objective);
    assert.deepEqual(active.allowed_files, taskCard.allowed_files);
    assert.deepEqual(active.verify, taskCard.verify);
    assert.equal(existsSync(cardPath), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance rejects an invalid task card without changing the board or either exact artifact", () => {
  const fixture = makeBoard();
  try {
    const placeholder = readFileSync(fixture.statePath, "utf8").replace(
      `  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the outcome."
    receipt: null
`,
      `  - id: T999
    type: worker
    assignee: Worker
    status: queued
    objective: "Provisional Worker."
    allowed_files: []
    verify: []
    stop_if:
      - "The provisional card has not been replaced."
    receipt: null
`,
    );
    writeFileSync(fixture.statePath, placeholder);
    const sourcePath = join(fixture.root, "receipts", "source.json");
    const cardPath = join(fixture.root, "receipts", "task-card.json");
    writeFileSync(sourcePath, JSON.stringify(receipt(fixture.statePath)));
    writeFileSync(cardPath, JSON.stringify({
      id: "T998",
      type: "worker",
      assignee: "Worker",
      status: "queued",
      objective: "Wrong successor.",
      allowed_files: ["src/wrong.mjs"],
      verify: ["npm test"],
      stop_if: ["Need files outside allowed_files."],
      receipt: null,
    }));
    const boardBefore = readFileSync(fixture.statePath);
    const sourceBefore = readFileSync(sourcePath);
    const cardBefore = readFileSync(cardPath);

    const result = runAdvance(fixture.root, {
      taskCard: "receipts/task-card.json",
    });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /task id T998 does not match|hydrate-task T999/i);
    assert.deepEqual(readFileSync(fixture.statePath), boardBefore);
    assert.deepEqual(readFileSync(sourcePath), sourceBefore);
    assert.deepEqual(readFileSync(cardPath), cardBefore);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance rejects invalid source, authority, scope, identity, and successor cases byte-identically", () => {
  const scenarios = [
    {
      name: "malformed source",
      source(fixture) {
        return "{";
      },
      options: {},
      expected: /exact JSON/,
    },
    {
      name: "stale dispatch",
      source(fixture) {
        return JSON.stringify(acceptedDispatch({
          statePath: fixture.statePath,
          stateDigest: "0".repeat(64),
          value: receipt(fixture.statePath),
        }));
      },
      options: {},
      expected: /state digest|identity mismatch/i,
    },
    {
      name: "dirty dispatch",
      source(fixture) {
        const digest = sha256(readFileSync(fixture.statePath));
        const value = acceptedDispatch({
          statePath: fixture.statePath,
          stateDigest: digest,
          value: receipt(fixture.statePath),
        });
        value.scope_check = { status: "violations", violations: ["outside scope"] };
        return JSON.stringify(value);
      },
      options: {},
      expected: /scope|authoritative/i,
    },
    {
      name: "wrong receipt task",
      source(fixture) {
        return JSON.stringify(receipt(fixture.statePath, { task_id: "T002" }));
      },
      options: {},
      expected: /task_id|identity/i,
    },
    {
      name: "PM authority without origin",
      source(fixture) {
        return JSON.stringify(receipt(fixture.statePath));
      },
      options: { closeoutAuthority: "pm_blocked_closeout" },
      expected: /requires --origin-artifact/,
    },
    {
      name: "unknown successor",
      source(fixture) {
        return JSON.stringify(receipt(fixture.statePath));
      },
      options: { activate: "T998" },
      expected: /successor|queued/i,
    },
  ];

  for (const scenario of scenarios) {
    const fixture = makeBoard();
    try {
      const sourcePath = join(fixture.root, "receipts", "source.json");
      writeFileSync(sourcePath, scenario.source(fixture));
      const boardBefore = readFileSync(fixture.statePath);
      const sourceBefore = readFileSync(sourcePath);
      const result = runAdvance(fixture.root, scenario.options);
      assert.equal(result.status, 1, `${scenario.name}: ${result.stderr || result.stdout}`);
      assert.match(JSON.parse(result.stdout).error, scenario.expected, scenario.name);
      assert.deepEqual(readFileSync(fixture.statePath), boardBefore, scenario.name);
      assert.deepEqual(readFileSync(sourcePath), sourceBefore, scenario.name);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test("advance rejects a changed held artifact before application and preserves the held board", () => {
  const fixture = makeBoard();
  try {
    const sourcePath = join(fixture.root, "receipts", "source.json");
    writeFileSync(sourcePath, JSON.stringify(receipt(fixture.statePath)));
    const held = runHold(fixture.root);
    assert.equal(held.status, 0, held.stderr || held.stdout);
    const handle = JSON.parse(held.stdout).handle;
    const boardBefore = readFileSync(fixture.statePath);
    writeFileSync(sourcePath, JSON.stringify(receipt(fixture.statePath, { summary: "changed after hold" })));
    const changedSource = readFileSync(sourcePath);

    const result = runAdvance(fixture.root, {
      source: "",
      heldReceipt: handle,
    });
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stdout).error, /artifact|sha|checker|held/i);
    assert.deepEqual(readFileSync(fixture.statePath), boardBefore);
    assert.deepEqual(readFileSync(sourcePath), changedSource);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("advance consumes the exact ready report from the active linked worktree", () => {
  const fixture = makeBoard();
  const worktreeParent = realpathSync(mkdtempSync(join(tmpdir(), "goalbuddy-advance-worktree-")));
  const linked = join(worktreeParent, "linked");
  try {
    git(fixture.root, ["config", "user.name", "GoalBuddy Test"]);
    git(fixture.root, ["config", "user.email", "goalbuddy@example.invalid"]);
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "-qm", "fixture"]);
    git(fixture.root, ["worktree", "add", "-qb", "advance-fixture", linked]);
    mkdirSync(join(linked, "receipts"), { recursive: true });
    const statePath = join(linked, "docs", "goals", "one", "state.yaml");
    const digest = sha256(readFileSync(statePath));
    const rawGitDir = git(linked, ["rev-parse", "--git-dir"]);
    const activeGitDir = realpathSync(resolve(linked, rawGitDir));
    const reportDir = join(activeGitDir, "goalbuddy", "dispatch-reports", "T001-linked");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "dispatch-report.json");
    writeFileSync(reportPath, JSON.stringify(acceptedDispatch({
      statePath,
      stateDigest: digest,
      value: receipt(statePath),
      reportPath,
      transport: "ready",
    })));

    const result = runAdvance(linked, { source: reportPath });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).frontier.slice.id, "T999");
    assert.equal(existsSync(reportPath), false);
    const state = parseGoalStateText(readFileSync(statePath, "utf8"), { allowFallback: false });
    assert.equal(state.active_task, "T999");
  } finally {
    rmSync(worktreeParent, { recursive: true, force: true });
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
