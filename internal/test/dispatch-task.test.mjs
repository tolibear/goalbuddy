import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

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
`);
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git(["init", "-q"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "add", "-A"]);
  git(["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-qm", "init"]);
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
  return spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--json", ...extraArgs], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
  });
}

test("dispatch runs an external worker and reports a clean scope", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `if printf '%s\\n' "$@" | grep -q 'Native wait_agent timeouts'; then exit 42; fi\necho "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
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
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.violations, ["README.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
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
    assert.deepEqual(report.scope_check.violations, ["src/widget.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch extracts receipts wrapped in markdown fences", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `printf 'Here you go:\\n\\n\`\`\`json\\n%s\\n\`\`\`\\n' '${RECEIPT}'`);
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
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--json"], {
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
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "gemini", "--json"], {
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

test("external dispatch timeout is terminal and still reports partial writes", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", "echo 'partial external write' >> README.md\nwhile :; do :; done");
    const result = spawnSync(process.execPath, [dispatcher, "docs/goals/one", "--to", "codex", "--timeout", "1", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.error, /hard execution timeout after 1s/);
    assert.equal(report.timeout_semantics, "hard_execution_deadline");
    assert.equal(report.scope_check.status, "violations");
    assert.deepEqual(report.scope_check.violations, ["README.md"]);
    assert.equal(report.receipt, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("goalbuddy dispatch CLI wrapper forwards to the bundled script", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const cli = resolve("internal/cli/goal-maker.mjs");
    const result = spawnSync(process.execPath, [cli, "dispatch", "docs/goals/one", "--to", "codex", "--json"], {
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

test("dispatch rejects receipt-shaped fragments that are not real receipts", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo '{"goalbuddy_receipt_v1": true}'\necho 'later, the real one:'\necho '${RECEIPT}'`);
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
