#!/usr/bin/env node
// Keeps both plugin manifests' version equal to package.json .version.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.env.GOALBUDDY_MANIFEST_ROOT || resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifests = [
  "plugins/goalbuddy/.claude-plugin/plugin.json",
  "plugins/goalbuddy/.codex-plugin/plugin.json",
];
const write = process.argv.includes("--write");

const { version } = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const drift = [];

for (const rel of manifests) {
  const path = join(repoRoot, rel);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (manifest.version === version) continue;
  drift.push({ rel, path, from: manifest.version, manifest });
}

if (write) {
  for (const { rel, path, manifest } of drift) {
    manifest.version = version;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`synced ${rel} -> ${version}`);
  }
  console.log(`Plugin manifests match package.json (${version}).`);
} else if (drift.length) {
  for (const { rel, from } of drift) {
    console.error(`version mismatch: ${rel} is ${from}, package.json is ${version}`);
  }
  console.error("Run: node internal/cli/sync-manifest-version.mjs --write (or npm version <bump>)");
  process.exit(1);
} else {
  console.log(`Plugin manifests match package.json (${version}).`);
}
