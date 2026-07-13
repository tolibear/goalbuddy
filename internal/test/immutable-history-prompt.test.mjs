import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const cli = resolve("internal/cli/goal-maker.mjs");

test("prompt strictly renders the active task across an exact malformed historical receipt", () => {
  const fixture = createGoal(legacyBoard());
  try {
    const strict = runPrompt(fixture.goalDir, []);
    assert.equal(strict.status, 1);
    assert.match(strict.stderr, /Could not parse line/);

    const result = runPrompt(fixture.goalDir, compatibilityArgs(fixture.state));
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.metadata.state_digest, digest(fixture.state));
    assert.equal(report.metadata.projection_mode, "immutable_history_active_task");
    assert.equal(report.metadata.checker_status, "immutable_history_compatible");
    assert.deepEqual(report.metadata.immutable_history.preserved_task_ids, ["T058"]);
    assert.equal(report.metadata.immutable_history.historical_task_bytes_unchanged, true);
    assert.equal(report.metadata.immutable_history.live_tail_checker_errors, 0);
    assert.equal(report.task.id, "T082");
    assert.equal(report.task.status, "active");
    assert.equal(report.task.objective, "Audit the corrected boundary.");
    assert.deepEqual(report.task.constraints, ["Read only."]);
    assert.equal(result.stdout.includes("Historical detail that must not enter the prompt."), false);
  } finally {
    fixture.cleanup();
  }
});

test("prompt immutable-history path rejects a stale expected digest", () => {
  const fixture = createGoal(legacyBoard());
  try {
    const result = runPrompt(fixture.goalDir, [
      "--expected-state-digest",
      "0".repeat(64),
      "--allow-immutable-history",
      "--json",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /state\.yaml digest drift/);
    assert.equal(readFileSync(fixture.statePath, "utf8"), fixture.state);
  } finally {
    fixture.cleanup();
  }
});

test("prompt immutable-history path rejects changed historical bytes", () => {
  const fixture = createGoal(legacyBoard());
  try {
    const originalDigest = digest(fixture.state);
    const changed = fixture.state.replace(
      "Historical detail that must not enter the prompt.",
      "Changed historical detail that must not enter the prompt.",
    );
    writeFileSync(fixture.statePath, changed);

    const result = runPrompt(fixture.goalDir, [
      "--expected-state-digest",
      originalDigest,
      "--allow-immutable-history",
      "--json",
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /state\.yaml digest drift/);
    assert.equal(readFileSync(fixture.statePath, "utf8"), changed);
  } finally {
    fixture.cleanup();
  }
});

test("prompt immutable-history path rejects malformed active task bytes", () => {
  const fixture = createGoal(legacyBoard({ activeExtra: "    - malformed_active_task: true\n" }));
  try {
    const result = runPrompt(fixture.goalDir, compatibilityArgs(fixture.state));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not parse line|Expected mapping|active-task mismatch/);
  } finally {
    fixture.cleanup();
  }
});

test("prompt immutable-history path rejects live-tail checker errors", () => {
  const fixture = createGoal(legacyBoard({ secondActive: true }));
  try {
    const result = runPrompt(fixture.goalDir, compatibilityArgs(fixture.state));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Immutable-history prompt projection rejected/);
    assert.match(result.stderr, /not confined to exactly one task|touches live or missing task/);
  } finally {
    fixture.cleanup();
  }
});

test("prompt keeps the normal checker-green strict rendering path", () => {
  const state = legacyBoard()
    .replace("decision: amend", "decision: approved")
    .replace("      - kind: finding_closure", "        - kind: finding_closure")
    .replace("        status: retained", "          status: retained");
  const fixture = createGoal(state);
  try {
    const result = runPrompt(fixture.goalDir, ["--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.metadata.projection_mode, "strict_full_state");
    assert.equal(report.metadata.checker_status, null);
    assert.equal(report.metadata.immutable_history, null);
    assert.equal(report.task.id, "T082");
  } finally {
    fixture.cleanup();
  }
});

function createGoal(state) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-immutable-prompt-"));
  const goalDir = join(root, "goal");
  const notes = join(goalDir, "notes");
  mkdirSync(notes, { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), "# Immutable prompt fixture\n");
  const statePath = join(goalDir, "state.yaml");
  writeFileSync(statePath, state);
  return {
    goalDir,
    state,
    statePath,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function runPrompt(goalDir, extraArgs) {
  return spawnSync(process.execPath, [cli, "prompt", goalDir, ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_TOKEN: "" },
  });
}

function compatibilityArgs(state) {
  return ["--expected-state-digest", digest(state), "--allow-immutable-history", "--json"];
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function legacyBoard({ activeExtra = "", secondActive = false } = {}) {
  return `version: 2
goal:
  title: "Immutable prompt fixture"
  slug: "immutable-prompt-fixture"
  kind: specific
  tranche: "Render one active task."
  status: active
  oracle:
    signal: "The exact active task renders without reading malformed history."
    final_proof: "The prompt is digest-bound and checker-proven."
rules:
  goal_pressure_requires_oracle: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T082
tasks:
  - id: T058
    type: judge
    assignee: Judge
    status: done
    objective: "Historical review."
    receipt:
      result: done
      decision: amend
      summary: "Historical detail that must not enter the prompt."
      evidence:
      - kind: finding_closure
        status: retained
  - id: T081
    type: judge
    assignee: Judge
    status: ${secondActive ? "active" : "queued"}
    objective: "Queued historical successor."
    receipt: null
  - id: T082
    type: judge
    assignee: Judge
    status: active
    reasoning_hint: xhigh
    objective: "Audit the corrected boundary."
    inputs:
      - "Exact active evidence."
    constraints:
      - "Read only."
    expected_output:
      - "One bounded decision."
    allowed_files: []
    verify: []
    stop_if: []
    receipt: null
${activeExtra}checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`;
}
