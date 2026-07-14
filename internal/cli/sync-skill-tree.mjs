#!/usr/bin/env node
// Keeps the plugin's installed skills byte-exact with their canonical sources.
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mappings = [
  {
    name: "goal-prep",
    canonicalRoot: join(repoRoot, "goalbuddy"),
    mirrorRoot: join(repoRoot, "plugins", "goalbuddy", "skills", "goal-prep"),
  },
  {
    name: "codex-goal-compiler",
    canonicalRoot: join(repoRoot, "codex-goal-compiler"),
    mirrorRoot: join(repoRoot, "plugins", "goalbuddy", "skills", "codex-goal-compiler"),
  },
];
const ignoredNames = new Set([".DS_Store"]);
const ignoredDirs = new Set([".goalbuddy-board", "__pycache__"]);
const write = process.argv.includes("--write");

let mismatched = false;
for (const mapping of mappings) {
  mismatched = syncMapping(mapping) || mismatched;
}

if (!write && mismatched) {
  console.error("Run: npm run sync:plugin");
  process.exit(1);
}
console.log("Plugin skill trees match their canonical sources.");

function syncMapping({ name, canonicalRoot, mirrorRoot }) {
  const canonicalFiles = listFiles(canonicalRoot);
  const mirrorFiles = listFiles(mirrorRoot);
  const missing = [];
  const changed = [];
  const extra = [...mirrorFiles].filter((file) => !canonicalFiles.has(file));

  for (const file of canonicalFiles) {
    if (!mirrorFiles.has(file)) {
      missing.push(file);
    } else if (
      !readFileSync(join(canonicalRoot, file)).equals(readFileSync(join(mirrorRoot, file)))
      || fileMode(join(canonicalRoot, file)) !== fileMode(join(mirrorRoot, file))
    ) {
      changed.push(file);
    }
  }

  if (write) {
    for (const file of [...missing, ...changed]) {
      const dest = join(mirrorRoot, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(canonicalRoot, file), dest);
      chmodSync(dest, fileMode(join(canonicalRoot, file)));
      console.log(`synced ${name}/${file}`);
    }
    for (const file of extra) {
      rmSync(join(mirrorRoot, file));
      console.log(`removed extra ${name}/${file}`);
    }
  } else {
    for (const file of missing) console.error(`missing in ${name} mirror: ${file}`);
    for (const file of changed) console.error(`differs in ${name}: ${file}`);
    for (const file of extra) console.error(`extra in ${name} mirror: ${file}`);
  }

  return missing.length > 0 || changed.length > 0 || extra.length > 0;
}

function fileMode(path) {
  return statSync(path).mode & 0o777;
}

function listFiles(root, dir = root, files = new Set()) {
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue;
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(root, path, files);
    else files.add(relative(root, path).split(sep).join("/"));
  }
  return files;
}
