import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { parseDispatchArgs } from "../../goalbuddy/scripts/dispatch-task.mjs";

const dispatcher = resolve("goalbuddy/scripts/dispatch-task.mjs");
const applyReceipt = resolve("goalbuddy/scripts/apply-receipt.mjs");
const CODEX_SESSION_ID = "019f6dab-7b25-7620-9da6-4f79a0648146";
const OTHER_CODEX_SESSION_ID = "019f6dac-0000-7000-8000-000000000000";

function makeProject({ taskType = "worker", successorType = "judge" } = {}) {
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
    type: ${successorType}
    assignee: ${successorType === "worker" ? "Worker" : "Judge"}
    status: queued
    objective: "Queued audit must never dispatch early."
${successorType === "worker" ? `    allowed_files:
      - src/widget.mjs
    verify:
      - "true"
    stop_if:
      - "Need files outside allowed_files."
` : ""}
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
  const session = name === "codex" ? `echo '{"type":"thread.started","thread_id":"${CODEX_SESSION_ID}"}'\n` : "";
  writeFileSync(path, `#!/bin/sh\n${session}${script}\n`);
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
    assert.equal(report.mutation.board, "changed");
    assert.equal(report.mutation.product, "observed");
    assert.equal(report.mutation.receipt_applied, false);
    assert.equal(report.mutation.digest_kind, "state_yaml_sha256");
    assert.notEqual(report.mutation.before_digest, report.mutation.after_digest);
    assert.equal(report.commands.apply_receipt.operation, "apply_receipt");
    assert.equal(report.commands.apply_receipt.expected_state_digest, report.mutation.after_digest);
    assert.equal(report.commands.apply_receipt.receipt_path, report.report_path);
    assert.deepEqual(report.commands.apply_receipt.unresolved, ["activate_task_id"]);
    assert.equal(report.commands.apply_receipt.command_template.includes(`--receipt ${JSON.stringify(report.report_path)} --expected-state-digest`), true);
    assert.match(report.commands.apply_receipt.command_template, /--activate <T###> --json$/);
    assert.equal(report.report_transport.kind, "git_local_ephemeral_v1");
    assert.equal(report.report_transport.status, "ready");
    assert.equal(statSync(report.report_path).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(report.commands), ["apply_receipt"]);
    assert.match(report.next_action, /supply only activate_task_id/);
    const fullReportText = readFileSync(report.report_path, "utf8");
    assert.equal(Buffer.byteLength(result.stdout) < Buffer.byteLength(fullReportText), true);
    const fullReport = JSON.parse(fullReportText);
    assert.deepEqual(fullReport.receipt, report.receipt);
    assert.equal(fullReport.report_path, report.report_path);
    assert.equal(typeof fullReport.commands.resume_worker, "string");
    assert.equal(typeof fullReport.commands.recovery, "string");
    assert.equal(Object.hasOwn(report, "dispatch_contract_sha256"), false);
    assert.equal(typeof fullReport.dispatch_contract_sha256, "string");

    const apply = spawnSync(process.execPath, [
      applyReceipt,
      "docs/goals/one",
      "--task", "T001",
      "--receipt", report.report_path,
      "--expected-state-digest", report.commands.apply_receipt.expected_state_digest,
      "--activate", "T002",
      "--json",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);
    const transition = JSON.parse(apply.stdout);
    assert.equal(transition.active_task, "T002");
    assert.deepEqual(transition.report_transport_cleanup, {
      attempted: true,
      removed: true,
      path: report.report_path,
      error: null,
    });
    assert.equal(existsSync(report.report_path), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Codex dispatch closes stdin and pins the default execution profile", () => {
  const root = makeProject();
  const evidenceRoot = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-profile-"));
  try {
    const argsPath = join(evidenceRoot, "codex-args.txt");
    const bin = fakeHarnessBin(root, "codex", `printf '%s\\n' "$@" > '${argsPath}'\nif read _line; then exit 41; fi\necho "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const args = readFileSync(argsPath, "utf8");
    assert.match(args, /model="gpt-5\.6-sol"/);
    assert.match(args, /model_reasoning_effort="medium"/);
    assert.match(args, /service_tier="default"/);
    assert.match(args, /sandbox_mode="danger-full-access"/);
    assert.match(args, /recommended_reasoning: medium/);
    assert.match(args, /sandbox: danger-full-access/);
    const state = readFileSync(join(root, "docs", "goals", "one", "state.yaml"), "utf8");
    assert.match(state, /model: gpt-5\.6-sol/);
    assert.match(state, /reasoning_effort: medium/);
    assert.match(state, /service_tier: default/);
    assert.match(state, /sandbox: danger-full-access/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
});

test("Codex dispatch can select reasoning effort and enable Fast", () => {
  const root = makeProject();
  const evidenceRoot = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-tier-"));
  try {
    const argsPath = join(evidenceRoot, "codex-args.txt");
    const bin = fakeHarnessBin(root, "codex", `printf '%s\\n' "$@" > '${argsPath}'\necho "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin, ["--reasoning-effort", "high", "--service-tier", "fast"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const args = readFileSync(argsPath, "utf8");
    assert.match(args, /model_reasoning_effort="high"/);
    assert.match(args, /service_tier="fast"/);
    assert.match(args, /recommended_reasoning: high/);
    const state = readFileSync(join(root, "docs", "goals", "one", "state.yaml"), "utf8");
    assert.match(state, /reasoning_effort: high/);
    assert.match(state, /service_tier: fast/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
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
    assert.equal(report.mutation.board, "changed");
    assert.equal(report.mutation.product, "observed");
    assert.equal(report.mutation.receipt_applied, false);
    assert.equal(Object.hasOwn(report, "report_path"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejected receipt application preserves the Git-local dispatch report for a corrected semantic decision", () => {
  const root = makeProject();
  try {
    const bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    const beforeApply = readFileSync(join(root, "docs", "goals", "one", "state.yaml"), "utf8");
    const apply = spawnSync(process.execPath, [
      applyReceipt,
      "docs/goals/one",
      "--task", "T001",
      "--receipt", report.report_path,
      "--expected-state-digest", report.commands.apply_receipt.expected_state_digest,
      "--activate", "T777",
      "--json",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(apply.status, 1, apply.stderr || apply.stdout);
    assert.equal(readFileSync(join(root, "docs", "goals", "one", "state.yaml"), "utf8"), beforeApply);
    assert.equal(existsSync(report.report_path), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Git-local dispatch transport follows the linked worktree recovery identity", () => {
  const root = makeProject();
  const worktree = mkdtempSync(join(tmpdir(), "goalbuddy-linked-worktree-"));
  rmSync(worktree, { recursive: true, force: true });
  try {
    const add = spawnSync("git", ["worktree", "add", "-q", "-b", `test-linked-${process.pid}`, worktree], { cwd: root, encoding: "utf8" });
    assert.equal(add.status, 0, add.stderr || add.stdout);
    const bin = fakeHarnessBin(worktree, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(worktree, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    const gitDir = spawnSync("git", ["rev-parse", "--git-dir"], { cwd: worktree, encoding: "utf8" }).stdout.trim();
    assert.equal(report.report_path.startsWith(`${realpathSync(gitDir)}/goalbuddy/dispatch-reports/`), true);

    const apply = spawnSync(process.execPath, [
      applyReceipt,
      "docs/goals/one",
      "--task", "T001",
      "--receipt", report.report_path,
      "--expected-state-digest", report.commands.apply_receipt.expected_state_digest,
      "--activate", "T002",
      "--json",
    ], { cwd: worktree, encoding: "utf8" });
    assert.equal(apply.status, 0, apply.stderr || apply.stdout);
    assert.equal(existsSync(report.report_path), false);
  } finally {
    spawnSync("git", ["worktree", "remove", "--force", worktree], { cwd: root, encoding: "utf8" });
    rmSync(worktree, { recursive: true, force: true });
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

test("dispatch has no implicit deadline and accepts only explicit positive timeouts", () => {
  const baseArgs = ["docs/goals/one", "--to", "codex", "--expected-state-digest", "0".repeat(64)];
  assert.equal(parseDispatchArgs(baseArgs).timeoutSeconds, null);
  assert.equal(parseDispatchArgs(baseArgs).reasoningEffort, "");
  assert.equal(parseDispatchArgs(baseArgs).serviceTier, "");
  for (const effort of ["low", "medium", "high", "xhigh", "max", "ultra"]) {
    assert.equal(parseDispatchArgs([...baseArgs, "--reasoning-effort", effort]).reasoningEffort, effort);
  }
  assert.throws(() => parseDispatchArgs([...baseArgs, "--reasoning-effort", "extreme"]), /must be low, medium, high, xhigh, max, or ultra/);
  assert.equal(parseDispatchArgs([...baseArgs, "--service-tier", "default"]).serviceTier, "default");
  assert.throws(() => parseDispatchArgs([...baseArgs, "--service-tier", "turbo"]), /must be fast, default, or flex/);
  assert.equal(parseDispatchArgs([...baseArgs, "--timeout", "1.5"]).timeoutSeconds, 1.5);
  assert.throws(() => parseDispatchArgs([...baseArgs, "--timeout", "0"]), /--timeout must be a positive number/);
  assert.throws(() => parseDispatchArgs([...baseArgs, "--timeout", "not-a-number"]), /--timeout must be a positive number/);
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
    assert.deepEqual(Object.keys(report).sort(), ["error", "error_code", "mutation", "next_action", "ok"]);
    assert.deepEqual(report.mutation, {
      board: "unknown",
      product: "none_observed",
      receipt_applied: false,
      session_binding_preserved: null,
      before_digest: null,
      after_digest: null,
      digest_kind: "state_yaml_sha256",
    });
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
      commands: [{ cmd: "true", status: "pass" }],
      summary: "bare receipt",
      harness: "codex",
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

test("dispatch repairs one schema-invalid receipt through the exact bound session without another write", () => {
  const root = makeProject();
  try {
    const count = join(root, ".git", "repair-count");
    const malformed = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: ["true"],
        summary: "widget adjusted",
        harness: "codex",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `if [ -f '${count}' ]; then echo '${RECEIPT}'; else touch '${count}'; echo "export const widget = 2;" > src/widget.mjs; echo '${malformed}'; fi`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.repair.attempted, true);
    assert.equal(report.repair.succeeded, true);
    const fullReport = JSON.parse(readFileSync(report.report_path, "utf8"));
    assert.deepEqual(fullReport.repair.original_malformed_receipt.commands, ["true"]);
    assert.deepEqual(report.receipt.commands, [{ cmd: "true", status: "pass" }]);
    assert.equal(readFileSync(join(root, "src", "widget.mjs"), "utf8"), "export const widget = 2;\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("schema failure never repairs after an original authority violation", () => {
  const root = makeProject();
  try {
    const count = join(root, ".git", "repair-count");
    const malformed = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: ["true"],
        summary: "bad scope",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `if [ -f '${count}' ]; then echo second > '${count}'; else touch '${count}'; echo tampered >> README.md; echo '${malformed}'; fi`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "DISPATCH_SCOPE_FAILED");
    assert.equal(report.repair.attempted, false);
    assert.equal(readFileSync(count, "utf8"), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt repair fails closed when its resumed turn writes any file", () => {
  const root = makeProject();
  try {
    const count = join(root, ".git", "repair-count");
    const malformed = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: ["true"],
        summary: "widget adjusted",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `if [ -f '${count}' ]; then echo "export const widget = 3;" > src/widget.mjs; echo '${RECEIPT}'; else touch '${count}'; echo "export const widget = 2;" > src/widget.mjs; echo '${malformed}'; fi`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "DISPATCH_SCOPE_FAILED");
    assert.equal(report.repair.attempted, true);
    assert.equal(report.repair.failure, "repair_turn_write");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt repair attempts at most once", () => {
  const root = makeProject();
  try {
    const count = join(root, ".git", "repair-count");
    const malformed = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "done",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: ["true"],
        summary: "still malformed",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `if [ -f '${count}' ]; then printf x >> '${count}'; echo '${malformed}'; else touch '${count}'; echo "export const widget = 2;" > src/widget.mjs; echo '${malformed}'; fi`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "RECEIPT_SCHEMA_INVALID");
    assert.equal(report.repair.attempted, true);
    assert.equal(report.repair.failure, "second_receipt_invalid");
    assert.equal(readFileSync(count, "utf8"), "x");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt repair never invents an invalid terminal result", () => {
  const root = makeProject();
  try {
    const count = join(root, ".git", "repair-count");
    const malformed = JSON.stringify({
      goalbuddy_receipt_v1: {
        result: "complete",
        task_id: "T001",
        board_path: "docs/goals/one/state.yaml",
        changed_files: ["src/widget.mjs"],
        commands: [{ cmd: "true", status: "pass" }],
        summary: "terminal meaning is invalid",
      },
    });
    const bin = fakeHarnessBin(root, "codex", `if [ -f '${count}' ]; then printf x >> '${count}'; else touch '${count}'; echo "export const widget = 2;" > src/widget.mjs; fi; echo '${malformed}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "RECEIPT_SCHEMA_INVALID");
    assert.equal(report.repair.attempted, false);
    assert.equal(report.repair.failure, "terminal_result_unknown");
    assert.equal(report.mutation.board, "changed");
    assert.equal(report.mutation.product, "observed");
    assert.equal(report.mutation.receipt_applied, false);
    assert.equal(readFileSync(count, "utf8"), "");
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
      const report = JSON.parse(result.stdout);
      assert.match(report.error_code, /STALE_STATE_DIGEST|TASK_NOT_CURRENT_ACTIVE/);
      assert.equal(report.mutation.product, "none_observed");
      assert.equal(report.mutation.receipt_applied, false);
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

test("dispatch reconciles a Wedding-style receipt for declared gitignored sidecars", () => {
  const root = makeProject();
  try {
    writeFileSync(join(root, ".gitignore"), ".context/\n");
    const statePath = join(root, "docs", "goals", "one", "state.yaml");
    writeFileSync(statePath, readFileSync(statePath, "utf8").replace("      - src/widget.mjs", "      - src/widget.mjs\n      - .context/infra/**"));
    const changed = ["src/widget.mjs", ...["a", "b", "c", "d"].map((name) => `.context/infra/lane-a/${name}.md`)];
    const receipt = JSON.stringify({ goalbuddy_receipt_v1: {
      result: "done", task_id: "T001", board_path: "docs/goals/one/state.yaml", changed_files: changed,
      commands: [{ cmd: "true", status: "pass" }], summary: "widget and sidecars adjusted", harness: "codex",
    } });
    const bin = fakeHarnessBin(root, "codex", `mkdir -p .context/infra/lane-a\necho "export const widget = 2;" > src/widget.mjs\nfor name in a b c d; do echo "$name" > ".context/infra/lane-a/$name.md"; done\necho '${receipt}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.scope_check.status, "clean");
    assert.deepEqual(report.scope_check.changed_files, changed.slice().sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unsafe ignored-capable scope fails before harness launch", () => {
  const root = makeProject();
  try {
    const statePath = join(root, "docs", "goals", "one", "state.yaml");
    writeFileSync(statePath, readFileSync(statePath, "utf8").replace("      - src/widget.mjs", "      - '**'"));
    const marker = join(root, "harness-ran");
    const bin = fakeHarnessBin(root, "codex", `touch '${marker}'\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "DISPATCH_SCOPE_UNSAFE");
    assert.match(report.next_action, /Narrow the task scope/);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispatch binds an existing plan or JIT brief by repository path and digest", () => {
  const root = makeProject();
  const evidenceRoot = mkdtempSync(join(tmpdir(), "goalbuddy-dispatch-args-"));
  try {
    const briefPath = join(root, "docs", "goals", "one", "notes", "T001-dispatch.md");
    writeFileSync(briefPath, "Current integration order and hazards.\n");
    const briefDigest = createHash("sha256").update(readFileSync(briefPath)).digest("hex");
    const argsPath = join(evidenceRoot, "codex-args.txt");
    const bin = fakeHarnessBin(root, "codex", `printf '%s\n' "$@" > '${argsPath}'\necho "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    const result = runDispatch(root, bin, ["--brief", "docs/goals/one/notes/T001-dispatch.md", "--brief-sha256", briefDigest]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.brief, { path: "docs/goals/one/notes/T001-dispatch.md", sha256: briefDigest });
    assert.match(readFileSync(argsPath, "utf8"), /Read the bound implementation context/);
    assert.match(readFileSync(argsPath, "utf8"), new RegExp(briefDigest));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(evidenceRoot, { recursive: true, force: true });
  }
});

test("changed or out-of-repository bound context fails before launch", () => {
  for (const extraArgs of [
    ["--brief", "docs/goals/one/notes/missing.md", "--brief-sha256", "0".repeat(64)],
    ["--brief", "../outside.md", "--brief-sha256", "0".repeat(64)],
  ]) {
    const root = makeProject();
    try {
      const marker = join(root, "harness-ran");
      const bin = fakeHarnessBin(root, "codex", `touch '${marker}'\necho '${RECEIPT}'`);
      const result = runDispatch(root, bin, extraArgs);
      assert.equal(result.status, 1, result.stderr || result.stdout);
      assert.equal(existsSync(marker), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("an interrupted Codex Worker resumes only by its exact task-bound session id", () => {
  const root = makeProject();
  const sessionId = CODEX_SESSION_ID;
  try {
    let bin = fakeHarnessBin(root, "codex", "exit 7");
    let result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    let report = JSON.parse(result.stdout);
    assert.equal(report.error_code, "HARNESS_FAILED");
    assert.equal(report.session_binding.session_id, sessionId);
    const boundState = readFileSync(join(root, "docs", "goals", "one", "state.yaml"), "utf8");
    assert.match(boundState, new RegExp(sessionId));

    bin = fakeHarnessBin(root, "codex", `echo "export const widget = 2;" > src/widget.mjs\necho '${RECEIPT}'`);
    result = runDispatch(root, bin, ["--resume-session", sessionId, "--confirmed-not-live"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.session_binding.session_id, sessionId);
    assert.equal(report.scope_check.status, "clean");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("wrong-session and changed-contract resume attempts fail before process launch", () => {
  const root = makeProject();
  const sessionId = CODEX_SESSION_ID;
  try {
    let bin = fakeHarnessBin(root, "codex", "exit 7");
    let result = runDispatch(root, bin);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const marker = join(root, "harness-ran");
    bin = fakeHarnessBin(root, "codex", `touch '${marker}'\necho '${RECEIPT}'`);
    result = runDispatch(root, bin, ["--resume-session", OTHER_CODEX_SESSION_ID, "--confirmed-not-live"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).error_code, "CODEX_SESSION_RESUME_FAILED");
    assert.equal(existsSync(marker), false);

    result = runDispatch(root, bin, ["--resume-session", sessionId, "--confirmed-not-live", "--service-tier", "fast"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).error_code, "CODEX_SESSION_RESUME_FAILED");
    assert.equal(existsSync(marker), false);

    result = runDispatch(root, bin, ["--resume-session", sessionId, "--confirmed-not-live", "--reasoning-effort", "high"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).error_code, "CODEX_SESSION_RESUME_FAILED");
    assert.equal(existsSync(marker), false);

    const statePath = join(root, "docs", "goals", "one", "state.yaml");
    writeFileSync(statePath, readFileSync(statePath, "utf8").replace("Adjust the widget.", "Adjust the widget with changed authority."));
    result = runDispatch(root, bin, ["--resume-session", sessionId, "--confirmed-not-live"]);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).error_code, "CODEX_SESSION_RESUME_FAILED");
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an active task with a bound Codex session rejects fresh redispatch before launch", () => {
  const root = makeProject();
  try {
    let bin = fakeHarnessBin(root, "codex", "exit 7");
    const first = runDispatch(root, bin);
    assert.equal(first.status, 1, first.stderr || first.stdout);
    assert.equal(JSON.parse(first.stdout).session_binding.session_id, CODEX_SESSION_ID);

    const marker = join(root, "fresh-redispatch-ran");
    bin = fakeHarnessBin(root, "codex", `touch '${marker}'\necho '${RECEIPT}'`);
    const second = runDispatch(root, bin);
    assert.equal(second.status, 1, second.stderr || second.stdout);
    assert.equal(JSON.parse(second.stdout).error_code, "DISPATCH_SESSION_BIND_FAILED");
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a bound Worker can close blocked and activate a fresh successor without unbinding history", () => {
  const root = makeProject({ successorType: "worker" });
  try {
    let bin = fakeHarnessBin(root, "codex", "exit 7");
    const interrupted = runDispatch(root, bin);
    assert.equal(interrupted.status, 1, interrupted.stderr || interrupted.stdout);
    assert.equal(JSON.parse(interrupted.stdout).session_binding.session_id, CODEX_SESSION_ID);

    const statePath = join(root, "docs", "goals", "one", "state.yaml");
    const receiptPath = join(root, "blocked-receipt.json");
    writeFileSync(receiptPath, JSON.stringify({
      result: "blocked",
      task_id: "T001",
      board_path: "docs/goals/one/state.yaml",
      changed_files: [],
      commands: [{ cmd: "true", status: "pass" }],
      summary: "Original Worker stopped without product changes.",
      blocked_reason: "The current package needs a newly scoped successor.",
      harness: "codex",
    }));
    const digest = createHash("sha256").update(readFileSync(statePath)).digest("hex");
    const transition = spawnSync(process.execPath, [applyReceipt, "docs/goals/one", "--task", "T001", "--receipt", receiptPath, "--expected-state-digest", digest, "--activate", "T002", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(transition.status, 0, transition.stderr || transition.stdout);
    const transitioned = readFileSync(statePath, "utf8");
    assert.match(transitioned, /active_task: T002/);
    assert.match(transitioned, new RegExp(CODEX_SESSION_ID));

    const successorReceipt = JSON.stringify({ goalbuddy_receipt_v1: {
      result: "done",
      task_id: "T002",
      board_path: "docs/goals/one/state.yaml",
      changed_files: ["src/widget.mjs"],
      commands: [{ cmd: "true", status: "pass" }],
      summary: "successor adjusted widget",
      harness: "codex",
    } });
    bin = fakeHarnessBin(root, "codex", `echo "export const widget = 3;" > src/widget.mjs\necho '${successorReceipt}'`);
    const successor = runDispatch(root, bin);
    assert.equal(successor.status, 0, successor.stderr || successor.stdout);
    assert.equal(JSON.parse(successor.stdout).task_id, "T002");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
