import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const cli = resolve("internal/cli/goal-maker.mjs");
const bundledResume = resolve("goalbuddy/scripts/resume-board.mjs");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;

function runGoalMaker(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    env: testEnv(options.env || process.env),
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function testEnv(env) {
  const result = { ...env };
  delete result.GITHUB_TOKEN;
  return result;
}

function pathSuffixPattern(...segments) {
  return new RegExp(`${segments.map(escapeRegExp).join("[\\\\/]")}$`);
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function receiptContractSchema(agentPath) {
  const text = readFileSync(agentPath, "utf8");
  const match = text.match(/\{\s*"goalbuddy_receipt_v1":\s*(\{[\s\S]*?\n\s*\})\s*\n\}/);
  assert.ok(match, `missing goalbuddy_receipt_v1 contract in ${agentPath}`);
  return JSON.parse(match[1]);
}

function ledgerAuditContractSchema(agentPath) {
  const text = readFileSync(agentPath, "utf8");
  const match = text.match(/\{\s*"goalbuddy_ledger_audit_v1":\s*(\{[\s\S]*?\n\s*\})\s*\n\}/);
  assert.ok(match, `missing goalbuddy_ledger_audit_v1 contract in ${agentPath}`);
  return JSON.parse(match[1]);
}

function keeperReceiptContractSchema(agentPath) {
  const text = readFileSync(agentPath, "utf8");
  const match = text.match(/\{\s*"goalbuddy_keeper_receipt_v1":\s*(\{[\s\S]*?\n\s*\})\s*\n\}/);
  assert.ok(match, `missing goalbuddy_keeper_receipt_v1 contract in ${agentPath}`);
  return JSON.parse(match[1]);
}

function fakeCodexBin(root, { loggedIn = true, goalsEnabled = true } = {}) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  if (process.platform === "win32") {
    const script = [
      "@echo off",
      "if \"%~1\"==\"--version\" echo codex-cli 0.128.0& exit /b 0",
      "if \"%~1\"==\"login\" if \"%~2\"==\"status\" (",
      loggedIn ? "  echo Logged in with ChatGPT& exit /b 0" : "  echo Not logged in& exit /b 1",
      ")",
      "if \"%~1\"==\"features\" if \"%~2\"==\"list\" (",
      `  echo goals                               under development  ${goalsEnabled ? "true" : "false"}& exit /b 0`,
      ")",
      "if \"%~1\"==\"plugin\" if \"%~2\"==\"marketplace\" if \"%~3\"==\"add\" echo Added marketplace goalbuddy& exit /b 0",
      "exit /b 2",
      "",
    ].join("\r\n");
    writeFileSync(join(bin, "codex.cmd"), script);
  } else {
    const script = [
      "#!/bin/sh",
      "if [ \"$1\" = \"--version\" ]; then echo \"codex-cli 0.128.0\"; exit 0; fi",
      "if [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then",
      loggedIn ? "  echo \"Logged in with ChatGPT\"; exit 0" : "  echo \"Not logged in\"; exit 1",
      "fi",
      "if [ \"$1\" = \"features\" ] && [ \"$2\" = \"list\" ]; then",
      `  echo "goals                               under development  ${goalsEnabled ? "true" : "false"}"; exit 0`,
      "fi",
      "if [ \"$1\" = \"plugin\" ] && [ \"$2\" = \"marketplace\" ] && [ \"$3\" = \"add\" ]; then",
      "  echo \"Added marketplace goalbuddy\"; exit 0",
      "fi",
      "exit 2",
      "",
    ].join("\n");
    const path = join(bin, "codex");
    writeFileSync(path, script);
    chmodSync(path, 0o755);
  }
  return bin;
}

function fakeCodexEnv(root, options = {}) {
  const fakeBin = fakeCodexBin(root, options);
  return {
    ...process.env,
    PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
  };
}

test("doctor fails when a required bundled agent is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--codex-home", codexHome], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    unlinkSync(join(codexHome, "agents", "goal_worker.toml"));

    const doctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(doctor.status, 1, doctor.stderr || doctor.stdout);

    const report = JSON.parse(doctor.stdout);
    assert.equal(report.capabilities.atomic_amendment_transition, true);
    assert.equal(report.codex_install_model, "plugin");
    assert.equal(report.plugin.skill_installed, true);
    assert.equal(report.plugin.enabled, true);
    assert.equal(report.skill_installed, false);
    assert.equal(report.compatibility_skill_installed, false);
    assert.deepEqual(report.missing_agents, ["goal_worker.toml"]);
    assert.match(report.errors.join("\n"), /Missing GoalBuddy Codex agent: goal_worker\.toml/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor distinguishes fully removed and residual-agent Codex states", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);

    const fullyRemoved = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(fullyRemoved.status, 1, fullyRemoved.stderr || fullyRemoved.stdout);
    const fullyRemovedReport = JSON.parse(fullyRemoved.stdout);
    assert.equal(fullyRemovedReport.runtime_state, "fully-removed");
    assert.deepEqual(fullyRemovedReport.installed_agents, []);
    assert.deepEqual(fullyRemovedReport.residual_agents, []);
    assert.deepEqual(fullyRemovedReport.missing_agents, []);
    assert.match(fullyRemovedReport.errors.join("\n"), /fully removed/);

    const agentsDir = join(codexHome, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, "goal_worker.toml"), readFileSync("goalbuddy/agents/goal_worker.toml", "utf8"));

    const residual = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(residual.status, 1, residual.stderr || residual.stdout);
    const residualReport = JSON.parse(residual.stdout);
    assert.equal(residualReport.runtime_state, "residual-agents-only");
    assert.deepEqual(residualReport.residual_agents, ["goal_worker.toml"]);
    assert.deepEqual(residualReport.missing_agents, ["goal_judge.toml", "goal_keeper.toml", "goal_ledger.toml", "goal_scout.toml"]);
    assert.match(residualReport.errors.join("\n"), /Residual GoalBuddy Codex agents remain/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor fails when a bundled agent is stale and update refreshes it", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--codex-home", codexHome], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    writeFileSync(join(codexHome, "agents", "goal_worker.toml"), "stale\n");

    const staleDoctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(staleDoctor.status, 1, staleDoctor.stderr || staleDoctor.stdout);
    assert.deepEqual(JSON.parse(staleDoctor.stdout).stale_agents, ["goal_worker.toml"]);

    const update = runGoalMaker(["update", "--codex-home", codexHome], { env });
    assert.equal(update.status, 0, update.stderr || update.stdout);

    const refreshedDoctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(refreshedDoctor.status, 0, refreshedDoctor.stderr || refreshedDoctor.stdout);
    assert.deepEqual(JSON.parse(refreshedDoctor.stdout).stale_agents, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor reports native goal runtime readiness and supports strict goal-ready mode", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root, { loggedIn: false, goalsEnabled: false });

    const install = runGoalMaker(["install", "--codex-home", codexHome], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const doctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.goal_runtime.codex_cli_available, true);
    assert.equal(report.goal_runtime.logged_in, false);
    assert.equal(report.goal_runtime.goals_feature_enabled, false);
    assert.equal(report.goal_runtime.ready, false);

    const strictDoctor = runGoalMaker(["doctor", "--goal-ready", "--codex-home", codexHome], { env });
    assert.equal(strictDoctor.status, 1, strictDoctor.stderr || strictDoctor.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundled agent contracts stay strict and receipt-shaped", () => {
  const scout = readFileSync("goalbuddy/agents/goal_scout.toml", "utf8");
  const judge = readFileSync("goalbuddy/agents/goal_judge.toml", "utf8");
  const keeper = readFileSync("goalbuddy/agents/goal_keeper.toml", "utf8");
  const ledger = readFileSync("goalbuddy/agents/goal_ledger.toml", "utf8");
  const worker = readFileSync("goalbuddy/agents/goal_worker.toml", "utf8");
  assert.match(scout, /model_reasoning_effort = "medium"/);
  assert.match(scout, /Read only/);
  assert.match(scout, /goalbuddy_receipt_v1/);
  assert.match(judge, /Parallel Worker work is safe only with provably disjoint allowed_files/);
  assert.match(judge, /model_reasoning_effort = "xhigh"/);
  assert.match(judge, /Choose the largest safe useful slice/);
  assert.match(judge, /Routine checks belong to the checker/);
  assert.match(keeper, /model = "gpt-5\.6-sol"/);
  assert.match(keeper, /model_reasoning_effort = "low"/);
  assert.match(keeper, /sandbox_mode = "workspace-write"/);
  assert.match(keeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(keeper, /Run `checker_command` after every mutation/);
  assert.match(ledger, /model = "gpt-5\.6-sol"/);
  assert.match(ledger, /model_reasoning_effort = "medium"/);
  assert.match(ledger, /sandbox_mode = "read-only"/);
  assert.match(ledger, /Independently read the complete `goal\.md` and `state\.yaml`/);
  assert.match(ledger, /goalbuddy_ledger_audit_v1/);
  assert.match(ledger, /never `congruent`/);
  assert.match(worker, /model_reasoning_effort = "high"/);
  assert.match(worker, /Edit only files matching allowed_files/);
  assert.match(worker, /Complete the whole assigned slice/);
  assert.match(worker, /verification_attempts/);

  assert.equal(readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_scout.toml", "utf8"), scout);
  assert.equal(readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_judge.toml", "utf8"), judge);
  assert.equal(readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_keeper.toml", "utf8"), keeper);
  assert.equal(readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_ledger.toml", "utf8"), ledger);
  assert.equal(readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_worker.toml", "utf8"), worker);
});

test("install bundles the core local board surface into the skill", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const skillRoot = join(JSON.parse(install.stdout).cache_path, "skills", "goal-prep");
    assert.equal(existsSync(join(skillRoot, "surfaces", "local-goal-board", "scripts", "local-goal-board.mjs")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check-update reports newer published GoalBuddy versions", () => {
  const env = {
    ...process.env,
    GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0",
    GOALBUDDY_TEST_UPDATE_COMMAND: "/plugin update goalbuddy@goalbuddy",
  };

  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.current_version, packageVersion);
  assert.equal(report.latest_version, "99.0.0");
  assert.equal(report.update_available, true);
  assert.equal(report.update_command, "/plugin update goalbuddy@goalbuddy");

  const human = runGoalMaker(["check-update"], { env });
  assert.equal(human.status, 0, human.stderr || human.stdout);
  assert.match(human.stdout, /GoalBuddy 99\.0\.0 is available/);
  assert.match(human.stdout, /Update with: \/plugin update goalbuddy@goalbuddy/);
});

test("check-update honors a user-owned update command", () => {
  const env = {
    GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0",
    GOALBUDDY_UPDATE_COMMAND: "git -C /tmp/goalbuddy fetch origin main",
  };

  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).update_command, env.GOALBUDDY_UPDATE_COMMAND);
});

test("check-update avoids guessing an unknown install channel", () => {
  const env = {
    GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0",
  };

  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.update_command, "use the install channel that installed GoalBuddy");
});

test("prompt renders a compact active task prompt without dumping full state", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    mkdirSync(goal, { recursive: true });
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Prompt test"
  slug: "prompt-test"
  kind: specific
  tranche: "Render a prompt."
  status: active
  oracle:
    signal: "Prompt includes the active task contract without dumping old receipts."
    final_proof: "JSON and human prompt outputs include the goal oracle and active task."
rules:
  slice_policy:
    max_consecutive_tiny_tasks: 2
    prefer_vertical_slices: true
    judge_picks_largest_safe_slice: true
    worker_completes_whole_slice: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T002
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: done
    objective: "Old work."
    receipt:
      result: done
      summary: "A previous finding that should not force a full state dump."
      evidence:
        - README.md
  - id: T002
    type: worker
    assignee: Worker
    status: active
    objective: "Patch the prompt renderer."
    allowed_files:
      - goalbuddy/scripts/**
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const result = runGoalMaker(["prompt", goal, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.metadata.recommended_agent, "goal_worker");
    assert.equal(report.metadata.required_spawn_agent_type, "goal_worker");
    assert.equal(report.metadata.recommended_reasoning, "high");
    assert.equal(report.metadata.sandbox, "workspace-write");
    assert.equal(report.metadata.changed_files_path_style, "board-relative");
    assert.deepEqual(report.metadata.goal_oracle, {
      signal: "Prompt includes the active task contract without dumping old receipts.",
      final_proof: "JSON and human prompt outputs include the goal oracle and active task.",
    });
    assert.deepEqual(report.metadata.slice_policy, {
      max_consecutive_tiny_tasks: 2,
      prefer_vertical_slices: true,
      judge_picks_largest_safe_slice: true,
      worker_completes_whole_slice: true,
    });
    assert.equal(report.task.id, "T002");
    assert.deepEqual(report.task.allowed_files, ["goalbuddy/scripts/**"]);
    assert.equal(report.receipt_schema.task_id, "<T###>");
    assert.equal(report.receipt_schema.board_path, "<path to state.yaml>");
    assert.equal(report.receipt_schema.stopped_because, null);
    assert.equal(Object.hasOwn(report.receipt_schema, "needs_judge"), false);
    assert.equal(Object.hasOwn(report.receipt_schema, "next_allowed_task"), false);
    assert.equal(result.stdout.includes("A previous finding that should not force a full state dump."), false);

    const human = runGoalMaker(["prompt", goal]);
    assert.equal(human.status, 0, human.stderr || human.stdout);
    assert.match(human.stdout, /Codex spawn_agent agent_type: goal_worker/);
    assert.match(human.stdout, /Do not substitute generic scout, worker, or judge agents/);
    assert.match(human.stdout, /wait_agent polling timeout while the target agent is still running is only a polling interval expiry/);
    assert.match(human.stdout, /Keep waiting on the same agent; do not interrupt, replace, redispatch, declare a task timeout, or trigger PM fallback/);
    assert.match(human.stdout, /absence is not evidence of inactivity; read-only Judge\/Ledger work and inspection-only Keeper work may never create diffs/);
    assert.match(human.stdout, /terminal timeout, failed, or unavailable state/);
    assert.match(human.stdout, /configured job\/runtime deadline is actually exceeded/);
    assert.match(human.stdout, /Preserve one-agent\/no-duplicate dispatch/);
    assert.match(human.stdout, /changed_files must use board-relative paths/);
    assert.match(human.stdout, /do not convert absolute paths to relative paths/);
    assert.doesNotMatch(human.stdout, /After one wait_agent timeout/);
    assert.match(human.stdout, /goal_oracle/);
    assert.match(human.stdout, /slice_policy/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt requires absolute changed_files when allowed_files are absolute", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    mkdirSync(goal, { recursive: true });
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Absolute receipt path test"
  slug: "absolute-receipt-path-test"
  kind: specific
  tranche: "Render path guidance."
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
    objective: "Preserve absolute scope paths."
    allowed_files:
      - /tmp/project/src/**
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
`);

    const result = runGoalMaker(["prompt", goal, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).metadata.changed_files_path_style, "absolute");

    const human = runGoalMaker(["prompt", goal]);
    assert.equal(human.status, 0, human.stderr || human.stdout);
    assert.match(human.stdout, /changed_files must use absolute paths/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt resolves relative goal paths without rewriting task ids", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "docs", "goals", "demo");
    mkdirSync(goal, { recursive: true });
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Relative prompt test"
  slug: "relative-prompt-test"
  kind: specific
  tranche: "Render a relative prompt."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T002
tasks:
  - id: T001
    type: scout
    assignee: Scout
    status: done
    objective: "Inspect the relative board."
    receipt:
      result: done
      summary: "Mapped the board."
  - id: T002
    type: worker
    assignee: Worker
    status: active
    objective: "Patch the relative board."
    allowed_files:
      - internal/cli/**
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const cases = [
      ["prompt", "docs/goals/demo", "--task", "T001", "--json"],
      ["prompt", "docs/goals/demo", "--task=T001", "--json"],
      ["prompt", "--board", "docs/goals/demo/state.yaml", "--task", "T001", "--json"],
    ];
    for (const args of cases) {
      const result = runGoalMaker(args, { cwd: root });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.task.id, "T001", args.join(" "));
      assert.equal(report.metadata.board_path, join(realpathSync(goal), "state.yaml"));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt receipt schemas mirror bundled agent receipt contracts", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const cases = [
      {
        type: "scout",
        agent: "goal_scout",
        assignee: "Scout",
        reasoning: "medium",
        extra: "",
      },
      {
        type: "judge",
        agent: "goal_judge",
        assignee: "Judge",
        reasoning: "xhigh",
        extra: "",
      },
      {
        type: "worker",
        agent: "goal_worker",
        assignee: "Worker",
        reasoning: "high",
        extra: [
          "    allowed_files:",
          "      - goalbuddy/scripts/**",
          "    verify:",
          "      - npm test",
          "    stop_if:",
          "      - \"Need files outside allowed_files.\"",
        ].join("\n"),
      },
    ];

    for (const item of cases) {
      const goal = join(root, item.type);
      mkdirSync(goal, { recursive: true });
      writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "${item.type} prompt contract"
  slug: "${item.type}-prompt-contract"
  kind: specific
  tranche: "Render ${item.type} prompt."
  status: active
  oracle:
    signal: "Rendered prompt schema matches the bundled ${item.agent} receipt contract."
    final_proof: "Receipt schema object matches the agent contract object."
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T001
tasks:
  - id: T001
    type: ${item.type}
    assignee: ${item.assignee}
    status: active
    objective: "Render the ${item.type} task prompt."
${item.extra ? `${item.extra}\n` : ""}    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

      const result = runGoalMaker(["prompt", goal, "--json"]);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      const expectedSchema = receiptContractSchema(`goalbuddy/agents/${item.agent}.toml`);
      assert.deepEqual(report.receipt_schema, expectedSchema, item.agent);
      assert.equal(report.metadata.recommended_reasoning, item.reasoning, item.agent);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt warns when the board may be micro-slicing", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    mkdirSync(goal, { recursive: true });
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Prompt warning test"
  slug: "prompt-warning-test"
  kind: existing_plan
  tranche: "Backend milestone."
  status: active
  first_milestone_complete: true
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
    objective: "Add one narrow projection helper."
    receipt:
      result: done
      summary: "Added one helper."
  - id: T002
    type: worker
    assignee: Worker
    status: done
    objective: "Add one narrow contract file."
    receipt:
      result: done
      summary: "Added one contract."
  - id: T003
    type: worker
    assignee: Worker
    status: done
    objective: "Add one narrow validation wrapper."
    receipt:
      result: done
      summary: "Added one wrapper."
  - id: T004
    type: worker
    assignee: Worker
    status: active
    objective: "Add one more projection helper."
    allowed_files:
      - lib/helper.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const result = runGoalMaker(["prompt", goal, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.match(report.metadata.warnings.join("\n"), /Board may be micro-slicing\. Prefer the largest safe useful slice/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel-plan allows read-only active tasks and does not mutate state", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    const child = join(goal, "subgoals", "T001-child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, "state.yaml"), `version: 2
goal:
  title: "Child"
  slug: "child"
  kind: specific
  tranche: "Judge child."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T010
tasks:
  - id: T010
    type: judge
    assignee: Judge
    status: active
    objective: "Judge child evidence."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    const parentState = `version: 2
goal:
  title: "Parent"
  slug: "parent"
  kind: specific
  tranche: "Scout parent."
  status: active
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
    objective: "Scout parent evidence."
    subgoal:
      status: active
      path: subgoals/T001-child/state.yaml
      owner: Judge
      depth: 1
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`;
    writeFileSync(join(goal, "state.yaml"), parentState);

    const result = runGoalMaker(["parallel-plan", "goal", "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mutated, false);
    assert.equal(report.spawned_agents, false);
    assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates.every((candidate) => candidate.safe_to_parallelize), true);
    assert.equal(readFileSync(join(goal, "state.yaml"), "utf8"), parentState);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel-plan rejects overlapping active Worker write scopes", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    const child = join(goal, "subgoals", "T001-child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, "state.yaml"), `version: 2
goal:
  title: "Child"
  slug: "child"
  kind: specific
  tranche: "Patch child."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T010
tasks:
  - id: T010
    type: worker
    assignee: Worker
    status: active
    objective: "Patch same area."
    allowed_files:
      - src/router.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Parent"
  slug: "parent"
  kind: specific
  tranche: "Patch parent."
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
    objective: "Patch broad area."
    allowed_files:
      - src/**
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    subgoal:
      status: active
      path: subgoals/T001-child/state.yaml
      owner: Worker
      depth: 1
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const result = runGoalMaker(["parallel-plan", goal, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates.every((candidate) => candidate.safe_to_parallelize === false), true);
    assert.match(report.candidates[0].reason, /overlaps|cannot be compared/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parallel-plan treats overlapping Worker glob patterns as unsafe", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    const child = join(goal, "subgoals", "T001-child");
    mkdirSync(child, { recursive: true });
    writeFileSync(join(child, "state.yaml"), `version: 2
goal:
  title: "Child"
  slug: "child"
  kind: specific
  tranche: "Patch child."
  status: active
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T010
tasks:
  - id: T010
    type: worker
    assignee: Worker
    status: active
    objective: "Patch possible TypeScript peer."
    allowed_files:
      - src/foo.*
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);
    writeFileSync(join(goal, "state.yaml"), `version: 2
goal:
  title: "Parent"
  slug: "parent"
  kind: specific
  tranche: "Patch parent."
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
    objective: "Patch TypeScript files."
    allowed_files:
      - src/*.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    subgoal:
      status: active
      path: subgoals/T001-child/state.yaml
      owner: Worker
      depth: 1
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const result = runGoalMaker(["parallel-plan", goal, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates.every((candidate) => candidate.safe_to_parallelize === false), true);
    assert.match(report.candidates[0].reason, /overlaps|cannot be compared/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin install adds marketplace, caches plugin, and enables config", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const fakeBin = fakeCodexBin(root);
    const env = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    };

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const report = JSON.parse(install.stdout);
    assert.equal(report.installed, true);
    assert.equal(report.plugin, "goalbuddy@goalbuddy");
    assert.equal(report.version, packageVersion);
    assert.match(report.cache_path, pathSuffixPattern("plugins", "cache", "goalbuddy", "goalbuddy", packageVersion));
    assert.match(report.config_path, /config\.toml$/);
    assert.equal(existsSync(join(report.cache_path, "skills", "goal-prep", "surfaces", "local-goal-board", "scripts", "local-goal-board.mjs")), true);

    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    assert.match(config, /\[plugins\."goalbuddy@goalbuddy"\]/);
    assert.match(config, /enabled = true/);

    const doctor = runGoalMaker(["doctor", "--target", "codex", "--goal-ready", "--codex-home", codexHome], { env });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.equal(doctorReport.codex_install_model, "plugin");
    assert.equal(doctorReport.plugin.skill_installed, true);
    assert.equal(doctorReport.skill_installed, false);
    assert.equal(doctorReport.compatibility_skill_installed, false);
    assert.deepEqual(doctorReport.warnings, []);
    assert.deepEqual(doctorReport.errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin install removes stale personal Codex GoalBuddy skills", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const fakeBin = fakeCodexBin(root);
    const env = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    };

    const staleSkill = join(codexHome, "skills", "goalbuddy");
    const staleAlias = join(codexHome, "skills", "goal-maker");
    mkdirSync(staleSkill, { recursive: true });
    mkdirSync(staleAlias, { recursive: true });
    writeFileSync(join(staleSkill, "SKILL.md"), "stale GoalBuddy skill\n");
    writeFileSync(join(staleAlias, "SKILL.md"), "stale Goal Maker alias\n");

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const report = JSON.parse(install.stdout);
    assert.match(report.removed_legacy_skill_paths[0], pathSuffixPattern("skills", "goalbuddy"));
    assert.match(report.removed_legacy_skill_paths[1], pathSuffixPattern("skills", "goal-maker"));
    assert.equal(existsSync(staleSkill), false);
    assert.equal(existsSync(staleAlias), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reset removes only GoalBuddy-owned Codex runtime surfaces", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const configPath = join(codexHome, "config.toml");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(configPath, [
      '[plugins."goalbuddy@goalbuddy"]',
      "enabled = true",
      "",
      '[plugins."goalbuddy@goalbuddy".settings]',
      'token = "remove-me"',
      "",
      '[plugins."github@openai-curated"]',
      "enabled = true",
      "",
      "[marketplaces.goalbuddy]",
      'source = "tolibear/goalbuddy"',
      'source_type = "git"',
      "",
      "[marketplaces.goalbuddy.settings]",
      'token = "remove-me-too"',
      "",
      "[marketplaces.other]",
      'source = "openai/curated"',
      "",
    ].join("\n"));

    const cacheRoot = join(codexHome, "plugins", "cache", "goalbuddy", "goalbuddy", packageVersion);
    mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(join(cacheRoot, "sentinel.txt"), "cached\n");

    const agentsRoot = join(codexHome, "agents");
    mkdirSync(agentsRoot, { recursive: true });
    for (const file of ["goal_judge.toml", "goal_keeper.toml", "goal_ledger.toml", "goal_scout.toml", "other.toml"]) {
      writeFileSync(join(agentsRoot, file), `${file}\n`);
    }
    mkdirSync(join(agentsRoot, "goal_worker.toml"), { recursive: true });
    writeFileSync(join(agentsRoot, "goal_worker.toml", "sentinel.txt"), "corrupt agent path\n");

    const staleSkill = join(codexHome, "skills", "goalbuddy");
    const staleAlias = join(codexHome, "skills", "goal-maker");
    mkdirSync(staleSkill, { recursive: true });
    mkdirSync(staleAlias, { recursive: true });
    writeFileSync(join(staleSkill, "SKILL.md"), "stale GoalBuddy skill\n");
    writeFileSync(join(staleAlias, "SKILL.md"), "stale Goal Maker alias\n");

    const reset = runGoalMaker(["reset", "--target", "codex", "--codex-home", codexHome, "--json"]);
    assert.equal(reset.status, 0, reset.stderr || reset.stdout);
    const report = JSON.parse(reset.stdout);
    assert.deepEqual(report.removed_config_sections, [
      '[plugins."goalbuddy@goalbuddy"]',
      "[marketplaces.goalbuddy]",
    ]);
    assert.match(report.removed_plugin_cache_paths[0], pathSuffixPattern("plugins", "cache", "goalbuddy"));
    assert.equal(report.removed_agents.length, 5);
    assert.equal(report.removed_legacy_skill_paths.length, 2);

    const config = readFileSync(configPath, "utf8");
    assert.doesNotMatch(config, /goalbuddy@goalbuddy/);
    assert.doesNotMatch(config, /\[marketplaces\.goalbuddy\]/);
    assert.doesNotMatch(config, /remove-me/);
    assert.doesNotMatch(config, /remove-me-too/);
    assert.match(config, /\[plugins\."github@openai-curated"\]/);
    assert.match(config, /\[marketplaces\.other\]/);
    assert.equal(existsSync(join(codexHome, "plugins", "cache", "goalbuddy")), false);
    assert.equal(existsSync(join(agentsRoot, "goal_worker.toml")), false);
    assert.equal(existsSync(join(agentsRoot, "other.toml")), true);
    assert.equal(existsSync(staleSkill), false);
    assert.equal(existsSync(staleAlias), false);

    const secondReset = runGoalMaker(["reset", "--codex-home", codexHome, "--json"]);
    assert.equal(secondReset.status, 0, secondReset.stderr || secondReset.stdout);
    const secondReport = JSON.parse(secondReset.stdout);
    assert.deepEqual(secondReport.removed_config_sections, []);
    assert.deepEqual(secondReport.removed_plugin_cache_paths, []);
    assert.deepEqual(secondReport.removed_agents, []);
    assert.deepEqual(secondReport.removed_legacy_skill_paths, []);

    const doctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env: fakeCodexEnv(root) });
    assert.equal(doctor.status, 1, doctor.stderr || doctor.stdout);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.deepEqual(doctorReport.installed_agents, []);
    assert.deepEqual(doctorReport.stale_agents, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin install ignores non-version cache directories", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const fakeBin = fakeCodexBin(root);
    const env = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    };

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const stalePreservePath = join(codexHome, "plugins", "cache", "goalbuddy", "goalbuddy", ".goalbuddy-preserved-extend-123-456");
    mkdirSync(stalePreservePath, { recursive: true });

    const reinstall = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
    assert.equal(JSON.parse(reinstall.stdout).version, packageVersion);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin reinstall does not leave empty preserved cache directories", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const fakeBin = fakeCodexBin(root);
    const env = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    };

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const reinstall = runGoalMaker(["plugin", "install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(reinstall.status, 0, reinstall.stderr || reinstall.stdout);

    const cacheRoot = join(codexHome, "plugins", "cache", "goalbuddy", "goalbuddy");
    const preservedDirs = readdirSync(cacheRoot).filter((entry) => entry.startsWith(".goalbuddy-preserved-"));
    assert.deepEqual(preservedDirs, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plugin install output points to Goal Prep and the local goal surface", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Agents: 5 installed/);
    assert.match(install.stdout, /\$goal-prep/);
    assert.match(install.stdout, /Goal surface/);
    assert.match(install.stdout, /npx goalbuddy board docs\/goals\/<slug>/);
    assert.doesNotMatch(install.stdout, /goalbuddy extend/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("update preserves an existing marketplace source unless explicitly overridden", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const configPath = join(codexHome, "config.toml");
    const localSource = join(root, "local-goalbuddy");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(configPath, [
      "[marketplaces.goalbuddy]",
      'source_type = "local"',
      `source = ${JSON.stringify(localSource)}`,
      "",
    ].join("\n"));
    const env = fakeCodexEnv(root);

    const preserved = runGoalMaker(["update", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(preserved.status, 0, preserved.stderr || preserved.stdout);
    assert.equal(JSON.parse(preserved.stdout).marketplace_source, localSource);

    const overridden = runGoalMaker([
      "update",
      "--target",
      "codex",
      "--source",
      "tolibear/goalbuddy",
      "--codex-home",
      codexHome,
      "--json",
    ], { env });
    assert.equal(overridden.status, 0, overridden.stderr || overridden.stdout);
    assert.equal(JSON.parse(overridden.stdout).marketplace_source, "tolibear/goalbuddy");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--help on mutating commands prints help without installing", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");

    const pluginHelp = runGoalMaker(["plugin", "install", "--help", "--codex-home", codexHome]);
    assert.equal(pluginHelp.status, 0, pluginHelp.stderr || pluginHelp.stdout);
    assert.match(pluginHelp.stdout, /GoalBuddy Plugin/);
    assert.equal(existsSync(codexHome), false);

    const updateHelp = runGoalMaker(["update", "--help", "--codex-home", codexHome, "--claude-home", claudeHome]);
    assert.equal(updateHelp.status, 0, updateHelp.stderr || updateHelp.stdout);
    assert.match(updateHelp.stdout, /goalbuddy update/);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default command installs the native Codex plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const report = JSON.parse(install.stdout);
    assert.equal(report.installed, true);
    assert.equal(report.plugin, "goalbuddy@goalbuddy");
    assert.equal(report.agents.length, 5);
    assert.equal(existsSync(join(codexHome, "skills", "goalbuddy", "SKILL.md")), false);
    assert.equal(existsSync(join(codexHome, "agents", "goal_worker.toml")), true);
    assert.equal(existsSync(join(codexHome, "agents", "goal_keeper.toml")), true);
    assert.equal(existsSync(join(codexHome, "agents", "goal_ledger.toml")), true);

    const config = readFileSync(join(codexHome, "config.toml"), "utf8");
    assert.match(config, /\[plugins\."goalbuddy@goalbuddy"\]/);
    assert.match(config, /enabled = true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("default command installs Codex and Claude Code when both homes are provided", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["--codex-home", codexHome, "--claude-home", claudeHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const report = JSON.parse(install.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.codex.installed, true);
    assert.equal(report.claude.skill.status, "installed");
    assert.equal(existsSync(join(codexHome, "config.toml")), true);
    assert.equal(existsSync(join(claudeHome, "skills", "goal-prep", "SKILL.md")), true);
    assert.equal(existsSync(join(claudeHome, "agents", "goal-worker.md")), true);
    assert.equal(existsSync(join(claudeHome, "agents", "goal-keeper.md")), true);
    assert.equal(existsSync(join(claudeHome, "agents", "goal-ledger.md")), true);
    assert.equal(existsSync(join(claudeHome, "commands", "goal-prep.md")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install removes a pre-existing legacy ~/.claude/commands/goal-prep.md", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const claudeHome = join(root, "claude-home");
    const legacyCommand = join(claudeHome, "commands", "goal-prep.md");
    mkdirSync(join(claudeHome, "commands"), { recursive: true });
    writeFileSync(legacyCommand, "stale wrapper from older GoalBuddy install\n");

    const install = runGoalMaker(["install", "--target", "claude", "--claude-home", claudeHome, "--json"]);
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const report = JSON.parse(install.stdout);
    assert.equal(report.legacy_commands_cleanup.removed, true);
    assert.equal(existsSync(legacyCommand), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("update refreshes Codex plugin and Claude Code install together", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["--codex-home", codexHome, "--claude-home", claudeHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    writeFileSync(join(claudeHome, "agents", "goal-worker.md"), "stale\n");

    const update = runGoalMaker(["update", "--codex-home", codexHome, "--claude-home", claudeHome, "--json"], { env });
    assert.equal(update.status, 0, update.stderr || update.stdout);
    const report = JSON.parse(update.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.claude.agents.find((agent) => agent.file === "goal-worker.md").status, "updated");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install reports Codex plugin state in json mode", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const result = runGoalMaker(["install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const report = JSON.parse(result.stdout);
    assert.equal(report.installed, true);
    assert.equal(report.plugin, "goalbuddy@goalbuddy");
    assert.match(report.cache_path, pathSuffixPattern("plugins", "cache", "goalbuddy", "goalbuddy", packageVersion));
    assert.equal(report.agents.length, 5);
    assert.equal(existsSync(join(codexHome, "skills", "goalbuddy")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("legacy goal-maker invocation prints rebrand notice only for human output", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = {
      ...process.env,
      GOALBUDDY_INVOKED_AS: "goal-maker",
      PATH: `${fakeCodexBin(root)}${delimiter}${process.env.PATH}`,
    };

    const human = runGoalMaker(["--help"], { env });
    assert.equal(human.status, 0, human.stderr || human.stdout);
    assert.match(human.stdout, /GoalBuddy for Claude Code and Codex/);
    assert.match(human.stdout, /goalbuddy install/);
    assert.match(human.stderr, /goal-maker has been rebranded to goalbuddy/);
    assert.match(human.stderr, /Use: npx goalbuddy/);

    const json = runGoalMaker(["install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(json.status, 0, json.stderr || json.stdout);
    assert.equal(json.stderr, "");
    const report = JSON.parse(json.stdout);
    assert.equal(report.plugin, "goalbuddy@goalbuddy");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install removes legacy skill folders and keeps plugin install authoritative", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const legacySkill = join(codexHome, "skills", "goal-maker");
    mkdirSync(legacySkill, { recursive: true });
    writeFileSync(join(legacySkill, ".goal-maker-install.json"), JSON.stringify({
      package_name: "goal-maker",
      package_version: "0.2.9",
    }));

    const install = runGoalMaker(["install", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const report = JSON.parse(install.stdout);
    assert.match(report.removed_legacy_skill_paths[0], pathSuffixPattern("skills", "goal-maker"));

    const doctor = runGoalMaker(["doctor", "--codex-home", codexHome], { env });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.equal(doctorReport.plugin.skill_installed, true);
    assert.equal(doctorReport.skill_installed, false);
    assert.equal(doctorReport.compatibility_skill_installed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("board command launches the bundled local board surface", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const goalDir = join(root, "docs", "goals", "demo");
    mkdirSync(join(goalDir, "notes"), { recursive: true });
    writeFileSync(join(goalDir, "goal.md"), "# Demo\n");
    writeFileSync(join(goalDir, "state.yaml"), `
version: 2
goal:
  title: "Demo"
  slug: "demo"
  kind: specific
  tranche: "demo"
  status: active
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
    objective: "Map the demo."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

    const installCore = runGoalMaker(["install", "--codex-home", codexHome], { env });
    assert.equal(installCore.status, 0, installCore.stderr || installCore.stdout);

    const board = runGoalMaker([
      "board",
      join("docs", "goals", "demo"),
      "--codex-home",
      codexHome,
      "--once",
      "--json",
      "--port",
      "0",
    ], { cwd: root });
    assert.equal(board.status, 0, board.stderr || board.stdout);

    const report = JSON.parse(board.stdout);
    assert.equal(report.goalDir, realpathSync(goalDir));
    assert.equal(existsSync(join(goalDir, ".goalbuddy-board", "index.html")), true);
    assert.equal(report.board.goal.slug, "demo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("errors when a path option is missing its value", () => {
  const result = runGoalMaker(["doctor", "--codex-home", "--json"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing value for --codex-home/);
});

test("judge receipt contract includes worker_package in every surface", () => {
  const tomlSchema = receiptContractSchema("goalbuddy/agents/goal_judge.toml");
  const mdSchema = receiptContractSchema("plugins/goalbuddy/agents/goal-judge.md");
  assert.deepEqual(Object.keys(tomlSchema.worker_package), ["objective", "allowed_files", "verify", "stop_if"]);
  assert.deepEqual(mdSchema.worker_package, tomlSchema.worker_package);
});

test("ledger audit contract is parseable and aligned across both harnesses", () => {
  const tomlSchema = ledgerAuditContractSchema("goalbuddy/agents/goal_ledger.toml");
  const mdSchema = ledgerAuditContractSchema("plugins/goalbuddy/agents/goal-ledger.md");
  assert.deepEqual(mdSchema, tomlSchema);
  assert.equal(tomlSchema.state_digest, "<state.yaml SHA-256 from the resume response | null>");
  assert.equal(tomlSchema.verdict, "congruent | discrepant | uncertain");
  assert.equal(tomlSchema.main_agent_action, "continue | escalate");
});

test("keeper receipt contract is parseable and aligned across both harnesses", () => {
  const tomlSchema = keeperReceiptContractSchema("goalbuddy/agents/goal_keeper.toml");
  const mdSchema = keeperReceiptContractSchema("plugins/goalbuddy/agents/goal-keeper.md");
  assert.deepEqual(mdSchema, tomlSchema);
  assert.equal(tomlSchema.result, "done | no_change | blocked");
  assert.equal(tomlSchema.checker_status, "pass | fail | not_run");
  assert.equal(tomlSchema.expected_after_confirmed, false);
});

test("installs the Claude skill as goal-prep and migrates the legacy directory", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-skill-rename-"));
  try {
    const claudeHome = join(root, "claude");
    mkdirSync(join(claudeHome, "skills", "goalbuddy"), { recursive: true });
    writeFileSync(join(claudeHome, "skills", "goalbuddy", "SKILL.md"), "legacy\n");
    const result = runGoalMaker(["install", "--target", "claude", "--claude-home", claudeHome, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(claudeHome, "skills", "goal-prep", "SKILL.md")), true);
    assert.equal(existsSync(join(claudeHome, "skills", "goalbuddy")), false);

    const doctor = runGoalMaker(["doctor", "--target", "claude", "--claude-home", claudeHome]);
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.legacy_skill_present, false);
    assert.equal(report.capabilities.atomic_amendment_transition, true);
    assert.match(report.skill_path, pathSuffixPattern("skills", "goal-prep", "SKILL.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("installs the /goal command for Claude Code", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-goal-command-"));
  try {
    const claudeHome = join(root, "claude");
    const result = runGoalMaker(["install", "--target", "claude", "--claude-home", claudeHome, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const command = readFileSync(join(claudeHome, "commands", "goal.md"), "utf8");
    assert.match(command, /GoalBuddy/);
    assert.match(command, /state\.yaml/);

    const doctor = runGoalMaker(["doctor", "--target", "claude", "--claude-home", claudeHome]);
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    assert.equal(JSON.parse(doctor.stdout).goal_command_present, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an invalid --target value", () => {
  const result = runGoalMaker(["doctor", "--target", "bogus"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Invalid --target: bogus/);
});

test("emits JSON for early argument errors when --json is set", () => {
  const result = runGoalMaker(["doctor", "--codex-home", "--json"]);
  assert.equal(result.status, 2);
  const report = JSON.parse(result.stderr);
  assert.equal(report.ok, false);
  assert.match(report.error, /Missing value for --codex-home/);
});

test("repeated flags take the last value", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-last-wins-"));
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    const result = runGoalMaker(["install", "--target", "claude", "--claude-home", first, "--claude-home", second, "--json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(second, "skills", "goal-prep", "SKILL.md")), true);
    assert.equal(existsSync(join(first, "skills")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeResumeGoal(repoRoot, slug, { active = true } = {}) {
  const goalDir = join(repoRoot, "docs", "goals", slug);
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), `# ${slug}\n`);
  writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "${slug} goal"
  slug: "${slug}"
  kind: specific
  tranche: "test"
  status: ${active ? "active" : "done"}
  oracle:
    signal: "The widget behavior is verified."
    final_proof: "A passing npm test receipt and final Judge audit."
  intake:
    original_request: "Make the widget work."
    interpreted_outcome: "The widget works and the test proves it."
    authority: approved
    proof_type: test
    completion_proof: "npm test passes and the final audit is complete."
    likely_misfire: "Changing code without proving behavior."
rules:
  continuous_until_full_outcome: true
  missing_input_or_credentials_do_not_stop_goal: true
  goal_pressure_requires_oracle: true
  no_completion_on_weak_proof: true
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: ${active ? "T002" : "null"}
tasks:
  - id: T000
    type: pm
    assignee: PM
    status: done
    objective: "Record old orientation."
    receipt:
      result: done
      summary: "OLD_RECEIPT_SHOULD_NOT_APPEAR"
  - id: T001
    type: pm
    assignee: PM
    status: done
    objective: "Select the widget task."
    receipt:
      result: done
      summary: "Recent transition selected the bounded widget task."
      note: notes/T001-transition.md
  - id: T002
    type: worker
    assignee: Worker
    status: ${active ? "active" : "done"}
    objective: "Fix the widget in ${slug}."
    allowed_files:
      - src/widget.mjs
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt: ${active ? "null" : `
      result: done
      changed_files:
        - src/widget.mjs
      commands:
        - cmd: npm test
          status: pass
      summary: "done"`}
${active ? "" : `  - id: T999
    type: judge
    assignee: Judge
    status: done
    objective: "Audit the completed widget outcome."
    receipt:
      result: done
      decision: complete
      full_outcome_complete: true
      rationale: "The widget is complete and npm test passed."
      evidence:
        - src/widget.mjs
`}checks:
  dirty_fingerprint: unknown
  last_verification:
    result: ${active ? "unknown" : "pass"}
    task: ${active ? "null" : "T002"}
    commands:${active ? " []" : `
      - cmd: npm test
        status: pass`}
`);
  writeFileSync(join(goalDir, "notes", "T001-transition.md"), "# T001 transition\n\nThe recent task-selection evidence.\n");
  return goalDir;
}

test("resume lists boards and prints the handoff command for active goals", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-"));
  try {
    writeResumeGoal(root, "one", { active: true });
    writeResumeGoal(root, "two", { active: false });

    const result = runGoalMaker(["resume"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /one goal/);
    assert.match(result.stdout, /two goal/);
    assert.match(result.stdout, /T002 \(worker\) Fix the widget in one\./);
    assert.match(result.stdout, /Resume in any harness \(Codex or Claude Code\)/);
    assert.match(result.stdout, /\/goal Follow docs\/goals\/one\/goal\.md\./);
    assert.doesNotMatch(result.stdout, /\/goal Follow docs\/goals\/two\/goal\.md\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume --json returns structured boards", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-json-"));
  try {
    writeResumeGoal(root, "one", { active: true });
    const result = runGoalMaker(["resume", "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.boards.length, 1);
    assert.equal(report.boards[0].slug, "one");
    assert.equal(report.boards[0].status, "active");
    assert.equal(report.boards[0].active_task.id, "T002");
    assert.equal(report.boards[0].run_command, "/goal Follow docs/goals/one/goal.md.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume scoped to one goal dir returns a validated continuation projection", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-scoped-"));
  try {
    writeResumeGoal(root, "one", { active: true });
    writeResumeGoal(root, "two", { active: false });

    const scoped = runGoalMaker(["resume", "docs/goals/one", "--json"], { cwd: root });
    assert.equal(scoped.status, 0, scoped.stderr || scoped.stdout);
    const scopedReport = JSON.parse(scoped.stdout);
    assert.equal(scopedReport.ok, true);
    assert.equal(scopedReport.schema_version, 1);
    assert.equal(scopedReport.checker.ok, true);
    assert.equal(scopedReport.checker.state_digest, scopedReport.board.state_digest);
    assert.equal(scopedReport.board.slug, "one");
    assert.match(scopedReport.board.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(scopedReport.board.state_digest_status, "checker_validated");
    assert.equal(scopedReport.board.intake.original_request, "Make the widget work.");
    assert.equal(scopedReport.board.intake.interpreted_outcome, "The widget works and the test proves it.");
    assert.equal(scopedReport.board.active_task.id, "T002");
    assert.deepEqual(scopedReport.board.active_task.allowed_files, ["src/widget.mjs"]);
    assert.deepEqual(scopedReport.board.active_task.verify, ["npm test"]);
    assert.deepEqual(scopedReport.board.active_task.stop_if, ["Need files outside allowed_files."]);
    assert.equal(scopedReport.board.recent_receipt.task_id, "T001");
    assert.equal(scopedReport.board.recent_receipt.note, "notes/T001-transition.md");
    assert.doesNotMatch(scoped.stdout, /OLD_RECEIPT_SHOULD_NOT_APPEAR/);
    assert.equal(scopedReport.recovery.audit_required, true);
    assert.equal(scopedReport.recovery.audit_agent.codex, "goal_ledger");
    assert.equal(scopedReport.recovery.audit_agent.claude_code, "goal-ledger");
    assert.equal(scopedReport.recovery.continue_only_on, "congruent");
    assert.equal(scopedReport.recovery.worker_liveness, "unknown");
    assert.equal(scopedReport.recovery.continuation_allowed_after_audit, true);
    assert.match(scopedReport.commands.resume, /^node /);
    assert.match(scopedReport.commands.resume, /scripts\/resume-board\.mjs/);

    const direct = spawnSync(process.execPath, [bundledResume, "docs/goals/one", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(direct.status, 0, direct.stderr || direct.stdout);
    assert.deepEqual(JSON.parse(direct.stdout), scopedReport);

    const scopedHuman = runGoalMaker(["resume", "docs/goals/one"], { cwd: root });
    assert.equal(scopedHuman.status, 0, scopedHuman.stderr || scopedHuman.stdout);
    assert.match(scopedHuman.stdout, /State digest: [a-f0-9]{64}/);
    assert.match(scopedHuman.stdout, /Recovery audit required before continuation/);

    const complete = runGoalMaker(["resume", "docs/goals/two", "--json"], { cwd: root });
    assert.equal(complete.status, 0, complete.stderr || complete.stdout);
    const completeReport = JSON.parse(complete.stdout);
    assert.equal(completeReport.board.slug, "two");
    assert.equal(completeReport.board.active_task, null);
    assert.equal(completeReport.recovery.continuation_allowed_after_audit, false);

    const empty = mkdtempSync(join(tmpdir(), "goalbuddy-resume-empty-"));
    try {
      const none = runGoalMaker(["resume", "--json"], { cwd: empty });
      assert.equal(none.status, 0, none.stderr || none.stdout);
      assert.deepEqual(JSON.parse(none.stdout).boards, []);
      const human = runGoalMaker(["resume"], { cwd: empty });
      assert.match(human.stdout, /No GoalBuddy boards found/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume scoped to an invalid board fails closed with checker evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-invalid-"));
  try {
    const goalDir = writeResumeGoal(root, "invalid", { active: true });
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(statePath, readFileSync(statePath, "utf8").replace("active_task: T002", "active_task: T404"));

    const result = runGoalMaker(["resume", "docs/goals/invalid", "--json"], { cwd: root });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.checker.ok, false);
    assert.match(report.board.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(report.board.state_digest_status, "observed_unvalidated");
    assert.equal(report.recovery.mode, "full_board_review");
    assert.equal(report.recovery.main_agent_action, "inspect_full_board");
    assert.equal(report.recovery.continuation_allowed, false);
    assert.match(report.checker.errors.join("\n"), /active_task/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume rejects a checker-green board when only the lossy parser can render it", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-strict-projection-"));
  try {
    const goalDir = writeResumeGoal(root, "strict-projection", { active: true });
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(
      statePath,
      readFileSync(statePath, "utf8").replace(
        '      summary: "Recent transition selected the bounded widget task."',
        "      summary: |\n        Recent transition selected the bounded widget task.",
      ),
    );

    const result = runGoalMaker(["resume", "docs/goals/strict-projection", "--json"], { cwd: root });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.checker.ok, true);
    assert.match(report.board.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(report.board.state_digest_status, "checker_validated");
    assert.equal(report.recovery.mode, "full_board_review");
    assert.equal(report.recovery.continuation_allowed, false);
    assert.match(report.errors.join("\n"), /Block scalar YAML is not supported/);
    assert.equal(report.board.active_task, undefined);
    assert.equal(report.board.approval_gates, undefined);

    const prompt = runGoalMaker(["prompt", "docs/goals/strict-projection", "--json"], { cwd: root });
    assert.equal(prompt.status, 1, prompt.stderr || prompt.stdout);
    assert.match(prompt.stderr, /Block scalar YAML is not supported/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume rejects duplicate mapping keys instead of projecting a different value than the checker", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-duplicate-key-"));
  try {
    const goalDir = writeResumeGoal(root, "duplicate-key", { active: true });
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(
      statePath,
      readFileSync(statePath, "utf8").replace(
        "active_task: T002",
        "active_task: T002\nactive_task: T001",
      ),
    );

    const result = runGoalMaker(["resume", "docs/goals/duplicate-key", "--json"], { cwd: root });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.checker.ok, true);
    assert.equal(report.recovery.mode, "full_board_review");
    assert.equal(report.recovery.continuation_allowed, false);
    assert.match(report.errors.join("\n"), /Duplicate mapping key "active_task"/);
    assert.equal(report.board.active_task, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume preserves an unresolved exact-approval gate without inventing an active task", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-approval-"));
  try {
    const goalDir = join(root, "docs", "goals", "production-migration");
    mkdirSync(join(goalDir, "notes"), { recursive: true });
    writeFileSync(join(goalDir, "goal.md"), "# Production migration\n");
    writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "Run production migration"
  slug: "production-migration"
  kind: specific
  tranche: "Apply the migration after exact owner approval."
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
      waiting_for_user_approval: true
      required_reply: "approve 20260711120000"
      blocked_reason: "Production migration requires exact human approval."
      summary: "Asked once for the exact approval phrase and stopped."
checks:
  dirty_fingerprint: clean
  last_verification:
    result: pass
    task: T001
    commands:
      - cmd: npm test
        status: pass
`);

    const result = runGoalMaker(["resume", "docs/goals/production-migration", "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.board.status, "blocked");
    assert.equal(report.board.active_task, null);
    assert.equal(report.board.approval_gates.length, 1);
    assert.equal(report.board.approval_gates[0].task_id, "T001");
    assert.equal(report.board.approval_gates[0].required_reply, "approve 20260711120000");
    assert.equal(report.board.blocked_tasks[0].waiting_for_user_approval, true);
    assert.equal(report.recovery.continuation_allowed_after_audit, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("init scaffolds a working board from the bundled templates", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-init-"));
  try {
    const created = runGoalMaker(["init", "ship-widgets", "--json"], { cwd: root });
    assert.equal(created.status, 0, created.stderr || created.stdout);
    const report = JSON.parse(created.stdout);
    assert.equal(report.slug, "ship-widgets");
    assert.equal(report.run_command, "/goal Follow docs/goals/ship-widgets/goal.md.");
    const state = readFileSync(join(root, "docs", "goals", "ship-widgets", "state.yaml"), "utf8");
    assert.match(state, /version: 2/);
    assert.match(state, /slug: "ship-widgets"/);
    assert.match(state, /title: "Ship Widgets"/);
    assert.equal(existsSync(join(root, "docs", "goals", "ship-widgets", "notes")), true);

    const resume = runGoalMaker(["resume", "--json"], { cwd: root });
    assert.equal(resume.status, 0, resume.stderr || resume.stdout);
    const boards = JSON.parse(resume.stdout).boards;
    assert.equal(boards[0].slug, "ship-widgets");
    assert.equal(boards[0].status, "active");

    const again = runGoalMaker(["init", "ship-widgets"], { cwd: root });
    assert.equal(again.status, 2);
    assert.match(again.stderr, /already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
