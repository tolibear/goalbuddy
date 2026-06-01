#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const publishedVersions = readPublishedVersions(pkg.name);
const currentVersion = normalizeVersion(pkg.version);

if (!publishedVersions.length) {
  console.log(`Publish version check passed: ${pkg.name}@${currentVersion} has no published versions.`);
  process.exit(0);
}

const normalizedPublishedVersions = publishedVersions.map(normalizeVersion);
const latestPublishedVersion = normalizedPublishedVersions.slice().sort(compareVersions).at(-1);

if (normalizedPublishedVersions.includes(currentVersion)) {
  fail(`${pkg.name}@${currentVersion} has already been published. Bump package.json before publishing.`);
}

if (compareVersions(currentVersion, latestPublishedVersion) <= 0) {
  fail(`${pkg.name}@${currentVersion} must be greater than the latest published version ${latestPublishedVersion}.`);
}

console.log(`Publish version check passed: ${pkg.name}@${currentVersion} > published ${latestPublishedVersion}.`);

function readPublishedVersions(packageName) {
  if (process.env.GOALBUDDY_PUBLISHED_VERSIONS !== undefined) {
    return parseVersionList(process.env.GOALBUDDY_PUBLISHED_VERSIONS);
  }
  if (process.env.GOAL_MAKER_PUBLISHED_VERSIONS !== undefined) {
    return parseVersionList(process.env.GOAL_MAKER_PUBLISHED_VERSIONS);
  }

  const result = spawnSync("npm", ["view", packageName, "versions", "--json"], {
    encoding: "utf8",
  });

  if (result.status === 0) return parseVersionList(result.stdout);

  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (output.includes("E404") || output.includes("404 Not Found")) return [];

  fail(`Unable to read published versions for ${packageName}.\n${output.trim()}`);
}

function parseVersionList(value) {
  const text = String(value || "").trim();
  if (!text || text === "[]") return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") return [parsed];
  } catch {
    // Fall through to comma/newline parsing for test and manual use.
  }

  return text
    .split(/[,\n]/)
    .map((version) => version.trim())
    .filter(Boolean);
}

function normalizeVersion(version) {
  const match = String(version).trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) fail(`Unsupported package version: ${version}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function fail(message) {
  console.error(`Publish version check failed: ${message}`);
  process.exit(1);
}
