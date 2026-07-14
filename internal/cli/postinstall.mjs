#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "goal-maker.mjs");
const globalInstall = process.env.npm_config_global === "true"
  || process.env.npm_config_location === "global";

if (!globalInstall || process.env.GOALBUDDY_SKIP_POSTINSTALL) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [cliPath], {
  encoding: "utf8",
  env: process.env,
  stdio: "inherit",
});

if (result.status === 0) {
  process.exit(0);
}

console.error("");
console.error("GoalBuddy installed globally, but setup did not complete for every target.");
console.error("Run this after Codex and Claude Code are available:");
console.error("  goalbuddy install");
process.exit(0);
