#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "goal-maker.mjs");
const globalInstall = process.env.npm_config_global === "true"
  || process.env.npm_config_location === "global";

if (!globalInstall) {
  process.exit(0);
}

if (process.env.GOALBUDDY_SKIP_POSTINSTALL) {
  console.error("GoalBuddy postinstall skipped because GOALBUDDY_SKIP_POSTINSTALL is set.");
  console.error("Run `goalbuddy` later to install Codex and Claude Code runtime files.");
  process.exit(0);
}

console.error("GoalBuddy global install detected; running `goalbuddy` setup now.");
console.error("By default, this writes GoalBuddy runtime files for Codex and Claude Code under their configured homes.");
console.error("Set GOALBUDDY_SKIP_POSTINSTALL=1 to skip automatic setup and run `goalbuddy` later.");
console.error("");

const result = spawnSync(process.execPath, [cliPath], {
  encoding: "utf8",
  env: process.env,
  stdio: "inherit",
});

if (result.status === 0) {
  process.exit(0);
}

console.error("");
console.error("GoalBuddy installed globally, but automatic setup did not complete for every target.");
console.error("The package is installed; runtime files may be incomplete.");
console.error("After Codex and Claude Code are available, rerun setup with:");
console.error("  goalbuddy");
console.error("To skip automatic setup on future installs, set:");
console.error("  GOALBUDDY_SKIP_POSTINSTALL=1");
process.exit(0);
