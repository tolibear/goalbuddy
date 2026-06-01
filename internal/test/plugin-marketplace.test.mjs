import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const marketplace = JSON.parse(readFileSync(".agents/plugins/marketplace.json", "utf8"));
const plugin = JSON.parse(readFileSync("plugins/goalbuddy/.codex-plugin/plugin.json", "utf8"));
const claudePlugin = JSON.parse(readFileSync("plugins/goalbuddy/.claude-plugin/plugin.json", "utf8"));

test("GoalBuddy plugin is exposed through a Codex marketplace manifest", () => {
  assert.equal(marketplace.name, "goalbuddy");
  assert.equal(marketplace.interface.displayName, "GoalBuddy");
  assert.equal(marketplace.plugins.length, 1);

  const [entry] = marketplace.plugins;
  assert.equal(entry.name, "goalbuddy");
  assert.equal(entry.source.source, "local");
  assert.equal(entry.source.path, "./plugins/goalbuddy");
  assert.equal(entry.policy.installation, "INSTALLED_BY_DEFAULT");
  assert.equal(entry.category, "Coding");
});

test("GoalBuddy plugin metadata tracks the package release", () => {
  assert.equal(plugin.name, pkg.name);
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.repository, "https://github.com/tolibear/goalbuddy");
  assert.equal(plugin.skills, "./skills/");
});

test("npm package keeps README assets without shipping site and release artwork", () => {
  const allowedAssetFiles = new Set([
    "internal/assets/goalbuddy-live-board.jpg",
    "internal/assets/goalbuddy-readme-hero.png",
  ]);
  const normalizedFiles = pkg.files.map((file) => file.replace(/\\/g, "/").replace(/\/+$/, ""));
  const packagedAssetEntries = normalizedFiles.filter((file) => (
    file === "internal/assets" || file.startsWith("internal/assets/")
  ));

  assert.deepEqual(new Set(packagedAssetEntries), allowedAssetFiles);
});

test("Claude plugin metadata stays aligned with package release", () => {
  assert.equal(claudePlugin.name, pkg.name);
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(claudePlugin.description, plugin.description);
  assert.ok(!claudePlugin.keywords.includes("extensions"));
});

test("GoalBuddy plugin delegates composer invocation to Goal Prep", () => {
  assert.deepEqual(plugin.interface.defaultPrompt, [
    "$goal-prep prepare a GoalBuddy board for this goal",
  ]);
});
