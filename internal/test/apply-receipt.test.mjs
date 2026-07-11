import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = resolve("goalbuddy/scripts/apply-receipt.mjs");
const checker = resolve("goalbuddy/scripts/check-goal-state.mjs");

function makeBoard() {
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

function runApply(root, args, receipt) {
  const receiptPath = join(root, "receipt.json");
  writeFileSync(receiptPath, JSON.stringify(receipt));
  return spawnSync(process.execPath, [script, "docs/goals/one", "--receipt", receiptPath, "--json", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

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
