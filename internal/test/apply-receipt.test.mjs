import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalStateText } from "../../goalbuddy/surfaces/local-goal-board/scripts/lib/goal-board.mjs";
import { bindCodexWorkerSession } from "../../goalbuddy/scripts/apply-receipt.mjs";

const script = resolve("goalbuddy/scripts/apply-receipt.mjs");
const checker = resolve("goalbuddy/scripts/check-goal-state.mjs");

function makeBoard({ placeholder = false, populatedWorker = false, omitReceipts = false, sourceType = "worker" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-apply-receipt-"));
  const goalDir = join(root, "docs", "goals", "one");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
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
    type: ${sourceType}
    assignee: ${sourceType === "worker" ? "Worker" : "Judge"}
    status: active
    objective: "Adjust the widget."
${sourceType === "worker" ? `    allowed_files:
      - src/widget.mjs
    verify:
      - npm test
      - npm run lint
      - git diff --check
    stop_if:
      - "Need files outside allowed_files."
` : ""}
${omitReceipts ? "" : "    receipt: null\n"}
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the outcome."
${omitReceipts ? "" : "    receipt: null\n"}
${placeholder ? `  - id: T042
    type: worker
    assignee: Worker
    status: queued
    reasoning_hint: high
    objective: "Provisional worker; Judge package required before activation."
    inputs:
      - T001 receipt
    constraints:
      - "Keep the operation local."
    allowed_files: []
    verify: []
    stop_if:
      - "The provisional card has not been replaced with the exact worker_package."
    expected_output:
      - "Exact implementation receipt"
    receipt: null
` : ""}
${populatedWorker ? `  - id: T043
    type: worker
    assignee: Worker
    status: queued
    objective: "Already materialized Worker package."
    allowed_files:
      - src/existing.mjs
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
` : ""}
`);
  return { root, goalDir };
}

const DONE_RECEIPT = {
  result: "done",
  task_id: "T001",
  board_path: "docs/goals/one/state.yaml",
  changed_files: ["src/widget.mjs"],
  commands: [
    { cmd: "npm test", status: "pass" },
    { cmd: "npm run lint", status: "pass" },
    { cmd: "git diff --check", status: "pass" },
  ],
  summary: "widget adjusted",
  harness: "codex",
};

function failureReport(result) {
  assert.notEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function failureText(result) {
  return failureReport(result).error;
}

function runApply(root, args, receipt, taskCards = null, hydrateCard = null, hydrateSha256 = null) {
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  const taskArgs = [];
  if (taskCards !== null) {
    const taskCardsPath = join(root, "task-cards.json");
    writeFileSync(taskCardsPath, JSON.stringify(taskCards));
    taskArgs.push("--add-tasks", taskCardsPath);
  }
  if (hydrateCard !== null) {
    const taskCardPath = join(root, "task-card.json");
    const rawTaskCard = JSON.stringify(hydrateCard);
    writeFileSync(taskCardPath, rawTaskCard);
    taskArgs.push("--task-card", taskCardPath, "--task-card-sha256", hydrateSha256 ?? createHash("sha256").update(rawTaskCard).digest("hex"));
  }
  const digest = createHash("sha256").update(readFileSync(join(root, "docs/goals/one/state.yaml"))).digest("hex");
  return spawnSync(process.execPath, [script, "docs/goals/one", "--receipt", receiptPath, "--expected-state-digest", digest, ...taskArgs, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runWait(root, args, receipt) {
  const receiptPath = join(root, "wait.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  return spawnSync(process.execPath, [script, "wait", "docs/goals/one", "--receipt", receiptPath, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runReply(root, args, reply) {
  const replyPath = join(root, "reply.json");
  writeFileSync(replyPath, JSON.stringify(reply));
  return spawnSync(process.execPath, [script, "reply", "docs/goals/one", "--reply-file", replyPath, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runComplete(root, args, receipt) {
  const receiptPath = join(root, "final.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  return spawnSync(process.execPath, [script, "complete", "docs/goals/one", "--receipt", receiptPath, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function runRebind(root, args, binding, installedCheckerPaths) {
  const bindingPath = join(root, "binding.json");
  writeFileSync(bindingPath, JSON.stringify(binding));
  const installedArgs = installedCheckerPaths.flatMap((path) => ["--installed-checker", path]);
  return spawnSync(process.execPath, [script, "rebind", "docs/goals/one", "--binding", bindingPath, ...installedArgs, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function captureChild(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolveChild, rejectChild) => {
    child.once("error", rejectChild);
    child.once("close", (status, signal) => resolveChild({ status, signal, stdout, stderr }));
  });
}

function waitForPath(path, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
  }
  throw new Error(`Timed out waiting for ${path}.`);
}

function makeCompletionBoard({ taskType = "judge", extraQueued = false, legacyDecision = false, legacyDialect = false, liveTailError = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-complete-"));
  const goalDir = join(root, "docs", "goals", "one");
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), "# one\n");
  writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "one goal"
  slug: "one"
  kind: specific
  tranche: "test"
  status: active
  oracle:
    signal: "The widget behavior is verified."
    final_proof: "A passing npm test receipt and final audit."
  intake:
    completion_proof: "npm test passes and the final audit records full completion."
rules:
  continuous_until_full_outcome: true
agents:
  scout: unknown
  worker: unknown
  judge: unknown
active_task: T999
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Adjust the widget."
    allowed_files:
      - src/widget.mjs
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - src/widget.mjs
      commands:
        - cmd: npm test
          status: pass
      summary: "Widget adjusted."
${legacyDecision ? `  - id: T007
    type: judge
    assignee: Judge
    status: done
    objective: "Preserve the historical audit exactly."
    receipt:
      result: done
      decision: amend
      summary: "Historical pre-0.4 decision vocabulary."
${legacyDialect ? `      evidence:
      - kind: legacy-indentation
        summary: "Preserved exactly."
` : ""}` : ""}  - id: T999
    type: ${taskType}
    assignee: ${liveTailError ? "Worker" : taskType === "judge" ? "Judge" : "PM"}
    status: active
    objective: "Audit the complete outcome."
${legacyDialect ? "" : `    transition_evidence:
      marker: kept
`}    receipt: null
${extraQueued ? `  - id: T998
    type: worker
    assignee: Worker
    status: queued
    objective: "Unexpected remaining work."
    allowed_files:
      - src/other.mjs
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
` : ""}checks:
  dirty_fingerprint: unknown
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);
  return { root, goalDir };
}

function addExistingGoalbuddyBinding(statePath) {
  const state = readFileSync(statePath, "utf8");
  writeFileSync(statePath, state.replace("checks:\n", `checks:
  goalbuddy_binding:
    source_root: "/old/goalbuddy"
    accepted_commit: "${"0".repeat(40)}"
    checker_path: "/old/goalbuddy/check-goal-state.mjs"
    checker_sha256: "${"0".repeat(64)}"
    installed_checker_sha256: "${"0".repeat(64)}"
    runtime_doctor_goal_ready: true
    cached_marketplace_checker_authoritative: false
`));
}

function makeBindingProof(root) {
  const sourceRoot = join(root, "goalbuddy-source");
  const checkerPath = join(sourceRoot, "goalbuddy", "scripts", "check-goal-state.mjs");
  mkdirSync(dirname(checkerPath), { recursive: true });
  const checkerBytes = "#!/usr/bin/env node\nconsole.log('fixture checker');\n";
  writeFileSync(checkerPath, checkerBytes);
  for (const args of [
    ["init", "-q"],
    ["add", "goalbuddy/scripts/check-goal-state.mjs"],
    ["-c", "user.name=GoalBuddy Test", "-c", "user.email=goalbuddy@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture checker"],
  ]) {
    const result = spawnSync("git", args, { cwd: sourceRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }
  const acceptedCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).stdout.trim();
  const checkerSha256 = createHash("sha256").update(checkerBytes).digest("hex");
  const codexChecker = join(root, "installed", "codex", "check-goal-state.mjs");
  const claudeChecker = join(root, "installed", "claude", "check-goal-state.mjs");
  mkdirSync(dirname(codexChecker), { recursive: true });
  mkdirSync(dirname(claudeChecker), { recursive: true });
  writeFileSync(codexChecker, checkerBytes);
  writeFileSync(claudeChecker, checkerBytes);
  return {
    binding: {
      source_root: sourceRoot,
      accepted_commit: acceptedCommit,
      checker_path: checkerPath,
      checker_sha256: checkerSha256,
      installed_checker_sha256: checkerSha256,
      runtime_doctor_goal_ready: true,
      cached_marketplace_checker_authoritative: false,
    },
    installedCheckerPaths: [codexChecker, claudeChecker],
  };
}

const AMENDMENT_TASKS = [
  {
    id: "T046",
    type: "worker",
    assignee: "Worker",
    status: "queued",
    reasoning_hint: "high",
    objective: "Implement the exact amended slice without truncating this deliberately long task payload.",
    inputs: ["T001 receipt", "Judge amendment"],
    constraints: ["Keep the implementation bounded.", "Preserve the accepted architecture."],
    allowed_files: ["src/widget.mjs", "test/widget.test.mjs"],
    verify: ["npm test", "npm run lint", "git diff --check"],
    stop_if: ["Need files outside allowed_files.", "Verification fails twice."],
    expected_output: ["Working behavior", "Passing verification"],
    receipt: null,
  },
  {
    id: "T047",
    type: "judge",
    assignee: "Judge",
    status: "queued",
    reasoning_hint: "xhigh",
    objective: "Audit the amended implementation.",
    inputs: ["T046 receipt"],
    constraints: ["Do not implement."],
    expected_output: ["approve | amend"],
    receipt: null,
  },
];

const HYDRATED_T042 = {
  id: "T042",
  type: "worker",
  assignee: "Worker",
  status: "queued",
  reasoning_hint: "high",
  objective: "Run the exact approved local pilot packet.",
  inputs: ["T001 receipt", "Judge decision"],
  constraints: ["Keep the operation local.", "Use the hash-bound packet."],
  allowed_files: ["src/pilot.mjs"],
  verify: ["npm test", "npm run lint", "git diff --check"],
  stop_if: ["Need files outside allowed_files."],
  expected_output: ["Exact implementation receipt"],
  receipt: null,
};

test("apply-receipt records a done receipt and activates the next task atomically", () => {
  const { root, goalDir } = makeBoard();
  try {
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], DONE_RECEIPT);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.commands.apply_receipt.task_id, "T999");
    assert.equal(report.commands.apply_receipt.expected_state_digest, report.after_digest);
    assert.equal(report.commands.apply_receipt.digest_kind, "state_yaml_sha256");
    assert.equal(report.commands.apply_receipt.receipt_path, null);
    assert.equal(report.commands.apply_receipt.activate_task_id, null);
    assert.deepEqual(report.commands.apply_receipt.unresolved, ["receipt_path", "activate_task_id"]);
    assert.match(report.commands.apply_receipt.command_template, /--receipt "<receipt-path>" /);
    assert.match(report.commands.apply_receipt.command_template, /--activate <T###> --json$/);

    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T999/);
    assert.match(state, /summary: "widget adjusted"/);
    assert.match(state, /harness: codex/);
    assert.match(state, /status: pass/);

    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(JSON.parse(check.stdout).ok, true, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt help is read-only while malformed ordinary calls still fail closed", () => {
  const { root, goalDir } = makeBoard();
  try {
    const statePath = join(goalDir, "state.yaml");
    const before = readFileSync(statePath, "utf8");
    for (const flag of ["--help", "-h"]) {
      const help = spawnSync(process.execPath, [script, flag], { cwd: root, encoding: "utf8" });
      assert.equal(help.status, 0, help.stderr || help.stdout);
      assert.match(help.stdout, /^Usage:\n/);
      for (const usage of [
        "[receipt] <goal-root> --task T### --receipt <file>",
        "wait <goal-root> --task T### --receipt <file>",
        "reply <goal-root> --task T### --reply-file <file>",
        "complete <goal-root> --task T### --receipt <file>",
        "rebind <goal-root> --binding <binding.json> --installed-checker <path>",
      ]) {
        assert.equal(help.stdout.includes(usage), true, `${flag} help includes ${usage}`);
      }
      for (const option of ["--add-tasks", "--hydrate-task", "--task-card", "--task-card-sha256", "--expected-state-digest"]) {
        assert.match(help.stdout, new RegExp(option), `${flag} help includes ${option}`);
      }
      assert.equal(readFileSync(statePath, "utf8"), before);
    }

    const malformed = spawnSync(process.execPath, [script, goalDir, "--task", "T001"], { cwd: root, encoding: "utf8" });
    assert.notEqual(malformed.status, 0, malformed.stderr || malformed.stdout);
    assert.match(malformed.stderr || malformed.stdout, /Usage: node apply-receipt\.mjs/);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt accepts checker-equivalent omitted receipts and canonicalizes the closed task", () => {
  const { root, goalDir } = makeBoard({ omitReceipts: true });
  try {
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], DONE_RECEIPT);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const board = parseGoalStateText(state, { allowFallback: false });
    const closed = board.tasks.find((task) => task.id === "T001");
    assert.equal(closed.status, "done");
    assert.equal(closed.receipt.result, "done");
    assert.equal(board.active_task, "T999");
    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(JSON.parse(check.stdout).ok, true, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt preserves receipt task and board identity losslessly", () => {
  const { root, goalDir } = makeBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const receipt = {
      ...DONE_RECEIPT,
      board_path: boardPath,
      evidence: [{ kind: "custom-proof", digest: "abc123", accepted: false }],
    };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const board = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    const storedReceipt = board.tasks.find((task) => task.id === "T001").receipt;
    assert.equal(storedReceipt.task_id, "T001");
    assert.equal(storedReceipt.board_path, boardPath);
    assert.deepEqual(storedReceipt.evidence, receipt.evidence);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt round-trips the complete admitted JSON-safe receipt value domain", () => {
  const { root, goalDir } = makeBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const payload = JSON.parse(`{
      "ambiguous_strings": ["0", "-0", "1e3", "true", "false", "null", "~", ""],
      "finite_numbers": [1e+21, 1e-7, -0, 42.5],
      "nested_arrays": [[["deep"], []], [1, [2, [3]]]],
      "first_nested_sequence_value": [{"first": [["nested"]], "after": "retained"}],
      "unsafe_keys": {
        "": "empty",
        "colon:key": "colon",
        "space key": "space",
        "__proto__": {"polluted": false}
      }
    }`);
    payload.ambiguous_strings.push("hash # retained", 'escaped \\" quote # retained', "line\nbreak", "trailing\\");
    Object.defineProperty(payload.unsafe_keys, "line\nbreak: # key", {
      value: "quoted key retained",
      enumerable: true,
      configurable: true,
      writable: true,
    });
    payload.finite_numbers[2] = -0;
    const receipt = {
      ...DONE_RECEIPT,
      board_path: boardPath,
      evidence: [{
        kind: "json-safe-inverse",
        toString: "shadowed own toString remains data",
        valueOf: "shadowed own valueOf remains data",
        payload,
      }],
    };
    const receiptText = JSON.stringify(receipt).replace(
      '"finite_numbers":[1e+21,1e-7,0,42.5]',
      '"finite_numbers":[1e+21,1e-7,-0,42.5]',
    );
    const expectedReceipt = JSON.parse(receiptText);
    const receiptPath = join(root, "receipt.json");
    writeFileSync(receiptPath, receiptText);
    const digest = createHash("sha256").update(readFileSync(boardPath)).digest("hex");

    const result = spawnSync(process.execPath, [
      script,
      "docs/goals/one",
      "--task", "T001",
      "--receipt", receiptPath,
      "--expected-state-digest", digest,
      "--activate", "T999",
      "--json",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const board = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    const storedReceipt = board.tasks.find((task) => task.id === "T001").receipt;
    assert.deepEqual(storedReceipt, expectedReceipt);
    assert.equal(Object.is(storedReceipt.evidence[0].payload.finite_numbers[2], -0), true);
    assert.equal(Object.hasOwn(storedReceipt.evidence[0].payload.unsafe_keys, "__proto__"), true);
    assert.equal(Object.getPrototypeOf(storedReceipt.evidence[0].payload.unsafe_keys), Object.prototype);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects contradictory receipt identity without writing", () => {
  for (const receipt of [
    { ...DONE_RECEIPT, task_id: "T999" },
    { ...DONE_RECEIPT, board_path: "/tmp/a-different-goal/state.yaml" },
  ]) {
    const { root, goalDir } = makeBoard();
    try {
      const boardPath = join(goalDir, "state.yaml");
      const before = readFileSync(boardPath, "utf8");
      const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
      assert.equal(result.status, 1, result.stdout);
      assert.match(failureText(result), /Receipt (?:task_id|board_path)/);
      assert.equal(readFileSync(boardPath, "utf8"), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("apply-receipt rejects a stale expected board digest without writing", () => {
  const { root, goalDir } = makeBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const result = runApply(root, ["--task", "T001", "--expected-state-digest", "0".repeat(64), "--activate", "T999"], DONE_RECEIPT);
    assert.equal(result.status, 1, result.stdout);
    assert.match(failureText(result), /state\.yaml digest drift/);
    assert.equal(readFileSync(boardPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt requires a digest for every canonical typed transition", () => {
  const { root, goalDir } = makeBoard();
  try {
    const receiptPath = join(root, "receipt.json");
    writeFileSync(receiptPath, JSON.stringify(DONE_RECEIPT));
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const result = spawnSync(process.execPath, [script, "docs/goals/one", "--task", "T001", "--receipt", receiptPath, "--activate", "T999", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(failureText(result), /requires --expected-state-digest/);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary receipt admission rejects the lifecycle matrix without changing board bytes", () => {
  const cases = [
    {
      name: "omitted successor",
      args: ["--task", "T001"],
      receipt: DONE_RECEIPT,
      errorCode: "SUCCESSOR_NOT_QUEUED",
    },
    {
      name: "successor none",
      args: ["--task", "T001", "--activate", "none"],
      receipt: DONE_RECEIPT,
      errorCode: "SUCCESSOR_NOT_QUEUED",
    },
    {
      name: "self successor",
      args: ["--task", "T001", "--activate", "T001"],
      receipt: DONE_RECEIPT,
      errorCode: "SUCCESSOR_NOT_QUEUED",
    },
    {
      name: "removed status flag",
      args: ["--task", "T001", "--activate", "T999", "--status", "done"],
      receipt: DONE_RECEIPT,
      errorCode: "INVALID_ARGUMENT",
    },
    {
      name: "missing receipt identity",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: { ...DONE_RECEIPT, board_path: undefined },
      errorCode: "RECEIPT_IDENTITY_MISMATCH",
    },
    {
      name: "unknown receipt result",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: { ...DONE_RECEIPT, result: "skipped" },
      errorCode: "INVALID_ARGUMENT",
    },
    {
      name: "unknown successor",
      args: ["--task", "T001", "--activate", "T002"],
      receipt: DONE_RECEIPT,
      errorCode: "SUCCESSOR_NOT_QUEUED",
    },
    {
      name: "failed dispatch envelope",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: { ok: false, receipt: DONE_RECEIPT, scope_check: { status: "violations" } },
      errorCode: "DISPATCH_SCOPE_FAILED",
    },
    {
      name: "scope-violating dispatch envelope",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: { ok: true, receipt: DONE_RECEIPT, scope_check: { status: "violations" } },
      errorCode: "DISPATCH_SCOPE_FAILED",
    },
    {
      name: "non-current source",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: DONE_RECEIPT,
      errorCode: "TASK_NOT_CURRENT_ACTIVE",
      mutate(text) {
        return text
          .replace("active_task: T001", "active_task: T999")
          .replace('    status: active\n    objective: "Adjust the widget."', '    status: queued\n    objective: "Adjust the widget."')
          .replace('    status: queued\n    objective: "Audit the outcome."', '    status: active\n    objective: "Audit the outcome."');
      },
    },
    {
      name: "done successor",
      args: ["--task", "T001", "--activate", "T999"],
      receipt: DONE_RECEIPT,
      errorCode: "SUCCESSOR_NOT_QUEUED",
      mutate(text) {
        return text.replace(
          '    status: queued\n    objective: "Audit the outcome."\n    receipt: null',
          '    status: done\n    objective: "Audit the outcome."\n    receipt:\n      result: done\n      decision: approved\n      summary: "Prior audit completed."',
        );
      },
    },
  ];

  for (const scenario of cases) {
    const { root } = makeBoard();
    try {
      const statePath = join(root, "docs", "goals", "one", "state.yaml");
      if (scenario.mutate) writeFileSync(statePath, scenario.mutate(readFileSync(statePath, "utf8")));
      const before = readFileSync(statePath, "utf8");
      const result = runApply(root, scenario.args, scenario.receipt);
      const report = failureReport(result);
      assert.equal(report.error_code, scenario.errorCode, scenario.name);
      assert.equal(result.stderr, "", scenario.name);
      assert.equal(result.stdout.trim().split("\n").length, 1, scenario.name);
      assert.equal(readFileSync(statePath, "utf8"), before, scenario.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("apply-receipt adds exact amendment tasks, closes the current task, and activates the successor atomically", () => {
  const { root, goalDir } = makeBoard();
  try {
    const result = runApply(root, ["--task", "T001", "--activate", "T046"], DONE_RECEIPT, AMENDMENT_TASKS);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.added_task_ids, ["T046", "T047"]);

    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T046/);
    assert.match(state, /- id: T046[\s\S]*status: active/);
    assert.match(state, /- id: T047[\s\S]*status: queued/);
    assert.match(state, /allowed_files:\n      - src\/widget\.mjs\n      - test\/widget\.test\.mjs/);
    assert.match(state, /objective: "Implement the exact amended slice without truncating this deliberately long task payload\."/);
    const board = parseGoalStateText(state, { allowFallback: false });
    assert.equal(board.tasks.find((task) => task.id === "T046").receipt, null);
    assert.equal(board.tasks.find((task) => task.id === "T047").receipt, null);

    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(JSON.parse(check.stdout).ok, true, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt hydrates an existing Worker placeholder from one exact task card and activates it atomically", () => {
  const { root, goalDir } = makeBoard({ placeholder: true });
  try {
    const result = runApply(root, ["--task", "T001", "--hydrate-task", "T042", "--activate", "T042"], DONE_RECEIPT, null, HYDRATED_T042);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.hydrated_task_id, "T042");
    assert.equal(report.hydration_source, "task_card");
    assert.equal(report.hydration_sha256, createHash("sha256").update(JSON.stringify(HYDRATED_T042)).digest("hex"));
    assert.deepEqual(report.added_task_ids, []);

    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T042/);
    assert.match(state, /- id: T042[\s\S]*status: active/);
    assert.match(state, /objective: "Run the exact approved local pilot packet\."/);
    assert.match(state, /allowed_files:\n      - src\/pilot\.mjs/);
    assert.match(state, /constraints:\n      - "Keep the operation local\."\n      - "Use the hash-bound packet\."/);
    assert.doesNotMatch(state, /approval_phrase|approval_phrases|boundary_classification/);
    assert.doesNotMatch(state, /Provisional worker/);
    assert.doesNotMatch(state, /provisional card has not been replaced/);
    assert.equal(parseGoalStateText(state, { allowFallback: false }).tasks.find((task) => task.id === "T042").receipt, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("activating an unhydrated Worker placeholder fails closed with exact atomic retry guidance", () => {
  const { root, goalDir } = makeBoard({ placeholder: true });
  try {
    const statePath = join(goalDir, "state.yaml");
    const before = readFileSync(statePath, "utf8");
    const result = runApply(root, ["--task", "T001", "--activate", "T042"], DONE_RECEIPT);
    const report = failureReport(result);
    assert.equal(report.error_code, "CHECKER_FAILED");
    assert.match(
      report.error,
      /state\.yaml is unchanged\. Retry the same atomic receipt transition with --hydrate-task T042 --task-card <file> --task-card-sha256 <hex> --activate T042/,
    );
    assert.equal(report.mutation.board, "unchanged");
    assert.equal(report.mutation.before_digest, report.mutation.after_digest);
    assert.equal(readFileSync(statePath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt hydrates a placeholder from the exact Judge worker_package", () => {
  const { root, goalDir } = makeBoard({ placeholder: true, sourceType: "judge" });
  try {
    const workerPackage = {
      objective: "Run the receipt-selected Worker package.",
      allowed_files: ["src/pilot.mjs"],
      verify: ["npm test", "npm run lint", "git diff --check"],
      stop_if: ["Need files outside allowed_files."],
    };
    const judgeReceipt = {
      result: "done",
      task_id: "T001",
      board_path: "docs/goals/one/state.yaml",
      decision: "approved",
      full_outcome_complete: false,
      rationale: "The package is bounded and ready.",
      evidence: ["Reviewed the exact package."],
      worker_package: workerPackage,
      harness: "codex",
    };
    const result = runApply(root, ["--task", "T001", "--hydrate-task", "T042", "--activate", "T042"], judgeReceipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.hydration_source, "receipt_worker_package");
    assert.match(report.hydration_sha256, /^[a-f0-9]{64}$/);
    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /objective: "Run the receipt-selected Worker package\."/);
    assert.match(state, /verify:\n      - "npm test"\n      - "npm run lint"\n      - "git diff --check"/);
    assert.match(state, /constraints:\n      - "Keep the operation local\."/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects task-card id mismatch, populated Worker packages, and unknown fields without writing", () => {
  for (const testCase of [
    { name: "id mismatch", board: { placeholder: true }, card: { ...HYDRATED_T042, id: "T043" }, pattern: /does not match --hydrate-task T042/ },
    { name: "source cannot be its own hydrated successor", board: {}, card: { ...HYDRATED_T042, id: "T001", status: "active" }, hydrate: "T001", pattern: /distinct from the source/ },
    { name: "populated Worker package", board: { populatedWorker: true }, card: { ...HYDRATED_T042, id: "T043" }, hydrate: "T043", pattern: /not a placeholder: allowed_files is already populated/ },
    { name: "unsupported field", board: { placeholder: true }, card: { ...HYDRATED_T042, arbitrary_board_edit: true }, pattern: /unsupported fields: arbitrary_board_edit/ },
    { name: "product approval phrase", board: { placeholder: true }, card: { ...HYDRATED_T042, approval_phrase: "Approve production." }, pattern: /unsupported fields: approval_phrase/ },
    { name: "product approval phrases", board: { placeholder: true }, card: { ...HYDRATED_T042, approval_phrases: ["Approve production."] }, pattern: /unsupported fields: approval_phrases/ },
    { name: "product boundary classification", board: { placeholder: true }, card: { ...HYDRATED_T042, boundary_classification: "production" }, pattern: /unsupported fields: boundary_classification/ },
  ]) {
    const { root, goalDir } = makeBoard(testCase.board);
    try {
      const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
      const hydrate = testCase.hydrate ?? "T042";
      const result = runApply(root, ["--task", "T001", "--hydrate-task", hydrate, "--activate", hydrate], DONE_RECEIPT, null, testCase.card);
      assert.equal(result.status, 1, `${testCase.name}: ${result.stdout}`);
      assert.match(failureText(result), testCase.pattern);
      assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("apply-receipt rejects a task card whose bytes do not match the approved SHA-256", () => {
  const { root, goalDir } = makeBoard({ placeholder: true });
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const result = runApply(root, ["--task", "T001", "--hydrate-task", "T042", "--activate", "T042"], DONE_RECEIPT, null, HYDRATED_T042, "0".repeat(64));
    assert.equal(result.status, 1, result.stdout);
    assert.match(failureText(result), /SHA-256 mismatch/);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt restores the original board when hydrated content fails the checker", () => {
  const { root, goalDir } = makeBoard({ placeholder: true });
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const invalidReceipt = { ...DONE_RECEIPT, commands: [{ cmd: "npm test", status: "fail" }] };
    const result = runApply(root, ["--task", "T001", "--hydrate-task", "T042", "--activate", "T042"], invalidReceipt, null, HYDRATED_T042);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(JSON.parse(result.stdout).error_code, "RECEIPT_SCHEMA_INVALID");
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects duplicate amendment task ids before writing", () => {
  const { root, goalDir } = makeBoard();
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], DONE_RECEIPT, [
      { ...AMENDMENT_TASKS[0], id: "T999" },
    ]);
    assert.equal(result.status, 1, result.stdout);
    assert.match(failureText(result), /Task T999 already exists/);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt restores the original board when an amendment successor is invalid", () => {
  const { root, goalDir } = makeBoard();
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const result = runApply(root, ["--task", "T001", "--activate", "T404"], DONE_RECEIPT, AMENDMENT_TASKS);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt reverts the board when the transition is invalid", () => {
  const { root, goalDir } = makeBoard();
  try {
    const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
    const badReceipt = { ...DONE_RECEIPT, commands: [{ cmd: "npm test", status: "fail" }] };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], badReceipt);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.error_code, "RECEIPT_SCHEMA_INVALID");
    assert.equal(report.mutation.board, "unchanged");
    assert.equal(report.mutation.product, "none_observed");
    assert.equal(report.mutation.receipt_applied, false);
    assert.equal(report.mutation.before_digest, report.mutation.after_digest);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects out-of-scope work with typed successor recovery guidance", () => {
  const { root, goalDir } = makeBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const receipt = {
      ...DONE_RECEIPT,
      changed_files: ["src/widget.mjs", "src/outside.mjs"],
    };

    const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "CHECKER_FAILED");
    assert.match(report.error, /Do not widen or retry the active task/);
    assert.match(report.error, /apply_amendment/);
    assert.match(report.error, /apply_hydration/);
    assert.match(report.error, /fully scoped successor/);
    assert.equal(readFileSync(boardPath, "utf8"), before);

    const human = spawnSync(process.execPath, [
      script,
      "docs/goals/one",
      "--task",
      "T001",
      "--receipt",
      join(root, "receipt.json"),
      "--expected-state-digest",
      createHash("sha256").update(before).digest("hex"),
      "--activate",
      "T999",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(human.status, 1, human.stderr || human.stdout);
    assert.match(human.stderr, /^CHECKER_FAILED:/);
    assert.match(human.stderr, /apply_amendment/);
    assert.match(human.stderr, /apply_hydration/);
    assert.equal(readFileSync(boardPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects done receipts that do not cover every declared verification command", () => {
  const cases = [
    {
      name: "missing commands",
      commands: [{ cmd: "npm test", status: "pass" }],
    },
    {
      name: "unrelated passing command",
      commands: [{ cmd: "true", status: "pass" }],
    },
    {
      name: "renamed command",
      commands: [
        { cmd: "npm test -- --run", status: "pass" },
        { cmd: "npm run lint", status: "pass" },
        { cmd: "git diff --check", status: "pass" },
      ],
    },
  ];

  for (const testCase of cases) {
    const { root, goalDir } = makeBoard();
    try {
      const before = readFileSync(join(goalDir, "state.yaml"), "utf8");
      const receipt = { ...DONE_RECEIPT, commands: testCase.commands };
      const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
      assert.equal(result.status, 1, `${testCase.name}: ${result.stdout}`);
      const report = JSON.parse(result.stdout);
      assert.equal(report.ok, false, testCase.name);
      assert.equal(report.error_code, "RECEIPT_SCHEMA_INVALID", testCase.name);
      assert.match(report.error, /missing passing (?:declared )?verification command/i, testCase.name);
      assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before, testCase.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("apply-receipt allows extra passing commands after all declared verification commands pass", () => {
  const { root } = makeBoard();
  try {
    const receipt = {
      ...DONE_RECEIPT,
      commands: [...DONE_RECEIPT.commands, { cmd: "node --version", status: "pass" }],
    };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], receipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt accepts a dispatch report and defaults status from the receipt", () => {
  const { root, goalDir } = makeBoard();
  try {
    const dispatchReport = { ok: true, harness: "codex", receipt: DONE_RECEIPT, scope_check: { status: "clean" } };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], dispatchReport);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /active_task: T999/);
    assert.match(state, /summary: "widget adjusted"/);
    const t001 = state.slice(state.indexOf("- id: T001"), state.indexOf("- id: T999"));
    assert.match(t001, /status: done/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt never deletes a user-authored dispatch report outside GoalBuddy's Git-local transport", () => {
  const { root, goalDir } = makeBoard();
  try {
    const receiptPath = join(root, "receipt.json");
    const dispatchReport = {
      ok: true,
      harness: "codex",
      receipt: DONE_RECEIPT,
      scope_check: { status: "clean" },
      report_path: receiptPath,
      report_transport: {
        kind: "git_local_ephemeral_v1",
        status: "ready",
        path: receiptPath,
        authority: "transport_only",
      },
    };
    const result = runApply(root, ["--task", "T001", "--activate", "T999"], dispatchReport);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.report_transport_cleanup.removed, false);
    assert.equal(existsSync(receiptPath), true);
    assert.match(readFileSync(join(goalDir, "state.yaml"), "utf8"), /active_task: T999/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exact-human wait and reply are atomic, strict, durable, and final-receipt safe", () => {
  const { root, goalDir } = makeBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const requiredReply = "Approve  T001 exactly";
    const waitReceipt = {
      result: "blocked",
      task_id: "T001",
      board_path: boardPath,
      waiting_for_user_approval: true,
      required_reply: requiredReply,
      blocked_reason: "The exact owner string is required.",
      summary: "Waiting once without claiming identity or authorization.",
      evidence: [{ kind: "inert-custom-evidence", retained: true }],
    };
    const before = readFileSync(boardPath, "utf8");
    const beforeDigest = createHash("sha256").update(before).digest("hex");
    const wait = runWait(root, ["--task", "T001", "--expected-state-digest", beforeDigest], waitReceipt);
    assert.equal(wait.status, 0, wait.stderr || wait.stdout);
    const waitReport = JSON.parse(wait.stdout);
    assert.equal(waitReport.mode, "wait");
    assert.equal(waitReport.no_change, false);

    const waitingState = readFileSync(boardPath, "utf8");
    const waitingDigest = createHash("sha256").update(waitingState).digest("hex");
    const waitingBoard = parseGoalStateText(waitingState, { allowFallback: false });
    assert.equal(waitingBoard.goal.status, "blocked");
    assert.equal(waitingBoard.active_task, null);
    assert.equal(waitingBoard.tasks.find((task) => task.id === "T001").status, "blocked");
    assert.deepEqual(waitingBoard.tasks.find((task) => task.id === "T001").receipt, waitReceipt);
    assert.equal(waitingBoard.tasks.find((task) => task.id === "T999").status, "queued");

    for (const reply of ["approve  T001 exactly", "Approve T001 exactly", `${requiredReply} `]) {
      const mismatch = runReply(root, ["--task", "T001", "--expected-state-digest", waitingDigest], { reply });
      assert.equal(mismatch.status, 0, mismatch.stderr || mismatch.stdout);
      const mismatchReport = JSON.parse(mismatch.stdout);
      assert.equal(mismatchReport.ok, true);
      assert.equal(mismatchReport.mode, "reply");
      assert.equal(mismatchReport.task_id, "T001");
      assert.equal(mismatchReport.exact_match, false);
      assert.equal(mismatchReport.no_change, true);
      assert.equal(mismatchReport.before_digest, waitingDigest);
      assert.equal(mismatchReport.after_digest, waitingDigest);
      assert.equal(mismatchReport.mutation.board, "unchanged");
      assert.equal(readFileSync(boardPath, "utf8"), waitingState);
    }

    for (const testCase of [
      { name: "stale digest", args: ["--task", "T001", "--expected-state-digest", "0".repeat(64)], payload: { reply: requiredReply } },
      { name: "wrong task", args: ["--task", "T999", "--expected-state-digest", waitingDigest], payload: { reply: requiredReply } },
      { name: "extra reply field", args: ["--task", "T001", "--expected-state-digest", waitingDigest], payload: { reply: requiredReply, authority: true } },
      { name: "non-string reply", args: ["--task", "T001", "--expected-state-digest", waitingDigest], payload: { reply: 42 } },
    ]) {
      const rejected = runReply(root, testCase.args, testCase.payload);
      assert.equal(rejected.status, 1, `${testCase.name}: ${rejected.stdout}`);
      assert.equal(readFileSync(boardPath, "utf8"), waitingState, testCase.name);
    }

    const exact = runReply(root, ["--task", "T001", "--expected-state-digest", waitingDigest], { reply: requiredReply });
    assert.equal(exact.status, 0, exact.stderr || exact.stdout);
    const exactReport = JSON.parse(exact.stdout);
    assert.equal(exactReport.exact_match, true);
    assert.equal(exactReport.wait_board_digest, waitingDigest);
    const resumedState = readFileSync(boardPath, "utf8");
    const resumedBoard = parseGoalStateText(resumedState, { allowFallback: false });
    const resumedTask = resumedBoard.tasks.find((task) => task.id === "T001");
    assert.equal(resumedBoard.goal.status, "active");
    assert.equal(resumedBoard.active_task, "T001");
    assert.equal(resumedTask.status, "active");
    assert.equal(resumedTask.receipt, null);
    assert.equal(resumedBoard.tasks.find((task) => task.id === "T999").status, "queued");
    const evidence = resumedTask.transition_evidence.exact_human_replies[0];
    assert.deepEqual(evidence.wait_receipt, waitReceipt);
    assert.equal(evidence.wait_board_digest, waitingDigest);
    assert.equal(evidence.required_reply_sha256, createHash("sha256").update(requiredReply).digest("hex"));
    assert.equal(evidence.reply_sha256, evidence.required_reply_sha256);
    assert.equal(evidence.exact_match, true);

    const replay = runReply(root, ["--task", "T001", "--expected-state-digest", exactReport.after_digest], { reply: requiredReply });
    assert.equal(replay.status, 1, replay.stdout);
    assert.equal(readFileSync(boardPath, "utf8"), resumedState);

    const secondWaitReceipt = {
      ...waitReceipt,
      required_reply: "Approve T001 again exactly",
      summary: "A second exact wait proves prior copied receipts survive another evidence rewrite.",
    };
    const secondWait = runWait(root, ["--task", "T001", "--expected-state-digest", exactReport.after_digest], secondWaitReceipt);
    assert.equal(secondWait.status, 0, secondWait.stderr || secondWait.stdout);
    const secondWaitReport = JSON.parse(secondWait.stdout);
    const secondReply = runReply(root, ["--task", "T001", "--expected-state-digest", secondWaitReport.after_digest], { reply: secondWaitReceipt.required_reply });
    assert.equal(secondReply.status, 0, secondReply.stderr || secondReply.stdout);
    const secondReplyReport = JSON.parse(secondReply.stdout);
    const resumedAgain = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    const copiedReplies = resumedAgain.tasks.find((task) => task.id === "T001").transition_evidence.exact_human_replies;
    assert.equal(copiedReplies.length, 2);
    assert.deepEqual(copiedReplies[0], evidence);
    assert.deepEqual(copiedReplies[1].wait_receipt, secondWaitReceipt);

    const bindingReport = bindCodexWorkerSession({
      goalRoot: goalDir,
      taskId: "T001",
      expectedStateDigest: secondReplyReport.after_digest,
      allowImmutableHistory: false,
    }, {
      harness: "codex",
      session_id: "019f6dab-7b25-7620-9da6-4f79a0648146",
      task_id: "T001",
      board_path_sha256: "1".repeat(64),
      workspace_root_sha256: "2".repeat(64),
      codex_home_sha256: "3".repeat(64),
      dispatch_contract_sha256: "4".repeat(64),
      model: "gpt-5.6-sol",
      reasoning_effort: "medium",
      service_tier: "fast",
      sandbox: "danger-full-access",
      brief_path: null,
      brief_sha256: null,
      launch_state_digest: secondReplyReport.after_digest,
    });
    assert.equal(bindingReport.ok, true, JSON.stringify(bindingReport));
    const boundBoard = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    const boundEvidence = boundBoard.tasks.find((task) => task.id === "T001").transition_evidence;
    assert.deepEqual(boundEvidence.exact_human_replies, copiedReplies);
    assert.equal(boundEvidence.codex_worker_session.session_id, "019f6dab-7b25-7620-9da6-4f79a0648146");

    const final = runApply(root, ["--task", "T001", "--activate", "T999"], DONE_RECEIPT);
    assert.equal(final.status, 0, final.stderr || final.stdout);
    const finalBoard = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    const finalTask = finalBoard.tasks.find((task) => task.id === "T001");
    assert.equal(finalTask.receipt.result, "done");
    assert.deepEqual(finalTask.transition_evidence.exact_human_replies, copiedReplies);

    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exact-human wait rejects malformed entry conditions without writing", () => {
  const cases = [
    { name: "missing digest", args: ["--task", "T001"], receipt: null },
    { name: "missing identity", args: null, receipt: { result: "blocked", waiting_for_user_approval: true, required_reply: "Exact" } },
    { name: "empty reply", args: null, receipt: { result: "blocked", task_id: "T001", waiting_for_user_approval: true, required_reply: "" } },
    { name: "completion claim", args: null, receipt: { result: "blocked", task_id: "T001", waiting_for_user_approval: true, required_reply: "Exact", full_outcome_complete: true } },
  ];
  for (const testCase of cases) {
    const { root, goalDir } = makeBoard();
    try {
      const boardPath = join(goalDir, "state.yaml");
      const before = readFileSync(boardPath, "utf8");
      const digest = createHash("sha256").update(before).digest("hex");
      const receipt = { ...(testCase.receipt || { result: "blocked", task_id: "T001", waiting_for_user_approval: true, required_reply: "Exact" }) };
      if (!Object.hasOwn(receipt, "board_path") && testCase.name !== "missing identity") receipt.board_path = boardPath;
      const args = testCase.args || ["--task", "T001", "--expected-state-digest", digest];
      const result = runWait(root, args, receipt);
      assert.equal(result.status, 1, testCase.name);
      assert.equal(readFileSync(boardPath, "utf8"), before, testCase.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("complete closes the active audit and goal atomically while preserving transition evidence", () => {
  const { root, goalDir } = makeCompletionBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const beforeDigest = createHash("sha256").update(before).digest("hex");
    const receipt = {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "complete",
      full_outcome_complete: true,
      rationale: "Current receipts and verification satisfy the original oracle.",
      evidence: ["Current verification and transition evidence."],
      summary: "The complete goal outcome is proven.",
    };
    const result = runComplete(root, ["--task", "T999", "--expected-state-digest", beforeDigest], receipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "complete");
    assert.equal(report.active_task, null);

    const finalText = readFileSync(boardPath, "utf8");
    const board = parseGoalStateText(finalText, { allowFallback: false });
    const task = board.tasks.find((candidate) => candidate.id === "T999");
    assert.equal(board.goal.status, "done");
    assert.equal(board.active_task, null);
    assert.equal(task.status, "done");
    assert.deepEqual(task.receipt, receipt);
    assert.deepEqual(task.transition_evidence, { marker: "kept" });
    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout);

    const replay = runComplete(root, ["--task", "T999", "--expected-state-digest", report.after_digest], receipt);
    assert.equal(replay.status, 1, replay.stdout);
    assert.equal(readFileSync(boardPath, "utf8"), finalText);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completion preserves byte-identical done history while admitting only its exact legacy checker errors", () => {
  const { root, goalDir } = makeCompletionBoard({ legacyDecision: true });
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const historicalBefore = before.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0];
    const beforeDigest = createHash("sha256").update(before).digest("hex");
    const baselineCheck = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(baselineCheck.status, 1);
    const baselineErrors = JSON.parse(baselineCheck.stdout).errors;
    assert.equal(baselineErrors.length, 1);

    const receipt = {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "complete",
      full_outcome_complete: true,
      rationale: "Current receipts and verification satisfy the original oracle.",
      evidence: ["Current verification and transition evidence."],
      summary: "The live outcome is complete without rewriting old history.",
    };
    const implicit = runComplete(root, ["--task", "T999", "--expected-state-digest", beforeDigest], receipt);
    assert.equal(implicit.status, 1);
    assert.match(JSON.parse(implicit.stdout).error, /explicit --allow-immutable-history/);
    assert.equal(readFileSync(boardPath, "utf8"), before);

    const result = runComplete(root, ["--task", "T999", "--expected-state-digest", beforeDigest, "--allow-immutable-history"], receipt);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.checker_status, "immutable_history_compatible");
    assert.equal(report.immutable_history.baseline_error_count, 1);
    assert.deepEqual(report.immutable_history.preserved_task_ids, ["T007"]);
    assert.equal(report.immutable_history.historical_task_bytes_unchanged, true);

    const after = readFileSync(boardPath, "utf8");
    assert.equal(after.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0], historicalBefore);
    const afterCheck = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(afterCheck.status, 1);
    assert.deepEqual(JSON.parse(afterCheck.stdout).errors, baselineErrors);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("immutable-history compatibility rejects checker errors that touch the live tail", () => {
  const { root, goalDir } = makeCompletionBoard({ legacyDecision: true, liveTailError: true });
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const digest = createHash("sha256").update(before).digest("hex");
    const result = runComplete(root, ["--task", "T999", "--expected-state-digest", digest, "--allow-immutable-history"], {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "complete",
      full_outcome_complete: true,
      rationale: "The live task would be invalid even with complete audit proof.",
      evidence: ["Current verification and transition evidence."],
      summary: "This must be rejected because the live task is invalid.",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /live or missing task T999/);
    assert.equal(readFileSync(boardPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt transition works on a checker-tolerated legacy dialect without strict-parser coercion", () => {
  const { root, goalDir } = makeCompletionBoard({ legacyDecision: true, legacyDialect: true, extraQueued: true });
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    assert.doesNotThrow(() => parseGoalStateText(before, { allowFallback: false }));
    const historicalBefore = before.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0];
    const digest = createHash("sha256").update(before).digest("hex");
    const result = runApply(root, ["--task", "T999", "--activate", "T998", "--expected-state-digest", digest, "--allow-immutable-history"], {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "approved",
      rationale: "The current audit supports the declared successor.",
      evidence: ["Current audit evidence."],
      summary: "The current audit closed and selected the already-declared successor.",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.checker_status, "immutable_history_compatible");
    assert.deepEqual(report.immutable_history.preserved_task_ids, ["T007"]);
    const after = readFileSync(boardPath, "utf8");
    assert.equal(after.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0], historicalBefore);
    assert.match(after, /active_task: T998/);
    assert.doesNotThrow(() => parseGoalStateText(after, { allowFallback: false }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("strict candidate projection rejects checker-admitted unsupported YAML without changing bytes or digest", () => {
  const { root, goalDir } = makeCompletionBoard({ legacyDecision: true, legacyDialect: true, extraQueued: true });
  try {
    const boardPath = join(goalDir, "state.yaml");
    const unsupported = readFileSync(boardPath, "utf8").replace(
      "      evidence:\n      - kind: legacy-indentation\n",
      "      evidence:\n       - kind: legacy-indentation\n",
    );
    writeFileSync(boardPath, unsupported);
    const before = readFileSync(boardPath, "utf8");
    const beforeDigest = createHash("sha256").update(before).digest("hex");
    const baselineCheck = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(JSON.parse(baselineCheck.stdout).errors.length, 1, baselineCheck.stdout);
    assert.throws(() => parseGoalStateText(before, { allowFallback: false }), /odd indentation/);

    const result = runApply(root, [
      "--task", "T999",
      "--activate", "T998",
      "--expected-state-digest", beforeDigest,
      "--allow-immutable-history",
    ], {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "approved",
      rationale: "The current audit supports the declared successor.",
      evidence: ["Current audit evidence."],
      summary: "The current audit closed and selected the already-declared successor.",
    });

    const report = failureReport(result);
    assert.match(report.error, /strict(?:ly)? (?:parse|resum)/i);
    assert.equal(report.before_digest, beforeDigest);
    assert.equal(report.after_digest, beforeDigest);
    assert.equal(report.mutation.board, "unchanged");
    assert.equal(readFileSync(boardPath, "utf8"), before);
    assert.equal(createHash("sha256").update(readFileSync(boardPath)).digest("hex"), beforeDigest);
    assert.equal(existsSync(join(root, "receipt.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebind updates only checks.goalbuddy_binding under the same immutable-history proof", () => {
  const { root, goalDir } = makeCompletionBoard({ legacyDecision: true, legacyDialect: true });
  try {
    const boardPath = join(goalDir, "state.yaml");
    addExistingGoalbuddyBinding(boardPath);
    const { binding, installedCheckerPaths } = makeBindingProof(root);
    const before = readFileSync(boardPath, "utf8");
    const historicalBefore = before.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0];
    const digest = createHash("sha256").update(before).digest("hex");

    const badInstalledChecker = join(root, "installed", "bad-checker.mjs");
    writeFileSync(badInstalledChecker, "different bytes\n");
    const rejected = runRebind(root, ["--expected-state-digest", digest, "--allow-immutable-history"], binding, [badInstalledChecker]);
    assert.equal(rejected.status, 1);
    assert.match(failureText(rejected), /Installed checker bytes do not match binding/);
    assert.equal(readFileSync(boardPath, "utf8"), before);

    const result = runRebind(root, ["--expected-state-digest", digest, "--allow-immutable-history"], binding, installedCheckerPaths);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "rebind");
    assert.equal(report.checker_status, "immutable_history_compatible");
    assert.equal(report.binding.installed_checker_count, 2);
    assert.deepEqual(report.immutable_history.preserved_task_ids, ["T007"]);

    const after = readFileSync(boardPath, "utf8");
    assert.equal(after.match(/  - id: T007[\s\S]*?(?=  - id: T999)/)?.[0], historicalBefore);
    assert.equal(after.includes(`source_root: ${binding.source_root}`), true);
    assert.equal(after.includes(`accepted_commit: ${binding.accepted_commit}`), true);
    assert.equal(after.includes(`checker_sha256: ${binding.checker_sha256}`), true);
    assert.equal(after.includes("runtime_doctor_goal_ready: true"), true);
    const changedOutsideBinding = after
      .replace(/  goalbuddy_binding:[\s\S]*?(?=  last_verification:)/, "")
      .replace(/  goalbuddy_binding:[\s\S]*?(?=  last_verification:)/, "");
    const beforeOutsideBinding = before.replace(/  goalbuddy_binding:[\s\S]*?(?=  last_verification:)/, "");
    assert.equal(changedOutsideBinding, beforeOutsideBinding);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent same-digest completion writers serialize and cannot overwrite each other", async () => {
  const { root, goalDir } = makeCompletionBoard();
  try {
    const boardPath = join(goalDir, "state.yaml");
    const before = readFileSync(boardPath, "utf8");
    const beforeDigest = createHash("sha256").update(before).digest("hex");
    const firstReceipt = {
      result: "done",
      task_id: "T999",
      board_path: boardPath,
      decision: "complete",
      full_outcome_complete: true,
      rationale: "Current receipts and verification satisfy the original oracle.",
      evidence: ["Current verification and transition evidence."],
      summary: "The first serialized writer completed the goal.",
    };
    const secondReceipt = {
      ...firstReceipt,
      summary: "The competing writer must never overwrite the first.",
    };
    const firstReceiptPath = join(root, "first-final.json");
    const secondReceiptPath = join(root, "second-final.json");
    writeFileSync(firstReceiptPath, JSON.stringify(firstReceipt));
    writeFileSync(secondReceiptPath, JSON.stringify(secondReceipt));
    const transitionArgs = ["complete", "docs/goals/one", "--task", "T999", "--expected-state-digest", beforeDigest, "--json"];

    const firstChild = spawn(process.execPath, [script, ...transitionArgs.slice(0, 2), "--receipt", firstReceiptPath, ...transitionArgs.slice(2)], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GOALBUDDY_TEST_HOLD_LOCK_MS: "1000" },
    });
    const firstResultPromise = captureChild(firstChild);
    const lockPath = `${dirname(realpathSync(boardPath))}.goalbuddy-transition-lock`;
    waitForPath(lockPath);

    const secondResult = spawnSync(process.execPath, [script, ...transitionArgs.slice(0, 2), "--receipt", secondReceiptPath, ...transitionArgs.slice(2)], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(secondResult.status, 1, secondResult.stdout);
    const secondFailure = failureReport(secondResult);
    assert.equal(secondFailure.error_code, "TRANSITION_LOCK_BUSY");
    assert.match(secondFailure.error, /Another GoalBuddy transition is already in progress/);
    assert.match(secondFailure.next_action, /Wait.*resume.*fresh state digest/i);

    const firstResult = await firstResultPromise;
    assert.equal(firstResult.status, 0, firstResult.stderr || firstResult.stdout);
    const board = parseGoalStateText(readFileSync(boardPath, "utf8"), { allowFallback: false });
    assert.deepEqual(board.tasks.find((task) => task.id === "T999").receipt, firstReceipt);
    assert.equal(existsSync(lockPath), false);
    const check = spawnSync(process.execPath, [checker, goalDir], { encoding: "utf8" });
    assert.equal(check.status, 0, check.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete rejects unsafe or incomplete finalization without writing", () => {
  const cases = [
    { name: "stale digest", args: ["--task", "T999", "--expected-state-digest", "0".repeat(64)] },
    { name: "wrong task", args: ["--task", "T001"] },
    { name: "missing identity", receipt: { task_id: undefined, board_path: undefined } },
    { name: "incomplete receipt", receipt: { decision: "amend", full_outcome_complete: false } },
    { name: "non-audit task", board: { taskType: "worker" } },
    { name: "queued work remains", board: { extraQueued: true } },
  ];
  for (const testCase of cases) {
    const { root, goalDir } = makeCompletionBoard(testCase.board);
    try {
      const boardPath = join(goalDir, "state.yaml");
      const before = readFileSync(boardPath, "utf8");
      const digest = createHash("sha256").update(before).digest("hex");
      const receipt = {
        result: "done",
        task_id: "T999",
        board_path: boardPath,
        decision: "complete",
        full_outcome_complete: true,
        summary: "The complete goal outcome is proven.",
        ...testCase.receipt,
      };
      if (testCase.name === "missing identity") {
        delete receipt.task_id;
        delete receipt.board_path;
      }
      const args = testCase.args || ["--task", "T999"];
      if (!args.includes("--expected-state-digest")) args.push("--expected-state-digest", digest);
      const result = runComplete(root, args, receipt);
      assert.equal(result.status, 1, `${testCase.name}: ${result.stdout}`);
      assert.equal(readFileSync(boardPath, "utf8"), before, testCase.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
