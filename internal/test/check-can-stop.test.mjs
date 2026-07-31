import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = resolve("goalbuddy/scripts/check-can-stop.mjs");

function makeGoal(state) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-can-stop-"));
  mkdirSync(join(root, "notes"));
  writeFileSync(join(root, "goal.md"), "# Test goal\n");
  writeFileSync(join(root, "state.yaml"), state.trimStart());
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [script, root, "--json"], { encoding: "utf8" });
  return { status: result.status, report: JSON.parse(result.stdout || result.stderr) };
}

const activeState = `
version: 2
goal:
  title: "Keep going"
  slug: "keep-going"
  kind: specific
  tranche: "Continue safe work"
  status: active
  oracle:
    signal: "The requested outcome works."
    final_proof: "A final audit verifies the outcome."
  intake:
    completion_proof: "The final audit passes."
rules:
  continuous_until_full_outcome: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T001
tasks:
  - id: T001
    type: pm
    assignee: PM
    status: active
    objective: "Continue the next safe work package."
    receipt: null
checks:
  dirty_fingerprint: clean
  last_verification:
    result: unknown
    task: null
    commands: []
`;

test("rejects host turn exit while an active task remains", () => {
  const root = makeGoal(activeState);
  try {
    const result = run(root);
    assert.equal(result.status, 1);
    assert.equal(result.report.can_stop, false);
    assert.equal(result.report.reason, "runnable_work_remains");
    assert.equal(result.report.active_task, "T001");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows host turn exit after a receipt-backed full outcome audit", () => {
  const root = makeGoal(`
version: 2
goal:
  title: "Finished"
  slug: "finished"
  kind: specific
  tranche: "Verify completion"
  status: done
  oracle:
    signal: "The requested outcome works."
    final_proof: "T999 verifies the complete outcome."
  intake:
    completion_proof: "T999 passes."
rules:
  continuous_until_full_outcome: true
  no_completion_on_weak_proof: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit the full outcome."
    receipt:
      result: done
      decision: complete
      full_outcome_complete: true
      summary: "The original outcome is verified."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T999
    commands: []
`);
  try {
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.report.can_stop, true);
    assert.equal(result.report.reason, "full_outcome_complete");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows the exact validated terminal approval wait", () => {
  const root = makeGoal(`
version: 2
goal:
  title: "Approval gate"
  slug: "approval-gate"
  kind: specific
  tranche: "Wait for exact approval"
  status: blocked
rules:
  continuous_until_full_outcome: true
  missing_input_or_credentials_do_not_stop_goal: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: blocked
    objective: "Apply the approved production change."
    allowed_files:
      - src/**
    verify:
      - npm test
    stop_if:
      - "Exact approval is missing."
    receipt:
      result: blocked
      waiting_for_user_approval: true
      required_reply: "approve production"
      blocked_reason: "Production change requires exact approval."
      summary: "Asked once and stopped."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: unknown
    task: T001
    commands: []
`);
  try {
    const result = run(root);
    assert.equal(result.status, 0);
    assert.equal(result.report.can_stop, true);
    assert.equal(result.report.reason, "validated_terminal_block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
