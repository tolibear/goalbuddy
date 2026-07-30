import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { receiptExample, validateTaskReceipt } from "../../goalbuddy/scripts/receipt-contract.mjs";
import { projectTransitionEvidence } from "../../goalbuddy/scripts/resume-board.mjs";
import { createCheckedSemanticFrontier } from "../../goalbuddy/scripts/frontier.mjs";

const cli = resolve("internal/cli/goal-maker.mjs");
const bundledResume = resolve("goalbuddy/scripts/resume-board.mjs");
const bundledFrontier = resolve("goalbuddy/scripts/frontier.mjs");
const compilerPreflight = resolve("codex-goal-compiler/scripts/check_goalbuddy_runtime.py");
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const runtimeCapabilities = {
  atomic_amendment_transition: true,
  atomic_placeholder_hydration_transition: true,
  lossless_receipt_identity: true,
  strict_multiline_yaml_projection: true,
  closed_judge_decision_vocabulary: true,
  atomic_exact_human_wait_resume: true,
  atomic_goal_completion: true,
  task_bound_codex_exec_resume: true,
};

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

function runParallelPlan(goal, options = {}) {
  const resume = runGoalMaker(["resume", goal, "--json"], options);
  assert.equal(resume.status, 0, resume.stderr || resume.stdout);
  const report = JSON.parse(resume.stdout);
  return runGoalMaker([
    "parallel-plan",
    goal,
    "--expected-state-digest",
    report.board.state_digest,
    "--expected-board-tree-digest",
    report.board.tree.digest,
    "--json",
  ], options);
}

function testEnv(env) {
  const result = { ...env };
  delete result.GITHUB_TOKEN;
  return result;
}

function writeGoalSupport(goalDir, title = "Goal") {
  mkdirSync(join(goalDir, "notes"), { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), `# ${title}\n`);
}

function pathSuffixPattern(...segments) {
  return new RegExp(`${segments.map(escapeRegExp).join("[\\\\/]")}$`);
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function snapshotPath(path) {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat) return null;
  if (stat.isSymbolicLink()) return { type: "symlink", target: readlinkSync(path) };
  if (stat.isFile()) return { type: "file", hash: createHash("sha256").update(readFileSync(path)).digest("hex") };
  if (stat.isDirectory()) {
    return {
      type: "directory",
      entries: Object.fromEntries(readdirSync(path).sort().map((entry) => [entry, snapshotPath(join(path, entry))])),
    };
  }
  return { type: "other" };
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
      "if \"%~1\"==\"plugin\" if \"%~2\"==\"marketplace\" if \"%~3\"==\"remove\" (type nul > \"%HOME%\\.goalbuddy-marketplace-removed\"& echo Removed marketplace goalbuddy& exit /b 0)",
      "if \"%~1\"==\"plugin\" if \"%~2\"==\"marketplace\" if \"%~3\"==\"add\" (",
      "  if \"%GOALBUDDY_TEST_REQUIRE_MARKETPLACE_REMOVE%\"==\"1\" if not exist \"%HOME%\\.goalbuddy-marketplace-removed\" (echo marketplace goalbuddy is already added from a different source 1>&2& exit /b 1)",
      "  echo Added marketplace goalbuddy& exit /b 0",
      ")",
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
      "if [ \"$1\" = \"plugin\" ] && [ \"$2\" = \"marketplace\" ] && [ \"$3\" = \"remove\" ]; then",
      "  : > \"$HOME/.goalbuddy-marketplace-removed\"",
      "  echo \"Removed marketplace goalbuddy\"; exit 0",
      "fi",
      "if [ \"$1\" = \"plugin\" ] && [ \"$2\" = \"marketplace\" ] && [ \"$3\" = \"add\" ]; then",
      "  if [ \"$GOALBUDDY_TEST_REQUIRE_MARKETPLACE_REMOVE\" = \"1\" ] && [ ! -f \"$HOME/.goalbuddy-marketplace-removed\" ]; then",
      "    echo \"marketplace goalbuddy is already added from a different source\" >&2; exit 1",
      "  fi",
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
    HOME: root,
    PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
  };
}

test("--version is read-only and never falls through to installation", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-version-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const result = runGoalMaker(["--version", "--codex-home", codexHome, "--claude-home", claudeHome], {
      env: { ...process.env, HOME: root },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), packageVersion);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
    assert.deepEqual(report.capabilities, runtimeCapabilities);
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

test("contract exposes the stable Codex compiler boundary after an isolated install", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-contract-codex-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const result = runGoalMaker(["contract", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.contract_version, 1);
    assert.equal(report.product_version, packageVersion);
    assert.equal(report.board_schema_version, 2);
    assert.equal(report.skills.goal_prep.path, join(codexHome, "plugins", "cache", "goalbuddy", "goalbuddy", packageVersion, "skills", "goal-prep"));
    assert.equal(report.skills.compiler.path, join(codexHome, "plugins", "cache", "goalbuddy", "goalbuddy", packageVersion, "skills", "codex-goal-compiler"));
    assert.match(report.skills.goal_prep.tree_fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(report.skills.goal_prep.tree_fingerprint, report.skills.goal_prep.source_tree_fingerprint);
    assert.equal(report.skills.compiler.tree_fingerprint, report.skills.compiler.source_tree_fingerprint);
    assert.deepEqual(report.capabilities, Object.keys(runtimeCapabilities).sort());
    assert.equal(report.target.name, "codex");
    assert.equal(report.target.install_model, "plugin");
    assert.equal(report.target.goal_prep_installed, true);
    assert.equal(report.target.compiler_installed, true);
    assert.equal(report.target.agents_ready, true);
    assert.equal(report.target.native_goal_ready, true);
    assert.equal(report.target.duplicate_compiler_present, false);
    assert.deepEqual(report.errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract exposes the stable Claude compiler boundary after an isolated install", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-contract-claude-"));
  try {
    const claudeHome = join(root, "claude-home");
    const env = { ...process.env, HOME: root };
    const install = runGoalMaker(["install", "--target", "claude", "--claude-home", claudeHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const result = runGoalMaker(["contract", "--target", "claude", "--claude-home", claudeHome, "--json"], { env });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.contract_version, 1);
    assert.equal(report.target.name, "claude");
    assert.equal(report.target.install_model, "personal-skills-and-agents");
    assert.equal(report.target.goal_prep_installed, true);
    assert.equal(report.target.compiler_installed, true);
    assert.equal(report.target.agents_ready, true);
    assert.equal(report.target.goal_command_ready, true);
    assert.equal(report.skills.goal_prep.path, join(claudeHome, "skills", "goal-prep"));
    assert.equal(report.skills.compiler.path, join(claudeHome, "skills", "codex-goal-compiler"));
    assert.equal(report.skills.goal_prep.tree_fingerprint, report.skills.goal_prep.source_tree_fingerprint);
    assert.equal(report.skills.compiler.tree_fingerprint, report.skills.compiler.source_tree_fingerprint);
    assert.deepEqual(report.errors, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract fails closed for a duplicate standalone Codex compiler", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-contract-duplicate-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const duplicate = join(root, ".agents", "skills", "codex-goal-compiler");
    mkdirSync(duplicate, { recursive: true });
    writeFileSync(join(duplicate, "SKILL.md"), "duplicate\n");

    const result = runGoalMaker(["contract", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.target.duplicate_compiler_present, true);
    assert.match(report.errors.join("\n"), /shadowing entry remains/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install retires only a recognized standalone compiler symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-retire-compiler-link-"));
  try {
    const codexHome = join(root, "codex-home");
    const oldCompiler = join(root, "Code", "skills", "shared", "skills", "codex-goal-compiler");
    const standalone = join(root, ".agents", "skills", "codex-goal-compiler");
    mkdirSync(oldCompiler, { recursive: true });
    writeFileSync(join(oldCompiler, "SKILL.md"), "old compiler\n");
    mkdirSync(dirname(standalone), { recursive: true });
    symlinkSync(oldCompiler, standalone, "dir");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["install", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const report = JSON.parse(install.stdout);
    assert.equal(report.standalone_compiler_cleanup.status, "removed_symlink");
    assert.equal(report.standalone_compiler_cleanup.previous_target, oldCompiler);
    assert.equal(report.standalone_compiler_cleanup.resolved_target, oldCompiler);
    assert.match(report.standalone_compiler_cleanup.previous_fingerprint, /^[0-9a-f]{64}$/);
    assert.equal(lstatSync(standalone, { throwIfNoEntry: false }), undefined);

    const doctor = runGoalMaker(["doctor", "--target", "codex", "--codex-home", codexHome], { env });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install refuses an unrecognized standalone compiler symlink before mutating either harness", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-refuse-unknown-compiler-link-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const unknownCompiler = join(root, "other", "codex-goal-compiler");
    const standalone = join(root, ".agents", "skills", "codex-goal-compiler");
    mkdirSync(unknownCompiler, { recursive: true });
    writeFileSync(join(unknownCompiler, "SKILL.md"), "user-owned compiler\n");
    mkdirSync(dirname(standalone), { recursive: true });
    symlinkSync(unknownCompiler, standalone, "dir");
    const before = snapshotPath(join(root, ".agents"));
    const env = fakeCodexEnv(root);

    const install = runGoalMaker([
      "install",
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--json",
    ], { env });
    assert.equal(install.status, 1, install.stderr || install.stdout);
    assert.match(install.stderr, /unrecognized standalone compiler symlink/);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
    assert.deepEqual(snapshotPath(join(root, ".agents")), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install refuses a non-symlink standalone compiler before mutating either harness", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-refuse-compiler-directory-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const standalone = join(root, ".agents", "skills", "codex-goal-compiler");
    mkdirSync(standalone, { recursive: true });
    writeFileSync(join(standalone, "SKILL.md"), "user-owned compiler\n");
    const before = snapshotPath(join(root, ".agents"));
    const env = fakeCodexEnv(root);

    const install = runGoalMaker([
      "install",
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--json",
    ], { env });
    assert.equal(install.status, 1, install.stderr || install.stdout);
    assert.match(install.stderr, /not a symlink and cannot be retired automatically/);
    assert.equal(JSON.parse(install.stderr).ok, false);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
    assert.deepEqual(snapshotPath(join(root, ".agents")), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("install restores every owned runtime byte after a failure at each activation checkpoint", () => {
  for (const checkpoint of ["codex", "claude", "compiler_retirement", "verification"]) {
    const root = mkdtempSync(join(tmpdir(), `goalbuddy-rollback-${checkpoint}-`));
    try {
      const codexHome = join(root, "codex-home");
      const claudeHome = join(root, "claude-home");
      const oldCompiler = join(root, "old-compiler");
      const standalone = join(root, ".agents", "skills", "codex-goal-compiler");

      mkdirSync(join(codexHome, "plugins", "cache", "goalbuddy"), { recursive: true });
      writeFileSync(join(codexHome, "config.toml"), "[plugins.other]\nenabled = true\n");
      writeFileSync(join(codexHome, "plugins", "cache", "goalbuddy", "sentinel.txt"), "old cache\n");
      for (const file of ["goal_judge.toml", "goal_keeper.toml", "goal_ledger.toml", "goal_scout.toml", "goal_worker.toml"]) {
        mkdirSync(join(codexHome, "agents"), { recursive: true });
        writeFileSync(join(codexHome, "agents", file), `old ${file}\n`);
      }
      for (const skill of ["goalbuddy", "goal-maker"]) {
        mkdirSync(join(codexHome, "skills", skill), { recursive: true });
        writeFileSync(join(codexHome, "skills", skill, "SKILL.md"), `old ${skill}\n`);
      }

      for (const skill of ["goal-prep", "codex-goal-compiler", "goalbuddy"]) {
        mkdirSync(join(claudeHome, "skills", skill), { recursive: true });
        writeFileSync(join(claudeHome, "skills", skill, "SKILL.md"), `old ${skill}\n`);
      }
      for (const file of ["goal-scout.md", "goal-judge.md", "goal-keeper.md", "goal-ledger.md", "goal-worker.md"]) {
        mkdirSync(join(claudeHome, "agents"), { recursive: true });
        writeFileSync(join(claudeHome, "agents", file), `old ${file}\n`);
      }
      mkdirSync(join(claudeHome, "commands"), { recursive: true });
      writeFileSync(join(claudeHome, "commands", "goal.md"), "old goal command\n");
      writeFileSync(join(claudeHome, "commands", "goal-prep.md"), "old legacy command\n");

      mkdirSync(oldCompiler, { recursive: true });
      writeFileSync(join(oldCompiler, "SKILL.md"), "old standalone compiler\n");
      mkdirSync(dirname(standalone), { recursive: true });
      symlinkSync(oldCompiler, standalone, "dir");

      const before = {
        codex: snapshotPath(codexHome),
        claude: snapshotPath(claudeHome),
        agents: snapshotPath(join(root, ".agents")),
      };
      const env = {
        ...fakeCodexEnv(root),
        GOALBUDDY_LEGACY_COMPILER_ROOT: oldCompiler,
        GOALBUDDY_TEST_FAIL_AFTER: checkpoint,
      };
      const install = runGoalMaker([
        "install",
        "--codex-home",
        codexHome,
        "--claude-home",
        claudeHome,
        "--json",
      ], { env });
      assert.equal(install.status, 1, `${checkpoint}: ${install.stderr || install.stdout}`);
      const failure = JSON.parse(install.stderr);
      assert.equal(failure.transaction.status, "rolled_back");
      assert.equal(failure.transaction.rollback_performed, true);
      assert.match(failure.error, new RegExp(`after ${checkpoint}`));
      assert.deepEqual(snapshotPath(codexHome), before.codex, `${checkpoint}: Codex bytes drifted`);
      assert.deepEqual(snapshotPath(claudeHome), before.claude, `${checkpoint}: Claude bytes drifted`);
      assert.deepEqual(snapshotPath(join(root, ".agents")), before.agents, `${checkpoint}: compiler link drifted`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("a failed fresh install removes transaction-created parent directories", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-fresh-rollback-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = {
      ...fakeCodexEnv(root),
      GOALBUDDY_TEST_FAIL_AFTER: "claude",
    };
    const install = runGoalMaker([
      "install",
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--json",
    ], { env });
    assert.equal(install.status, 1, install.stderr || install.stdout);
    assert.equal(JSON.parse(install.stderr).transaction.status, "rolled_back");
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("contract fails closed when the installed compiler differs from GoalBuddy", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-contract-stale-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);
    const install = runGoalMaker(["install", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const report = JSON.parse(install.stdout);
    writeFileSync(join(report.cache_path, "skills", "codex-goal-compiler", "SKILL.md"), "stale\n");

    const result = runGoalMaker(["contract", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const contract = JSON.parse(result.stdout);
    assert.equal(contract.ok, false);
    assert.match(contract.errors.join("\n"), /Codex Goal Compiler plugin skill is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundled compiler preflight consumes the real GoalBuddy contract for both harnesses", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-compiler-preflight-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = {
      ...fakeCodexEnv(root),
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
      GOALBUDDY_BIN: cli,
    };
    const install = runGoalMaker([
      "install",
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--json",
    ], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    for (const target of ["codex", "claude"]) {
      const result = spawnSync("python3", [compilerPreflight, "--target", target, "--json"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: testEnv(env),
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.ok, true);
      assert.equal(report.contract.contract_version, 1);
      assert.equal(report.contract.target.name, target);
    }
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
  assert.match(keeper, /default_permissions = ":workspace"/);
  assert.match(keeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(keeper, /Run `checker_command` after every mutation/);
  assert.match(keeper, /rebind_goalbuddy/);
  assert.match(keeper, /immutable_history_compatible/);
  assert.match(ledger, /model = "gpt-5\.6-sol"/);
  assert.match(ledger, /model_reasoning_effort = "medium"/);
  assert.match(ledger, /default_permissions = ":read-only"/);
  assert.match(ledger, /Independently read the complete `goal\.md`, root `state\.yaml`, and every depth-one child `state\.yaml`/);
  assert.match(ledger, /goalbuddy_ledger_audit_v1/);
  assert.match(ledger, /never `congruent`/);
  assert.match(worker, /model_reasoning_effort = "medium"/);
  assert.match(worker, /default_permissions = "workspace-network"/);
  assert.match(worker, /\[permissions\.workspace-network\]/);
  assert.match(worker, /extends = ":workspace"/);
  assert.match(worker, /\[permissions\.workspace-network\.network\]\nenabled = true/);
  assert.match(worker, /Edit only files matching allowed_files/);
  assert.match(worker, /Complete the whole assigned slice/);
  assert.match(worker, /result-specific done or blocked shape supplied in the current rendered task prompt/);
  assert.match(worker, /exact `cmd` and truthful `status`/);

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

test("check-update reports observed local-checkout provenance without consulting npm", () => {
  const env = {
    ...process.env,
    GOALBUDDY_TEST_NPM_LATEST_VERSION: "99.0.0",
    GOALBUDDY_UPDATE_COMMAND: "",
  };

  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.current_version, packageVersion);
  assert.equal(report.latest_version, null);
  assert.equal(report.update_available, false);
  assert.equal(report.check_status, "managed_local");
  assert.equal(report.update_mode, "local_checkout");
  assert.equal(report.source.verified, true);
  assert.equal(report.source.installed_bytes_match, true);
  assert.equal(report.update_command, "review and commit the local GoalBuddy checkout, refresh the Bun global package from that path, then run goalbuddy update");

  const human = runGoalMaker(["check-update"], { env });
  assert.equal(human.status, 0, human.stderr || human.stdout);
  assert.match(human.stdout, /bound to /);
  assert.match(human.stdout, /Installed package bytes match/);
  assert.match(human.stdout, /Update policy:/);
});

test("check-update honors a user-owned update command", () => {
  const env = {
    GOALBUDDY_UPDATE_COMMAND: "git -C /tmp/goalbuddy fetch origin main",
  };

  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).update_command, env.GOALBUDDY_UPDATE_COMMAND);
});

test("check-update never suggests a registry-owned install channel", () => {
  const env = {};
  const result = runGoalMaker(["check-update", "--json"], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.doesNotMatch(report.update_command, /npm|pnpm|bun update|plugin update/);
});

test("activation rejects package bytes that do not match the bound local checkout before mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-source-mismatch-"));
  try {
    const packageCopy = join(root, "package-copy");
    for (const entry of ["package.json", "codex-goal-compiler", "goalbuddy", "plugins/goalbuddy", "internal/cli"]) {
      cpSync(resolve(entry), join(packageCopy, entry), { recursive: true });
    }
    writeFileSync(join(packageCopy, "goalbuddy", "SKILL.md"), "mismatched package bytes\n");

    const bunInstall = join(root, "bun");
    const globalManifest = join(bunInstall, "install", "global", "package.json");
    mkdirSync(dirname(globalManifest), { recursive: true });
    writeFileSync(globalManifest, JSON.stringify({ dependencies: { goalbuddy: realpathSync(".") } }));

    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = {
      ...fakeCodexEnv(root),
      BUN_INSTALL: bunInstall,
    };
    const result = spawnSync(process.execPath, [
      join(packageCopy, "internal", "cli", "goal-maker.mjs"),
      "install",
      "--codex-home",
      codexHome,
      "--claude-home",
      claudeHome,
      "--json",
    ], { encoding: "utf8", env: testEnv(env) });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /package bytes do not match a verified local Git checkout/);
    assert.equal(JSON.parse(result.stderr).ok, false);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prompt renders a compact active task prompt without dumping full state", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const goal = join(root, "goal");
    writeGoalSupport(goal, "Prompt test");
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

    const stateDigest = createHash("sha256").update(readFileSync(join(goal, "state.yaml"))).digest("hex");
    const result = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.metadata.recommended_agent, "goal_worker");
    assert.equal(report.metadata.required_spawn_agent_type, "goal_worker");
    assert.equal(report.metadata.recommended_reasoning, "medium");
    assert.equal(report.metadata.sandbox, "workspace-write");
    assert.equal(report.metadata.changed_files_path_style, "repository-relative");
    assert.match(report.metadata.scope_change_recovery, /stop before those writes and return a blocked receipt/);
    assert.match(report.metadata.scope_change_recovery, /apply_amendment/);
    assert.match(report.metadata.scope_change_recovery, /apply_hydration/);
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
    assert.equal(report.receipt_schema.task_id, "T002");
    assert.equal(report.receipt_schema.board_path, report.metadata.board_path);
    assert.deepEqual(report.receipt_schema.commands, report.task.verify.map((cmd) => ({ cmd, status: "pass" })));
    assert.equal(Object.hasOwn(report.receipt_schema, "needs_judge"), false);
    assert.equal(Object.hasOwn(report.receipt_schema, "next_allowed_task"), false);
    assert.equal(result.stdout.includes("A previous finding that should not force a full state dump."), false);

    const stale = runGoalMaker(["prompt", goal, "--expected-state-digest", "0".repeat(64), "--json"]);
    assert.equal(stale.status, 1);
    assert.match(JSON.parse(stale.stdout).error, /state\.yaml digest drift/);

    const human = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest]);
    assert.equal(human.status, 0, human.stderr || human.stdout);
    assert.match(human.stdout, /Codex spawn_agent agent_type: goal_worker/);
    assert.match(human.stdout, /Do not substitute generic scout, worker, or judge agents/);
    assert.match(human.stdout, /wait_agent polling timeout while the target agent is still running is only a polling interval expiry/);
    assert.match(human.stdout, /Keep waiting on the same agent; do not interrupt, replace, redispatch, declare a task timeout, or trigger PM fallback/);
    assert.match(human.stdout, /Under the Quiet Control Plane, do not narrate polling or internal agent management/);
    assert.match(human.stdout, /report only product-level progress, review status, a real blocker, or a required decision/);
    assert.doesNotMatch(human.stdout, /periodic user-facing progress updates/);
    assert.match(human.stdout, /absence is not evidence of inactivity; read-only Judge\/Ledger work and inspection-only Keeper work may never create diffs/);
    assert.match(human.stdout, /terminal timeout, failed, or unavailable state/);
    assert.match(human.stdout, /configured job\/runtime deadline is actually exceeded/);
    assert.match(human.stdout, /Preserve one-agent\/no-duplicate dispatch/);
    assert.match(human.stdout, /changed_files must use repository-relative paths/);
    assert.match(human.stdout, /do not convert absolute paths to relative paths/);
    assert.match(human.stdout, /scope_change_recovery/);
    assert.match(human.stdout, /Do not widen or retry the active task/);
    assert.match(human.stdout, /apply_amendment/);
    assert.match(human.stdout, /apply_hydration/);
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
    writeGoalSupport(goal, "Absolute receipt path test");
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

    const stateDigest = createHash("sha256").update(readFileSync(join(goal, "state.yaml"))).digest("hex");
    const result = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest, "--json"]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).metadata.changed_files_path_style, "absolute");

    const human = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest]);
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
    writeGoalSupport(goal, "Relative prompt test");
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
      evidence:
        - docs/goals/demo/state.yaml
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

    const stateDigest = createHash("sha256").update(readFileSync(join(goal, "state.yaml"))).digest("hex");
    const cases = [
      ["prompt", "docs/goals/demo", "--task", "T002", "--expected-state-digest", stateDigest, "--json"],
      ["prompt", "docs/goals/demo", "--task=T002", "--expected-state-digest", stateDigest, "--json"],
      ["prompt", "--board", "docs/goals/demo/state.yaml", "--task", "T002", "--expected-state-digest", stateDigest, "--json"],
    ];
    for (const args of cases) {
      const result = runGoalMaker(args, { cwd: root });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.task.id, "T002", args.join(" "));
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
        reasoning: "medium",
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
      writeGoalSupport(goal, `${item.type} prompt contract`);
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

      const stateDigest = createHash("sha256").update(readFileSync(join(goal, "state.yaml"))).digest("hex");
      const result = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest, "--json"]);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      for (const resultName of ["done", "blocked"]) {
        const findings = validateTaskReceipt(report.receipt_schemas[resultName], {
          role: item.type,
          taskId: "T001",
          boardPath: report.metadata.board_path,
          verify: report.task.verify,
          terminalCompletionEligible: report.metadata.terminal_completion_eligible,
        });
        assert.deepEqual(findings, [], `${item.agent}:${resultName}`);
      }
      assert.deepEqual(report.receipt_schema, report.receipt_schemas.done, item.agent);
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
    writeGoalSupport(goal, "Prompt warning test");
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
    allowed_files:
      - lib/helper-1.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - lib/helper-1.ts
      commands:
        - cmd: npm test
          status: pass
      summary: "Added one helper."
  - id: T002
    type: worker
    assignee: Worker
    status: done
    objective: "Add one narrow contract file."
    allowed_files:
      - lib/helper-2.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - lib/helper-2.ts
      commands:
        - cmd: npm test
          status: pass
      summary: "Added one contract."
  - id: T003
    type: worker
    assignee: Worker
    status: done
    objective: "Add one narrow validation wrapper."
    allowed_files:
      - lib/helper-3.ts
    verify:
      - npm test
    stop_if:
      - "Need files outside allowed_files."
    receipt:
      result: done
      changed_files:
        - lib/helper-3.ts
      commands:
        - cmd: npm test
          status: pass
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

    const stateDigest = createHash("sha256").update(readFileSync(join(goal, "state.yaml"))).digest("hex");
    const result = runGoalMaker(["prompt", goal, "--expected-state-digest", stateDigest, "--json"]);
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
    writeGoalSupport(goal, "Parent");
    writeGoalSupport(child, "Child");
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

    const result = runParallelPlan("goal", { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mutated, false);
    assert.equal(report.spawned_agents, false);
    assert.equal(report.candidates.length, 2);
    assert.equal(report.candidates.every((candidate) => candidate.safe_to_parallelize), true);
    assert.equal(report.candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.state_digest)), true);
    assert.equal(report.candidates.every((candidate) => candidate.render_prompt_command.includes(`--expected-state-digest ${candidate.state_digest}`)), true);
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
    writeGoalSupport(goal, "Parent");
    writeGoalSupport(child, "Child");
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

    const result = runParallelPlan(goal);
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
    writeGoalSupport(goal, "Parent");
    writeGoalSupport(child, "Child");
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

    const result = runParallelPlan(goal);
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
    const env = fakeCodexEnv(root);

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
      HOME: root,
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
      HOME: root,
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
      HOME: root,
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

test("plugin install output points to Codex Goal Compiler and the local goal surface", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = fakeCodexEnv(root);

    const install = runGoalMaker(["plugin", "install", "--codex-home", codexHome], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Agents: 5 installed/);
    assert.match(install.stdout, /\$codex-goal-compiler/);
    assert.match(install.stdout, /Goal surface/);
    assert.match(install.stdout, /goalbuddy board docs\/goals\/<slug>/);
    assert.doesNotMatch(install.stdout, /goalbuddy extend/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("update replaces stale marketplace provenance and rejects a different source", () => {
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
    const env = {
      ...fakeCodexEnv(root),
      GOALBUDDY_TEST_REQUIRE_MARKETPLACE_REMOVE: "1",
    };

    const repaired = runGoalMaker(["update", "--target", "codex", "--codex-home", codexHome, "--json"], { env });
    assert.equal(repaired.status, 0, repaired.stderr || repaired.stdout);
    assert.equal(JSON.parse(repaired.stdout).marketplace_source, realpathSync("."));
    assert.match(readFileSync(configPath, "utf8"), new RegExp(`source = ${escapeRegExp(JSON.stringify(realpathSync(".")))}`));
    assert.equal(existsSync(join(root, ".goalbuddy-marketplace-removed")), true);

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
    assert.equal(overridden.status, 1, overridden.stderr || overridden.stdout);
    assert.match(overridden.stderr, /requires a local marketplace path/);
    assert.equal(JSON.parse(repaired.stdout).marketplace_source, realpathSync("."));
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

    const holdHelp = runGoalMaker(["hold", "--help", "--origin-artifact", "receipts/origin.json"]);
    assert.equal(holdHelp.status, 0, holdHelp.stderr || holdHelp.stdout);
    assert.match(holdHelp.stdout, /goalbuddy hold .*--origin-artifact/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bare command shows help without mutating either harness", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const result = runGoalMaker(["--codex-home", codexHome, "--claude-home", claudeHome]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /goalbuddy install/);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the package has no install lifecycle hook that can activate a harness", () => {
  const root = mkdtempSync(join(tmpdir(), "goal-maker-cli-test-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(manifest.scripts.postinstall, undefined);
    assert.equal(manifest.files.includes("codex-goal-compiler/references"), true);
    assert.equal(manifest.files.includes("goalbuddy/references"), true);
    assert.equal(existsSync(codexHome), false);
    assert.equal(existsSync(claudeHome), false);
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

    const install = runGoalMaker(["install", "--codex-home", codexHome, "--claude-home", claudeHome, "--json"], { env });
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

test("CODEX_HOME and CLAUDE_HOME override paths without narrowing the default install", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-home-overrides-"));
  try {
    const codexHome = join(root, "codex-home");
    const claudeHome = join(root, "claude-home");
    const env = {
      ...fakeCodexEnv(root),
      CODEX_HOME: codexHome,
      CLAUDE_HOME: claudeHome,
    };

    const install = runGoalMaker(["install", "--json"], { env });
    assert.equal(install.status, 0, install.stderr || install.stdout);
    const report = JSON.parse(install.stdout);
    assert.equal(report.codex.codex_home, codexHome);
    assert.equal(report.claude.claude_home, claudeHome);
    assert.deepEqual(report.transaction.targets, ["codex", "claude"]);
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
      HOME: root,
      GOALBUDDY_INVOKED_AS: "goal-maker",
      PATH: `${fakeCodexBin(root)}${delimiter}${process.env.PATH}`,
    };

    const human = runGoalMaker(["--help"], { env });
    assert.equal(human.status, 0, human.stderr || human.stdout);
    assert.match(human.stdout, /GoalBuddy for Claude Code and Codex/);
    assert.match(human.stdout, /goalbuddy install/);
    assert.match(human.stdout, /--reasoning-effort low\|medium\|high\|xhigh\|max\|ultra/);
    assert.match(human.stdout, /--service-tier fast\|default\|flex/);
    assert.match(human.stderr, /goal-maker has been rebranded to goalbuddy/);
    assert.match(human.stderr, /Use: goalbuddy/);

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

test("prompt, dispatch, and receipt preserve --json after a missing option value", () => {
  const cases = [
    ["prompt", "--board", "--json"],
    ["dispatch", "docs/goals/one", "--to", "--json"],
    ["receipt", "docs/goals/one", "--task", "--json"],
  ];
  for (const args of cases) {
    const result = runGoalMaker(args);
    assert.equal(result.status, 1, `${args.join(" ")}\n${result.stderr || result.stdout}`);
    assert.equal(result.stderr, "", args.join(" "));
    assert.equal(result.stdout.trim().split("\n").length, 1, args.join(" "));
    const report = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(report).sort(), ["error", "error_code", "next_action", "ok"]);
    assert.equal(report.error_code, "INVALID_ARGUMENT");
  }
});

test("agent surfaces point to rendered result-specific receipts while executable examples own shape", () => {
  for (const path of ["goalbuddy/agents/goal_judge.toml", "plugins/goalbuddy/agents/goal-judge.md", "goalbuddy/agents/goal_worker.toml", "plugins/goalbuddy/agents/goal-worker.md"]) {
    const text = readFileSync(path, "utf8");
    assert.match(text, /result-specific done or blocked shape supplied in the current rendered task prompt/);
    assert.doesNotMatch(text, /"result": "done \| blocked"/);
  }
  const judge = receiptExample({ role: "judge", result: "done" });
  assert.deepEqual(Object.keys(judge.worker_package || {}), []);
  assert.equal(judge.worker_package, null);
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
  assert.equal(tomlSchema.checker_status, "pass | immutable_history_compatible | fail | not_run");
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
    assert.deepEqual(report.capabilities, runtimeCapabilities);
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

test("Claude doctor and compiler contract fail closed when the installed /goal command is stale", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-stale-goal-command-"));
  try {
    const claudeHome = join(root, "claude");
    const install = runGoalMaker(["install", "--target", "claude", "--claude-home", claudeHome, "--json"]);
    assert.equal(install.status, 0, install.stderr || install.stdout);
    writeFileSync(join(claudeHome, "commands", "goal.md"), "stale goal command\n");

    const doctor = runGoalMaker(["doctor", "--target", "claude", "--claude-home", claudeHome]);
    assert.equal(doctor.status, 1, doctor.stderr || doctor.stdout);
    const doctorReport = JSON.parse(doctor.stdout);
    assert.equal(doctorReport.goal_command_present, true);
    assert.equal(doctorReport.goal_command_stale, true);
    assert.match(doctorReport.errors.join("\n"), /Claude \/goal command is stale/);

    const contract = runGoalMaker(["contract", "--target", "claude", "--claude-home", claudeHome, "--json"]);
    assert.equal(contract.status, 1, contract.stderr || contract.stdout);
    const contractReport = JSON.parse(contract.stdout);
    assert.equal(contractReport.target.goal_command_ready, false);
    assert.match(contractReport.errors.join("\n"), /Claude \/goal command is stale/);
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
    existing_plan_facts:
      - "Keep the existing widget API unchanged."
      - "Run npm test before the final audit."
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
${active ? `  - id: T003
    type: judge
    assignee: Judge
    status: queued
    objective: "Audit the ready successor."
    receipt: null
  - id: T004
    type: worker
    assignee: Worker
    status: queued
    objective: "Provisional Worker card awaiting exact hydration."
    allowed_files: []
    verify: []
    stop_if: []
    receipt: null
` : ""}
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

function writeCompletionProjectionGoal(repoRoot, slug, { role = "judge", blockedSibling = false, queuedSibling = false } = {}) {
  const goalDir = writeResumeGoal(repoRoot, slug, { active: false });
  const statePath = join(goalDir, "state.yaml");
  const assignee = role === "judge" ? "Judge" : role === "pm" ? "PM" : "Scout";
  let state = readFileSync(statePath, "utf8")
    .replace("  status: done\n  oracle:", "  status: active\n  oracle:")
    .replace("active_task: null", "active_task: T999")
    .replace(
      /  - id: T999\n    type: judge\n    assignee: Judge\n    status: done\n    objective: "Audit the completed widget outcome\."\n    receipt:\n      result: done\n      decision: complete\n      full_outcome_complete: true\n      rationale: "The widget is complete and npm test passed\."\n      evidence:\n        - src\/widget\.mjs\n/,
      `  - id: T999
    type: ${role}
    assignee: ${assignee}
    status: active
    objective: "Audit the completed widget outcome."
    receipt: null
`,
    );
  const siblings = [
    blockedSibling
      ? `  - id: T998
    type: pm
    assignee: PM
    status: blocked
    objective: "Preserve a non-terminal blocked sibling."
    receipt:
      result: blocked
      blocked_reason: "This sibling is intentionally blocked."
      summary: "The blocked sibling remains unresolved."
`
      : "",
    queuedSibling
      ? `  - id: T003
    type: pm
    assignee: PM
    status: queued
    objective: "A queued sibling prevents completion."
    receipt: null
`
      : "",
  ].join("");
  state = state.replace("  - id: T999\n", `${siblings}  - id: T999\n`);
  writeFileSync(statePath, state);
  return goalDir;
}

function writeExhaustedTaskNamespaceGoal(repoRoot, slug) {
  const goalDir = join(repoRoot, "docs", "goals", slug);
  mkdirSync(goalDir, { recursive: true });
  writeFileSync(join(goalDir, "goal.md"), `# ${slug}\n`);
  const tasks = Array.from({ length: 1000 }, (_, index) => {
    const id = `T${String(index).padStart(3, "0")}`;
    if (id === "T999") {
      return `  - id: T999
    type: judge
    assignee: Judge
    status: active
    objective: "Audit the exhausted namespace."
    receipt: null`;
    }
    return `  - id: ${id}
    type: pm
    assignee: PM
    status: done
    objective: "Completed namespace fixture ${id}."
    receipt:
      result: done
      summary: "Completed ${id}."`;
  }).join("\n");
  writeFileSync(join(goalDir, "state.yaml"), `version: 2
goal:
  title: "${slug} goal"
  slug: "${slug}"
  kind: specific
  tranche: "test"
  status: active
  oracle:
    signal: "The namespace behavior is verified."
    final_proof: "The resume projection fails closed on exhaustion."
  intake:
    original_request: "Prove task ID exhaustion."
    interpreted_outcome: "No invalid task ID is projected."
    authority: approved
    proof_type: test
    completion_proof: "The projection explicitly names exhaustion."
    likely_misfire: "Suggesting T1000."
agents:
  scout: installed
  worker: installed
  judge: installed
active_task: T999
tasks:
${tasks}
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: pass
    task: T999
    commands: []
`);
  return goalDir;
}

function writeResumeChildBoard(goalDir, { objective = "Implement the child lane." } = {}) {
  const childDir = join(goalDir, "subgoals", "T002-child");
  writeGoalSupport(childDir, "Child lane");
  writeFileSync(join(childDir, "state.yaml"), `version: 2
goal:
  title: "Child lane"
  slug: "child-lane"
  kind: specific
  tranche: "test child"
  status: active
  oracle:
    signal: "The child behavior is verified."
    final_proof: "The focused child test passes."
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
    objective: "${objective}"
    allowed_files:
      - src/child.mjs
    verify:
      - node --test test/child.test.mjs
    stop_if:
      - "Need files outside child allowed_files."
    receipt: null
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`);

  const rootStatePath = join(goalDir, "state.yaml");
  const rootState = readFileSync(rootStatePath, "utf8").replace(
    `    stop_if:\n      - "Need files outside allowed_files."\n    receipt: null`,
    `    stop_if:\n      - "Need files outside allowed_files."\n    subgoal:\n      status: active\n      path: subgoals/T002-child/state.yaml\n      owner: Worker\n      created_from: T002\n      depth: 1\n      rollup_receipt: null\n    receipt: null`,
  );
  writeFileSync(rootStatePath, rootState);
  return childDir;
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

test("installed resume executes when its argv path uses a filesystem alias", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-alias-"));
  const aliasRoot = join(root, "scripts-alias");
  try {
    symlinkSync(dirname(bundledResume), aliasRoot, "dir");
    const result = spawnSync(process.execPath, [join(aliasRoot, "resume-board.mjs"), "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout), { boards: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("wait and reply expose the digest-bound exact-human lifecycle and compact resume evidence", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-exact-human-cli-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const statePath = join(goalDir, "state.yaml");
    const initial = readFileSync(statePath, "utf8").replace(
      "  missing_input_or_credentials_do_not_stop_goal: true\n",
      "  missing_input_or_credentials_do_not_stop_goal: true\n  exact_human_approval_can_terminal_wait: true\n",
    );
    writeFileSync(statePath, initial);
    const waitPath = join(root, "wait.json");
    const requiredReply = "resume T002 exactly";
    writeFileSync(waitPath, JSON.stringify({
      result: "blocked",
      task_id: "T002",
      board_path: statePath,
      waiting_for_user_approval: true,
      required_reply: requiredReply,
      evidence: [{ kind: "opaque", retained: true }],
    }));
    const initialDigest = createHash("sha256").update(initial).digest("hex");

    const wait = runGoalMaker(["wait", goalDir, "--task", "T002", "--receipt", waitPath, "--expected-state-digest", initialDigest, "--json"], { cwd: root });
    assert.equal(wait.status, 0, wait.stderr || wait.stdout);
    const waitReport = JSON.parse(wait.stdout);
    assert.equal(waitReport.mode, "wait");
    assert.equal(waitReport.active_task, null);

    const replyPath = join(root, "reply.json");
    writeFileSync(replyPath, JSON.stringify({ reply: requiredReply }));
    const reply = runGoalMaker(["reply", goalDir, "--task", "T002", "--reply-file", replyPath, "--expected-state-digest", waitReport.after_digest, "--json"], { cwd: root });
    assert.equal(reply.status, 0, reply.stderr || reply.stdout);
    const replyReport = JSON.parse(reply.stdout);
    assert.equal(replyReport.exact_match, true);
    assert.equal(replyReport.active_task, "T002");

    const resumed = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    const projection = JSON.parse(resumed.stdout).board.active_task.transition_evidence;
    assert.equal(projection.exact_human_reply_count, 1);
    assert.equal(projection.latest_exact_human_reply.wait_board_digest, waitReport.after_digest);
    assert.equal(projection.latest_exact_human_reply.exact_match, true);
    assert.doesNotMatch(resumed.stdout, /resume T002 exactly|waiting_for_user_approval|opaque/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume transition evidence preserves checker-admitted provenance and held receipts without losing identity fields", () => {
  const provenance = {
    kind: "goalbuddy_receipt_provenance_v1",
    receipt_transport: "explicit_file",
    report_transport: "not_applicable",
    dispatch_disposition: "not_applicable",
    closeout_authority: "original_role",
    application_state: "applied",
    receipt_artifact: {
      root: "repository",
      path: "receipts/applied.json",
      sha256: "a".repeat(64),
      retention_policy: "retained",
    },
    origin_artifact: null,
    receipt_value_sha256: "b".repeat(64),
  };
  const held = [{
    kind: "goalbuddy_held_receipt_v1",
    task_id: "T002",
    application_state: "held",
    receipt_transport: "git_local_report",
    report_transport: "ready",
    dispatch_disposition: "accepted",
    source_artifact: {
      root: "git_common_dir",
      path: "worktrees/fixture/goalbuddy/dispatch-reports/T002-run/dispatch-report.json",
      sha256: "c".repeat(64),
    },
    origin_artifact: {
      root: "repository",
      path: "receipts/origin.json",
      sha256: "d".repeat(64),
    },
    receipt_value_sha256: "e".repeat(64),
    handle: "f".repeat(64),
  }];

  const projection = projectTransitionEvidence({
    receipt_provenance: provenance,
    held_receipts: held,
  });

  assert.deepEqual(projection.receipt_provenance, provenance);
  assert.deepEqual(projection.held_receipts, held);
  assert.notEqual(projection.receipt_provenance, provenance);
  assert.notEqual(projection.held_receipts, held);
  assert.equal(projectTransitionEvidence({}), null);
});

test("hold is exposed through the public CLI and resume returns the exact held-receipt identity", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-hold-cli-"));
  try {
    const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const statePath = join(goalDir, "state.yaml");
    mkdirSync(join(root, "receipts"), { recursive: true });
    const sourcePath = join(root, "receipts", "source.json");
    writeFileSync(sourcePath, JSON.stringify({
      result: "done",
      task_id: "T002",
      board_path: statePath,
      harness: "codex",
      changed_files: ["src/widget.mjs"],
      commands: [{ cmd: "npm test", status: "pass" }],
      summary: "Implemented and verified the authorized task.",
      deviations: [],
    }));
    const before = readFileSync(statePath, "utf8");
    const digest = createHash("sha256").update(before).digest("hex");

    const held = runGoalMaker([
      "hold",
      goalDir,
      "--task",
      "T002",
      "--source",
      "receipts/source.json",
      "--expected-state-digest",
      digest,
      "--json",
    ], { cwd: root });
    assert.equal(held.status, 0, held.stderr || held.stdout);
    const holdReport = JSON.parse(held.stdout);

    const resumed = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(resumed.status, 0, resumed.stderr || resumed.stdout);
    const projectedHeld = JSON.parse(resumed.stdout).board.active_task.transition_evidence.held_receipts;
    assert.equal(projectedHeld.length, 1);
    assert.equal(projectedHeld[0].handle, holdReport.handle);
    assert.equal(projectedHeld[0].source_artifact.path, "receipts/source.json");
    assert.equal(projectedHeld[0].source_artifact.sha256, createHash("sha256").update(readFileSync(sourcePath)).digest("hex"));
    assert.equal(projectedHeld[0].receipt_value_sha256.length, 64);
    assert.equal(projectedHeld[0].origin_artifact, null);

    const frontier = runGoalMaker(["frontier", goalDir, "--json"], { cwd: root });
    assert.equal(frontier.status, 0, frontier.stderr || frontier.stdout);
    const semanticHeld = JSON.parse(frontier.stdout).evidence.held_receipts;
    assert.equal(semanticHeld.length, 1);
    assert.equal(semanticHeld[0].handle, holdReport.handle);
    assert.equal(semanticHeld[0].state, "held_unapplied");
    assert.equal(semanticHeld[0].source.kind, "held_artifact");
    assert.doesNotMatch(frontier.stdout, /source_artifact|dispatch-reports|state_digest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete is exposed through the public CLI and closes an audit-only tail", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-complete-cli-"));
  try {
    const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    const goalDir = writeResumeGoal(root, "one", { active: false });
    const statePath = join(goalDir, "state.yaml");
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "reviews"), { recursive: true });
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = true;\n");
    let state = readFileSync(statePath, "utf8")
      .replace("  status: done\n  oracle:", "  status: active\n  oracle:")
      .replace("active_task: null", "active_task: T999")
      .replace("  - id: T999\n    type: judge\n    assignee: Judge\n    status: done", "  - id: T999\n    type: judge\n    assignee: Judge\n    status: active")
      .replace(/    receipt:\n      result: done\n      decision: complete\n      full_outcome_complete: true\n      rationale: "The widget is complete and npm test passed\."\n      evidence:\n        - src\/widget\.mjs\n/, "    receipt: null\n");
    writeFileSync(statePath, state);
    const committed = spawnSync("git", [
      "-c", "user.name=GoalBuddy Test",
      "-c", "user.email=goalbuddy@example.invalid",
      "-c", "commit.gpgsign=false",
      "add", ".",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(committed.status, 0, committed.stderr);
    const commit = spawnSync("git", [
      "-c", "user.name=GoalBuddy Test",
      "-c", "user.email=goalbuddy@example.invalid",
      "-c", "commit.gpgsign=false",
      "commit", "-qm", "completion fixture",
    ], { cwd: root, encoding: "utf8" });
    assert.equal(commit.status, 0, commit.stderr);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
    assert.equal(head.status, 0, head.stderr);
    const identity = { kind: "git_commit", value: head.stdout.trim() };
    const review = {
      kind: "goalbuddy_final_review_v1",
      workflow_version: "goalbuddy-cli-test-review@1",
      scope: {
        kind: "goalbuddy_review_scope_v1",
        patterns: ["src/**"],
      },
      base_identity: identity,
      reviewed_identity: identity,
      completeness_status: "complete",
      decision: "complete",
      unresolved_blocking_findings: [],
    };
    const reviewBytes = `${JSON.stringify(review, null, 2)}\n`;
    writeFileSync(join(root, "reviews", "final-review.json"), reviewBytes);
    const digest = createHash("sha256").update(state).digest("hex");
    const receiptPath = join(root, "final.json");
    writeFileSync(receiptPath, JSON.stringify({
      result: "done",
      task_id: "T999",
      board_path: statePath,
      decision: "complete",
      full_outcome_complete: true,
      rationale: "The current receipts and verification prove the final outcome.",
      evidence: ["src/widget.mjs", "npm test"],
      summary: "The public CLI proved the final outcome.",
      completion_disposition: "exact",
      accepted_deviations: [],
      deviation_acceptance: null,
      final_review: {
        status: "complete",
        artifact: {
          path: "reviews/final-review.json",
          sha256: createHash("sha256").update(reviewBytes).digest("hex"),
        },
        workflow_version: review.workflow_version,
        scope: review.scope,
        base_identity: review.base_identity,
        reviewed_identity: review.reviewed_identity,
        completeness_status: review.completeness_status,
      },
    }));

    const result = runGoalMaker(["complete", goalDir, "--task", "T999", "--receipt", receiptPath, "--expected-state-digest", digest, "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "complete");
    assert.equal(report.active_task, null);
    assert.match(readFileSync(statePath, "utf8"), /status: done/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebind exposes the typed digest-bound GoalBuddy control mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-rebind-cli-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const statePath = join(goalDir, "state.yaml");
    const initial = readFileSync(statePath, "utf8").replace("checks:\n", `checks:
  goalbuddy_binding:
    source_root: "/old/goalbuddy"
    accepted_commit: "${"0".repeat(40)}"
    checker_path: "/old/checker.mjs"
    checker_sha256: "${"0".repeat(64)}"
    installed_checker_sha256: "${"0".repeat(64)}"
    runtime_doctor_goal_ready: true
    cached_marketplace_checker_authoritative: false
`);
    writeFileSync(statePath, initial);

    const sourceRoot = join(root, "source");
    const sourceChecker = join(sourceRoot, "goalbuddy", "scripts", "check-goal-state.mjs");
    mkdirSync(dirname(sourceChecker), { recursive: true });
    const checkerBytes = "#!/usr/bin/env node\nconsole.log('cli fixture');\n";
    writeFileSync(sourceChecker, checkerBytes);
    for (const gitArgs of [
      ["init", "-q"],
      ["add", "goalbuddy/scripts/check-goal-state.mjs"],
      ["-c", "user.name=GoalBuddy Test", "-c", "user.email=goalbuddy@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"],
    ]) {
      const git = spawnSync("git", gitArgs, { cwd: sourceRoot, encoding: "utf8" });
      assert.equal(git.status, 0, git.stderr || git.stdout);
    }
    const acceptedCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).stdout.trim();
    const checkerSha256 = createHash("sha256").update(checkerBytes).digest("hex");
    const installedChecker = join(root, "installed", "check-goal-state.mjs");
    mkdirSync(dirname(installedChecker), { recursive: true });
    writeFileSync(installedChecker, checkerBytes);
    const bindingPath = join(root, "binding.json");
    writeFileSync(bindingPath, JSON.stringify({
      source_root: sourceRoot,
      accepted_commit: acceptedCommit,
      checker_path: sourceChecker,
      checker_sha256: checkerSha256,
      installed_checker_sha256: checkerSha256,
      runtime_doctor_goal_ready: true,
      cached_marketplace_checker_authoritative: false,
    }));
    const digest = createHash("sha256").update(initial).digest("hex");

    const result = runGoalMaker(["rebind", goalDir, "--binding", bindingPath, "--installed-checker", installedChecker, "--expected-state-digest", digest, "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "rebind");
    assert.equal(report.checker_status, "pass");
    assert.equal(report.binding.accepted_commit, acceptedCommit);
    assert.match(readFileSync(statePath, "utf8"), new RegExp(`accepted_commit: ${acceptedCommit}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("frontier is a read-only shadow route over the checked resume boundary", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-frontier-cli-"));
  try {
    const initialized = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const statePath = join(goalDir, "state.yaml");
    mkdirSync(join(root, "reviews"), { recursive: true });
    mkdirSync(join(root, "screenshots"), { recursive: true });
    const roundOneBytes = "{\"kind\":\"independent_review\",\"round\":1}\n";
    const roundTwoBytes = "{\"kind\":\"independent_review\",\"round\":2}\n";
    const roundOneDiffBytes = "diff --git a/src/widget.mjs b/src/widget.mjs\n";
    const screenshotBytes = Buffer.from("decisive screenshot fixture");
    writeFileSync(join(root, "reviews", "round-one.json"), roundOneBytes);
    writeFileSync(join(root, "reviews", "round-two.json"), roundTwoBytes);
    writeFileSync(join(root, "reviews", "round-one.diff"), roundOneDiffBytes);
    writeFileSync(join(root, "screenshots", "widget.png"), screenshotBytes);
    const roundOneSha256 = createHash("sha256").update(roundOneBytes).digest("hex");
    const roundTwoSha256 = createHash("sha256").update(roundTwoBytes).digest("hex");
    const roundOneDiffSha256 = createHash("sha256").update(roundOneDiffBytes).digest("hex");
    const screenshotSha256 = createHash("sha256").update(screenshotBytes).digest("hex");
    const briefPath = "docs/goals/one/notes/T002-brief.md";
    const briefBytes = "# T002 brief\n\nImplement and verify the bounded widget slice.\n";
    writeFileSync(join(root, briefPath), briefBytes);
    const briefSha256 = createHash("sha256").update(briefBytes).digest("hex");
    const state = readFileSync(statePath, "utf8")
      .replace(
        `      note: notes/T001-transition.md`,
        `      note: notes/T001-transition.md
      evidence:
        - kind: goalbuddy_review_evidence_v1
          identity: round-one
          round: 1
          reviewer: independent-code-review
          status: complete
          scope_status: exact
          findings: 8
          accepted_findings: 6
          yield: high
          selection: selected_for_material_diff
          adjudication: six_findings_accepted
          artifact:
            path: reviews/round-one.json
            sha256: ${roundOneSha256}
          diff_artifact:
            path: reviews/round-one.diff
            sha256: ${roundOneDiffSha256}
            identity:
              kind: content_sha256
              value: ${"b".repeat(64)}
            scope:
              - src/**
          scope_anomalies: []
        - kind: goalbuddy_review_evidence_v1
          identity: round-two
          round: 2
          reviewer: independent-code-review
          status: complete
          scope_status: wrong_scope
          findings: 1
          accepted_findings: 0
          yield: diminishing
          selection: selected_as_convergence_check
          adjudication: finding_rejected
          artifact:
            path: reviews/round-two.json
            sha256: ${roundTwoSha256}
          diff_artifact: null
          scope_anomalies:
            - kind: wrong_scope_workflow
              status: open
              detail: Review included an unrelated generated file.
        - kind: goalbuddy_browser_evidence_v1
          state: completed_widget
          verdict: accepted
          decisive: true
          summary: The widget state is visually correct.
          screenshot:
            path: screenshots/widget.png
            sha256: ${screenshotSha256}
        - kind: goalbuddy_product_decision_v1
          id: PD001
          status: blocked
          decision: Owner must choose the activation threshold.
          note: docs/goals/one/notes/T001-transition.md`,
      )
      .replace(
        `    stop_if:
      - "Need files outside allowed_files."
    receipt: null`,
        `    stop_if:
      - "Need files outside allowed_files."
    brief:
      path: ${briefPath}
      sha256: ${briefSha256}
    receipt: null`,
      );
    writeFileSync(statePath, state);

    const goalPath = "docs/goals/one";
    const resumeBefore = runGoalMaker(["resume", goalPath, "--json"], { cwd: root });
    assert.equal(resumeBefore.status, 0, resumeBefore.stderr || resumeBefore.stdout);
    const before = snapshotPath(root);

    const result = runGoalMaker(["frontier", goalPath, "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    const digestBound = createCheckedSemanticFrontier(goalDir, {
      expectedStateDigest: JSON.parse(resumeBefore.stdout).board.state_digest,
    });
    assert.equal(digestBound.kind, "goalbuddy_frontier_v1");
    assert.equal(digestBound.slice.id, "T002");
    assert.throws(() => createCheckedSemanticFrontier(goalDir, {
      expectedStateDigest: "0".repeat(64),
    }), /exact installed advance state/);
    assert.deepEqual(Object.keys(report), [
      "kind",
      "goal",
      "slice",
      "worker",
      "evidence",
      "reviews",
      "deviations",
      "decisions",
      "drill_down",
    ]);
    assert.equal(report.kind, "goalbuddy_frontier_v1");
    assert.equal(report.goal.objective, "The widget works and the test proves it.");
    assert.equal(report.goal.source.path, "docs/goals/one/goal.md");
    assert.equal(report.slice.id, "T002");
    assert.equal(report.slice.brief.status, "bound");
    assert.equal(report.slice.brief.path, briefPath);
    assert.equal(report.worker.liveness, "unknown");
    assert.equal(report.evidence.changed_paths[0].status, "unavailable");
    assert.equal(report.evidence.browser[0].decisive, true);
    assert.equal(report.evidence.browser[0].source.kind, "stored_receipt");
    assert.equal(report.reviews.rounds[0].yield, "high");
    assert.equal(report.reviews.rounds[1].yield, "diminishing");
    assert.equal(report.reviews.rounds[1].scope_status, "wrong_scope");
    assert.equal(report.reviews.scope_anomalies[0].kind, "wrong_scope_workflow");
    assert.equal(report.reviews.final_review.status, "unavailable");
    assert.equal(report.decisions.unresolved.some((decision) => decision.id === "PD001"), true);
    assert.equal(
      report.decisions.queued_placeholders.find((task) => task.id === "T004").hydration,
      "required",
    );
    assert.equal(
      report.drill_down.some((entry) => entry.source?.path === briefPath),
      true,
    );
    assert.equal(
      report.drill_down.some((entry) => entry.source?.path === "screenshots/widget.png"),
      true,
    );
    assert.deepEqual(
      new Set(report.drill_down.map((entry) => entry.source?.kind)),
      new Set(["plan_or_note", "review_artifact", "diff_identity", "screenshot_artifact"]),
    );
    for (const forbidden of [
      "state_digest",
      "board_tree_digest",
      "command_template",
      "session_id",
      "dispatch-reports",
    ]) {
      assert.equal(result.stdout.includes(forbidden), false, forbidden);
    }

    const direct = spawnSync(process.execPath, [bundledFrontier, goalPath, "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(direct.status, 0, direct.stderr || direct.stdout);
    assert.deepEqual(JSON.parse(direct.stdout), report);
    assert.deepEqual(snapshotPath(root), before);

    const resumeAfter = runGoalMaker(["resume", goalPath, "--json"], { cwd: root });
    assert.equal(resumeAfter.status, 0, resumeAfter.stderr || resumeAfter.stdout);
    assert.deepEqual(JSON.parse(resumeAfter.stdout), JSON.parse(resumeBefore.stdout));

    rmSync(join(root, "reviews", "round-two.json"));
    const missingArtifactBefore = snapshotPath(root);
    const missingArtifact = runGoalMaker(["frontier", goalPath, "--json"], { cwd: root });
    assert.equal(missingArtifact.status, 0, missingArtifact.stderr || missingArtifact.stdout);
    const missingArtifactReport = JSON.parse(missingArtifact.stdout);
    assert.deepEqual(
      missingArtifactReport.reviews.rounds.map((review) => review.identity),
      ["round-one"],
    );
    assert.equal(
      missingArtifactReport.reviews.scope_anomalies.some((anomaly) => (
        anomaly.kind === "frontier_evidence_invalid"
        && anomaly.detail === "Semantic frontier evidence references a missing artifact."
      )),
      true,
    );
    assert.equal(
      missingArtifactReport.drill_down.some((entry) => (
        entry.source?.path === "reviews/round-two.json"
      )),
      false,
    );
    assert.deepEqual(snapshotPath(root), missingArtifactBefore);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("frontier rejects discovery, non-JSON, planning, unknown flags, and extra roots", () => {
  const cases = [
    [["frontier", "--json"], /requires one explicit goal root/],
    [["frontier", "docs/goals/one"], /requires --json/],
    [["frontier", "docs/goals/one", "--planning", "--json"], /Unknown argument: --planning/],
    [["frontier", "docs/goals/one", "--wat", "--json"], /Unknown argument: --wat/],
    [["frontier", "docs/goals/one", "docs/goals/two", "--json"], /Unexpected argument/],
  ];
  for (const [args, expected] of cases) {
    const result = runGoalMaker(args);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(result.stderr, expected);
  }

  const help = runGoalMaker(["frontier", "--help"]);
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /goalbuddy frontier <docs\/goals\/slug> --json/);
  assert.match(help.stdout, /frontier is shadow-only/);
  assert.match(help.stdout, /Installed \/goal continues to use the checked resume projection/);
});

test("advance publicly closes one checked slice and returns the activated semantic frontier", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-advance-public-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const git = spawnSync("git", ["init", "-q"], { cwd: root, encoding: "utf8" });
    assert.equal(git.status, 0, git.stderr || git.stdout);
    mkdirSync(join(root, "receipts"), { recursive: true });
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(join(root, "receipts", "T002.json"), JSON.stringify({
      result: "done",
      task_id: "T002",
      board_path: statePath,
      changed_files: ["src/widget.mjs"],
      commands: [{ cmd: "npm test", status: "pass" }],
      summary: "The bounded widget slice is complete.",
      harness: "codex",
    }));

    const result = runGoalMaker([
      "advance",
      "docs/goals/one",
      "--task",
      "T002",
      "--source",
      "receipts/T002.json",
      "--closeout-authority",
      "original_role",
      "--activate",
      "T003",
      "--json",
    ], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.outcome, {
      task_id: "T002",
      result: "done",
      next_task_id: "T003",
      hydrated_task_id: null,
    });
    assert.equal(report.frontier.kind, "goalbuddy_frontier_v1");
    assert.equal(report.frontier.slice.id, "T003");
    assert.equal(report.frontier.slice.status, "active");
    assert.doesNotMatch(result.stdout, /state_digest|before_digest|after_digest/);
    assert.equal(existsSync(join(root, "receipts", "T002.json")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("advance exposes one strict public grammar without caller-supplied digest control", () => {
  const valid = [
    "advance",
    "docs/goals/one",
    "--task",
    "T001",
    "--source",
    "receipt.json",
    "--closeout-authority",
    "original_role",
    "--activate",
    "T002",
    "--json",
  ];
  const cases = [
    [["advance", "docs/goals/one", "--task", "T001", "--closeout-authority", "original_role", "--activate", "T002", "--json"], /exactly one of --source or --held-receipt/, "INVALID_ARGUMENT"],
    [[...valid.slice(0, 6), "--held-receipt", "0".repeat(64), ...valid.slice(6)], /exactly one of --source or --held-receipt/, "INVALID_ARGUMENT"],
    [["advance", "docs/goals/one", "--task", "T001", "--held-receipt", "0".repeat(64), "--origin-artifact", "origin.json", "--closeout-authority", "original_role", "--activate", "T002", "--json"], /origin-artifact is allowed only with --source/, "INVALID_ARGUMENT"],
    [valid.filter((value) => !["--closeout-authority", "original_role"].includes(value)), /requires --closeout-authority/, "INVALID_ARGUMENT"],
    [valid.map((value) => value === "original_role" ? "owner" : value), /requires --closeout-authority/, "INVALID_ARGUMENT"],
    [valid.map((value) => value === "T002" ? "T001" : value), /successor must be distinct/, "SUCCESSOR_NOT_QUEUED"],
    [["advance", "docs/goals/one", "--task", "T001", "--held-receipt", "abc", "--closeout-authority", "original_role", "--activate", "T002", "--json"], /64 lowercase hex/, "INVALID_ARGUMENT"],
    [[...valid.slice(0, -1), "--expected-state-digest", "0".repeat(64), "--json"], /Unknown argument: --expected-state-digest/, "INVALID_ARGUMENT"],
    [[...valid.slice(0, -1), "--wat", "--json"], /Unknown argument: --wat/, "INVALID_ARGUMENT"],
    [[...valid.slice(0, -1), "docs/goals/two", "--json"], /Unexpected argument/, "INVALID_ARGUMENT"],
    [[...valid.slice(0, -1), "--task", "T002", "--json"], /Duplicate argument: --task/, "INVALID_ARGUMENT"],
  ];
  for (const [args, expected, errorCode] of cases) {
    const result = runGoalMaker(args);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const failure = JSON.parse(result.stdout);
    assert.equal(failure.ok, false);
    assert.equal(failure.error_code, errorCode);
    assert.match(failure.error, expected);
  }

  const help = runGoalMaker(["advance", "--help"]);
  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /goalbuddy advance <docs\/goals\/slug>/);
  assert.doesNotMatch(
    help.stdout.match(/goalbuddy advance .*$/m)?.[0] || "",
    /expected-state-digest/,
  );
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
    assert.equal(scopedReport.checker.board_tree_version, 1);
    assert.equal(scopedReport.checker.board_tree_digest, scopedReport.board.tree.digest);
    assert.equal(scopedReport.board.tree.boards.length, 1);
    assert.equal(scopedReport.board.tree.boards[0].path, "state.yaml");
    assert.equal(scopedReport.board.slug, "one");
    assert.match(scopedReport.board.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(scopedReport.board.state_digest_status, "checker_validated");
    assert.equal(scopedReport.board.intake.original_request, "Make the widget work.");
    assert.equal(scopedReport.board.intake.interpreted_outcome, "The widget works and the test proves it.");
    assert.deepEqual(scopedReport.board.intake.existing_plan_facts, [
      "Keep the existing widget API unchanged.",
      "Run npm test before the final audit.",
    ]);
    assert.equal(scopedReport.board.active_task.id, "T002");
    assert.deepEqual(scopedReport.board.active_task.allowed_files, ["src/widget.mjs"]);
    assert.deepEqual(scopedReport.board.active_task.verify, ["npm test"]);
    assert.deepEqual(scopedReport.board.active_task.stop_if, ["Need files outside allowed_files."]);
    assert.equal(scopedReport.board.active_lanes.length, 1);
    assert.equal(scopedReport.board.active_lanes[0].kind, "root");
    assert.equal(scopedReport.board.active_lanes[0].active_task.id, "T002");
    assert.equal(scopedReport.board.recent_receipt.task_id, "T001");
    assert.equal(scopedReport.board.recent_receipt.note, "notes/T001-transition.md");
    assert.doesNotMatch(scoped.stdout, /OLD_RECEIPT_SHOULD_NOT_APPEAR/);
    assert.equal(scopedReport.recovery.audit_required, true);
    assert.equal(scopedReport.recovery.audit_agent.codex, "goal_ledger");
    assert.equal(scopedReport.recovery.audit_agent.claude_code, "goal-ledger");
    assert.equal(scopedReport.recovery.continue_only_on, "congruent");
    assert.equal(scopedReport.recovery.worker_liveness, "unknown");
    assert.equal(scopedReport.recovery.active_lane_count, 1);
    assert.equal(scopedReport.recovery.continuation_allowed_after_audit, true);
    assert.match(scopedReport.commands.resume, /^node /);
    assert.match(scopedReport.commands.resume, /scripts\/resume-board\.mjs/);
    assert.match(scopedReport.commands.prompt, /scripts\/render-task-prompt\.mjs/);
    assert.match(scopedReport.commands.prompt, new RegExp(`--task T002 --expected-state-digest ${scopedReport.board.state_digest} --json$`));
    assert.deepEqual(scopedReport.commands.apply_receipt, {
      operation: "apply_receipt",
      board_path: scopedReport.board.state_path,
      task_id: "T002",
      expected_state_digest: scopedReport.board.state_digest,
      digest_kind: "state_yaml_sha256",
      receipt_path: null,
      activate_task_id: null,
      unresolved: ["receipt_path", "activate_task_id"],
      command_template: scopedReport.commands.apply_receipt.command_template,
    });
    assert.match(
      scopedReport.commands.apply_receipt.command_template,
      /--receipt "<receipt-path>" /,
      "resume supplies the receipt-path slot instead of requiring CLI discovery",
    );
    assert.match(
      scopedReport.commands.apply_receipt.command_template,
      /--activate <T###> --json$/,
      "resume supplies the semantic-successor slot instead of inviting a successorless guess",
    );
    assert.equal(scopedReport.board.planning_inventory.included, false);
    assert.deepEqual(scopedReport.board.planning_inventory.blocked_tasks, []);
    assert.deepEqual(scopedReport.board.planning_inventory.queued_tasks, []);
    assert.match(scopedReport.commands.planning, /--planning --json$/);

    const planning = runGoalMaker(["resume", "docs/goals/one", "--planning", "--json"], { cwd: root });
    assert.equal(planning.status, 0, planning.stderr || planning.stdout);
    const planningReport = JSON.parse(planning.stdout);
    const readyTransition = planningReport.board.planning_inventory.queued_tasks.find((task) => task.id === "T003").next_transition;
    assert.equal(readyTransition.operation, "apply_receipt");
    assert.equal(readyTransition.task_id, "T002");
    assert.equal(readyTransition.activate_task_id, "T003");
    assert.equal(readyTransition.expected_state_digest, planningReport.board.state_digest);
    assert.deepEqual(readyTransition.unresolved, ["receipt_path"]);
    assert.match(readyTransition.command_template, /--receipt "<receipt-path>" /);
    assert.match(readyTransition.command_template, /--activate T003 --json$/);

    const hydrationTransition = planningReport.board.planning_inventory.queued_tasks.find((task) => task.id === "T004").next_transition;
    assert.equal(hydrationTransition.operation, "apply_hydration");
    assert.equal(hydrationTransition.task_id, "T002");
    assert.equal(hydrationTransition.hydrate_task_id, "T004");
    assert.equal(hydrationTransition.activate_task_id, "T004");
    assert.equal(hydrationTransition.expected_state_digest, planningReport.board.state_digest);
    assert.deepEqual(hydrationTransition.unresolved, ["receipt_path", "task_card_path", "task_card_sha256"]);
    assert.match(hydrationTransition.command_template, /--receipt "<receipt-path>" /);
    assert.match(hydrationTransition.command_template, /--hydrate-task T004 --task-card "<task-card-path>" --task-card-sha256 <sha256> --activate T004 --json$/);

    const direct = spawnSync(process.execPath, [bundledResume, "docs/goals/one", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(direct.status, 0, direct.stderr || direct.stdout);
    assert.deepEqual(JSON.parse(direct.stdout), scopedReport);

    const scopedHuman = runGoalMaker(["resume", "docs/goals/one"], { cwd: root });
    assert.equal(scopedHuman.status, 0, scopedHuman.stderr || scopedHuman.stdout);
    assert.match(scopedHuman.stdout, /State digest: [a-f0-9]{64}/);
    assert.match(scopedHuman.stdout, /Board tree digest: [a-f0-9]{64} \(1 board\(s\)\)/);
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

test("resume projects complete_goal only for eligible Judge and PM tails in normal and planning routes", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-complete-projection-"));
  try {
    for (const [role, planning] of [
      ["judge", false],
      ["pm", false],
      ["judge", true],
      ["pm", true],
    ]) {
      const slug = `${role}-${planning ? "planning" : "normal"}`;
      const goalDir = writeCompletionProjectionGoal(root, slug, { role });
      const args = ["resume", goalDir, ...(planning ? ["--planning"] : []), "--json"];
      const result = runGoalMaker(args, { cwd: root });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const report = JSON.parse(result.stdout);
      assert.equal(report.board.next_free_task_id, "T003");
      assert.equal(report.commands.apply_receipt.operation, "apply_receipt");
      assert.deepEqual(report.commands.apply_receipt.unresolved, ["receipt_path", "activate_task_id"]);
      assert.deepEqual(report.commands.complete_goal, {
        operation: "complete_goal",
        board_path: report.board.state_path,
        task_id: "T999",
        expected_state_digest: report.board.state_digest,
        digest_kind: "state_yaml_sha256",
        receipt_path: null,
        unresolved: ["receipt_path"],
        command_template: report.commands.complete_goal.command_template,
      });
      assert.match(
        report.commands.complete_goal.command_template,
        new RegExp(`apply-receipt\\.mjs" complete .* --task T999 --receipt "<receipt-path>" --expected-state-digest ${report.board.state_digest} --json$`),
      );
      assert.doesNotMatch(report.commands.complete_goal.command_template, /--activate/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume suppresses completion for every unfinished sibling and non-audit active task", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-complete-parity-"));
  try {
    const blockedGoal = writeCompletionProjectionGoal(root, "blocked-sibling", { blockedSibling: true });
    const blocked = runGoalMaker(["resume", blockedGoal, "--json"], { cwd: root });
    assert.equal(blocked.status, 0, blocked.stderr || blocked.stdout);
    assert.equal(JSON.parse(blocked.stdout).commands.complete_goal, null);

    const queuedGoal = writeCompletionProjectionGoal(root, "queued-sibling", { queuedSibling: true });
    const queued = runGoalMaker(["resume", queuedGoal, "--json"], { cwd: root });
    assert.equal(queued.status, 0, queued.stderr || queued.stdout);
    assert.equal(JSON.parse(queued.stdout).commands.complete_goal, null);

    const childGoal = writeCompletionProjectionGoal(root, "unfinished-child");
    writeResumeChildBoard(childGoal);
    const childStatePath = join(childGoal, "state.yaml");
    const childState = readFileSync(childStatePath, "utf8");
    const childBoundState = childState.replace(
      [
        "    stop_if:",
        '      - "Need files outside allowed_files."',
        "    receipt: ",
        "      result: done",
      ].join("\n"),
      [
        "    stop_if:",
        '      - "Need files outside allowed_files."',
        "    subgoal:",
        "      status: active",
        "      path: subgoals/T002-child/state.yaml",
        "      owner: Worker",
        "      created_from: T002",
        "      depth: 1",
        "      rollup_receipt: null",
        "    receipt: ",
        "      result: done",
      ].join("\n"),
    );
    assert.notEqual(childBoundState, childState);
    writeFileSync(childStatePath, childBoundState);
    const unfinishedChild = runGoalMaker(["resume", childGoal, "--json"], { cwd: root });
    assert.equal(unfinishedChild.status, 0, unfinishedChild.stderr || unfinishedChild.stdout);
    assert.equal(JSON.parse(unfinishedChild.stdout).commands.complete_goal, null);

    const workerGoal = writeResumeGoal(root, "active-worker", { active: true });
    const worker = runGoalMaker(["resume", workerGoal, "--json"], { cwd: root });
    assert.equal(worker.status, 0, worker.stderr || worker.stdout);
    const workerReport = JSON.parse(worker.stdout);
    assert.equal(workerReport.commands.complete_goal, null);
    assert.equal(workerReport.board.next_free_task_id, "T005");
    assert.equal(workerReport.commands.apply_receipt.operation, "apply_receipt");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume scans T000 through T999 for the lowest unused root task ID", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-next-task-id-"));
  try {
    const goalDir = writeCompletionProjectionGoal(root, "t999-occupied");
    const statePath = join(goalDir, "state.yaml");
    writeFileSync(
      statePath,
      readFileSync(statePath, "utf8").replace(
        `  - id: T000
    type: pm`,
        `  - id: T005
    type: pm`,
      ),
    );

    const result = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.board.active_task.id, "T999");
    assert.equal(report.board.next_free_task_id, "T000");
    assert.doesNotMatch(result.stdout, /T1000/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume fails closed and names root task-ID namespace exhaustion", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-task-id-exhaustion-"));
  try {
    const goalDir = writeExhaustedTaskNamespaceGoal(root, "exhausted");
    const result = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.checker.ok, true);
    assert.equal(report.recovery.mode, "full_board_review");
    assert.equal(report.recovery.continuation_allowed, false);
    assert.match(report.errors.join("\n"), /task ID namespace exhausted.*T000.*T999/i);
    assert.doesNotMatch(result.stdout, /T1000/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume and parallel-plan bind every active child lane to one composite board-tree digest", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-tree-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const childDir = writeResumeChildBoard(goalDir);
    const rootStatePath = join(goalDir, "state.yaml");
    const childStatePath = join(childDir, "state.yaml");
    const rootDigest = createHash("sha256").update(readFileSync(rootStatePath, "utf8")).digest("hex");

    const first = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstReport = JSON.parse(first.stdout);
    assert.equal(firstReport.checker.state_digest, rootDigest);
    assert.equal(firstReport.board.tree.version, 1);
    assert.match(firstReport.board.tree.digest, /^[a-f0-9]{64}$/);
    assert.deepEqual(firstReport.board.tree.boards.map((board) => board.path), [
      "state.yaml",
      "subgoals/T002-child/state.yaml",
    ]);
    assert.equal(firstReport.board.active_lanes.length, 2);
    const childLane = firstReport.board.active_lanes.find((lane) => lane.kind === "child");
    assert.equal(childLane.active_task.id, "T010");
    assert.deepEqual(childLane.active_task.allowed_files, ["src/child.mjs"]);
    assert.deepEqual(childLane.active_task.verify, ["node --test test/child.test.mjs"]);
    assert.deepEqual(childLane.active_task.stop_if, ["Need files outside child allowed_files."]);
    assert.equal(firstReport.recovery.active_lane_count, 2);
    assert.match(firstReport.commands.parallel_plan, /goalbuddy parallel-plan/);

    const frontier = runGoalMaker(["frontier", goalDir, "--json"], { cwd: root });
    assert.equal(frontier.status, 0, frontier.stderr || frontier.stdout);
    const semantic = JSON.parse(frontier.stdout);
    assert.deepEqual(semantic.slice.active_lanes.map((lane) => lane.id), ["T002", "T010"]);
    assert.deepEqual(semantic.worker.active_lanes.map((lane) => lane.id), ["T002", "T010"]);
    assert.equal(
      semantic.slice.active_lanes.find((lane) => lane.id === "T010").objective,
      "Implement the child lane.",
    );
    assert.doesNotMatch(frontier.stdout, /board_tree_digest|state_digest|render-task-prompt/);

    const plan = runParallelPlan(goalDir, { cwd: root });
    assert.equal(plan.status, 0, plan.stderr || plan.stdout);
    const planReport = JSON.parse(plan.stdout);
    assert.equal(planReport.board_tree_digest, firstReport.board.tree.digest);
    assert.equal(planReport.board_tree_digest_kind, "board_tree_sha256");
    assert.equal(planReport.root_state_digest, firstReport.board.state_digest);
    assert.equal(planReport.root_state_digest_kind, "state_yaml_sha256");
    assert.equal(planReport.candidates.length, 2);
    assert.equal(planReport.candidates.every((candidate) => candidate.safe_to_parallelize), true);
    for (const candidate of planReport.candidates) {
      assert.match(candidate.state_digest, /^[a-f0-9]{64}$/);
      assert.match(candidate.render_prompt_command, new RegExp(`--expected-state-digest ${candidate.state_digest}$`));
    }

    const stalePlan = runGoalMaker([
      "parallel-plan",
      goalDir,
      "--expected-state-digest",
      firstReport.board.state_digest,
      "--expected-board-tree-digest",
      "0".repeat(64),
      "--json",
    ], { cwd: root });
    assert.equal(stalePlan.status, 1);
    assert.match(stalePlan.stderr || stalePlan.stdout, /board-tree digest drift/);

    const childBefore = readFileSync(childStatePath, "utf8");
    writeFileSync(childStatePath, childBefore.replace("Implement the child lane.", "Implement the revised child lane."));
    const second = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondReport = JSON.parse(second.stdout);
    assert.equal(secondReport.board.state_digest, rootDigest);
    assert.notEqual(secondReport.board.tree.digest, firstReport.board.tree.digest);
    assert.notEqual(
      secondReport.board.tree.boards.find((board) => board.path !== "state.yaml").state_digest,
      firstReport.board.tree.boards.find((board) => board.path !== "state.yaml").state_digest,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume and frontier reject child boards reached through symlink components", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-child-symlink-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const childDir = writeResumeChildBoard(goalDir, { objective: "EXTERNAL_CHILD_MUST_NOT_PROJECT" });
    const goalAlias = join(root, "goal-alias");
    symlinkSync(goalDir, goalAlias, "dir");
    const aliasResume = runGoalMaker(["resume", goalAlias, "--json"], { cwd: root });
    assert.equal(aliasResume.status, 0, aliasResume.stderr || aliasResume.stdout);

    const outsideChild = join(root, "outside-child");
    cpSync(childDir, outsideChild, { recursive: true });
    rmSync(childDir, { recursive: true, force: true });
    symlinkSync(outsideChild, childDir, "dir");
    const before = snapshotPath(root);

    const resume = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(resume.status, 1, resume.stderr || resume.stdout);
    assert.match(resume.stdout, /symlink components/);
    assert.doesNotMatch(resume.stdout, /EXTERNAL_CHILD_MUST_NOT_PROJECT/);

    const frontier = runGoalMaker(["frontier", goalDir, "--json"], { cwd: root });
    assert.equal(frontier.status, 1, frontier.stderr || frontier.stdout);
    assert.match(frontier.stderr, /symlink components/);
    assert.doesNotMatch(frontier.stderr, /EXTERNAL_CHILD_MUST_NOT_PROJECT/);
    assert.deepEqual(snapshotPath(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume emits no partial board-tree projection when a child cannot be parsed strictly", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-tree-invalid-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const childDir = writeResumeChildBoard(goalDir);
    const childStatePath = join(childDir, "state.yaml");
    const malformed = readFileSync(childStatePath, "utf8").replace(
      "active_task: T010\n",
      "active_task: T010\nactive_task: T010\n",
    );
    writeFileSync(childStatePath, malformed);

    const result = runGoalMaker(["resume", goalDir, "--json"], { cwd: root });
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.recovery.mode, "full_board_review");
    assert.equal(report.recovery.continuation_allowed, false);
    assert.equal("tree" in report.board, false);
    assert.match(report.errors.join("\n"), /child board could not be strictly projected|duplicate mapping key/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume strictly projects valid multiline plain scalars", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-resume-multiline-"));
  try {
    const goalDir = writeResumeGoal(root, "one", { active: true });
    const statePath = join(goalDir, "state.yaml");
    const state = readFileSync(statePath, "utf8").replace(
      '      summary: "Recent transition selected the bounded widget task."',
      "      summary: Recent transition selected\n        the bounded widget task.",
    );
    writeFileSync(statePath, state);

    const result = runGoalMaker(["resume", "docs/goals/one", "--json"], { cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.board.recent_receipt.summary, "Recent transition selected the bounded widget task.");
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

test("resume and prompt strictly preserve checker-green block scalar receipts", () => {
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
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(report.checker.ok, true);
    assert.match(report.board.state_digest, /^[a-f0-9]{64}$/);
    assert.equal(report.board.state_digest_status, "checker_validated");
    assert.equal(report.board.active_task.id, "T002");
    assert.match(report.board.recent_receipt.summary, /Recent transition selected the bounded widget task/);

    const stateDigest = createHash("sha256").update(readFileSync(statePath)).digest("hex");
    const prompt = runGoalMaker(["prompt", "docs/goals/strict-projection", "--expected-state-digest", stateDigest, "--json"], { cwd: root });
    assert.equal(prompt.status, 0, prompt.stderr || prompt.stdout);
    assert.equal(JSON.parse(prompt.stdout).task.id, "T002");
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
    assert.equal(report.board.planning_inventory.included, false);
    assert.deepEqual(report.board.planning_inventory.blocked_tasks, []);
    const planning = runGoalMaker(["resume", "docs/goals/production-migration", "--planning", "--json"], { cwd: root });
    assert.equal(planning.status, 0, planning.stderr || planning.stdout);
    const planningReport = JSON.parse(planning.stdout);
    assert.equal(planningReport.board.planning_inventory.included, true);
    assert.equal(planningReport.board.planning_inventory.blocked_tasks[0].waiting_for_user_approval, true);
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
