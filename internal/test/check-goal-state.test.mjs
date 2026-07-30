import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

const checker = resolve("goalbuddy/scripts/check-goal-state.mjs");

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-test-"));
  mkdirSync(join(root, "notes"), { recursive: true });
  writeFileSync(join(root, "goal.md"), "# Sample Goal\n");
  return root;
}

function writeState(root, body) {
  writeFileSync(join(root, "state.yaml"), body.trimStart());
}

function runChecker(root, { snapshot = null } = {}) {
  const args = [checker, join(root, "state.yaml")];
  if (snapshot !== null) args.push("--snapshot-stdin");
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    input: snapshot ?? undefined,
  });
  return {
    status: result.status,
    stdout: JSON.parse(result.stdout),
    stderr: result.stderr,
  };
}

const validScoutBoard = `
version: 2

goal:
  title: "Improve this project"
  slug: "improve-this-project"
  kind: open_ended
  tranche: "discovery-then-first-safe-improvement"
  status: active

rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true

agents:
  scout: installed
  worker: installed
  judge: installed

active_task: T001

tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: active
    objective: "Map the repo and identify improvement candidates."
    inputs:
      - README.md
      - package.json
    constraints:
      - "Read-only."
    expected_output:
      - "Repo map"
      - "Candidate tasks"
    receipt: null
  - id: T002
    type: judge
    assignee: Judge
    status: queued
    objective: "Choose the first safe tranche."
    inputs:
      - "T001 receipt"
    constraints:
      - "Do not implement."
    expected_output:
      - "Decision"
    receipt: null

checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`;

test("accepts a valid v2 board with one active Scout task", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
    assert.equal(result.stdout.version, 2);
    assert.equal(result.stdout.active_task, "T001");
    assert.equal(result.stdout.state_digest, createHash("sha256").update(validScoutBoard.trimStart()).digest("hex"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not require an empty notes directory", () => {
  const root = makeRoot();
  try {
    rmSync(join(root, "notes"), { recursive: true, force: true });
    writeState(root, validScoutBoard);
    const result = runChecker(root);
    assert.equal(result.status, 0, JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validates explicit notes/ pointers while preserving legacy receipt.note values", () => {
  const completedScout = validScoutBoard
    .replace("active_task: T001", "active_task: T002")
    .replace('    status: active\n    objective: "Map the repo and identify improvement candidates."', '    status: done\n    objective: "Map the repo and identify improvement candidates."')
    .replace('    receipt: null\n  - id: T002', `    receipt:
      result: done
      summary: "Evidence lives in notes/T001.md; this prose is not another pointer."
      note: notes/T001.md
  - id: T002`)
    .replace('    status: queued\n    objective: "Choose the first safe tranche."', '    status: active\n    objective: "Choose the first safe tranche."');
  const root = makeRoot();
  try {
    writeState(root, completedScout);
    let result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /points to missing file: notes\/T001\.md/);

    writeFileSync(join(root, "notes", "T001.md"), "# evidence\n");
    result = runChecker(root);
    assert.equal(result.status, 0, JSON.stringify(result.stdout));

    for (const legacy of [".context/infra/t022-qa/qa-receipt.md", "M-G adjudication and receipt history", ""]) {
      writeState(root, completedScout.replace("note: notes/T001.md", `note: ${JSON.stringify(legacy)}`));
      result = runChecker(root);
      assert.equal(result.status, 0, `${legacy}: ${JSON.stringify(result.stdout)}`);
    }

    for (const invalid of ["notes/../escape.md", "notes/T001.md/", "notes/"]) {
      writeState(root, completedScout.replace("note: notes/T001.md", `note: ${JSON.stringify(invalid)}`));
      result = runChecker(root);
      assert.equal(result.status, 1, invalid);
      assert.match(result.stdout.errors.join("\n"), /receipt note/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a receipt note symlink that escapes the owning board", () => {
  const completedScout = validScoutBoard
    .replace("active_task: T001", "active_task: T002")
    .replace('    status: active\n    objective: "Map the repo and identify improvement candidates."', '    status: done\n    objective: "Map the repo and identify improvement candidates."')
    .replace('    receipt: null\n  - id: T002', `    receipt:
      result: done
      summary: "External evidence must not escape the board."
      note: notes/T001.md
  - id: T002`)
    .replace('    status: queued\n    objective: "Choose the first safe tranche."', '    status: active\n    objective: "Choose the first safe tranche."');
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), "goal-maker-note-outside-"));
  try {
    writeState(root, completedScout);
    writeFileSync(join(outside, "T001.md"), "# external evidence\n");
    symlinkSync(join(outside, "T001.md"), join(root, "notes", "T001.md"));
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /resolves outside the owning board notes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("accepts only the closed Judge decision vocabulary", () => {
  const completedJudgeBoard = (decision) => validScoutBoard
    .replace('    status: queued\n    objective: "Choose the first safe tranche."', '    status: done\n    objective: "Choose the first safe tranche."')
    .replace('    receipt: null\n\nchecks:', `    receipt:\n      result: done\n      decision: ${decision}\n\nchecks:`);

  for (const decision of ["approved", "rejected", "approve_subgoal", "reject_subgoal", "not_complete", "complete"]) {
    const root = makeRoot();
    try {
      writeState(root, completedJudgeBoard(decision));
      const result = runChecker(root);
      assert.equal(result.status, 0, `${decision}: ${JSON.stringify(result.stdout)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  for (const decision of ["approve", "done", "ready_for_launch", "authorization_ready"]) {
    const root = makeRoot();
    try {
      writeState(root, completedJudgeBoard(decision));
      const result = runChecker(root);
      assert.equal(result.status, 1, `${decision}: ${JSON.stringify(result.stdout)}`);
      assert.match(result.stdout.errors.join("\n"), /unsupported decision/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("digests the exact stdin snapshot and rejects an on-disk mismatch", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace("Improve this project", "On-disk board"));
    const snapshot = validScoutBoard.replace("Improve this project", "Captured board").trimStart();
    const result = runChecker(root, { snapshot });
    assert.equal(result.status, 1, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, false);
    assert.equal(result.stdout.state_digest, createHash("sha256").update(snapshot).digest("hex"));
    assert.match(result.stdout.errors.join("\n"), /snapshot does not match state\.yaml on disk/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects done goals with placeholder oracle proof", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Weak finish"
  slug: "weak-finish"
  kind: specific
  tranche: "prove completion"
  status: done
  oracle:
    signal: "<observable signal>"
    final_proof: "<receipt-backed final proof>"
  intake:
    completion_proof: "<observable completion proof>"
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
    objective: "Audit completion."
    receipt:
      result: done
      decision: complete
      full_outcome_complete: true
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: pass
    task: T999
    commands: []
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /done goals require concrete completion proof/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts explicit non-installed agent states with actionable warnings", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard
      .replace("scout: installed", "scout: bundled_not_installed")
      .replace("worker: installed", "worker: missing")
      .replace("judge: installed", "judge: unknown"));
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
    assert.deepEqual(result.stdout.agent_statuses, {
      scout: "bundled_not_installed",
      worker: "missing",
      judge: "unknown",
    });
    assert.match(result.stdout.warnings.join("\n"), /PM fallback/i);
    assert.match(result.stdout.warnings.join("\n"), /install channel with: agents/i);
    assert.match(result.stdout.warnings.join("\n"), /install channel with: install/i);
    assert.match(result.stdout.warnings.join("\n"), /install channel with: doctor/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts generated local visual board artifacts in goal roots", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard);
    mkdirSync(join(root, ".goalbuddy-board"), { recursive: true });
    writeFileSync(join(root, ".goalbuddy-board", "index.html"), "<!doctype html>\n");

    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts an active Worker only with scope, verification, and stop conditions", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Fix router coverage"
  slug: "fix-router-coverage"
  kind: specific
  tranche: "router regression coverage"
  status: active
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T004
tasks:
  - id: T004
    type: worker
    assignee: Worker
    status: active
    objective: "Add focused router dispatch regression coverage."
    allowed_files:
      - src/router/index.ts
      - test/router.test.ts
    verify:
      - git diff --check
      - npm test -- test/router.test.ts
    stop_if:
      - "Need files outside allowed_files."
      - "Verification fails twice."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("warns on malformed queued Worker packages while honest placeholders and complete packages stay clean", () => {
  const root = makeRoot();
  try {
    const state = validScoutBoard.replace("\nchecks:\n", `
  - id: T003
    type: worker
    assignee: Worker
    status: queued
    objective: "Half-hydrated package."
    allowed_files:
      - src/partial/**
    verify: []
    stop_if: []
    receipt: null
  - id: T004
    type: worker
    assignee: Worker
    status: queued
    objective: "Executable package without stop conditions."
    allowed_files:
      - src/no-stop/**
    verify:
      - npm test
    stop_if: []
    receipt: null
  - id: T005
    type: worker
    assignee: Worker
    status: queued
    objective: "Directory scope that does not include descendants."
    allowed_files:
      - src/bare/
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T006
    type: worker
    assignee: Worker
    status: queued
    objective: "Honest JIT placeholder."
    allowed_files: []
    verify: []
    stop_if:
      - "Do not activate before atomic hydration."
    receipt: null
  - id: T007
    type: worker
    assignee: Worker
    status: queued
    objective: "Complete executable package."
    allowed_files:
      - src/complete/**
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null

checks:
`);
    writeState(root, state);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
    assert.deepEqual(result.stdout.warnings.filter((warning) => warning.startsWith("GBW_")), [
      "GBW_QUEUED_WORKER_PARTIAL_PACKAGE: queued Worker T003 must be a complete package or an honest empty JIT placeholder",
      "GBW_QUEUED_WORKER_MISSING_STOP_IF: queued executable Worker T004 is missing stop_if",
      "GBW_SCOPE_DIRECTORY_WITHOUT_DESCENDANTS: queued Worker T005 scope src/bare/ ends with /; use an exact file or an explicit descendant glob such as src/bare/**",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("warns on active micro Worker/Judge loops without breaking old boards", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Projection helper churn"
  slug: "projection-helper-churn"
  kind: existing_plan
  tranche: "backend foundation"
  status: active
  full_outcome_complete: false
rules:
  continuous_until_full_outcome: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T004
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Create one narrow pure caller-input user_roles projection helper."
    allowed_files:
      - lib/db/user-role-projection.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - lib/db/user-role-projection.ts
      commands:
        - cmd: npm test
          status: pass
      summary: "Added one helper."
  - id: T002
    type: judge
    assignee: Judge
    status: done
    objective: "Audit T001's pure caller-input user_roles projection helper."
    receipt:
      result: done
      decision: approved
  - id: T003
    type: worker
    assignee: Worker
    status: done
    objective: "Create one narrow pure caller-input connector_runs projection helper."
    allowed_files:
      - lib/db/connector-run-projection.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - lib/db/connector-run-projection.ts
      commands:
        - cmd: npm test
          status: pass
      summary: "Added one helper."
  - id: T004
    type: judge
    assignee: Judge
    status: active
    objective: "Audit T003's pure caller-input connector_runs projection helper."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
    assert.match(result.stdout.warnings.join("\n"), /Board may be micro-slicing\. Prefer the largest safe useful slice/i);
    assert.match(result.stdout.warnings.join("\n"), /Micro Worker\/Judge loop detected/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects invalid goal status and absent agent states", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Bad status"
  slug: "bad-status"
  kind: open_ended
  tranche: "truthful board"
  status: banana
rules:
  continuous_until_full_outcome: true
active_task: T001
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: active
    objective: "Map the repo."
    receipt: null
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /goal\.status must be active, blocked, or done/i);
    assert.match(result.stdout.errors.join("\n"), /agents\.scout must be one of installed, bundled_not_installed, missing, or unknown/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects unsupported agent states", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace("scout: installed", "scout: maybe"));
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /agents\.scout must be one of installed, bundled_not_installed, missing, or unknown; got maybe/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects task type and assignee mismatch", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace("assignee: Scout", "assignee: Worker"));
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /assignee must be Scout for type scout/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects blocked task without receipt", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Blocked slice"
  slug: "blocked-slice"
  kind: open_ended
  tranche: "truthful blocking"
  status: active
rules:
  continuous_until_full_outcome: true
  missing_input_or_credentials_do_not_stop_goal: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T002
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: blocked
    objective: "Run the production-only command."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Need production access."
    receipt: null
  - id: T002
    type: scout
    assignee: Scout
    status: active
    objective: "Find a safe local workaround."
    receipt: null
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /blocked task T001 missing receipt/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects legacy v1 state with gate or units schema", () => {
  const root = makeRoot();
  try {
    writeFileSync(join(root, "evidence.jsonl"), "");
    mkdirSync(join(root, "units"), { recursive: true });
    writeState(root, `
goal: "Legacy"
status: green
active_unit: U-001
gate:
  status: green
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /legacy v1/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects more than one active task", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace("status: queued", "status: active"));
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /exactly one active task/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects done task without receipt", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace(
      `status: active
    objective: "Map the repo and identify improvement candidates."`,
      `status: done
    objective: "Map the repo and identify improvement candidates."`,
    ));
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /done task T001 missing receipt/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects root evidence, units, artifacts, or stray markdown", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard);
    writeFileSync(join(root, "evidence.jsonl"), "");
    mkdirSync(join(root, "units"), { recursive: true });
    mkdirSync(join(root, "artifacts"), { recursive: true });
    writeFileSync(join(root, "scout-report.md"), "# Stray\n");
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /unexpected root entries/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts depth-1 subgoals inside the parent goal root", () => {
  const root = makeRoot();
  try {
    mkdirSync(join(root, "subgoals", "T003-child", "notes"), { recursive: true });
    writeFileSync(join(root, "subgoals", "T003-child", "goal.md"), "# Child\n");
    writeFileSync(join(root, "subgoals", "T003-child", "state.yaml"), `
version: 2
goal:
  title: "Child board"
  slug: "child-board"
  kind: specific
  tranche: "Child branch."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T001
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: active
    objective: "Do child work."
    allowed_files:
      - src/child.ts
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    writeState(root, `
version: 2
goal:
  title: "Parent board"
  slug: "parent-board"
  kind: specific
  tranche: "Parent with child."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T003
tasks:
  - id: T003
    type: worker
    assignee: Worker
    status: active
    objective: "Run a bounded child branch."
    allowed_files:
      - src/parent.ts
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    subgoal:
      status: active
      path: subgoals/T003-child/state.yaml
      owner: Worker
      created_from: T003
      depth: 1
      rollup_receipt: null
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects subgoals outside root, missing child files, and nested child subgoals", () => {
  const outside = makeRoot();
  try {
    writeState(outside, validScoutBoard.replace(
      "receipt: null",
      `subgoal:
      status: active
      path: ../outside/state.yaml
      owner: Worker
      depth: 1
    receipt: null`,
    ));
    const result = runChecker(outside);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /subgoal\.path must stay inside the goal root/i);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }

  const missing = makeRoot();
  try {
    writeState(missing, validScoutBoard.replace(
      "receipt: null",
      `subgoal:
      status: active
      path: subgoals/missing/state.yaml
      owner: Worker
      depth: 1
    receipt: null`,
    ));
    const result = runChecker(missing);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /subgoal state file not found/i);
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }

  const nested = makeRoot();
  try {
    mkdirSync(join(nested, "subgoals", "T001-child", "subgoals", "T001-grandchild", "notes"), { recursive: true });
    mkdirSync(join(nested, "subgoals", "T001-child", "notes"), { recursive: true });
    writeFileSync(join(nested, "subgoals", "T001-child", "goal.md"), "# Child\n");
    writeFileSync(join(nested, "subgoals", "T001-child", "subgoals", "T001-grandchild", "goal.md"), "# Grandchild\n");
    writeFileSync(join(nested, "subgoals", "T001-child", "subgoals", "T001-grandchild", "state.yaml"), validScoutBoard);
    writeFileSync(join(nested, "subgoals", "T001-child", "state.yaml"), validScoutBoard.replace(
      "receipt: null",
      `subgoal:
      status: active
      path: subgoals/T001-grandchild/state.yaml
      owner: Worker
      depth: 1
    receipt: null`,
    ));
    writeState(nested, validScoutBoard.replace(
      "receipt: null",
      `subgoal:
      status: active
      path: subgoals/T001-child/state.yaml
      owner: Worker
      depth: 1
    receipt: null`,
    ));

    const result = runChecker(nested);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /child task T001 must not contain a nested subgoal/i);
  } finally {
    rmSync(nested, { recursive: true, force: true });
  }
});

test("accepts done goal only with final Judge or PM audit receipt", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Improve docs"
  slug: "improve-docs"
  kind: specific
  tranche: "docs cleanup"
  status: done
  oracle:
    signal: "README changed and git diff --check passes."
    final_proof: "T002 audit confirms docs cleanup after passing git diff --check."
  intake:
    completion_proof: "README changed and git diff --check passes."
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Update docs."
    allowed_files:
      - README.md
    verify:
      - git diff --check
    stop_if:
      - "Verification fails twice."
    receipt:
      result: done
      changed_files:
        - README.md
      commands:
        - cmd: git diff --check
          status: pass
      summary: "Docs updated."
  - id: T002
    type: judge
    assignee: Judge
    status: done
    objective: "Audit tranche completion."
    receipt:
      result: done
      decision: complete
      summary: "Tranche complete with current verification."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T002
    commands:
      - cmd: git diff --check
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects done Worker receipts with failed commands or files outside scope", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "False green"
  slug: "false-green"
  kind: specific
  tranche: "truthful receipt"
  status: done
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
  continuous_until_full_outcome: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Update README only."
    allowed_files:
      - README.md
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt:
      result: done
      changed_files:
        - README.md
        - package.json
      commands:
        - cmd: npm test
          status: fail
      summary: "Claimed done despite failed verification and widened scope."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit completion."
    receipt:
      result: done
      decision: complete
      full_outcome_complete: true
      summary: "Incorrectly approved."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: fail
    task: T001
    commands:
      - cmd: npm test
        status: fail
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    const errors = result.stdout.errors.join("\n");
    assert.match(errors, /changed file outside allowed_files: package\.json/i);
    assert.match(errors, /non-passing command status: fail/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("matches JSON-escaped verification commands emitted by the receipt applier", () => {
  const root = makeRoot();
  const command = 'node -e "process.exit(0)"';
  const encodedCommand = JSON.stringify(command);
  const unquotedCommand = 'node -e "console.log(1)"';
  try {
    writeState(root, `
version: 2
goal:
  title: "Escaped command"
  slug: "escaped-command"
  kind: specific
  tranche: "Preserve exact command identity."
  status: done
  oracle:
    signal: "The exact command passes."
    final_proof: "T999 confirms the exact command passed."
  intake:
    completion_proof: "The exact command passes."
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Run the quoted command."
    allowed_files:
      - README.md
    verify:
      - ${encodedCommand}
      - ${unquotedCommand}
    stop_if:
      - "The command fails."
    receipt:
      result: done
      changed_files:
        - README.md
      commands:
        - cmd: ${encodedCommand}
          status: pass
        - cmd: ${unquotedCommand}
          status: pass
      summary: "The exact command passed."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit completion."
    receipt:
      result: done
      decision: complete
      summary: "Complete."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: ${encodedCommand}
        status: pass
      - cmd: ${unquotedCommand}
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not let a non-command list item overwrite an earlier failed command", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "False status overwrite"
  slug: "false-status-overwrite"
  kind: specific
  tranche: "Keep every command result."
  status: done
  oracle:
    signal: "npm test passes."
    final_proof: "T999 confirms npm test passed."
  intake:
    completion_proof: "npm test passes."
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Run verification."
    allowed_files:
      - README.md
    verify:
      - npm test
    stop_if:
      - "Verification fails."
    receipt:
      result: done
      changed_files:
        - README.md
      commands:
        - cmd: npm test
          status: fail
        - note: "This is not a command."
          status: pass
      summary: "Incorrectly claimed success."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit completion."
    receipt:
      result: done
      decision: complete
      summary: "Incorrectly approved."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: fail
    task: T001
    commands:
      - cmd: npm test
        status: fail
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    const errors = result.stdout.errors.join("\n");
    assert.match(errors, /invalid commands entry: entry 2: each commands list item must begin with cmd/i);
    assert.match(errors, /non-passing command status: fail/i);
    assert.match(errors, /missing passing verification command: npm test/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts done Worker changed files that match allowed_files globs", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Agent contract update"
  slug: "agent-contract-update"
  kind: specific
  tranche: "Update agent files."
  status: done
  oracle:
    signal: "Agent contract files are updated and npm test passes."
    final_proof: "T999 audit confirms changed files match allowed globs after npm test passes."
  intake:
    completion_proof: "Agent contract files are updated and npm test passes."
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Update agent contracts."
    allowed_files:
      - goalbuddy/agents/**
      - plugins/goalbuddy/**
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt:
      result: done
      changed_files:
        - goalbuddy/agents/goal_scout.toml
        - plugins/goalbuddy/agents/goal-scout.md
      commands:
        - cmd: npm test
          status: pass
      summary: "Agent contracts updated."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit completion."
    receipt:
      result: done
      decision: complete
      summary: "Complete."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects done goal with unfinished Worker task", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Improve backend automation"
  slug: "improve-backend-automation"
  kind: open_ended
  tranche: "first safe backend automation slice"
  status: done
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: done
    objective: "Map backend automation gaps."
    receipt:
      result: done
      summary: "Found one safe automation slice."
      evidence:
        - package.json
  - id: T002
    type: worker
    assignee: Worker
    status: queued
    objective: "Implement the first safe automation slice."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt: null
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit tranche completion."
    receipt:
      result: done
      decision: complete
      summary: "Incorrectly claimed complete despite queued Worker."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T999
    commands:
      - cmd: npm test
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /done goals must not leave queued or active Worker tasks: T002/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects continuous done goal without full outcome audit", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Build autonomous backend"
  slug: "build-autonomous-backend"
  kind: open_ended
  tranche: "continuous backend automation"
  status: done
  oracle:
    signal: "Backend automation outcome is implemented and npm test passes."
    final_proof: "T999 audit records full_outcome_complete after Worker receipt and passing npm test."
  intake:
    completion_proof: "Backend automation outcome is implemented and npm test passes."
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
  continuous_until_full_outcome: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Implement the first safe backend slice."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt:
      result: done
      changed_files:
        - package.json
      commands:
        - cmd: npm test
          status: pass
      summary: "One slice completed."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit slice completion."
    receipt:
      result: done
      decision: complete
      summary: "Current slice complete, but full outcome was not declared complete."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /full_outcome_complete: true/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts continuous done goal with full outcome audit", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Build autonomous backend"
  slug: "build-autonomous-backend"
  kind: open_ended
  tranche: "continuous backend automation"
  status: done
  oracle:
    signal: "Backend automation outcome is implemented and npm test passes."
    final_proof: "T999 audit records full_outcome_complete after Worker receipt and passing npm test."
  intake:
    completion_proof: "Backend automation outcome is implemented and npm test passes."
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
  continuous_until_full_outcome: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: null
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: done
    objective: "Implement the complete backend automation outcome."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt:
      result: done
      changed_files:
        - package.json
      commands:
        - cmd: npm test
          status: pass
      summary: "Full outcome completed."
  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit full outcome completion."
    receipt:
      result: done
      decision: complete
      full_outcome_complete: true
      summary: "Full original outcome complete."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects blocked continuous goal when missing input should not stop the goal", () => {
  const root = makeRoot();
  try {
    writeState(root, `
version: 2
goal:
  title: "Build autonomous backend"
  slug: "build-autonomous-backend"
  kind: open_ended
  tranche: "continuous backend automation"
  status: blocked
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
  continuous_until_full_outcome: true
  missing_input_or_credentials_do_not_stop_goal: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T002
tasks:
  - id: T001
    type: worker
    assignee: Worker
    status: blocked
    objective: "Run credentialed backend execute slice."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Need credentials."
    receipt:
      result: blocked
      changed_files:
        - package.json
      commands:
        - cmd: npm test
          status: pass
      summary: "Blocked on credentials."
  - id: T002
    type: worker
    assignee: Worker
    status: active
    objective: "Implement safe local workaround while credentials are missing."
    allowed_files:
      - package.json
    verify:
      - npm test
    stop_if:
      - "Verification fails twice."
    receipt: null
checks:
  dirty_fingerprint: dirty
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);
    const result = runChecker(root);
    assert.equal(result.status, 1);
    assert.match(result.stdout.errors.join("\n"), /missing input or credentials should block specific tasks/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function terminalApprovalWaitBoard() {
  return `
version: 2
goal:
  title: "Run production migration"
  slug: "run-production-migration"
  kind: specific
  tranche: "Apply the approved migration after exact owner approval."
  status: blocked
rules:
  pm_owns_state: true
  one_active_task: true
  max_write_workers: 1
  no_implementation_without_worker_or_pm_task: true
  no_completion_without_judge_or_pm_audit: true
  continuous_until_full_outcome: true
  missing_input_or_credentials_do_not_stop_goal: true
  exact_human_approval_can_terminal_wait: true
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
    objective: "Apply production migration after exact approval."
    allowed_files:
      - db/migrations/**
    verify:
      - npm test
    stop_if:
      - "Need exact production approval phrase."
    receipt:
      result: blocked
      task_id: T001
      board_path: /tmp/goalbuddy/state.yaml
      waiting_for_user_approval: true
      required_reply: "approve 20260521234500"
      blocked_reason: "Production migration requires exact human approval before any destructive operation."
      summary: "Asked once for the exact approval phrase and stopped."
  - id: T002
    type: worker
    assignee: Worker
    status: queued
    objective: "Verify the migration after the approved operation."
    allowed_files:
      - db/migrations/**
    verify:
      - npm test
    stop_if:
      - "T001 remains approval-blocked."
    receipt: null
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`;
}

function exactHumanReplyEvidenceBoard() {
  const replyDigest = createHash("sha256").update("approve 20260521234500").digest("hex");
  return terminalApprovalWaitBoard()
    .replace('  status: blocked\nrules:', '  status: active\nrules:')
    .replace("active_task: null", "active_task: T001")
    .replace(/(- id: T001[\s\S]*?status:) blocked/, "$1 active")
    .replace(`    receipt:
      result: blocked
      task_id: T001
      board_path: /tmp/goalbuddy/state.yaml
      waiting_for_user_approval: true
      required_reply: "approve 20260521234500"
      blocked_reason: "Production migration requires exact human approval before any destructive operation."
      summary: "Asked once for the exact approval phrase and stopped."
`, `    transition_evidence:
      exact_human_replies:
        - wait_board_digest: ${"a".repeat(64)}
          required_reply_sha256: ${replyDigest}
          reply_sha256: ${replyDigest}
          exact_match: true
          wait_receipt:
            result: blocked
            task_id: T001
            board_path: /tmp/goalbuddy/state.yaml
            waiting_for_user_approval: true
            required_reply: "approve 20260521234500"
            blocked_reason: "Production migration requires exact human approval before any destructive operation."
            summary: "Asked once for the exact approval phrase and stopped."
    receipt: null
`);
}

test("accepts terminal approval wait when exact human approval is the only remaining action", () => {
  const root = makeRoot();
  try {
    writeState(root, terminalApprovalWaitBoard());
    const result = runChecker(root);
    assert.equal(result.status, 0, result.stderr || JSON.stringify(result.stdout));
    assert.equal(result.stdout.ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts durable exact-human reply transition evidence and rejects malformed variants", () => {
  const validRoot = makeRoot();
  try {
    writeState(validRoot, exactHumanReplyEvidenceBoard());
    const valid = runChecker(validRoot);
    assert.equal(valid.status, 0, valid.stderr || JSON.stringify(valid.stdout));
  } finally {
    rmSync(validRoot, { recursive: true, force: true });
  }

  const cases = [
    ["wrong required hash", exactHumanReplyEvidenceBoard().replace(/required_reply_sha256: [a-f0-9]{64}/, `required_reply_sha256: ${"b".repeat(64)}`)],
    ["mismatched reply hash", exactHumanReplyEvidenceBoard().replace(/reply_sha256: [a-f0-9]{64}/, `reply_sha256: ${"c".repeat(64)}`)],
    ["false exact match", exactHumanReplyEvidenceBoard().replace("exact_match: true", "exact_match: false")],
    ["wrong task identity", exactHumanReplyEvidenceBoard().replace("            task_id: T001", "            task_id: T999")],
    ["completion claim", exactHumanReplyEvidenceBoard().replace("            result: blocked", "            result: blocked\n            full_outcome_complete: true")],
  ];
  for (const [name, state] of cases) {
    const root = makeRoot();
    try {
      writeState(root, state);
      const result = runChecker(root);
      assert.equal(result.status, 1, `${name}: ${JSON.stringify(result.stdout)}`);
      assert.match(result.stdout.errors.join("\n"), /transition_evidence/, name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("rejects incomplete or generic continuous-goal approval waits", () => {
  const cases = [
    {
      name: "exception rule disabled",
      state: terminalApprovalWaitBoard().replace("exact_human_approval_can_terminal_wait: true", "exact_human_approval_can_terminal_wait: false"),
    },
    {
      name: "active task retained",
      state: terminalApprovalWaitBoard()
        .replace("active_task: null", "active_task: T002")
        .replace(/(- id: T002[\s\S]*?status:) blocked/, "$1 active"),
    },
    {
      name: "generic blocker without approval marker",
      state: terminalApprovalWaitBoard().replace("waiting_for_user_approval: true", "waiting_for_user_approval: false"),
    },
    {
      name: "invented approval class",
      state: terminalApprovalWaitBoard()
        .replace("waiting_for_user_approval: true", "approval_class: production")
        .replace('required_reply: "approve 20260521234500"', 'approval_value: "approve 20260521234500"'),
    },
    {
      name: "empty exact reply",
      state: terminalApprovalWaitBoard().replace('required_reply: "approve 20260521234500"', 'required_reply: "   "'),
    },
    {
      name: "completion claim present",
      state: terminalApprovalWaitBoard().replace("waiting_for_user_approval: true", "waiting_for_user_approval: true\n      full_outcome_complete: true"),
    },
  ];

  for (const testCase of cases) {
    const root = makeRoot();
    try {
      writeState(root, testCase.state);
      const result = runChecker(root);
      assert.equal(result.status, 1, `${testCase.name}: ${JSON.stringify(result.stdout)}`);
      assert.match(result.stdout.errors.join("\n"), /continuous goals must keep goal\.status active/i, testCase.name);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("accepts a goal directory argument", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard);
    const result = spawnSync(process.execPath, [checker, root], { encoding: "utf8" });
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true, result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preserves # inside quoted scalars", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard.replace(
      'objective: "Map the repo and identify improvement candidates."',
      'objective: "#12 regression: map the repo."',
    ));
    const result = runChecker(root);
    assert.equal(result.stdout.ok, true, JSON.stringify(result.stdout.errors));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports a broken symlink in the goal root instead of crashing", () => {
  const root = makeRoot();
  try {
    writeState(root, validScoutBoard);
    symlinkSync(join(root, "does-not-exist"), join(root, "dangling"));
    const result = runChecker(root);
    assert.equal(typeof result.stdout.ok, "boolean", result.stderr);
    assert.equal(result.stdout.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validates the closed task-bound Codex Worker session evidence shape", () => {
  const sessionBoard = validScoutBoard
    .replace("type: scout", "type: worker")
    .replace("assignee: Scout", "assignee: Worker")
    .replace('    expected_output:\n      - "Repo map"\n      - "Candidate tasks"', '    allowed_files:\n      - src/**\n    verify:\n      - "true"\n    stop_if:\n      - "Need files outside allowed_files."')
    .replace("    receipt: null\n  - id: T002", `    transition_evidence:\n      codex_worker_session:\n        harness: codex\n        session_id: "019f6dab-7b25-7620-9da6-4f79a0648146"\n        task_id: T001\n        board_path_sha256: "${"1".repeat(64)}"\n        workspace_root_sha256: "${"2".repeat(64)}"\n        codex_home_sha256: "${"3".repeat(64)}"\n        dispatch_contract_sha256: "${"4".repeat(64)}"\n        model: gpt-5.6-sol\n        reasoning_effort: medium\n        service_tier: fast\n        sandbox: danger-full-access\n        brief_path: null\n        brief_sha256: null\n        launch_state_digest: "${"5".repeat(64)}"\n    receipt: null\n  - id: T002`);
  for (const [name, state, ok] of [
    ["valid", sessionBoard, true],
    ["valid high effort", sessionBoard.replace("reasoning_effort: medium", "reasoning_effort: high"), true],
    ["bad UUID", sessionBoard.replace("019f6dab-7b25-7620-9da6-4f79a0648146", "not-a-session"), false],
    ["bad reasoning", sessionBoard.replace("reasoning_effort: medium", "reasoning_effort: extreme"), false],
    ["queued binding", sessionBoard.replace("assignee: Worker\n    status: active", "assignee: Worker\n    status: queued"), false],
  ]) {
    const root = makeRoot();
    try {
      writeState(root, state);
      const result = runChecker(root);
      assert.equal(result.stdout.ok, ok, `${name}: ${JSON.stringify(result.stdout.errors)}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("validates exact Worker-only brief bindings against current safe repository bytes", () => {
  const repository = mkdtempSync(join(tmpdir(), "goal-maker-brief-test-"));
  const root = join(repository, "docs", "goals", "one");
  try {
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "goal.md"), "# Sample Goal\n");
    spawnSync("git", ["init", "-q"], { cwd: repository });
    writeFileSync(join(root, "notes", "T001.md"), "Approved implementation brief.\n");
    const digest = createHash("sha256").update("Approved implementation brief.\n").digest("hex");
    const workerBoard = validScoutBoard
      .replace("type: scout", "type: worker")
      .replace("assignee: Scout", "assignee: Worker")
      .replace(`    expected_output:
      - "Repo map"
      - "Candidate tasks"`, `    allowed_files:
      - src/**
    verify:
      - "true"
    stop_if:
      - "Need files outside allowed_files."
    brief:
      path: docs/goals/one/notes/T001.md
      sha256: ${digest}`);
    writeState(root, workerBoard);
    const valid = runChecker(root);
    assert.equal(valid.stdout.ok, true, JSON.stringify(valid.stdout.errors));

    writeFileSync(join(root, "notes", "T001.md"), "Stale implementation brief.\n");
    assert.ok(runChecker(root).stdout.errors.some((error) => /digest mismatch/.test(error)));

    writeFileSync(join(root, "notes", "T001.md"), "Approved implementation brief.\n");
    writeState(root, workerBoard.replace("type: worker", "type: judge").replace("assignee: Worker", "assignee: Judge"));
    assert.ok(runChecker(root).stdout.errors.some((error) => /brief is allowed only on a Worker/.test(error)));

    writeState(root, workerBoard.replace(`      sha256: ${digest}`, `      sha256: ${digest}\n      extra: forbidden`));
    assert.ok(runChecker(root).stdout.errors.some((error) => /keys must be exact/.test(error)));
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});
