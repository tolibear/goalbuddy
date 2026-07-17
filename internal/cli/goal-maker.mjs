#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "../..");
const canonicalProductName = "GoalBuddy";
const canonicalCliName = "goalbuddy";
const pluginName = "goalbuddy";
const canonicalSkillName = "goal-prep";
const canonicalSkillDirectory = "goalbuddy";
const compilerSkillName = "codex-goal-compiler";
const compilerSkillDirectory = "codex-goal-compiler";
const compilerContractVersion = 1;
const boardSchemaVersion = 2;
const legacyCliName = "goal-maker";
const legacySkillName = "goal-maker";
const skillSource = join(packageRoot, canonicalSkillDirectory);
const compilerSkillSource = join(packageRoot, compilerSkillDirectory);
const claudePluginSource = join(packageRoot, "plugins", "goalbuddy");
const packageInfo = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const runtimeCapabilities = Object.freeze({
  atomic_amendment_transition: true,
  atomic_placeholder_hydration_transition: true,
  lossless_receipt_identity: true,
  strict_multiline_yaml_projection: true,
  closed_judge_decision_vocabulary: true,
  atomic_exact_human_wait_resume: true,
  atomic_goal_completion: true,
  task_bound_codex_exec_resume: true,
});
const defaultCodexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const defaultClaudeHome = process.env.CLAUDE_HOME || join(homedir(), ".claude");
const requiredAgentFiles = [
  "goal_judge.toml",
  "goal_keeper.toml",
  "goal_ledger.toml",
  "goal_scout.toml",
  "goal_worker.toml",
];
const requiredClaudeAgentFiles = [
  "goal-scout.md",
  "goal-judge.md",
  "goal-keeper.md",
  "goal-ledger.md",
  "goal-worker.md",
];
const optionsWithValues = new Set([
  "--claude-home",
  "--codex-home",
  "--goal",
  "--host",
  "--port",
  "--source",
  "--target",
  "--task",
  "--board",
  "--expected-state-digest",
  "--expected-board-tree-digest",
]);
const pathOptions = new Set(["--board", "--goal"]);

const args = process.argv.slice(2);
const command = args[0] === "--help" || args[0] === "-h"
  ? "help"
  : args[0] === "--version" || args[0] === "-v"
    ? "version"
    : args[0] && !args[0].startsWith("-")
      ? args[0]
      : "default";
const invokedAs = invokedCommandName();

main().catch((error) => {
  if (hasFlag("--json")) {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
});

async function main() {
  maybePrintLegacyNotice();
  switch (command) {
    case "default":
      usage();
      break;
    case "install":
    case "update":
      if (wantsHelp()) {
        usage();
        break;
      }
      await installTransaction(installTargetMode());
      break;
    case "agents":
      if (wantsHelp()) {
        usage();
        break;
      }
      if (targetMode() === "codex") {
        installAgents();
      } else {
        installClaudeAgents();
      }
      break;
    case "doctor":
      if (wantsHelp()) {
        usage();
        break;
      }
      if (targetMode() === "codex") {
        doctor();
      } else {
        doctorClaude();
      }
      break;
    case "contract":
      if (wantsHelp()) {
        usage();
        break;
      }
      compilerContract();
      break;
    case "reset":
      if (wantsHelp()) {
        usage();
        break;
      }
      if (targetMode() !== "codex") {
        console.error("Reset currently supports --target codex only.");
        process.exit(2);
      }
      resetCodex();
      break;
    case "check-update":
    case "update-check":
      checkUpdate();
      break;
    case "plugin":
      if (wantsHelp()) {
        pluginUsage();
        break;
      }
      await plugin();
      break;
    case "board":
      await board();
      break;
    case "resume":
      if (wantsHelp()) {
        usage();
        break;
      }
      await resume();
      break;
    case "dispatch":
      if (wantsHelp()) {
        usage();
        break;
      }
      dispatchCli();
      break;
    case "receipt":
      if (wantsHelp()) {
        usage();
        break;
      }
      receiptCli();
      break;
    case "wait":
    case "reply":
    case "complete":
    case "rebind":
      if (wantsHelp()) {
        usage();
        break;
      }
      stateTransitionCli(command);
      break;
    case "init":
      if (wantsHelp()) {
        usage();
        break;
      }
      initGoal();
      break;
    case "prompt":
      await prompt();
      break;
    case "parallel-plan":
      await parallelPlan();
      break;
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    case "version":
      console.log(packageInfo.version);
      break;
    default:
      if (!hasFlag("--json")) usage();
      argumentError(`Unknown command: ${command}`);
  }
}

function invokedCommandName() {
  if (process.env.GOALBUDDY_INVOKED_AS) return process.env.GOALBUDDY_INVOKED_AS;
  return basename(process.argv[1] || "");
}

function invokedThroughLegacyName() {
  return invokedAs === legacyCliName;
}

function maybePrintLegacyNotice() {
  if (!invokedThroughLegacyName() || hasFlag("--json")) return;
  console.error(`${legacyCliName} has been rebranded to ${canonicalCliName}.`);
  console.error(`Use: ${canonicalCliName}`);
  console.error(`${legacyCliName} remains available temporarily for compatibility.`);
  console.error("");
}

function optionValue(name) {
  let value = null;
  let found = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        argumentError(`Missing value for ${name}`);
      }
      value = next;
      found = true;
    } else if (arg.startsWith(`${name}=`)) {
      value = arg.slice(name.length + 1);
      found = true;
    }
  }
  return found ? value : null;
}

function argumentError(message) {
  if (args.includes("--json")) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exit(2);
}

function hasFlag(name) {
  return args.includes(name);
}

function wantsHelp() {
  return hasFlag("--help") || hasFlag("-h");
}

function positional(index) {
  return positionalArgs()[index] || "";
}

function positionalArgs() {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (optionsWithValues.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) continue;
    values.push(arg);
  }
  return values;
}

/**
 * Resolve goal-related paths in raw args to absolute paths.
 * Child processes spawned with cwd=packageRoot cannot resolve
 * relative goal paths from the user's working directory.
 */
function resolveChildGoalArgs(rawArgs) {
  const out = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    const joinedMatch = [...pathOptions].find((opt) => arg.startsWith(opt + "="));
    if (joinedMatch) {
      const value = arg.slice(joinedMatch.length + 1);
      out.push(`${joinedMatch}=${value ? resolve(value) : value}`);
    } else if (pathOptions.has(arg)) {
      out.push(arg);
      const value = rawArgs[index + 1];
      if (value !== undefined && !value.startsWith("--")) {
        index += 1;
        out.push(resolve(value));
      }
    } else if (optionsWithValues.has(arg)) {
      out.push(arg);
      const value = rawArgs[index + 1];
      if (value !== undefined && !value.startsWith("--")) {
        index += 1;
        out.push(value);
      }
    } else if (!arg.startsWith("-")) {
      out.push(resolve(arg));
    } else {
      out.push(arg);
    }
  }
  return out;
}

function usage() {
  console.log(`${canonicalProductName} for Claude Code and Codex

Usage:
  ${canonicalCliName}
  ${canonicalCliName} plugin install [--source <marketplace-source>] [--codex-home <path>] [--json]
  ${canonicalCliName} install [--target claude|codex] [--claude-home <path>] [--codex-home <path>] [--force] [--json]
  ${canonicalCliName} update [--target claude|codex] [--source <marketplace-source>] [--claude-home <path>] [--codex-home <path>] [--json]
  ${canonicalCliName} agents [--target claude|codex] [--claude-home <path>] [--codex-home <path>] [--force]
  ${canonicalCliName} doctor [--target claude|codex] [--claude-home <path>] [--codex-home <path>] [--goal-ready]
  ${canonicalCliName} contract --target claude|codex [--claude-home <path>] [--codex-home <path>] [--json]
  ${canonicalCliName} reset --target codex [--codex-home <path>] [--json]
  ${canonicalCliName} check-update [--json]
  ${canonicalCliName} board <docs/goals/slug> [--host <host>] [--port <port>] [--once] [--json]
  ${canonicalCliName} init <slug> [--title "<Goal title>"] [--json]
  ${canonicalCliName} resume [docs/goals/slug] [--planning] [--json]
  ${canonicalCliName} dispatch <docs/goals/slug> --to codex|claude-code --expected-state-digest <sha256> [--task T###] [--model <name>] [--reasoning-effort low|medium|high|xhigh|max|ultra] [--service-tier fast|default|flex] [--brief <path> --brief-sha256 <sha256>] [--resume-session <uuid> --confirmed-not-live] [--timeout <seconds>] [--allow-immutable-history] [--json]
  ${canonicalCliName} receipt <docs/goals/slug> --task T### --receipt <file> --expected-state-digest <sha256> --activate T### [--add-tasks <json-file> | --hydrate-task T### [--task-card <json-file> --task-card-sha256 <hex>]] [--allow-immutable-history] [--json]
  ${canonicalCliName} wait <docs/goals/slug> --task T### --receipt <wait.json> --expected-state-digest <sha256> [--allow-immutable-history] [--json]
  ${canonicalCliName} reply <docs/goals/slug> --task T### --reply-file <reply.json> --expected-state-digest <sha256> [--allow-immutable-history] [--json]
  ${canonicalCliName} complete <docs/goals/slug> --task T### --receipt <final.json> --expected-state-digest <sha256> [--allow-immutable-history] [--json]
  ${canonicalCliName} rebind <docs/goals/slug> --binding <binding.json> --installed-checker <path> [--installed-checker <path> ...] --expected-state-digest <sha256> [--allow-immutable-history] [--json]
  ${canonicalCliName} prompt <docs/goals/slug> --expected-state-digest <sha256> [--task T###] [--board <path/to/state.yaml>] [--allow-immutable-history] [--json]
  ${canonicalCliName} parallel-plan <docs/goals/slug> --expected-state-digest <sha256> --expected-board-tree-digest <sha256> [--json]

Targets: install/update transactionally prepares both Codex (~/.codex) and Claude Code (~/.claude). Use --target codex or --target claude to limit the transaction.

Default:
  ${canonicalCliName}                  Shows this help without changing runtime state.
  ${canonicalCliName} install          Installs Codex Goal Compiler, Goal Prep, and agents for both harnesses as one rollback-safe transaction.
  ${canonicalCliName} install --target claude  Installs ${canonicalProductName} compiler, backend, command, and agents for Claude Code.
  ${canonicalCliName} install --target codex   Installs and enables the native Codex plugin.

Compatibility:
  ${legacyCliName} remains an inherited temporary alias and prints the canonical local command for human-facing use.

Environment:
  CODEX_HOME                         Overrides the default ~/.codex target.
  CLAUDE_HOME                        Overrides the default ~/.claude path. For doctor/contract it selects Claude unless --target is explicit; install/update still default to both targets.
`);
}

function codexHome() {
  return resolve(optionValue("--codex-home") || defaultCodexHome);
}

function claudeHome() {
  return resolve(optionValue("--claude-home") || defaultClaudeHome);
}

function requestedTarget() {
  const raw = optionValue("--target");
  if (raw === null) return "";
  const value = raw.toLowerCase();
  if (value !== "codex" && value !== "claude") {
    argumentError(`Invalid --target: ${raw}. Use codex or claude.`);
  }
  return value;
}

function targetMode() {
  const value = requestedTarget();
  if (value) return value;
  // Explicit --claude-home or CLAUDE_HOME implies Claude target unless --target codex is set.
  if (optionValue("--claude-home") || process.env.CLAUDE_HOME) return "claude";
  return "codex";
}

function installTargetMode() {
  const value = requestedTarget();
  if (value) return value;

  const hasCodexHomeOption = Boolean(optionValue("--codex-home"));
  const hasClaudeHomeOption = Boolean(optionValue("--claude-home"));
  if (hasCodexHomeOption && !hasClaudeHomeOption) return "codex";
  if (hasClaudeHomeOption && !hasCodexHomeOption) return "claude";
  return "all";
}

function claudeSkillRoot() {
  return join(claudeHome(), "skills", canonicalSkillName);
}

function claudeCompilerSkillRoot() {
  return join(claudeHome(), "skills", compilerSkillName);
}

function standaloneCompilerRoot() {
  return join(homedir(), ".agents", "skills", compilerSkillName);
}

function recognizedStandaloneCompilerTarget() {
  return resolve(
    process.env.GOALBUDDY_LEGACY_COMPILER_ROOT
      || join(homedir(), "Code", "skills", "shared", "skills", compilerSkillName),
  );
}

function legacyClaudeSkillRoot() {
  return join(claudeHome(), "skills", canonicalSkillDirectory);
}

function claudeAgentsRoot() {
  return join(claudeHome(), "agents");
}

function legacyClaudeCommandPath() {
  return join(claudeHome(), "commands", "goal-prep.md");
}

function installClaudeSkill({ quiet = false } = {}) {
  const target = claudeSkillRoot();
  if (!existsSync(skillSource)) {
    throw new Error(`Skill payload not found: ${skillSource}`);
  }

  const legacyTarget = legacyClaudeSkillRoot();
  const previousMetadata = readInstallMetadata(target) || readInstallMetadata(legacyTarget);
  const previousFingerprint = existsSync(target) ? directoryFingerprint(target, { exclude: installFingerprintExcludes() }) : "";

  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  cpSync(skillSource, target, { recursive: true });
  writeInstallMetadata(target, previousMetadata);

  const legacyRemoved = existsSync(legacyTarget);
  if (legacyRemoved) {
    rmSync(legacyTarget, { recursive: true, force: true });
    if (!quiet) console.log(`removed legacy ${legacyTarget} (skill now installs as ${canonicalSkillName})`);
  }

  const currentFingerprint = directoryFingerprint(target, { exclude: installFingerprintExcludes() });
  const status = previousFingerprint
    ? previousFingerprint === currentFingerprint ? "unchanged" : "updated"
    : "installed";
  if (!quiet) console.log(`Installed Claude Code ${canonicalProductName} skill to ${target}`);

  return {
    status,
    path: target,
    previous_version: previousMetadata?.package_version || "",
    current_version: packageInfo.version,
    removed_legacy_skill_path: legacyRemoved ? legacyTarget : "",
  };
}

function installClaudeCompilerSkill({ quiet = false } = {}) {
  const target = claudeCompilerSkillRoot();
  if (!existsSync(compilerSkillSource)) {
    throw new Error(`Compiler skill payload not found: ${compilerSkillSource}`);
  }

  const previousMetadata = readInstallMetadata(target);
  const previousFingerprint = existsSync(target)
    ? directoryFingerprint(target, { exclude: installFingerprintExcludes() })
    : "";

  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  cpSync(compilerSkillSource, target, { recursive: true });
  writeInstallMetadata(target, previousMetadata);

  const currentFingerprint = directoryFingerprint(target, { exclude: installFingerprintExcludes() });
  const status = previousFingerprint
    ? previousFingerprint === currentFingerprint ? "unchanged" : "updated"
    : "installed";
  if (!quiet) console.log(`Installed Claude Code ${compilerSkillName} skill to ${target}`);

  return {
    status,
    path: target,
    previous_version: previousMetadata?.package_version || "",
    current_version: packageInfo.version,
  };
}

function installClaudeAgents({ quiet = false } = {}) {
  const source = join(claudePluginSource, "agents");
  const target = claudeAgentsRoot();
  const force = hasFlag("--force") || command === "update" || command === "install" || command === "default";
  mkdirSync(target, { recursive: true });

  const results = [];
  if (!existsSync(source)) return results;
  for (const file of readdirSync(source)) {
    if (!file.endsWith(".md")) continue;
    const dest = join(target, file);
    const sourceHash = sha256(readFileSync(join(source, file)));
    const previousHash = existsSync(dest) ? sha256(readFileSync(dest)) : "";
    if (existsSync(dest) && !force) {
      if (!quiet) console.log(`skip existing ${dest} (use --force to overwrite)`);
      results.push({ file, status: "skipped", path: dest });
      continue;
    }
    cpSync(join(source, file), dest);
    const status = previousHash ? previousHash === sourceHash ? "unchanged" : "updated" : "installed";
    if (!quiet) console.log(`installed ${dest}`);
    results.push({ file, status, path: dest });
  }
  return results;
}

function claudeGoalCommandPath() {
  return join(claudeHome(), "commands", "goal.md");
}

function claudeGoalCommandSource() {
  return join(claudePluginSource, "commands", "goal.md");
}

function installClaudeGoalCommand({ quiet = false } = {}) {
  const source = claudeGoalCommandSource();
  const target = claudeGoalCommandPath();
  if (!existsSync(source)) return { status: "missing_source", path: target };
  const sourceHash = sha256(readFileSync(source));
  const previousHash = existsSync(target) ? sha256(readFileSync(target)) : "";
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
  const status = previousHash ? previousHash === sourceHash ? "unchanged" : "updated" : "installed";
  if (!quiet) console.log(`installed ${target}`);
  return { status, path: target };
}

function cleanupLegacyClaudeCommands({ quiet = false } = {}) {
  const legacyPath = legacyClaudeCommandPath();
  if (!existsSync(legacyPath)) return { removed: false, path: legacyPath };
  rmSync(legacyPath, { force: true });
  if (!quiet) console.log(`removed legacy ${legacyPath} (skill now surfaces /goal-prep)`);
  return { removed: true, path: legacyPath };
}

async function buildClaudeInstallReport() {
  const quiet = true;
  const report = {
    command,
    target: "claude",
    package: {
      name: packageInfo.name,
      current_version: packageInfo.version,
    },
    claude_home: claudeHome(),
    skill: installClaudeSkill({ quiet }),
    compiler_skill: installClaudeCompilerSkill({ quiet }),
    agents: installClaudeAgents({ quiet }),
    goal_command: installClaudeGoalCommand({ quiet }),
    legacy_commands_cleanup: cleanupLegacyClaudeCommands({ quiet }),
    warnings: [],
  };

  report.package.previous_version = report.skill.previous_version;
  return report;
}

async function installTransaction(mode) {
  const targets = mode === "all" ? ["codex", "claude"] : [mode];
  preflightInstallTransaction(targets);
  const snapshot = createInstallSnapshot(installationOwnedPaths(targets));

  try {
    const codex = targets.includes("codex") ? installPlugin({ quiet: true }) : null;
    activationCheckpoint("codex");
    const claude = targets.includes("claude") ? await buildClaudeInstallReport() : null;
    activationCheckpoint("claude");
    const compilerCleanup = targets.includes("codex")
      ? retireStandaloneCompilerLink()
      : { status: "not_applicable", path: standaloneCompilerRoot() };
    activationCheckpoint("compiler_retirement");

    const verification = verifyInstalledTargets(targets);
    activationCheckpoint("verification");
    const transaction = {
      status: "committed",
      targets,
      rollback_performed: false,
      verified: true,
    };
    const report = installTransactionReport({ mode, codex, claude, compilerCleanup, verification, transaction });
    discardInstallSnapshot(snapshot);
    printInstallTransactionReport(mode, report);
    return report;
  } catch (error) {
    let rollbackError = null;
    try {
      restoreInstallSnapshot(snapshot);
    } catch (restoreError) {
      rollbackError = restoreError;
    }

    const failure = {
      ok: false,
      command,
      target_mode: mode,
      error: error.message,
      transaction: {
        status: rollbackError ? "rollback_failed" : "rolled_back",
        targets,
        rollback_performed: !rollbackError,
        verified: false,
        recovery_snapshot: rollbackError ? snapshot.root : null,
        rollback_error: rollbackError?.message || null,
      },
    };
    if (hasFlag("--json")) {
      console.error(JSON.stringify(failure, null, 2));
    } else if (rollbackError) {
      console.error(`GoalBuddy activation failed and rollback also failed: ${error.message}`);
      console.error(`Recovery snapshot: ${snapshot.root}`);
      console.error(`Rollback error: ${rollbackError.message}`);
    } else {
      console.error(`GoalBuddy activation failed; previous runtime surfaces were restored: ${error.message}`);
    }
    process.exitCode = 1;
    return failure;
  }
}

function installTransactionReport({ mode, codex, claude, compilerCleanup, verification, transaction }) {
  if (mode === "codex") {
    return {
      ...codex,
      ok: true,
      standalone_compiler_cleanup: compilerCleanup,
      verification,
      transaction,
    };
  }
  if (mode === "claude") {
    return {
      ...claude,
      ok: true,
      verification,
      transaction,
    };
  }
  return {
    command,
    package: {
      name: packageInfo.name,
      current_version: packageInfo.version,
    },
    codex,
    claude,
    standalone_compiler_cleanup: compilerCleanup,
    verification,
    errors: [],
    ok: true,
    transaction,
  };
}

function printInstallTransactionReport(mode, report) {
  if (hasFlag("--json")) {
    printJson(report);
  } else if (mode === "codex") {
    printCodexInstallReport(report);
  } else if (mode === "claude") {
    printClaudeInstallReport(report);
  } else {
    printEverywhereInstallReport(report);
  }
}

function preflightInstallTransaction(targets) {
  const source = sourceMetadata();
  if (!source.verified) {
    throw new Error("GoalBuddy package bytes do not match a verified local Git checkout; refresh the Bun package before activation.");
  }
  const requiredPaths = [
    join(packageRoot, "package.json"),
    join(compilerSkillSource, "SKILL.md"),
    join(skillSource, "SKILL.md"),
  ];
  if (targets.includes("codex")) {
    requiredPaths.push(join(claudePluginSource, ".codex-plugin", "plugin.json"));
    requiredPaths.push(...requiredAgentFiles.map((file) => join(skillSource, "agents", file)));
    const standalone = lstatSync(standaloneCompilerRoot(), { throwIfNoEntry: false });
    if (standalone && !standalone.isSymbolicLink()) {
      throw new Error(`Standalone Codex Goal Compiler is not a symlink and cannot be retired automatically: ${standaloneCompilerRoot()}`);
    }
    if (standalone) inspectRecognizedStandaloneCompilerLink();
  }
  if (targets.includes("claude")) {
    requiredPaths.push(join(claudePluginSource, "commands", "goal.md"));
    requiredPaths.push(...requiredClaudeAgentFiles.map((file) => join(claudePluginSource, "agents", file)));
  }
  const missing = requiredPaths.filter((path) => !existsSync(path));
  if (missing.length) throw new Error(`Activation payload is incomplete: ${missing.join(", ")}`);
}

function installationOwnedPaths(targets) {
  const paths = [];
  if (targets.includes("codex")) {
    paths.push(join(codexHome(), "config.toml"));
    paths.push(pluginCacheOwnerRoot());
    paths.push(...requiredAgentFiles.map((file) => join(codexHome(), "agents", file)));
    paths.push(...legacyCodexSkillRoots());
    paths.push(standaloneCompilerRoot());
  }
  if (targets.includes("claude")) {
    paths.push(claudeSkillRoot(), claudeCompilerSkillRoot(), legacyClaudeSkillRoot());
    paths.push(...requiredClaudeAgentFiles.map((file) => join(claudeAgentsRoot(), file)));
    paths.push(claudeGoalCommandPath(), legacyClaudeCommandPath());
  }
  return [...new Set(paths)];
}

function createInstallSnapshot(paths) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-activation-"));
  const missingDirectories = new Set();
  const entries = paths.map((path, index) => {
    const present = pathEntryExists(path);
    const backup = join(root, String(index));
    if (present) copyPathEntry(path, backup);
    recordMissingParentDirectories(path, missingDirectories);
    return { path, present, backup };
  });
  return { root, entries, missing_directories: [...missingDirectories] };
}

function restoreInstallSnapshot(snapshot) {
  for (const entry of snapshot.entries) {
    removePathEntry(entry.path);
    if (entry.present) copyPathEntry(entry.backup, entry.path);
  }
  removeTransactionCreatedDirectories(snapshot.missing_directories);
  discardInstallSnapshot(snapshot);
}

function discardInstallSnapshot(snapshot) {
  rmSync(snapshot.root, { recursive: true, force: true });
}

function copyPathEntry(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  });
}

function removePathEntry(path) {
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry) return;
  rmSync(path, { recursive: entry.isDirectory() && !entry.isSymbolicLink(), force: true });
}

function pathEntryExists(path) {
  return Boolean(lstatSync(path, { throwIfNoEntry: false }));
}

function recordMissingParentDirectories(path, missingDirectories) {
  let current = dirname(path);
  while (current !== dirname(current) && !pathEntryExists(current)) {
    missingDirectories.add(current);
    current = dirname(current);
  }
}

function removeTransactionCreatedDirectories(paths = []) {
  const deepestFirst = [...paths].sort((left, right) => right.length - left.length);
  for (const path of deepestFirst) {
    try {
      rmdirSync(path);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "ENOTEMPTY") continue;
      throw error;
    }
  }
}

function retireStandaloneCompilerLink() {
  const inspected = inspectRecognizedStandaloneCompilerLink();
  if (!inspected) return { status: "absent", path: standaloneCompilerRoot(), previous_target: null };
  const { path, previousTarget, resolvedTarget, fingerprint } = inspected;
  rmSync(path, { force: true });
  return {
    status: "removed_symlink",
    path,
    previous_target: previousTarget,
    resolved_target: resolvedTarget,
    previous_fingerprint: fingerprint,
  };
}

function inspectRecognizedStandaloneCompilerLink() {
  const path = standaloneCompilerRoot();
  const entry = lstatSync(path, { throwIfNoEntry: false });
  if (!entry) return null;
  if (!entry.isSymbolicLink()) {
    throw new Error(`Refusing to remove non-symlink standalone compiler: ${path}`);
  }
  const previousTarget = readlinkSync(path);
  const resolvedTarget = resolve(dirname(path), previousTarget);
  const recognizedTarget = recognizedStandaloneCompilerTarget();
  if (resolvedTarget !== recognizedTarget) {
    throw new Error(
      `Refusing to remove unrecognized standalone compiler symlink ${path}; `
      + `resolved target ${resolvedTarget} does not match recognized legacy source ${recognizedTarget}.`,
    );
  }
  if (!existsSync(join(resolvedTarget, "SKILL.md"))) {
    throw new Error(`Recognized standalone compiler target is missing SKILL.md: ${resolvedTarget}`);
  }
  return {
    path,
    previousTarget,
    resolvedTarget,
    fingerprint: skillTreeFingerprint(resolvedTarget),
  };
}

function verifyInstalledTargets(targets) {
  const result = {};
  if (targets.includes("codex")) {
    const codex = buildCodexDoctorReport();
    if (!codex.ok) throw new Error(`Codex verification failed: ${codex.report.errors.join(" ")}`);
    result.codex = "pass";
  }
  if (targets.includes("claude")) {
    const claude = buildClaudeDoctorReport();
    if (!claude.ok) throw new Error(`Claude verification failed: ${claude.report.errors.join(" ")}`);
    result.claude = "pass";
  }
  return result;
}

function activationCheckpoint(name) {
  if (process.env.GOALBUDDY_TEST_FAIL_AFTER === name) {
    throw new Error(`Injected activation failure after ${name}`);
  }
}

function buildClaudeDoctorReport() {
  const source = sourceMetadata();
  const skillPath = join(claudeSkillRoot(), "SKILL.md");
  const compilerSkillPath = join(claudeCompilerSkillRoot(), "SKILL.md");
  const agentsPath = claudeAgentsRoot();
  const installed = existsSync(skillPath);
  const compilerInstalled = existsSync(compilerSkillPath);
  const skillStale = installed && skillTreeFingerprint(claudeSkillRoot()) !== skillTreeFingerprint(skillSource);
  const compilerSkillStale = compilerInstalled
    && skillTreeFingerprint(claudeCompilerSkillRoot()) !== skillTreeFingerprint(compilerSkillSource);
  const agents = existsSync(agentsPath)
    ? readdirSync(agentsPath).filter((file) => file.startsWith("goal-") && file.endsWith(".md"))
    : [];
  const missingAgents = requiredClaudeAgentFiles.filter((file) => !agents.includes(file));
  const staleAgents = requiredClaudeAgentFiles.filter((file) => {
    const installedAgent = join(agentsPath, file);
    const bundledAgent = join(claudePluginSource, "agents", file);
    if (!existsSync(installedAgent) || !existsSync(bundledAgent)) return false;
    return sha256(readFileSync(installedAgent)) !== sha256(readFileSync(bundledAgent));
  });
  const legacyCommandPath = legacyClaudeCommandPath();
  const legacyCommandPresent = existsSync(legacyCommandPath);
  const legacySkillPath = legacyClaudeSkillRoot();
  const legacySkillPresent = existsSync(legacySkillPath);
  const goalCommandPath = claudeGoalCommandPath();
  const goalCommandPresent = existsSync(goalCommandPath);
  const goalCommandStale = goalCommandPresent
    && existsSync(claudeGoalCommandSource())
    && sha256(readFileSync(goalCommandPath)) !== sha256(readFileSync(claudeGoalCommandSource()));
  const errors = [];
  if (!source.verified) {
    errors.push("GoalBuddy package bytes do not match a verified local Git checkout; refresh the Bun package before activation.");
  }
  if (!installed) errors.push("Claude Goal Prep skill is not installed.");
  if (!compilerInstalled) errors.push("Claude Codex Goal Compiler skill is not installed.");
  if (skillStale) errors.push("Claude Goal Prep skill is stale; run `goalbuddy update --target claude`.");
  if (compilerSkillStale) errors.push("Claude Codex Goal Compiler skill is stale; run `goalbuddy update --target claude`.");
  for (const file of missingAgents) errors.push(`Missing GoalBuddy Claude agent: ${file}.`);
  for (const file of staleAgents) errors.push(`Stale GoalBuddy Claude agent: ${file}.`);
  if (!goalCommandPresent) errors.push("Claude /goal command is missing.");
  if (goalCommandStale) errors.push("Claude /goal command is stale; run `goalbuddy update --target claude`.");
  if (legacyCommandPresent) errors.push("Claude legacy Goal Prep command is still present.");
  if (legacySkillPresent) errors.push("Claude legacy GoalBuddy skill is still present.");

  const report = {
    target: "claude",
    source,
    capabilities: installedRuntimeCapabilities(),
    claude_home: claudeHome(),
    skill_installed: installed,
    skill_path: skillPath,
    skill_stale: skillStale,
    compiler_skill_installed: compilerInstalled,
    compiler_skill_path: compilerSkillPath,
    compiler_skill_stale: compilerSkillStale,
    installed_agents: agents,
    missing_agents: missingAgents,
    stale_agents: staleAgents,
    goal_command_present: goalCommandPresent,
    goal_command_path: goalCommandPath,
    goal_command_stale: goalCommandStale,
    legacy_command_present: legacyCommandPresent,
    legacy_command_path: legacyCommandPath,
    legacy_skill_present: legacySkillPresent,
    legacy_skill_path: legacySkillPath,
    errors,
  };

  return { report, ok: errors.length === 0 };
}

function doctorClaude() {
  const result = buildClaudeDoctorReport();
  console.log(JSON.stringify(result.report, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function printClaudeInstallReport(report) {
  const verb = report.command === "update" ? "Updated" : "Installed";
  const previous = report.package.previous_version && report.package.previous_version !== report.package.current_version
    ? ` ${report.package.previous_version} -> ${report.package.current_version}`
    : ` ${report.package.current_version}`;
  console.log("");
  console.log(`${verb} ${canonicalProductName} for Claude Code${previous}`);
  console.log("");
  console.log(`Skill: ${report.skill.status} at ${report.skill.path}`);
  console.log(`Compiler: ${report.compiler_skill.status} at ${report.compiler_skill.path}`);
  console.log(`Agents: ${summarizeStatuses(report.agents)}`);
  console.log(`Command: /goal ${report.goal_command.status} at ${report.goal_command.path}`);
  if (report.legacy_commands_cleanup?.removed) {
    console.log(`Removed legacy command: ${report.legacy_commands_cleanup.path}`);
  }
  console.log("");
  console.log("Next:");
  console.log(`  Restart Claude Code, then run: /${compilerSkillName}`);
  console.log(`  Goal Prep remains available explicitly as: /${canonicalSkillName}`);
  console.log("");
  console.log("Also available for Codex:");
  console.log(`  ${canonicalCliName} install --target codex`);
}

function installSkill({ force = true, quiet = false } = {}) {
  const target = installedSkillRoot();
  const legacyTarget = legacyInstalledSkillRoot();
  if (!existsSync(skillSource)) {
    console.error(`Skill payload not found: ${skillSource}`);
    process.exit(1);
  }

  const previousMetadata = readInstallMetadata(target) || readInstallMetadata(legacyTarget);
  const previousFingerprint = existsSync(target) ? directoryFingerprint(target, { exclude: installFingerprintExcludes() }) : "";

  mkdirSync(dirname(target), { recursive: true });
  if (existsSync(target)) {
    if (!force) {
      console.error(`Refusing to overwrite existing skill: ${target}`);
      console.error("Use --force to overwrite.");
      process.exit(1);
    }
    rmSync(target, { recursive: true, force: true });
  }

  cpSync(skillSource, target, {
    recursive: true,
  });
  writeInstallMetadata(target, previousMetadata);

  mkdirSync(dirname(legacyTarget), { recursive: true });
  rmSync(legacyTarget, { recursive: true, force: true });
  mkdirSync(legacyTarget, { recursive: true });
  writeFileSync(join(legacyTarget, "SKILL.md"), compatibilitySkillBody());
  writeInstallMetadata(legacyTarget, previousMetadata);

  const currentFingerprint = directoryFingerprint(target, { exclude: installFingerprintExcludes() });
  const status = previousFingerprint
    ? previousFingerprint === currentFingerprint ? "unchanged" : "updated"
    : "installed";
  if (!quiet) console.log(`Installed Codex ${canonicalProductName} skill to ${target}`);

  return {
    status,
    path: target,
    compatibility_path: legacyTarget,
    previous_version: previousMetadata?.package_version || "",
    current_version: packageInfo.version,
  };
}

function compatibilitySkillBody() {
  return `---
name: ${legacySkillName}
description: Compatibility alias for GoalBuddy. Use $${canonicalSkillName} as the canonical skill.
---

# GoalBuddy Compatibility Alias

$${legacySkillName} is the previous name for $${canonicalSkillName}.

Use $${canonicalSkillName} for new work. This compatibility skill exists so older prompts and local installs do not fail after the rebrand.

When invoked through $${legacySkillName}:

1. Tell the user Goal Maker has been rebranded to GoalBuddy.
2. Show the canonical command: $${canonicalSkillName}.
3. If the user wants to continue immediately, follow the same workflow as $${canonicalSkillName}: run diagnostic intake, create or repair \`docs/goals/<slug>/goal.md\` and \`state.yaml\`, preserve one active task, and print \`/goal Follow docs/goals/<slug>/goal.md.\` without starting \`/goal\` automatically.

This alias has the same invocation boundary as \`$${canonicalSkillName}\`: prepare the board only. Do not use or refresh named skills, inspect implementation files, browse references, research, generate assets, or perform the requested work until the user starts the printed \`/goal\` command.
`;
}

function installAgents({ quiet = false } = {}) {
  const source = join(skillSource, "agents");
  const target = join(codexHome(), "agents");
  const force = hasFlag("--force") || command === "update" || command === "install" || command === "default" || command === "plugin";
  mkdirSync(target, { recursive: true });

  const results = [];
  for (const file of readdirSync(source)) {
    if (!file.startsWith("goal_") || !file.endsWith(".toml")) continue;
    const dest = join(target, file);
    const sourceHash = sha256(readFileSync(join(source, file)));
    const previousHash = existsSync(dest) ? sha256(readFileSync(dest)) : "";
    if (existsSync(dest) && !force) {
      if (!quiet) console.log(`skip existing ${dest} (use --force to overwrite)`);
      results.push({ file, status: "skipped", path: dest });
      continue;
    }
    cpSync(join(source, file), dest);
    const status = previousHash ? previousHash === sourceHash ? "unchanged" : "updated" : "installed";
    if (!quiet) console.log(`installed ${dest}`);
    results.push({ file, status, path: dest });
  }
  return results;
}

async function installAll() {
  const quiet = true;
  const report = {
    command,
    package: {
      name: packageInfo.name,
      current_version: packageInfo.version,
    },
    codex_home: codexHome(),
    skill: installSkill({ force: true, quiet }),
    agents: installAgents({ quiet }),
    warnings: [],
  };

  report.package.previous_version = report.skill.previous_version;

  if (hasFlag("--json")) {
    printJson(report);
  } else {
    printInstallReport(report);
  }
}

function buildCodexDoctorReport({ requireGoalReady = false } = {}) {
  const source = sourceMetadata();
  const skillPath = join(installedSkillRoot(), "SKILL.md");
  const legacySkillPath = join(legacyInstalledSkillRoot(), "SKILL.md");
  const standaloneCompilerPath = join(homedir(), ".agents", "skills", compilerSkillName);
  const plugin = installedCodexPlugin();
  const marketplaceSource = marketplaceSourceFromConfig();
  const marketplaceSourceMatches = marketplaceSource === source.root;
  const agentsPath = join(codexHome(), "agents");
  const installed = existsSync(skillPath);
  const legacyInstalled = existsSync(legacySkillPath);
  const standaloneCompilerPresent = pathEntryExists(standaloneCompilerPath);
  const standaloneCompilerDangling = standaloneCompilerPresent
    && !existsSync(join(standaloneCompilerPath, "SKILL.md"));
  const agents = existsSync(agentsPath)
    ? readdirSync(agentsPath).filter((file) => file.startsWith("goal_") && file.endsWith(".toml"))
    : [];
  const installSurfacePresent = plugin.skill_installed || installed || legacyInstalled;
  const residualAgents = installSurfacePresent ? [] : agents.filter((file) => requiredAgentFiles.includes(file));
  const missingAgents = installSurfacePresent || residualAgents.length > 0
    ? requiredAgentFiles.filter((file) => !agents.includes(file))
    : [];
  const staleAgents = requiredAgentFiles.filter((file) => {
    const installedAgent = join(agentsPath, file);
    const bundledAgent = join(skillSource, "agents", file);
    if (!existsSync(installedAgent) || !existsSync(bundledAgent)) return false;
    return sha256(readFileSync(installedAgent)) !== sha256(readFileSync(bundledAgent));
  });
  const runtimeState = codexInstallState({
    plugin,
    installed,
    legacyInstalled,
    residualAgents,
    missingAgents,
    staleAgents,
  });
  const goalRuntime = codexGoalRuntimeStatus();
  const warnings = [];
  const errors = [];
  if (!source.verified) {
    errors.push("GoalBuddy package bytes do not match a verified local Git checkout; refresh the Bun package before activation.");
  }
  if (!goalRuntime.ready) {
    warnings.push("native Codex /goal runtime is not ready; run `codex login` and `codex features enable goals` before using /goal.");
  }
  if (runtimeState === "fully-removed") {
    errors.push("Codex GoalBuddy is fully removed; run `goalbuddy install --target codex` to install.");
  } else if (runtimeState === "residual-agents-only") {
    errors.push(`Residual GoalBuddy Codex agents remain without plugin cache/config: ${residualAgents.join(", ")}; run a GoalBuddy reset/cleanup before treating it as removed.`);
  } else if (!plugin.skill_installed && !installed) {
    errors.push("Codex GoalBuddy plugin is not installed; run `goalbuddy install --target codex`.");
  }
  if (plugin.skill_installed && !plugin.enabled) {
    errors.push("Codex GoalBuddy plugin cache exists but is not enabled in config.toml; run `goalbuddy install --target codex`.");
  }
  if (plugin.skill_installed && !marketplaceSourceMatches) {
    errors.push(`Codex GoalBuddy marketplace source is ${marketplaceSource || "missing"}; expected verified local checkout ${source.root}.`);
  }
  if (plugin.skill_installed && !plugin.compiler_skill_installed) {
    errors.push("Codex GoalBuddy plugin is missing the bundled Codex Goal Compiler; run `goalbuddy update --target codex`.");
  }
  if (plugin.goal_prep_stale) {
    errors.push("Codex Goal Prep plugin skill is stale; run `goalbuddy update --target codex`.");
  }
  if (plugin.compiler_skill_stale) {
    errors.push("Codex Goal Compiler plugin skill is stale; run `goalbuddy update --target codex`.");
  }
  if (standaloneCompilerPresent) {
    const state = standaloneCompilerDangling ? "dangling entry" : "shadowing entry";
    errors.push(`Standalone Codex Goal Compiler ${state} remains at ${standaloneCompilerPath}; run \`goalbuddy install --target codex\` to retire a symlink safely.`);
  }
  for (const file of missingAgents) {
    errors.push(`Missing GoalBuddy Codex agent: ${file}; run \`goalbuddy install --target codex\`.`);
  }
  for (const file of staleAgents) {
    errors.push(`Stale GoalBuddy Codex agent: ${file}; run \`goalbuddy update --target codex\`.`);
  }
  if (requireGoalReady && !goalRuntime.ready) {
    errors.push("Native Codex /goal runtime is not ready. GoalBuddy $goal-prep and local boards are separate from OpenAI-gated native /goal.");
  }

  const report = {
    codex_home: codexHome(),
    target: "codex",
    source,
    codex_install_model: "plugin",
    capabilities: installedRuntimeCapabilities(),
    expected_state: {
      plugin_cache: true,
      bundled_skill: "$goal-prep",
      compiler_skill: "$codex-goal-compiler",
      standalone_personal_skill: false,
      standalone_compiler_skill: false,
      compatibility_skill: false,
      agents: requiredAgentFiles,
      native_goal: "separate OpenAI-gated Codex feature",
    },
    plugin,
    marketplace_source: marketplaceSource,
    marketplace_source_matches: marketplaceSourceMatches,
    skill_installed: installed,
    skill_path: skillPath,
    compatibility_skill_installed: legacyInstalled,
    compatibility_skill_path: legacySkillPath,
    standalone_compiler_skill_present: standaloneCompilerPresent,
    standalone_compiler_skill_dangling: standaloneCompilerDangling,
    standalone_compiler_skill_path: standaloneCompilerPath,
    runtime_state: runtimeState,
    installed_agents: agents,
    residual_agents: residualAgents,
    missing_agents: missingAgents,
    stale_agents: staleAgents,
    goal_runtime: goalRuntime,
    warnings,
    errors,
  };

  const pluginOk = plugin.skill_installed && plugin.enabled;
  const legacySkillOk = installed;
  const installOk = (pluginOk || legacySkillOk)
    && plugin.compiler_skill_installed
    && !plugin.goal_prep_stale
    && !plugin.compiler_skill_stale
    && !standaloneCompilerPresent
    && source.verified
    && marketplaceSourceMatches
    && missingAgents.length === 0
    && staleAgents.length === 0;
  const goalReadyOk = !requireGoalReady || goalRuntime.ready;
  return { report, ok: installOk && goalReadyOk && errors.length === 0 };
}

function doctor() {
  const result = buildCodexDoctorReport({ requireGoalReady: hasFlag("--goal-ready") });
  console.log(JSON.stringify(result.report, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function installedRuntimeCapabilities() {
  return { ...runtimeCapabilities };
}

function compilerContract() {
  const target = requestedTarget();
  if (!target) argumentError("contract requires --target codex or --target claude");

  const runtime = target === "codex"
    ? buildCodexDoctorReport({ requireGoalReady: true })
    : buildClaudeDoctorReport();
  const report = runtime.report;
  const goalPrepPath = target === "codex" ? report.plugin.skill_path : claudeSkillRoot();
  const compilerPath = target === "codex" ? report.plugin.compiler_skill_path : claudeCompilerSkillRoot();
  const targetReport = target === "codex"
    ? {
        name: "codex",
        ready: runtime.ok,
        install_model: "plugin",
        goal_prep_installed: report.plugin.skill_installed,
        compiler_installed: report.plugin.compiler_skill_installed,
        agents_ready: report.missing_agents.length === 0 && report.stale_agents.length === 0,
        native_goal_ready: report.goal_runtime.ready,
        duplicate_compiler_present: report.standalone_compiler_skill_present,
        source_ready: report.source.verified && report.marketplace_source_matches,
      }
    : {
        name: "claude",
        ready: runtime.ok,
        install_model: "personal-skills-and-agents",
        goal_prep_installed: report.skill_installed,
        compiler_installed: report.compiler_skill_installed,
        agents_ready: report.missing_agents.length === 0 && report.stale_agents.length === 0,
        goal_command_ready: report.goal_command_present && !report.goal_command_stale,
        source_ready: report.source.verified,
      };
  const payload = {
    ok: runtime.ok,
    contract_version: compilerContractVersion,
    product_version: packageInfo.version,
    board_schema_version: boardSchemaVersion,
    skills: {
      goal_prep: installedSkillBinding(goalPrepPath, skillSource),
      compiler: installedSkillBinding(compilerPath, compilerSkillSource),
    },
    capabilities: Object.entries(runtimeCapabilities)
      .filter(([, supported]) => supported === true)
      .map(([capability]) => capability)
      .sort(),
    source: report.source,
    target: targetReport,
    errors: [...report.errors],
  };

  if (hasFlag("--json")) {
    printJson(payload);
  } else if (payload.ok) {
    console.log(`${canonicalProductName} compiler contract v${compilerContractVersion} for ${target}: pass`);
  } else {
    console.log(`${canonicalProductName} compiler contract v${compilerContractVersion} for ${target}: blocked`);
    for (const error of payload.errors) console.log(`- ${error}`);
  }
  process.exit(payload.ok ? 0 : 1);
}

function installedSkillBinding(path, sourcePath) {
  return {
    path,
    tree_fingerprint: skillTreeFingerprint(path),
    source_tree_fingerprint: skillTreeFingerprint(sourcePath),
  };
}

function sourceMetadata() {
  const root = canonicalSourceRoot();
  const git = gitCheckoutMetadata(root);
  const sourceFingerprint = distributionFingerprint(root);
  const installedFingerprint = distributionFingerprint(packageRoot);
  const installedBytesMatch = Boolean(sourceFingerprint)
    && sourceFingerprint === installedFingerprint;
  return {
    kind: git ? "local_git_checkout" : "local_checkout",
    root,
    installed_root: packageRoot,
    commit: git?.commit || null,
    dirty: git?.dirty ?? null,
    source_payload_fingerprint: sourceFingerprint || null,
    installed_payload_fingerprint: installedFingerprint || null,
    installed_bytes_match: installedBytesMatch,
    verified: Boolean(git && installedBytesMatch),
  };
}

function canonicalSourceRoot() {
  if (gitCheckoutMetadata(packageRoot)) return realpathSync(packageRoot);
  const bunSource = bunDependencySourceRoot();
  return bunSource || realpathSync(packageRoot);
}

function bunDependencySourceRoot() {
  const bunRoot = process.env.BUN_INSTALL || join(homedir(), ".bun");
  const manifestPath = join(bunRoot, "install", "global", "package.json");
  if (!existsSync(manifestPath)) return "";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const raw = manifest.dependencies?.[packageInfo.name] || manifest.devDependencies?.[packageInfo.name];
    if (typeof raw !== "string") return "";
    const candidate = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
    if (!isAbsolute(candidate)) return "";
    const root = realpathSync(candidate);
    const candidatePackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return candidatePackage.name === packageInfo.name ? root : "";
  } catch {
    return "";
  }
}

function gitCheckoutMetadata(root) {
  const top = spawnSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (top.status !== 0) return null;
  let topLevel;
  try {
    topLevel = realpathSync(top.stdout.trim());
  } catch {
    return null;
  }
  if (topLevel !== realpathSync(root)) return null;
  const head = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  const status = spawnSync("git", ["-C", root, "status", "--porcelain=v1"], { encoding: "utf8" });
  if (head.status !== 0 || status.status !== 0) return null;
  return {
    commit: head.stdout.trim(),
    dirty: status.stdout.trim() !== "",
  };
}

function distributionFingerprint(root) {
  const entries = [
    "package.json",
    compilerSkillDirectory,
    canonicalSkillDirectory,
    "plugins/goalbuddy",
    "internal/cli",
  ];
  const hash = createHash("sha256");
  for (const entry of entries) {
    const path = join(root, entry);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return "";
    if (stat.isDirectory()) {
      for (const file of listFiles(path, { exclude: new Set([".DS_Store", "__pycache__"]) })) {
        if (/\.py[co]$/.test(file)) continue;
        hash.update(`${entry}/${file}`);
        hash.update("\0");
        hash.update(readFileSync(join(path, file)));
        hash.update("\0");
      }
    } else if (stat.isFile()) {
      hash.update(entry);
      hash.update("\0");
      hash.update(readFileSync(path));
      hash.update("\0");
    } else {
      return "";
    }
  }
  return hash.digest("hex");
}

function codexInstallState({ plugin, installed, legacyInstalled, residualAgents, missingAgents, staleAgents }) {
  if (residualAgents.length > 0 && !plugin.skill_installed && !installed && !legacyInstalled) {
    return "residual-agents-only";
  }
  if (!plugin.skill_installed && !installed && !legacyInstalled) {
    return "fully-removed";
  }
  if (staleAgents.length > 0) return "stale-agents";
  if (missingAgents.length > 0) return "incomplete";
  if (plugin.skill_installed && !plugin.enabled) return "disabled";
  if ((plugin.skill_installed && plugin.enabled) || installed) return "installed";
  return "incomplete";
}

function checkUpdate() {
  const report = updateReport();

  if (hasFlag("--json")) {
    printJson(report);
    return;
  }

  if (report.check_status === "managed_local") {
    const state = report.source.dirty ? "with uncommitted source changes" : `at commit ${report.source.commit}`;
    console.log(`GoalBuddy ${report.current_version} is bound to ${report.source.root} ${state}.`);
    console.log("Installed package bytes match that checkout.");
    console.log(`Update policy: ${report.update_command}`);
  } else if (report.check_status === "source_mismatch") {
    console.log("GoalBuddy local source provenance is not verified.");
    console.log(`Source: ${report.source.root}`);
    console.log(`Installed package: ${report.source.installed_root}`);
    console.log(`Recovery: ${report.update_command}`);
  } else if (report.check_status !== "ok") {
    console.log(`GoalBuddy update check unavailable: ${report.error}`);
  } else if (report.update_available) {
    console.log(`GoalBuddy ${report.latest_version} is available; installed version is ${report.current_version}.`);
    console.log(`Update with: ${report.update_command}`);
  } else {
    console.log(`GoalBuddy is up to date (${report.current_version}).`);
  }
}

function updateReport() {
  const source = sourceMetadata();
  return {
    package: packageInfo.name,
    current_version: normalizeVersion(packageInfo.version),
    latest_version: null,
    update_available: !source.installed_bytes_match,
    check_status: source.verified ? "managed_local" : "source_mismatch",
    update_mode: "local_checkout",
    update_command: detectUpdateCommand(),
    source,
  };
}

function detectUpdateCommand() {
  if (process.env.GOALBUDDY_TEST_UPDATE_COMMAND) return process.env.GOALBUDDY_TEST_UPDATE_COMMAND;
  if (process.env.GOALBUDDY_UPDATE_COMMAND) return process.env.GOALBUDDY_UPDATE_COMMAND;
  return "review and commit the local GoalBuddy checkout, refresh the Bun global package from that path, then run goalbuddy update";
}

async function plugin() {
  const subcommand = positional(1) || "";
  if (wantsHelp()) {
    pluginUsage();
    return;
  }
  switch (subcommand) {
    case "install":
      await installTransaction("codex");
      break;
    case "help":
    case "--help":
    case "-h":
      pluginUsage();
      break;
    default:
      console.error(`Unknown plugin command: ${subcommand || "<missing>"}`);
      pluginUsage();
      process.exit(2);
  }
}

function pluginUsage() {
  console.log(`${canonicalProductName} Plugin

Usage:
  ${canonicalCliName} plugin install [--source <marketplace-source>] [--codex-home <path>] [--json]

Default source:
  The verified local GoalBuddy checkout that owns the installed package
`);
}

function installPlugin({ quiet = false } = {}) {
  const source = resolveMarketplaceSource();
  const pluginSource = join(packageRoot, "plugins", pluginName);
  const pluginManifestPath = join(pluginSource, ".codex-plugin", "plugin.json");
  if (!existsSync(pluginManifestPath)) {
    throw new Error(`Plugin manifest not found: ${pluginManifestPath}`);
  }

  const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  const pluginCachePath = pluginCacheRoot(pluginManifest.version);
  mkdirSync(codexHome(), { recursive: true });
  const configuredSource = marketplaceSourceFromConfig();
  if (configuredSource && configuredSource !== source) {
    const removed = runCodex(["plugin", "marketplace", "remove", pluginName, "--json"]);
    if (!removed.ok) {
      throw new Error(`Failed to replace Codex plugin marketplace: ${firstLine(removed.stderr || removed.stdout)}`);
    }
  }
  const marketplace = runCodex(["plugin", "marketplace", "add", source]);
  if (!marketplace.ok) {
    throw new Error(`Failed to add Codex plugin marketplace: ${firstLine(marketplace.stderr || marketplace.stdout)}`);
  }
  enableMarketplaceConfig(source);

  mkdirSync(dirname(pluginCachePath), { recursive: true });
  rmSync(pluginCachePath, { recursive: true, force: true });
  cpSync(pluginSource, pluginCachePath, { recursive: true });
  const removedLegacySkillPaths = cleanupLegacyCodexSkills();
  const configPath = enablePluginConfig();
  const agents = installAgents({ quiet: true });

  const report = {
    installed: true,
    target: "codex",
    plugin: `${pluginName}@${pluginName}`,
    version: pluginManifest.version,
    codex_home: codexHome(),
    marketplace_source: source,
    cache_path: pluginCachePath,
    config_path: configPath,
    compiler_skill_path: join(pluginCachePath, "skills", compilerSkillName),
    goal_prep_skill_path: join(pluginCachePath, "skills", canonicalSkillName),
    agents,
    removed_legacy_skill_paths: removedLegacySkillPaths,
  };

  if (hasFlag("--json") && !quiet) {
    printJson(report);
    return report;
  }

  if (quiet) return report;

  console.log(`Installed ${canonicalProductName} Codex plugin ${pluginManifest.version}`);
  console.log(`Marketplace: ${source}`);
  console.log(`Cache: ${pluginCachePath}`);
  console.log(`Config: ${configPath}`);
  console.log(`Agents: ${summarizeStatuses(report.agents)}`);
  if (report.removed_legacy_skill_paths.length) {
    console.log(`Removed legacy personal skills: ${report.removed_legacy_skill_paths.join(", ")}`);
  }
  console.log("");
  console.log("Restart Codex, then use:");
  console.log(`  $${compilerSkillName}`);
  console.log(`  $${canonicalSkillName} remains the explicit GoalBuddy board backend.`);
  console.log("");
  console.log("Goal surface:");
  console.log(`  ${canonicalCliName} board docs/goals/<slug>`);
  return report;
}

function resolveMarketplaceSource() {
  const expected = canonicalSourceRoot();
  const explicit = optionValue("--source");
  if (!explicit) return expected;
  if (!isAbsolute(explicit)) {
    throw new Error(`GoalBuddy's personal distribution requires a local marketplace path, not: ${explicit}`);
  }
  let actual;
  try {
    actual = realpathSync(explicit);
  } catch {
    throw new Error(`GoalBuddy marketplace source does not exist: ${explicit}`);
  }
  if (actual !== expected) {
    throw new Error(`GoalBuddy marketplace source must match the package's verified local checkout: ${expected}`);
  }
  return actual;
}

function marketplaceSourceFromConfig(configPath = join(codexHome(), "config.toml")) {
  if (!existsSync(configPath)) return "";
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  let inGoalBuddyMarketplace = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[.*\]$/.test(trimmed)) {
      inGoalBuddyMarketplace = trimmed === `[marketplaces.${pluginName}]`;
      continue;
    }
    if (!inGoalBuddyMarketplace) continue;
    const match = trimmed.match(/^source\s*=\s*("(?:\\.|[^"])*"|'[^']*')\s*(?:#.*)?$/);
    if (!match) continue;
    if (match[1].startsWith('"')) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return match[1].slice(1, -1);
      }
    }
    return match[1].slice(1, -1);
  }

  return "";
}

function legacyCodexSkillRoots() {
  return [installedSkillRoot(), legacyInstalledSkillRoot()];
}

function cleanupLegacyCodexSkills() {
  const removed = [];
  for (const path of legacyCodexSkillRoots()) {
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    removed.push(path);
  }
  return removed;
}

function resetCodex() {
  const configPath = join(codexHome(), "config.toml");
  const removedConfigSections = [];
  if (existsSync(configPath)) {
    const existing = readFileSync(configPath, "utf8");
    let updated = existing;
    for (const header of [`[plugins."${pluginName}@${pluginName}"]`, `[marketplaces.${pluginName}]`]) {
      const next = removeTomlTable(updated, header);
      if (next !== updated) {
        removedConfigSections.push(header);
        updated = next;
      }
    }
    if (updated !== existing) writeFileAtomic(configPath, updated);
  }

  const removedPluginCachePaths = [];
  const cacheRoot = pluginCacheOwnerRoot();
  if (existsSync(cacheRoot)) {
    rmSync(cacheRoot, { recursive: true, force: true });
    removedPluginCachePaths.push(cacheRoot);
  }

  const removedAgents = [];
  const agentsRoot = join(codexHome(), "agents");
  for (const file of requiredAgentFiles) {
    const path = join(agentsRoot, file);
    if (!existsSync(path)) continue;
    rmSync(path, { recursive: true, force: true });
    removedAgents.push(path);
  }

  const removedLegacySkillPaths = cleanupLegacyCodexSkills();
  const report = {
    reset: true,
    target: "codex",
    codex_home: codexHome(),
    config_path: configPath,
    removed_config_sections: removedConfigSections,
    removed_plugin_cache_paths: removedPluginCachePaths,
    removed_agents: removedAgents,
    removed_legacy_skill_paths: removedLegacySkillPaths,
  };

  if (hasFlag("--json")) {
    printJson(report);
    return report;
  }

  console.log(`Reset ${canonicalProductName} Codex-owned runtime files`);
  console.log(`Config sections: ${removedConfigSections.length ? removedConfigSections.join(", ") : "none"}`);
  console.log(`Plugin cache: ${removedPluginCachePaths.length ? removedPluginCachePaths.join(", ") : "none"}`);
  console.log(`Agents: ${removedAgents.length ? removedAgents.join(", ") : "none"}`);
  console.log(`Legacy personal skills: ${removedLegacySkillPaths.length ? removedLegacySkillPaths.join(", ") : "none"}`);
  return report;
}

function removeTomlTable(text, header) {
  const normalized = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
  const lines = normalized.split("\n");
  const output = [];
  let skipping = false;
  let removed = false;
  const descendantPrefix = `${header.slice(0, -1)}.`;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === header || trimmed.startsWith(descendantPrefix)) {
      skipping = true;
      removed = true;
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) {
      skipping = trimmed.startsWith(descendantPrefix);
      if (skipping) continue;
    }
    if (!skipping) output.push(line);
  }

  if (!removed) return text;
  return output.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
}

function pluginCacheOwnerRoot() {
  return join(codexHome(), "plugins", "cache", pluginName);
}

function pluginCacheRoot(version) {
  return join(pluginCacheOwnerRoot(), pluginName, version);
}

function enableMarketplaceConfig(source) {
  const configPath = join(codexHome(), "config.toml");
  mkdirSync(dirname(configPath), { recursive: true });
  const header = `[marketplaces.${pluginName}]`;
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const withoutGoalBuddy = removeTomlTable(existing, header);
  const prefix = withoutGoalBuddy.trim() ? `${withoutGoalBuddy.replace(/\n*$/, "\n")}\n` : "";
  const updated = `${prefix}${header}\nsource = ${JSON.stringify(source)}\nsource_type = "local"\n`;
  writeFileAtomic(configPath, updated);
  return configPath;
}

function enablePluginConfig() {
  const configPath = join(codexHome(), "config.toml");
  mkdirSync(dirname(configPath), { recursive: true });
  const header = `[plugins."${pluginName}@${pluginName}"]`;
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  const updated = upsertTomlEnabled(existing, header);
  writeFileAtomic(configPath, updated);
  return configPath;
}

function writeFileAtomic(path, content) {
  const tempPath = `${path}.goalbuddy-tmp-${process.pid}`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, path);
}

function upsertTomlEnabled(text, header) {
  const normalized = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
  const lines = normalized.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) {
    const prefix = normalized.trim() ? `${normalized}\n` : "";
    return `${prefix}${header}\nenabled = true\n`;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      end = index;
      break;
    }
  }

  let sawEnabled = false;
  for (let index = start + 1; index < end; index += 1) {
    if (/^\s*enabled\s*=/.test(lines[index])) {
      lines[index] = "enabled = true";
      sawEnabled = true;
      break;
    }
  }
  if (!sawEnabled) lines.splice(start + 1, 0, "enabled = true");

  return lines.join("\n").replace(/\n*$/, "\n");
}

function codexGoalRuntimeStatus() {
  const version = runCodex(["--version"]);
  const login = version.ok ? runCodex(["login", "status"]) : { ok: false, stdout: "", stderr: "codex CLI unavailable" };
  const features = version.ok ? runCodex(["features", "list"]) : { ok: false, stdout: "", stderr: "codex CLI unavailable" };
  const goalFeature = parseGoalFeature(features.stdout);
  const loggedIn = login.ok && !/not logged in/i.test(`${login.stdout}\n${login.stderr}`);

  return {
    codex_cli_available: version.ok,
    codex_version: firstLine(version.stdout),
    logged_in: loggedIn,
    login_status: firstLine(login.stdout || login.stderr),
    goals_feature_enabled: goalFeature.enabled,
    goals_feature_stage: goalFeature.stage,
    ready: version.ok && loggedIn && goalFeature.enabled,
  };
}

function runCodex(args) {
  const env = { ...process.env, CODEX_HOME: codexHome() };
  const command = codexSpawnCommand(args, env);
  const result = spawnSync(command.file, command.args, {
    encoding: "utf8",
    env,
    shell: command.shell || false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function codexSpawnCommand(args, env) {
  if (process.platform !== "win32") return { file: "codex", args };

  const command = resolveWindowsCommand("codex", env);
  if (!command) return { file: "codex", args };
  if (/\.(?:cmd|bat)$/i.test(command)) {
    const commandLine = [quoteWindowsCommandArg(command), ...args.map(quoteWindowsCommandArg)].join(" ");
    return {
      file: commandLine,
      args: [],
      shell: true,
    };
  }
  return { file: command, args };
}

function resolveWindowsCommand(name, env) {
  const systemWhere = env.SystemRoot ? join(env.SystemRoot, "System32", "where.exe") : "";
  const whereCommand = systemWhere && existsSync(systemWhere) ? systemWhere : "where.exe";
  const where = spawnSync(whereCommand, [name], { encoding: "utf8", env });
  if (where.status !== 0) return "";
  const candidates = where.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return candidates.find((candidate) => /\.(?:exe|cmd|bat)$/i.test(candidate)) || "";
}

function quoteWindowsCommandArg(value) {
  return `"${String(value).replace(/(["^&|<>()%])/g, "^$1")}"`;
}

function parseGoalFeature(output) {
  const line = output.split(/\r?\n/).find((candidate) => candidate.trim().startsWith("goals"));
  if (!line) return { enabled: false, stage: "" };
  const parts = line.trim().split(/\s{2,}/);
  return {
    enabled: parts.at(-1) === "true",
    stage: parts.slice(1, -1).join(" "),
  };
}

function firstLine(value) {
  return (value || "").split(/\r?\n/).find((line) => line.trim())?.trim() || "";
}

async function board() {
  const goal = optionValue("--goal") || positional(1);
  if (!goal) {
    console.error(`Missing goal directory. Usage: ${canonicalCliName} board docs/goals/<slug>`);
    process.exit(2);
  }

  const absoluteGoal = resolve(goal);
  const script = ensureLocalBoardSurface();
  const scriptArgs = [script, "--goal", absoluteGoal];
  for (const option of ["--host", "--port"]) {
    const value = optionValue(option);
    if (value) scriptArgs.push(option, value);
  }
  if (hasFlag("--once")) scriptArgs.push("--once");
  if (hasFlag("--json")) scriptArgs.push("--json");

  const capture = hasFlag("--once") || hasFlag("--json");
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (capture) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function initGoal() {
  const slug = positional(1);
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    argumentError(`Usage: ${canonicalCliName} init <slug> [--title "<Goal title>"] (slug: lowercase letters, digits, dashes)`);
  }
  const title = optionValue("--title") || slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  const goalDir = resolve("docs", "goals", slug);
  if (existsSync(join(goalDir, "state.yaml"))) {
    argumentError(`Board already exists: ${join(goalDir, "state.yaml")}`);
  }

  mkdirSync(join(goalDir, "notes"), { recursive: true });
  const templates = join(skillSource, "templates");
  writeFileSync(join(goalDir, "state.yaml"), readFileSync(join(templates, "state.yaml"), "utf8")
    .replaceAll("<Goal title>", title)
    .replaceAll("<goal-slug>", slug));
  writeFileSync(join(goalDir, "goal.md"), readFileSync(join(templates, "goal.md"), "utf8")
    .replaceAll("<Goal Title>", title)
    .replaceAll("<goal-slug>", slug)
    .replaceAll("<slug>", slug));

  const runCommand = `/goal Follow docs/goals/${slug}/goal.md.`;
  if (hasFlag("--json")) {
    printJson({ created: goalDir, slug, title, run_command: runCommand });
    return;
  }
  console.log(`Created GoalBuddy board: docs/goals/${slug}/`);
  console.log("Next: refine the charter and intake with $goal-prep (Codex) or /goal-prep (Claude Code),");
  console.log(`or start execution: ${runCommand}`);
}

function receiptCli() {
  const script = join(skillSource, "scripts", "apply-receipt.mjs");
  const result = spawnSync(process.execPath, [script, ...args.slice(1)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

function stateTransitionCli(mode) {
  const script = join(skillSource, "scripts", "apply-receipt.mjs");
  const result = spawnSync(process.execPath, [script, mode, ...args.slice(1)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

function dispatchCli() {
  const script = join(skillSource, "scripts", "dispatch-task.mjs");
  const result = spawnSync(process.execPath, [script, ...args.slice(1)], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

async function resume() {
  const script = join(skillSource, "scripts", "resume-board.mjs");
  const result = spawnSync(process.execPath, [script, ...args.slice(1)], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

async function prompt() {
  if (hasFlag("--parallel-plan")) {
    await parallelPlan();
    return;
  }

  const script = join(skillSource, "scripts", "render-task-prompt.mjs");
  const scriptArgs = [script, ...resolveChildGoalArgs(args.slice(1))];
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

async function parallelPlan() {
  const script = join(skillSource, "scripts", "parallel-plan.mjs");
  const scriptArgs = [script, ...resolveChildGoalArgs(args.slice(1).filter((arg) => arg !== "--parallel-plan"))];
  const result = spawnSync(process.execPath, scriptArgs, {
    cwd: packageRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function ensureLocalBoardSurface() {
  const script = join(skillSource, "surfaces", "local-goal-board", "scripts", "local-goal-board.mjs");
  if (!existsSync(script)) {
    throw new Error(`Bundled GoalBuddy board surface is missing: ${script}`);
  }
  return script;
}

function installedSkillRoot() {
  return join(codexHome(), "skills", canonicalSkillDirectory);
}

function installedCodexPlugin() {
  const root = join(codexHome(), "plugins", "cache", pluginName, pluginName);
  const configPath = join(codexHome(), "config.toml");
  const base = {
    installed: false,
    enabled: pluginConfigEnabled(configPath),
    name: `${pluginName}@${pluginName}`,
    version: "",
    cache_path: "",
    manifest_path: "",
    skill_installed: false,
    skill_path: "",
    goal_prep_stale: false,
    compiler_skill_installed: false,
    compiler_skill_path: "",
    compiler_skill_stale: false,
    config_path: configPath,
  };
  if (!existsSync(root)) return base;
  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter(isSupportedVersion)
    .sort(compareVersions)
    .reverse();
  for (const version of versions) {
    const cachePath = join(root, version);
    const skillPath = [canonicalSkillName, canonicalSkillDirectory]
      .map((name) => join(cachePath, "skills", name))
      .find((path) => existsSync(join(path, "SKILL.md"))) || join(cachePath, "skills", canonicalSkillName);
    const compilerSkillPath = join(cachePath, "skills", compilerSkillName);
    const manifestPath = join(cachePath, ".codex-plugin", "plugin.json");
    if (existsSync(join(skillPath, "SKILL.md"))) {
      const compilerSkillInstalled = existsSync(join(compilerSkillPath, "SKILL.md"));
      return {
        ...base,
        installed: true,
        version,
        cache_path: cachePath,
        manifest_path: manifestPath,
        skill_installed: true,
        skill_path: skillPath,
        goal_prep_stale: skillTreeFingerprint(skillPath) !== skillTreeFingerprint(skillSource),
        compiler_skill_installed: compilerSkillInstalled,
        compiler_skill_path: compilerSkillPath,
        compiler_skill_stale: compilerSkillInstalled
          && skillTreeFingerprint(compilerSkillPath) !== skillTreeFingerprint(compilerSkillSource),
      };
    }
  }
  return base;
}

function pluginConfigEnabled(configPath) {
  if (!existsSync(configPath)) return false;
  const lines = readFileSync(configPath, "utf8").split(/\r?\n/);
  const header = `[plugins."${pluginName}@${pluginName}"]`;
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("[")) break;
    if (/^enabled\s*=\s*true\b/.test(line)) return true;
    if (/^enabled\s*=/.test(line)) return false;
  }
  return false;
}

function legacyInstalledSkillRoot() {
  return join(codexHome(), "skills", legacySkillName);
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function directoryFingerprint(root, { exclude = new Set() } = {}) {
  if (!existsSync(root)) return "";
  const hash = createHash("sha256");
  for (const file of listFiles(root, { exclude })) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function skillTreeFingerprint(root) {
  if (!existsSync(root)) return "";
  const hash = createHash("sha256");
  const exclude = new Set([...installFingerprintExcludes(), ".DS_Store", ".goalbuddy-board", "__pycache__"]);
  for (const file of listFiles(root, { exclude }).sort()) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function listFiles(root, { exclude = new Set(), prefix = "" } = {}) {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true })
    .filter((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      return !exclude.has(relative) && !exclude.has(entry.name);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(root, { exclude, prefix: relative }));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

function installFingerprintExcludes() {
  return new Set([".goalbuddy-install.json", ".goal-maker-install.json"]);
}

function installMetadataPath(target) {
  return join(target, ".goalbuddy-install.json");
}

function legacyInstallMetadataPath(target) {
  return join(target, ".goal-maker-install.json");
}

function readInstallMetadata(target) {
  for (const path of [installMetadataPath(target), legacyInstallMetadataPath(target)]) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function writeInstallMetadata(target, previousMetadata) {
  writeFileSync(installMetadataPath(target), `${JSON.stringify({
    package_name: packageInfo.name,
    package_version: packageInfo.version,
    previous_package_version: previousMetadata?.package_version || "",
    installed_at: new Date().toISOString(),
  }, null, 2)}\n`);
}

function printInstallReport(report) {
  const verb = report.command === "update" ? "Updated" : "Installed";
  const previous = report.package.previous_version && report.package.previous_version !== report.package.current_version
    ? ` ${report.package.previous_version} -> ${report.package.current_version}`
    : ` ${report.package.current_version}`;
  console.log("");
  console.log(`${verb} ${canonicalProductName}${previous}`);
  console.log("");
  console.log(`Skill: ${report.skill.status} at ${report.skill.path}`);
  console.log(`Compatibility skill: ${report.skill.compatibility_path}`);
  const agentSummary = summarizeStatuses(report.agents);
  console.log(`Agents: ${agentSummary}`);

  console.log("");
  console.log("Next:");
  console.log(`  $${canonicalSkillName}`);
  console.log(`  ${canonicalCliName} board docs/goals/<slug>`);
  console.log(`  ${legacyCliName} remains a temporary compatibility alias.`);
}

function printCodexInstallReport(report) {
  console.log("");
  console.log(`Installed ${canonicalProductName} Codex plugin ${report.version}`);
  console.log(`Marketplace: ${report.marketplace_source}`);
  console.log(`Cache: ${report.cache_path}`);
  console.log(`Config: ${report.config_path}`);
  console.log(`Agents: ${summarizeStatuses(report.agents)}`);
  if (report.removed_legacy_skill_paths.length) {
    console.log(`Removed legacy personal skills: ${report.removed_legacy_skill_paths.join(", ")}`);
  }
  if (report.standalone_compiler_cleanup?.status === "removed_symlink") {
    console.log(`Removed superseded compiler link: ${report.standalone_compiler_cleanup.path}`);
  }
  console.log("");
  console.log("Restart Codex, then use:");
  console.log(`  $${compilerSkillName}`);
  console.log(`  $${canonicalSkillName} remains the explicit GoalBuddy board backend.`);
  console.log("");
  console.log("Goal surface:");
  console.log(`  ${canonicalCliName} board docs/goals/<slug>`);
}

function printEverywhereInstallReport(report) {
  const verb = report.command === "update" ? "Updated" : "Installed";
  console.log("");
  console.log(`${verb} ${canonicalProductName} for Codex and Claude Code ${report.package.current_version}`);
  console.log("");

  if (report.codex?.ok === false) {
    console.log(`Codex: not completed (${report.codex.error})`);
  } else if (report.codex) {
    console.log(`Codex: plugin ${report.codex.version} enabled at ${report.codex.cache_path}`);
  }

  if (report.claude?.ok === false) {
    console.log(`Claude Code: not completed (${report.claude.error})`);
  } else if (report.claude) {
    console.log(`Claude Code: skill ${report.claude.skill.status} at ${report.claude.skill.path}`);
    console.log(`Claude Code compiler: ${report.claude.compiler_skill.status} at ${report.claude.compiler_skill.path}`);
    console.log(`Claude Code agents: ${summarizeStatuses(report.claude.agents)}`);
    if (report.claude.legacy_commands_cleanup?.removed) {
      console.log(`Claude Code: removed legacy command at ${report.claude.legacy_commands_cleanup.path}`);
    }
  }

  if (report.errors.length) {
    console.log("");
    console.log("One or more targets need attention:");
    for (const error of report.errors) console.log(`  ${error.target}: ${error.error}`);
  }

  console.log("");
  console.log("Next:");
  console.log(`  Restart Codex, then use: $${compilerSkillName}`);
  console.log(`  Restart Claude Code, then run: /${compilerSkillName}`);
}

function summarizeStatuses(items) {
  const counts = items.reduce((memo, item) => {
    memo[item.status] = (memo[item.status] || 0) + 1;
    return memo;
  }, {});
  return Object.entries(counts)
    .map(([status, count]) => `${count} ${status}`)
    .join(", ");
}

function normalizeVersion(value) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Unsupported version: ${value}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function isSupportedVersion(value) {
  return /^v?\d+\.\d+\.\d+(?:[-+].*)?$/.test(String(value).trim());
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }
  const leftPre = String(left).includes("-");
  const rightPre = String(right).includes("-");
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return 0;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}
