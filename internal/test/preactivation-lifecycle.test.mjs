import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const cli = resolve("internal/cli/goal-maker.mjs");

function run(root, args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("public preactivation lifecycle stays digest-bound from init through completion", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-preactivation-lifecycle-"));
  const marker = `${root}.harness-launched`;
  try {
    const initialized = run(root, ["init", "ship-widget", "--json"]);
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);

    const goalDir = join(root, "docs", "goals", "ship-widget");
    const statePath = join(goalDir, "state.yaml");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 1;\n");
    writeFileSync(join(root, "README.md"), "# lifecycle fixture\n");
    writeFileSync(statePath, `version: 2
goal:
  title: "Ship Widget"
  slug: "ship-widget"
  kind: specific
  tranche: "Implement and audit one verified widget change."
  status: active
  oracle:
    signal: "The widget source passes node --check and the final audit accepts it."
    final_proof: "A passing Worker receipt and final Judge completion receipt."
  intake:
    completion_proof: "The exact current widget bytes pass node --check and final audit."
rules:
  continuous_until_full_outcome: true
  queued_required_worker_blocks_completion: true
  no_completion_without_judge_or_pm_audit: true
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
    objective: "Update the widget implementation."
    allowed_files:
      - src/widget.mjs
    verify:
      - node --check src/widget.mjs
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the complete widget outcome."
    receipt: null
checks:
  dirty_fingerprint: clean
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(git(["init", "-q"]).status, 0);
    assert.equal(git(["add", "-A"]).status, 0);
    assert.equal(git(["-c", "user.name=GoalBuddy Test", "-c", "user.email=goalbuddy@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]).status, 0);

    const workerReceipt = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/ship-widget/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: [{ cmd: "node --check src/widget.mjs", status: "pass" }],
        summary: "The widget implementation is updated and syntax-valid.",
        harness: "codex",
      },
    });
    const scopeReceipt = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/ship-widget/state.yaml",
        changed_files: ["README.md"],
        commands: [{ cmd: "node --check src/widget.mjs", status: "pass" }],
        summary: "The wrong file was changed.",
        harness: "codex",
      },
    });
    const bin = join(root, "fake-bin");
    mkdirSync(bin, { recursive: true });
    const fakeCodex = join(bin, "codex");
    writeFileSync(fakeCodex, `#!/bin/sh
printf 'launched\\n' >> "$GOALBUDDY_MARKER"
printf '%s\\n' '{"type":"thread.started","thread_id":"55555555-5555-4555-8555-555555555555"}'
if [ "$GOALBUDDY_FAKE_MODE" = "scope" ]; then
  printf 'out of scope\\n' >> README.md
  printf '%s\\n' '${scopeReceipt}'
  exit 0
fi
printf 'export const widget = 2;\\n' > src/widget.mjs
printf '%s\\n' '${workerReceipt}'
`);
    chmodSync(fakeCodex, 0o755);
    const harnessEnv = { PATH: `${bin}${delimiter}${process.env.PATH}`, GOALBUDDY_MARKER: marker };

    const firstResume = run(root, ["resume", "docs/goals/ship-widget", "--json"]);
    assert.equal(firstResume.status, 0, firstResume.stderr || firstResume.stdout);
    const firstProjection = JSON.parse(firstResume.stdout);
    const firstDigest = firstProjection.board.state_digest;
    assert.equal(firstProjection.board.active_task.id, "T001");

    const firstPrompt = run(root, ["prompt", "docs/goals/ship-widget", "--expected-state-digest", firstDigest, "--json"]);
    assert.equal(firstPrompt.status, 0, firstPrompt.stderr || firstPrompt.stdout);
    assert.equal(JSON.parse(firstPrompt.stdout).task.id, "T001");

    const staleDispatch = run(root, ["dispatch", "docs/goals/ship-widget", "--to", "codex", "--expected-state-digest", "0".repeat(64), "--json"], harnessEnv);
    assert.equal(staleDispatch.status, 1, staleDispatch.stderr || staleDispatch.stdout);
    assert.equal(JSON.parse(staleDispatch.stdout).error_code, "STALE_STATE_DIGEST");
    assert.equal(existsSync(marker), false, "a rejected admission must not launch the harness");

    const validDispatch = run(root, ["dispatch", "docs/goals/ship-widget", "--to", "codex", "--expected-state-digest", firstDigest, "--json"], { ...harnessEnv, GOALBUDDY_FAKE_MODE: "valid" });
    assert.equal(validDispatch.status, 0, validDispatch.stderr || validDispatch.stdout);
    const dispatchReport = JSON.parse(validDispatch.stdout);
    assert.equal(dispatchReport.ok, true);
    assert.equal(dispatchReport.scope_check.status, "clean");
    assert.equal(typeof dispatchReport.session_binding.state_digest, "string");
    const dispatchPath = join(root, "dispatch.json");
    writeFileSync(dispatchPath, validDispatch.stdout);

    const boardBeforeStaleReceipt = readFileSync(statePath, "utf8");
    const staleReceipt = run(root, ["receipt", "docs/goals/ship-widget", "--task", "T001", "--receipt", dispatchPath, "--expected-state-digest", "0".repeat(64), "--activate", "T999", "--json"]);
    assert.equal(staleReceipt.status, 1, staleReceipt.stderr || staleReceipt.stdout);
    assert.equal(staleReceipt.stderr, "");
    assert.equal(staleReceipt.stdout.trim().split("\n").length, 1);
    assert.equal(JSON.parse(staleReceipt.stdout).error_code, "STALE_STATE_DIGEST");
    assert.equal(readFileSync(statePath, "utf8"), boardBeforeStaleReceipt);

    const receiptTransition = run(root, ["receipt", "docs/goals/ship-widget", "--task", "T001", "--receipt", dispatchPath, "--expected-state-digest", dispatchReport.session_binding.state_digest, "--activate", "T999", "--json"]);
    assert.equal(receiptTransition.status, 0, receiptTransition.stderr || receiptTransition.stdout);
    assert.equal(JSON.parse(receiptTransition.stdout).active_task, "T999");

    const secondResume = run(root, ["resume", "docs/goals/ship-widget", "--json"]);
    assert.equal(secondResume.status, 0, secondResume.stderr || secondResume.stdout);
    const secondProjection = JSON.parse(secondResume.stdout);
    const secondDigest = secondProjection.board.state_digest;
    assert.equal(secondProjection.board.active_task.id, "T999");

    const finalPrompt = run(root, ["prompt", "docs/goals/ship-widget", "--expected-state-digest", secondDigest, "--json"]);
    assert.equal(finalPrompt.status, 0, finalPrompt.stderr || finalPrompt.stdout);
    assert.equal(JSON.parse(finalPrompt.stdout).task.id, "T999");

    const finalReceiptPath = join(root, "final-receipt.json");
    writeFileSync(finalReceiptPath, JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T999",
        board_path: "docs/goals/ship-widget/state.yaml",
        decision: "complete",
        full_outcome_complete: true,
        summary: "The exact current widget bytes satisfy the full outcome.",
      },
    }));
    const completed = run(root, ["complete", "docs/goals/ship-widget", "--task", "T999", "--receipt", finalReceiptPath, "--expected-state-digest", secondDigest, "--json"]);
    assert.equal(completed.status, 0, completed.stderr || completed.stdout);
    assert.equal(JSON.parse(completed.stdout).active_task, null);

    const finalResume = run(root, ["resume", "docs/goals/ship-widget", "--json"]);
    assert.equal(finalResume.status, 0, finalResume.stderr || finalResume.stdout);
    const finalProjection = JSON.parse(finalResume.stdout);
    assert.equal(finalProjection.board.status, "done");
    assert.equal(finalProjection.board.active_task, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});
