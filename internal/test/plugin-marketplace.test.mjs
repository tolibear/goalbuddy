import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const marketplace = JSON.parse(readFileSync(".agents/plugins/marketplace.json", "utf8"));
const claudeMarketplace = JSON.parse(readFileSync(".claude-plugin/marketplace.json", "utf8"));
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

test("GoalBuddy plugin is exposed through a Claude marketplace manifest", () => {
  assert.equal(claudeMarketplace.name, "goalbuddy");
  assert.equal(claudeMarketplace.owner.name, "Daniel Alnajjar");
  assert.equal(claudeMarketplace.plugins.length, 1);

  const [entry] = claudeMarketplace.plugins;
  assert.equal(entry.name, "goalbuddy");
  assert.equal(entry.source, "./plugins/goalbuddy");
  assert.ok(pkg.files.includes(".claude-plugin/marketplace.json"));
});

test("GoalBuddy plugin metadata tracks the package release", () => {
  assert.equal(plugin.name, pkg.name);
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.repository, "https://github.com/Danielalnajjar/goalbuddy");
  assert.equal(plugin.skills, "./skills/");
});

test("the personal distribution is fork-owned and cannot publish over upstream npm", () => {
  assert.equal(pkg.private, true);
  assert.equal(pkg.repository.url, "git+https://github.com/Danielalnajjar/goalbuddy.git");
  assert.equal(pkg.publishConfig, undefined);
  assert.equal(existsSync(".github/workflows/npm-publish.yml"), false);
});

test("Claude plugin metadata stays aligned with package release", () => {
  assert.equal(claudePlugin.name, pkg.name);
  assert.equal(claudePlugin.version, pkg.version);
  assert.equal(claudePlugin.description, plugin.description);
  assert.ok(!claudePlugin.keywords.includes("extensions"));
});

test("GoalBuddy plugin delegates composer invocation to the public goal router", () => {
  assert.deepEqual(plugin.interface.defaultPrompt, [
    "$codex-goal-compiler turn this agreed work into the correct goal route",
  ]);
});
