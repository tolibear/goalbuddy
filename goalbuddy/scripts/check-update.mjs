#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "goalbuddy";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const report = {
  package: packageName,
  current_version: findCurrentVersion(),
  latest_version: null,
  update_available: false,
  check_status: "managed_local",
  update_mode: "reviewed_local_checkout",
  update_command: detectUpdateCommand(),
};

if (args.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`GoalBuddy ${report.current_version} is managed from the reviewed local checkout.`);
  console.log(`Update policy: ${report.update_command}`);
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

function detectUpdateCommand() {
  if (process.env.GOALBUDDY_TEST_UPDATE_COMMAND) return process.env.GOALBUDDY_TEST_UPDATE_COMMAND;
  if (process.env.GOALBUDDY_UPDATE_COMMAND) return process.env.GOALBUDDY_UPDATE_COMMAND;
  return "review the local GoalBuddy checkout, pass its isolated gates, then run goalbuddy update";
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
