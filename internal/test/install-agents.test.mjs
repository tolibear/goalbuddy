import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = resolve("goalbuddy/scripts/install-agents.mjs");

test("does not treat --force as the destination directory", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-install-agents-"));
  try {
    const result = spawnSync(process.execPath, [script, "--force", join(root, "agents")], {
      encoding: "utf8",
      cwd: root,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, "--force")), false);
    const installed = readdirSync(join(root, "agents"));
    assert.ok(installed.includes("goal_scout.toml"), installed.join(", "));
    assert.ok(installed.includes("goal_worker.toml"));
    assert.ok(installed.includes("goal_judge.toml"));
    assert.ok(installed.includes("goal_keeper.toml"));
    assert.ok(installed.includes("goal_ledger.toml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("defaults to CODEX_HOME agents dir instead of cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-install-agents-home-"));
  try {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      cwd: root,
      env: { ...process.env, CODEX_HOME: join(root, "codex-home") },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, ".codex")), false);
    const installed = readdirSync(join(root, "codex-home", "agents"));
    assert.ok(installed.includes("goal_scout.toml"));
    assert.ok(installed.includes("goal_keeper.toml"));
    assert.ok(installed.includes("goal_ledger.toml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
