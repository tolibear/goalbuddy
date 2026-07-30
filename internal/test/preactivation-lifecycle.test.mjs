import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { currentArtifactIdentity } from "../../goalbuddy/scripts/current-artifact-identity.mjs";

const cli = resolve("internal/cli/goal-maker.mjs");

function run(root, args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("public preactivation lifecycle uses frontier, semantic dispatch, advance, and exact completion", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-preactivation-lifecycle-"));
  const bin = mkdtempSync(join(tmpdir(), "goalbuddy-preactivation-bin-"));
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
    const baseCommit = git(["rev-parse", "HEAD"]).stdout.trim();

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

    const firstFrontier = run(root, ["frontier", "docs/goals/ship-widget", "--json"]);
    assert.equal(firstFrontier.status, 0, firstFrontier.stderr || firstFrontier.stdout);
    assert.equal(JSON.parse(firstFrontier.stdout).slice.id, "T001");

    const firstResume = run(root, ["resume", "docs/goals/ship-widget", "--json"]);
    assert.equal(firstResume.status, 0, firstResume.stderr || firstResume.stdout);
    const firstProjection = JSON.parse(firstResume.stdout);
    assert.equal(firstProjection.board.active_task.id, "T001");

    const staleDispatch = run(root, ["dispatch", "docs/goals/ship-widget", "--to", "codex", "--expected-state-digest", "0".repeat(64), "--json"], harnessEnv);
    assert.equal(staleDispatch.status, 1, staleDispatch.stderr || staleDispatch.stdout);
    assert.equal(JSON.parse(staleDispatch.stdout).error_code, "STALE_STATE_DIGEST");
    assert.equal(existsSync(marker), false, "a rejected admission must not launch the harness");

    const validDispatch = run(root, ["dispatch", "docs/goals/ship-widget", "--to", "codex", "--json"], { ...harnessEnv, GOALBUDDY_FAKE_MODE: "valid" });
    assert.equal(validDispatch.status, 0, validDispatch.stderr || validDispatch.stdout);
    const dispatchReport = JSON.parse(validDispatch.stdout);
    assert.equal(dispatchReport.ok, true);
    assert.equal(dispatchReport.kind, "goalbuddy_dispatch_outcome_v1");
    assert.equal(dispatchReport.scope_check.status, "clean");
    assert.equal("state_digest" in dispatchReport, false);
    assert.equal("session_binding" in dispatchReport, false);
    assert.equal("receipt" in dispatchReport, false);
    assert.equal("commands" in dispatchReport, false);
    const dispatchPath = dispatchReport.receipt_source;
    assert.equal(typeof dispatchPath, "string");
    assert.equal(existsSync(dispatchPath), true);

    const receiptTransition = run(root, [
      "advance",
      "docs/goals/ship-widget",
      "--task",
      "T001",
      "--source",
      dispatchPath,
      "--closeout-authority",
      "original_role",
      "--activate",
      "T999",
      "--json",
    ]);
    assert.equal(receiptTransition.status, 0, receiptTransition.stderr || receiptTransition.stdout);
    const advanced = JSON.parse(receiptTransition.stdout);
    assert.equal(advanced.outcome.next_task_id, "T999");
    assert.equal(advanced.frontier.slice.id, "T999");
    assert.equal(existsSync(dispatchPath), false);

    const boardAfterAdvance = readFileSync(statePath, "utf8");
    const replay = run(root, [
      "advance",
      "docs/goals/ship-widget",
      "--task",
      "T001",
      "--source",
      dispatchPath,
      "--closeout-authority",
      "original_role",
      "--activate",
      "T999",
      "--json",
    ]);
    assert.equal(replay.status, 1, replay.stderr || replay.stdout);
    assert.match(JSON.parse(replay.stdout).error, /current active|active receipt-free|active_task/i);
    assert.equal(readFileSync(statePath, "utf8"), boardAfterAdvance);

    const secondResume = run(root, ["resume", "docs/goals/ship-widget", "--json"]);
    assert.equal(secondResume.status, 0, secondResume.stderr || secondResume.stdout);
    const secondProjection = JSON.parse(secondResume.stdout);
    const secondDigest = secondProjection.board.state_digest;
    assert.equal(secondProjection.board.active_task.id, "T999");

    const secondFrontier = run(root, ["frontier", "docs/goals/ship-widget", "--json"]);
    assert.equal(secondFrontier.status, 0, secondFrontier.stderr || secondFrontier.stdout);
    assert.equal(JSON.parse(secondFrontier.stdout).slice.id, "T999");

    const reviewScope = {
      kind: "goalbuddy_review_scope_v1",
      patterns: ["src/**"],
    };
    const reviewedIdentity = currentArtifactIdentity({ root, scope: reviewScope });
    const reviewArtifact = {
      kind: "goalbuddy_final_review_v1",
      workflow_version: "goalbuddy-preactivation-test-review@1",
      scope: reviewScope,
      base_identity: { kind: "git_commit", value: baseCommit },
      reviewed_identity: reviewedIdentity,
      completeness_status: "complete",
      decision: "complete",
      unresolved_blocking_findings: [],
    };
    mkdirSync(join(root, "reviews"), { recursive: true });
    const reviewBytes = `${JSON.stringify(reviewArtifact, null, 2)}\n`;
    writeFileSync(join(root, "reviews", "final-review.json"), reviewBytes);
    const finalReceiptPath = join(root, "final-receipt.json");
    writeFileSync(finalReceiptPath, JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T999",
        board_path: "docs/goals/ship-widget/state.yaml",
        decision: "complete",
        full_outcome_complete: true,
        rationale: "The current receipts and exact verification satisfy the goal oracle.",
        evidence: ["src/widget.mjs", "node --check src/widget.mjs"],
        summary: "The exact current widget bytes satisfy the full outcome.",
        completion_disposition: "exact",
        accepted_deviations: [],
        deviation_acceptance: null,
        final_review: {
          status: "complete",
          artifact: {
            path: "reviews/final-review.json",
            sha256: createHash("sha256").update(reviewBytes).digest("hex"),
          },
          workflow_version: reviewArtifact.workflow_version,
          scope: reviewArtifact.scope,
          base_identity: reviewArtifact.base_identity,
          reviewed_identity: reviewArtifact.reviewed_identity,
          completeness_status: reviewArtifact.completeness_status,
        },
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
    const finalFrontier = run(root, ["frontier", "docs/goals/ship-widget", "--json"]);
    assert.equal(finalFrontier.status, 0, finalFrontier.stderr || finalFrontier.stdout);
    assert.equal(JSON.parse(finalFrontier.stdout).goal.status, "done");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
    rmSync(marker, { force: true });
  }
});
