import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const canonicalPrefix = "goalbuddy/";
const pluginPrefix = "plugins/goalbuddy/skills/goal-prep/";

test("packed canonical and plugin skill trees stay complete and aligned", () => {
  const pack = runNpm(["pack", "--dry-run", "--json"]);
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);

  const files = JSON.parse(pack.stdout)[0].files.map((file) => file.path);
  const canonicalFiles = relativePackedFiles(files, canonicalPrefix);
  const pluginFiles = relativePackedFiles(files, pluginPrefix);

  assert.ok(files.includes("goalbuddy/references/goal-execution.md"));
  assert.ok(canonicalFiles.includes("SKILL.md"));
  assert.ok(canonicalFiles.includes("scripts/render-task-prompt.mjs"));
  assert.deepEqual(canonicalFiles, pluginFiles);
});

test("the packed npm artifact ships the Claude plugin contract and role agents", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-packed-install-"));
  try {
    const pack = runNpm(["pack", "--json", "--pack-destination", root]);
    assert.equal(pack.status, 0, pack.stderr || pack.stdout);
    const tarball = resolve(root, JSON.parse(pack.stdout)[0].filename);
    const packageRoot = join(root, "package-root");
    const install = runNpm([
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      packageRoot,
      tarball,
    ]);
    assert.equal(install.status, 0, install.stderr || install.stdout);

    // Claude surfaces the skill, /goal command, and role agents from the plugin, so the packed
    // artifact must ship a complete Claude plugin tree rather than loose personal-directory copies.
    const pluginRoot = join(packageRoot, "node_modules", "goalbuddy", "plugins", "goalbuddy");
    assert.equal(existsSync(join(pluginRoot, ".claude-plugin", "plugin.json")), true);
    assert.equal(existsSync(join(pluginRoot, "commands", "goal.md")), true);

    const skillContract = join(pluginRoot, "skills", "goal-prep", "references", "goal-execution.md");
    assert.equal(existsSync(skillContract), true);
    assert.match(readFileSync(skillContract, "utf8"), /governs `\/goal` runs/);

    for (const file of ["goal-judge.md", "goal-scout.md", "goal-worker.md"]) {
      assert.equal(existsSync(join(pluginRoot, "agents", file)), true);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function relativePackedFiles(files, prefix) {
  return files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .sort();
}

function runNpm(args) {
  return spawnSync("npm", args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, GOALBUDDY_SKIP_POSTINSTALL: "1" },
  });
}
