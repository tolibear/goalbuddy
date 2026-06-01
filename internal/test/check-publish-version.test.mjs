import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const script = "internal/cli/check-publish-version.mjs";
const currentVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const previousVersion = offsetPatchVersion(currentVersion, -1);
const olderVersion = offsetPatchVersion(currentVersion, -2);
const nextVersion = offsetPatchVersion(currentVersion, 1);

function runCheck(publishedVersions) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      GOALBUDDY_PUBLISHED_VERSIONS: publishedVersions,
      GOAL_MAKER_PUBLISHED_VERSIONS: "",
    },
  });
}

function runCheckWithoutToSorted(publishedVersions) {
  return spawnSync(process.execPath, ["--input-type=module", "--eval", `delete Array.prototype.toSorted; await import("./${script}");`], {
    encoding: "utf8",
    env: {
      ...process.env,
      GOALBUDDY_PUBLISHED_VERSIONS: publishedVersions,
      GOAL_MAKER_PUBLISHED_VERSIONS: "",
    },
  });
}

test("publish version check passes when package version is newer than npm", () => {
  const result = runCheck(JSON.stringify([olderVersion, previousVersion]));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(`goalbuddy@${escapeRegex(currentVersion)} > published ${escapeRegex(previousVersion)}`));
});

test("publish version check rejects already-published package version", () => {
  const result = runCheck(JSON.stringify([previousVersion, currentVersion]));

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`goalbuddy@${escapeRegex(currentVersion)} has already been published`));
});

test("publish version check rejects package versions behind the registry", () => {
  const result = runCheck(JSON.stringify([previousVersion, nextVersion]));

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`must be greater than the latest published version ${escapeRegex(nextVersion)}`));
});

test("publish version check does not require Node 20 array sorting APIs", () => {
  const result = runCheckWithoutToSorted(JSON.stringify([previousVersion, olderVersion]));

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(`goalbuddy@${escapeRegex(currentVersion)} > published ${escapeRegex(previousVersion)}`));
});

function offsetPatchVersion(version, offset) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  assert.ok(match, `expected plain semver version, got ${version}`);
  const major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]) + offset;
  while (patch < 0) {
    assert.ok(minor > 0, `cannot offset ${version} by ${offset}`);
    minor -= 1;
    patch += 100;
  }
  return `${major}.${minor}.${patch}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
