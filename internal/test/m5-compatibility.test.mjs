import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { parseGoalStateText } from "../../goalbuddy/surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const cli = resolve("internal/cli/goal-maker.mjs");

function run(root, args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function historicalReceiptDigests(stateText) {
  const document = parseGoalStateText(stateText, { allowFallback: false });
  return Object.fromEntries(
    document.tasks
      .filter((task) => ["T000", "T001"].includes(task.id))
      .map((task) => [
        task.id,
        createHash("sha256").update(JSON.stringify(task.receipt)).digest("hex"),
      ]),
  );
}

test("a faithful 0.5 board resumes, advances, and recovers without rewriting historical receipts", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-m5-compatibility-"));
  try {
    const goalDir = join(root, "docs", "goals", "compat");
    mkdirSync(join(goalDir, "notes"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "receipts"), { recursive: true });
    writeFileSync(join(goalDir, "goal.md"), "# Compatibility journey\n");
    writeFileSync(join(root, "src", "legacy-a.mjs"), "export const legacyA = 1;\n");
    writeFileSync(join(root, "src", "legacy-b.mjs"), "export const legacyB = 1;\n");
    writeFileSync(join(root, "src", "current.mjs"), "export const current = 2;\n");
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(statePath, `version: 2
goal:
  title: "Compatibility journey"
  slug: "compat"
  kind: specific
  tranche: "Advance one current slice without migrating completed 0.5 history."
  status: active
  oracle:
    signal: "The current slice advances and every historical receipt remains exact."
    final_proof: "Fresh resume and frontier preserve the old receipts."
agents:
  scout: unknown
  worker: unknown
  judge: unknown
active_task: T002
tasks:
  - id: T000
    type: worker
    assignee: Worker
    status: done
    objective: "Preserve the first historical slice."
    allowed_files:
      - src/legacy-a.mjs
    verify:
      - node --check src/legacy-a.mjs
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      task_id: T000
      board_path: docs/goals/compat/state.yaml
      changed_files:
        - src/legacy-a.mjs
      commands:
        - cmd: node --check src/legacy-a.mjs
          status: pass
      summary: "Legacy value 001 and URL https://example.test/a:b remain strings."
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Preserve the second historical slice."
    allowed_files:
      - src/legacy-b.mjs
    verify:
      - node --check src/legacy-b.mjs
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      task_id: T001
      board_path: docs/goals/compat/state.yaml
      changed_files:
        - src/legacy-b.mjs
      commands:
        - cmd: node --check src/legacy-b.mjs
          status: pass
      summary: "Historical receipt B remains immutable."
      note: "M-G adjudication and receipt history"
  - id: T002
    type: worker
    assignee: Worker
    status: active
    objective: "Apply the current compatible slice."
    allowed_files:
      - src/current.mjs
    verify:
      - node --check src/current.mjs
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T003
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the compatibility result."
    receipt: null
`);
    writeFileSync(join(root, "receipts", "T002.json"), `${JSON.stringify({
      result: "done",
      task_id: "T002",
      board_path: "docs/goals/compat/state.yaml",
      changed_files: ["src/current.mjs"],
      commands: [{ cmd: "node --check src/current.mjs", status: "pass" }],
      summary: "The current compatible slice is complete.",
      harness: "codex",
    }, null, 2)}\n`);

    const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(git(["init", "-q"]).status, 0);
    assert.equal(git(["add", "-A"]).status, 0);
    assert.equal(git([
      "-c",
      "user.name=GoalBuddy Test",
      "-c",
      "user.email=goalbuddy@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "0.5 fixture",
    ]).status, 0);

    const beforeText = readFileSync(statePath, "utf8");
    const historicalBefore = historicalReceiptDigests(beforeText);
    const sourceBefore = readFileSync(join(root, "receipts", "T002.json"), "utf8");

    const resumed = run(root, ["resume", "docs/goals/compat", "--json"]);
    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    assert.equal(JSON.parse(resumed.stdout).board.active_task.id, "T002");
    const frontier = run(root, ["frontier", "docs/goals/compat", "--json"]);
    assert.equal(frontier.status, 0, frontier.stderr || frontier.stdout);
    assert.equal(JSON.parse(frontier.stdout).slice.id, "T002");

    const advanced = run(root, [
      "advance",
      "docs/goals/compat",
      "--task",
      "T002",
      "--source",
      "receipts/T002.json",
      "--closeout-authority",
      "original_role",
      "--activate",
      "T003",
      "--json",
    ]);
    assert.equal(advanced.status, 0, advanced.stderr || advanced.stdout);
    assert.equal(JSON.parse(advanced.stdout).frontier.slice.id, "T003");
    assert.equal(readFileSync(join(root, "receipts", "T002.json"), "utf8"), sourceBefore);

    const afterText = readFileSync(statePath, "utf8");
    assert.deepEqual(historicalReceiptDigests(afterText), historicalBefore);
    const afterDocument = parseGoalStateText(afterText, { allowFallback: false });
    for (const taskId of ["T000", "T001"]) {
      const task = afterDocument.tasks.find((candidate) => candidate.id === taskId);
      assert.equal(task.transition_evidence, undefined);
    }
    const current = afterDocument.tasks.find((task) => task.id === "T002");
    assert.equal(current.transition_evidence.receipt_provenance.kind, "goalbuddy_receipt_provenance_v1");
    assert.equal(afterDocument.active_task, "T003");

    const recovered = run(root, ["resume", "docs/goals/compat", "--json"]);
    assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
    assert.equal(JSON.parse(recovered.stdout).board.active_task.id, "T003");
    const recoveredFrontier = run(root, ["frontier", "docs/goals/compat", "--json"]);
    assert.equal(recoveredFrontier.status, 0, recoveredFrontier.stderr || recoveredFrontier.stdout);
    assert.equal(JSON.parse(recoveredFrontier.stdout).slice.id, "T003");

    const replay = run(root, [
      "advance",
      "docs/goals/compat",
      "--task",
      "T002",
      "--source",
      "receipts/T002.json",
      "--closeout-authority",
      "original_role",
      "--activate",
      "T003",
      "--json",
    ]);
    assert.equal(replay.status, 1, replay.stderr || replay.stdout);
    assert.equal(readFileSync(statePath, "utf8"), afterText);
    assert.equal(readFileSync(join(root, "receipts", "T002.json"), "utf8"), sourceBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
