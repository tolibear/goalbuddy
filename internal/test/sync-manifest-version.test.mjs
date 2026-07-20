import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const script = resolve("internal/cli/sync-manifest-version.mjs");

test("plugin manifest versions match package.json", () => {
  const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("--write stamps drifted plugin manifests and check-mode reports drift", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-manifest-"));
  try {
    writeFileSync(join(root, "package.json"), `${JSON.stringify({ name: "goalbuddy", version: "9.9.9" }, null, 2)}\n`);
    for (const rel of [".claude-plugin", ".codex-plugin"]) {
      const dir = join(root, "plugins", "goalbuddy", rel);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "plugin.json"), `${JSON.stringify({ name: "goalbuddy", version: "0.0.1" }, null, 2)}\n`);
    }
    const env = { ...process.env, GOALBUDDY_MANIFEST_ROOT: root };

    const check = spawnSync(process.execPath, [script], { encoding: "utf8", env });
    assert.equal(check.status, 1, `${check.stdout}\n${check.stderr}`);
    assert.match(check.stderr, /version mismatch/);

    const write = spawnSync(process.execPath, [script, "--write"], { encoding: "utf8", env });
    assert.equal(write.status, 0, `${write.stdout}\n${write.stderr}`);
    for (const rel of [".claude-plugin", ".codex-plugin"]) {
      const manifest = JSON.parse(readFileSync(join(root, "plugins", "goalbuddy", rel, "plugin.json"), "utf8"));
      assert.equal(manifest.version, "9.9.9");
    }

    const recheck = spawnSync(process.execPath, [script], { encoding: "utf8", env });
    assert.equal(recheck.status, 0, `${recheck.stdout}\n${recheck.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
