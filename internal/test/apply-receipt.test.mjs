import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalStateText } from "../../goalbuddy/surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const script = resolve("goalbuddy/scripts/apply-receipt.mjs");
const checker = resolve("goalbuddy/scripts/check-goal-state.mjs");

function makeBoard({ placeholder = false, populatedWorker = false } = {}) {
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
  changed_files: ["src/widget.mjs"],
  commands: [
    { cmd: "npm test", status: "pass" },
    { cmd: "npm run lint", status: "pass" },
    { cmd: "git diff --check", status: "pass" },
  ],
  summary: "widget adjusted",
  harness: "codex",
};

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
  return spawnSync(process.execPath, [script, "docs/goals/one", "--receipt", receiptPath, ...taskArgs, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
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
      assert.match(result.stderr, /Receipt (?:task_id|board_path)/);
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
    assert.match(result.stderr, /state\.yaml digest drift/);
    assert.equal(readFileSync(boardPath, "utf8"), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt hydrates a placeholder from the exact Judge worker_package", () => {
  const { root, goalDir } = makeBoard({ placeholder: true });
  try {
    const workerPackage = {
      objective: "Run the receipt-selected Worker package.",
      allowed_files: ["src/pilot.mjs"],
      verify: ["npm test", "npm run lint", "git diff --check"],
      stop_if: ["Need files outside allowed_files."],
    };
    const result = runApply(root, ["--task", "T001", "--hydrate-task", "T042", "--activate", "T042"], { ...DONE_RECEIPT, worker_package: workerPackage });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.hydration_source, "receipt_worker_package");
    assert.match(report.hydration_sha256, /^[a-f0-9]{64}$/);
    const state = readFileSync(join(goalDir, "state.yaml"), "utf8");
    assert.match(state, /objective: "Run the receipt-selected Worker package\."/);
    assert.match(state, /verify:\n      - npm test\n      - npm run lint\n      - git diff --check/);
    assert.match(state, /constraints:\n      - "Keep the operation local\."/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("apply-receipt rejects task-card id mismatch, populated Worker packages, and unknown fields without writing", () => {
  for (const testCase of [
    { name: "id mismatch", board: { placeholder: true }, card: { ...HYDRATED_T042, id: "T043" }, pattern: /does not match --hydrate-task T042/ },
    { name: "non-placeholder", board: {}, card: { ...HYDRATED_T042, id: "T001", status: "active" }, hydrate: "T001", pattern: /not a queued receipt-free Worker placeholder/ },
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
      assert.match(result.stderr, testCase.pattern);
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
    assert.match(result.stderr, /SHA-256 mismatch/);
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
    assert.equal(JSON.parse(result.stdout).reverted, true);
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
    assert.match(result.stderr, /Task T999 already exists/);
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
    assert.ok(report.checker_errors.length > 0);
    assert.equal(readFileSync(join(goalDir, "state.yaml"), "utf8"), before);
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
      assert.match(report.checker_errors.join("\n"), /missing passing verification command/i, testCase.name);
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
