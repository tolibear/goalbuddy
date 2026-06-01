import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const canonicalSkill = readFileSync("goalbuddy/SKILL.md", "utf8");
const pluginSkill = readFileSync("plugins/goalbuddy/skills/goalbuddy/SKILL.md", "utf8");
const canonicalGoalBuddyRoot = "goalbuddy";
const pluginGoalBuddyRoot = "plugins/goalbuddy/skills/goalbuddy";

function fakeCodexBin(root) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, "codex");
  writeFileSync(path, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then echo \"codex-cli 0.128.0\"; exit 0; fi",
    "if [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then echo \"Logged in with ChatGPT\"; exit 0; fi",
    "if [ \"$1\" = \"features\" ] && [ \"$2\" = \"list\" ]; then echo \"goals                               under development  true\"; exit 0; fi",
    "if [ \"$1\" = \"plugin\" ] && [ \"$2\" = \"marketplace\" ] && [ \"$3\" = \"add\" ]; then echo \"Added marketplace goalbuddy\"; exit 0; fi",
    "exit 2",
    "",
  ].join("\n"));
  chmodSync(path, 0o755);
  return bin;
}

function listFiles(root, base = root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path, base));
    } else if (entry.isFile()) {
      files.push(relative(base, path));
    }
  }
  return files.sort();
}

test("Goal Prep invocation boundary keeps $goal-prep prepare-only", () => {
  for (const text of [canonicalSkill, pluginSkill]) {
    assert.match(text, /\$goal-prep`: prepare intake, `goal\.md`, `state\.yaml`, and the starter `\/goal` command, then stop/);
    assert.match(text, /During a `\$goal-prep` turn, do not perform the user's requested work/);
    assert.match(text, /Do not refresh or load named skills/);
    assert.match(text, /Do not load that skill, browse that repo, or generate those assets during `\$goal-prep`/);
    assert.match(text, /check whether GoalBuddy itself is stale/);
    assert.match(text, /GoalBuddy <latest_version> is available/);
    assert.match(text, /Intent -> Oracle -> Surface -> Loop -> Proof/);
    assert.match(text, /No oracle, no serious goal/);
    assert.match(text, /Do you want the local GoalBuddy board for this goal\?/);
    assert.match(text, /Use the local GoalBuddy board as the default work surface/);
    assert.match(text, /start the local board before filling the task list/);
    assert.match(text, /do not assume the existing process is stale and do not stop it/);
    assert.match(text, /First check `http:\/\/127\.0\.0\.1:41737\/api\/boards`/);
    assert.match(text, /shared multi-board hub/);
    assert.match(text, /Codex in-app Browser/);
    assert.match(text, /do not install a GoalBuddy catalog item/);
    assert.match(text, /Operator Escalation/);
    assert.match(text, /ask the operator one concise question before creating the external artifact/);
    assert.match(text, /This section applies after the user starts `\/goal Follow docs\/goals\/<slug>\/goal\.md\.`/);
    assert.match(text, /A good task is the largest safe useful slice/);
    assert.match(text, /Safe does not mean small/);
  }
});

test("slice policy is simple and mirrored across templates and agent payloads", () => {
  const canonicalState = readFileSync("goalbuddy/templates/state.yaml", "utf8");
  const pluginState = readFileSync("plugins/goalbuddy/skills/goalbuddy/templates/state.yaml", "utf8");
  const canonicalWorker = readFileSync("goalbuddy/agents/goal_worker.toml", "utf8");
  const pluginWorker = readFileSync("plugins/goalbuddy/skills/goalbuddy/agents/goal_worker.toml", "utf8");
  const canonicalJudge = readFileSync("goalbuddy/agents/goal_judge.toml", "utf8");
  const pluginJudge = readFileSync("plugins/goalbuddy/skills/goalbuddy/agents/goal_judge.toml", "utf8");

  assert.equal(pluginState, canonicalState);
  assert.equal(pluginWorker, canonicalWorker);
  assert.equal(pluginJudge, canonicalJudge);
  assert.doesNotMatch(canonicalState, /Pick small reviewable work/);
  assert.match(canonicalState, /Pick the largest safe useful slice with clear allowed_files, verify commands, and stop conditions/);
  assert.match(canonicalState, /max_consecutive_tiny_tasks: 2/);
  assert.match(canonicalWorker, /model_reasoning_effort = "medium"/);
  assert.match(canonicalWorker, /complete the whole assigned slice/i);
  assert.match(canonicalJudge, /largest safe useful slice/i);
});

test("canonical local board surface is the source of truth for the plugin mirror", () => {
  const surfacePath = "surfaces/local-goal-board";
  const canonicalSurface = join(canonicalGoalBuddyRoot, surfacePath);
  const pluginSurface = join(pluginGoalBuddyRoot, surfacePath);
  const canonicalFiles = listFiles(canonicalSurface);
  const pluginFiles = listFiles(pluginSurface);

  assert.deepEqual(pluginFiles, canonicalFiles);

  for (const file of canonicalFiles) {
    const canonicalPath = join(canonicalSurface, file);
    const pluginPath = join(pluginSurface, file);
    const canonicalStat = statSync(canonicalPath);
    const pluginStat = statSync(pluginPath);

    assert.equal(pluginStat.size, canonicalStat.size, `${file} size drifted`);
    assert.deepEqual(readFileSync(pluginPath), readFileSync(canonicalPath), `${file} content drifted`);
  }
});

test("Codex install keeps Goal Prep in the plugin and removes compatibility skill folders", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-policy-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = {
      ...process.env,
      PATH: `${fakeCodexBin(root)}${delimiter}${process.env.PATH}`,
    };
    const install = spawnSync(process.execPath, [
      "internal/cli/goal-maker.mjs",
      "install",
      "--codex-home",
      codexHome,
      "--json",
    ], {
      encoding: "utf8",
      env,
    });
    assert.equal(install.status, 0, install.stderr);
    const report = JSON.parse(install.stdout);
    const installedPluginSkill = readFileSync(join(report.cache_path, "skills", "goalbuddy", "SKILL.md"), "utf8");
    assert.equal(existsSync(join(codexHome, "skills", "goal-maker", "SKILL.md")), false);
    assert.equal(existsSync(join(codexHome, "skills", "goalbuddy", "SKILL.md")), false);
    assert.match(installedPluginSkill, /During a `\$goal-prep` turn, do not perform the user's requested work/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
