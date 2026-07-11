#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "goalbuddy";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const report = {
  package: packageName,
  current_version: findCurrentVersion(),
  latest_version: null,
  update_available: false,
  check_status: "unknown",
  update_command: detectUpdateCommand(),
};

try {
  report.latest_version = latestPublishedVersion();
  report.update_available = compareVersions(report.current_version, report.latest_version) < 0;
  report.check_status = "ok";
} catch (error) {
  report.check_status = "unavailable";
  report.error = error.message;
}

if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else if (report.check_status !== "ok") {
  console.log(`GoalBuddy update check unavailable: ${report.error}`);
} else if (report.update_available) {
  console.log(`GoalBuddy ${report.latest_version} is available; installed version is ${report.current_version}.`);
  console.log(`Update with: ${report.update_command}`);
} else {
  console.log(`GoalBuddy is up to date (${report.current_version}).`);
}

function findCurrentVersion() {
  const candidates = [
    join(scriptDir, "..", ".goalbuddy-install.json"),
    join(scriptDir, "..", "..", "..", ".codex-plugin", "plugin.json"),
    join(scriptDir, "..", "..", "package.json"),
  ];

  for (const path of candidates) {
    const data = readJson(path);
    const version = data?.package_version || data?.version;
    if (version) return normalizeVersion(version);
  }

  return "0.0.0";
}

function latestPublishedVersion() {
  if (process.env.GOALBUDDY_TEST_NPM_LATEST_VERSION) {
    return normalizeVersion(process.env.GOALBUDDY_TEST_NPM_LATEST_VERSION);
  }

  const result = spawnSync("npm", ["view", packageName, "version"], {
    cwd: resolve(scriptDir, ".."),
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 5000,
    env: {
      ...process.env,
      npm_config_update_notifier: "false",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
    throw new Error(output || `npm view exited with status ${result.status}`);
  }

  return normalizeVersion(result.stdout);
}

function detectUpdateCommand() {
  if (process.env.GOALBUDDY_TEST_UPDATE_COMMAND) return process.env.GOALBUDDY_TEST_UPDATE_COMMAND;
  if (process.env.GOALBUDDY_UPDATE_COMMAND) return process.env.GOALBUDDY_UPDATE_COMMAND;
  if (process.env.CLAUDE_PLUGIN_ROOT || normalizedPath(scriptDir).includes("/.claude/")) return "/plugin update goalbuddy@goalbuddy";

  const userAgent = process.env.npm_config_user_agent || "";
  if (/^pnpm\//.test(userAgent)) return "pnpm update -g goalbuddy";
  if (/^bun\//.test(userAgent)) return "bun update -g goalbuddy";
  if (process.env.MISE_EXE || process.env.MISE_SHELL || process.env.MISE_PROJECT_ROOT) return "mise upgrade npm:goalbuddy";
  if (/^npm\//.test(userAgent)) return "npx goalbuddy@latest";

  return "use the install channel that installed GoalBuddy";
}

function normalizedPath(path) {
  return String(path).replace(/\\/g, "/");
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeVersion(value) {
  const match = String(value).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) throw new Error(`Unsupported version: ${value}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split(".").map(Number);
  const rightParts = normalizeVersion(right).split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
