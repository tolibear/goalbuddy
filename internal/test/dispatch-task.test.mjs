import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const dispatcher = resolve("goalbuddy/scripts/dispatch-task.mjs");

function makeProject({ taskType = "worker" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 1;\n");
  writeFileSync(join(root, "README.md"), "# fixture\n");
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
    type: ${taskType}
    assignee: ${taskType === "worker" ? "Worker" : "Scout"}
    status: active
    objective: "Adjust the widget."
    allowed_files:
      - src/widget.mjs
    verify:
      - "true"
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
  - id: T002
    type: judge
    assignee: Judge
    status: queued
    objective: "Queued audit must never dispatch early."
    receipt: null
`);
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "add", "-A"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "-c", "commit.gpgsign=false", "commit", "-qm", "init"]);
  return root;
}

function fakeHarnessBin(root, name, script) {
  const bin = join(root, "fake-bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return bin;
}

const RECEIPT = JSON.stringify({
  goalbuddy_receipt_v1: {
    result: "done",
    task_id: "T001",
    board_path: "docs/goals/one/state.yaml",
    changed_files: ["src/widget.mjs"],
    commands: [{ cmd: "true", status: "pass" }],
    summary: "widget adjusted",
    harness: "codex",
  },
});

function runDispatch(root, bin, extraArgs = []) {
  const state = readFileSync(join(root, "docs", "goals", "one", "state.yaml"));
  const digest = createHash("sha256").update(state).digest("hex");
  return spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--expected-state-digest", digest, "--json", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
}

test("dispatch runs an external worker and reports a clean scope", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.harness, "codex");
    assert.equal(report.receipt.result, "done");
    assert.equal(report.scope_check.status, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch flags out-of-scope writes from an external worker", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "tampered" >> README.md\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(result.stdout.trim().split("\n").length, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.out_of_scope, ["README.md"]);
    assert.deepEqual(report.scope_check.missing_receipt_changes, ["README.md"]);
    assert.deepEqual(report.scope_check.extra_receipt_claims, ["src/widget.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch reports scope violations before a simultaneous harness failure", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", "echo tampered >> README.md\nexit 7");
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--expected-state-digest", digest], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.trim().split("\n").length, 1);
    assert.match(result.stderr, /^DISPATCH_SCOPE_FAILED:/);
    assert.match(result.stderr, /README\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch derives the harness working directory from an absolute board outside the caller cwd", () => {
  const root = makeProject();
  const caller = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-caller-"));
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const boardPath = join(root, "docs", "goals", "one", "state.yaml");
    const digest = createHash("sha256").update(readFileSync(boardPath)).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "--board", boardPath, "--to", "codex", "--expected-state-digest", digest, "--json"], {
      cwd: caller,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).scope_check.status, "clean");
    assert.equal(readFileSync(join(root, "src", "widget.mjs"), "utf8"), "export const widget = 2;\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(caller, { recursive: true, force: true });
  }
});

test("dispatch flags any write from a read-only role", () => {
  const root = makeProject({ taskType: "scout" });
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.changed_files, ["src/widget.mjs"]);
    assert.match(report.scope_check.violations.join("\n"), /Read-only task/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch extracts receipts wrapped in markdown fences", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\nprintf 'Here you go:\\n\\n\`\`\`json\\n%s\\n\`\`\`\\n' '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).receipt.summary, "widget adjusted");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch reports a missing harness CLI cleanly", () => {
  const root = makeProject();
  try {
    const bin = join(root, "sparse-bin");
    mkdirSync(bin, { recursive: true });
    const gitPath = spawnSync("command", ["-v", "git"], { encoding: "utf8", shell: true }).stdout.trim();
    symlinkSync(gitPath, join(bin, "git"));
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--expected-state-digest", digest, "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: bin },
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.match(report.error, /codex.*not found|not found.*codex/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch rejects unsupported harness targets", () => {
  const root = makeProject();
  try {
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "gemini", "--expected-state-digest", digest, "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /Unknown or missing dispatch target/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch human failures start with one stable code and action", () => {
  const root = makeProject();
  try {
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "gemini", "--expected-state-digest", digest], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /^INVALID_ARGUMENT: .* Next: /);
    assert.equal(result.stderr.trim().split("\n").length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch times out hung harness CLIs", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", "sleep 30");
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--expected-state-digest", digest, "--timeout", "1", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /timed out after 1s/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("goalbuddy dispatch CLI wrapper forwards to the bundled script", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const cli = resolve("internal/cli/goal-maker.mjs");
    const digest = createHash("sha256").update(readFileSync(join(root, "docs", "goals", "one", "state.yaml"))).digest("hex");
    const result = spawnSync(process.execPath, [cli, "dispatch", "docs/goals/one", "--to", "codex", "--expected-state-digest", digest, "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.scope_check.status, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("goalbuddy dispatch wrapper forwards one compact JSON failure without wrapping", () => {
  const root = makeProject();
  try {
    const cli = resolve("internal/cli/goal-maker.mjs");
    const result = spawnSync(process.execPath, [cli, "dispatch", "docs/goals/one", "--to", "codex", "--expected-state-digest", "0".repeat(64), "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report).sort(), ["error", "error_code", "next_action", "ok"]);
    assert.equal(report.error_code, "STALE_STATE_DIGEST");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch rejects receipt-shaped fragments that are not real receipts", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '{"goalbuddy_receipt_v1": true}'\necho 'later, the real one:'\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.receipt.result, "done");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch extracts bare receipts returned without the envelope", () => {
  const root = makeProject();
  try {
    const bare = JSON.stringify({
      result: "done",
      task_id: "T001",
      board_path: "docs/goals/one/state.yaml",
      changed_files: ["src/widget.mjs"],
      decision: "approved",
      summary: "bare receipt",
    });
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\nprintf 'Some prose first.\\n\`\`\`json\\n%s\\n\`\`\`\\n' '${bare}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.receipt.summary, "bare receipt");
    assert.equal(report.receipt.harness, "codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch never launches a harness for stale state or a queued explicit task", () => {
  for (const testCase of [
    { name: "stale digest", args: ["--expected-state-digest", "0".repeat(64)] },
    { name: "queued task", args: ["--task", "T002"] },
  ]) {
    const root = makeProject();
    try {
      const marker = join(root, "harness-ran");
      const bin = fakeHarnessBin(root, "codex", `touch '${marker}'\necho '${RECEIPT}'`);
      const result = runDispatch(root, bin, testCase.args);
      assert.equal(result.status, 1, `${testCase.name}: ${result.stderr || result.stdout}`);
      assert.equal(existsSync(marker), false, testCase.name);
      assert.match(JSON.parse(result.stdout).error_code, /STALE_STATE_DIGEST|TASK_NOT_CURRENT_ACTIVE/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("dispatch treats ignored GoalBuddy control writes as authority violations", () => {
  const root = makeProject();
  try {
    writeFileSync(join(root, ".gitignore"), "docs/\n");
    const receipt = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: [],
        commands: [{ cmd: "true", status: "pass" }],
        summary: "No product write claimed.",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `echo "tampered" >> docs/goals/one/goal.md\necho '${receipt}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "DISPATCH_SCOPE_FAILED");
    assert.deepEqual(report.scope_check.control_changes, ["docs/goals/one/goal.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch detects a second modification to a path that was already dirty", () => {
  const root = makeProject();
  try {
    writeFileSync(join(root, "README.md"), "# fixture\npre-dirty\n");
    const receipt = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["README.md"],
        commands: [{ cmd: "true", status: "pass" }],
        summary: "Out-of-scope edit claimed.",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `echo "changed again" >> README.md\necho '${receipt}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.scope_check.changed_files, ["README.md"]);
    assert.deepEqual(report.scope_check.out_of_scope, ["README.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
