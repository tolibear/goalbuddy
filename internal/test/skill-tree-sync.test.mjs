import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("plugin skill trees are byte-exact mirrors of both canonical skills", () => {
  const result = spawnSync(process.execPath, [resolve("internal/cli/sync-skill-tree.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
