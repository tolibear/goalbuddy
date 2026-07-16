import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const CONTROL_PREFIX = "docs/goals/";

export function repositoryRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Dispatch scope verification requires a git repository: ${(result.stderr || "").trim()}`);
  return realpathSync(resolve(result.stdout.trim()));
}

export function captureDispatchManifest(root) {
  const paths = new Set(gitInventory(root));
  for (const path of controlInventory(root)) paths.add(path);
  const entries = {};
  for (const path of [...paths].sort()) entries[path] = pathEvidence(root, path);
  return { root, entries };
}

export function compareDispatchScope({ before, after, role, allowedFiles, receiptChangedFiles }) {
  if (before.root !== after.root) throw new Error("Dispatch manifests must use one repository root.");
  const observed = changedPaths(before.entries, after.entries);
  const controlChanges = observed.filter(isGoalBuddyControlPath);
  const productChanges = observed.filter((path) => !isGoalBuddyControlPath(path));
  const rawAllowed = stringArray(allowedFiles);
  const rawReceiptPaths = stringArray(receiptChangedFiles);
  const normalizedAllowed = normalizePatterns(before.root, rawAllowed);
  const receiptPaths = normalizeReceiptPaths(before.root, rawReceiptPaths);
  validateReceiptPathForms(before.root, rawAllowed, rawReceiptPaths);
  const outOfScope = productChanges.filter((path) => !normalizedAllowed.some((pattern) => matchesPattern(path, pattern)));
  const observedSet = new Set(productChanges);
  const receiptSet = new Set(receiptPaths);
  const missingReceiptChanges = productChanges.filter((path) => !receiptSet.has(path));
  const extraReceiptClaims = receiptPaths.filter((path) => !observedSet.has(path));
  const readOnlyViolation = ["scout", "judge"].includes(String(role || "").toLowerCase())
    && (productChanges.length > 0 || receiptPaths.length > 0);
  const violations = [
    ...controlChanges.map((path) => `GoalBuddy control file changed: ${path}`),
    ...outOfScope.map((path) => `Changed file outside allowed_files: ${path}`),
    ...missingReceiptChanges.map((path) => `Observed change missing from receipt: ${path}`),
    ...extraReceiptClaims.map((path) => `Receipt claims unchanged file: ${path}`),
  ];
  if (readOnlyViolation) violations.push("Read-only task observed or claimed file changes.");
  return {
    status: violations.length > 0 ? "violations" : "clean",
    changed_files: productChanges,
    receipt_changed_files: receiptPaths,
    control_changes: controlChanges,
    out_of_scope: outOfScope,
    missing_receipt_changes: missingReceiptChanges,
    extra_receipt_claims: extraReceiptClaims,
    violations: [...new Set(violations)],
  };
}

export function normalizeRepositoryPath(root, value, { allowGlob = false } = {}) {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) throw new Error("Changed-file paths must be nonempty strings.");
  if (!allowGlob && /[*?[\]]/.test(raw)) throw new Error(`Receipt changed_files must name exact paths, not globs: ${raw}`);
  const canonicalRoot = canonicalAbsolutePath(root);
  const absolute = canonicalAbsolutePath(isAbsolute(raw) ? raw : resolve(canonicalRoot, raw));
  const rel = relative(canonicalRoot, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path resolves outside the dispatch repository: ${raw}`);
  }
  return rel.split(sep).join("/");
}

function canonicalAbsolutePath(value) {
  const absolute = resolve(value);
  return resolve(canonicalDirectoryPath(dirname(absolute)), basename(absolute));
}

function canonicalDirectoryPath(value) {
  let current = resolve(value);
  const suffix = [];
  while (true) {
    try {
      return resolve(realpathSync(current), ...suffix);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      suffix.unshift(basename(current));
      current = parent;
    }
  }
}

export function matchesPattern(file, pattern) {
  if (pattern === file) return true;
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return file === prefix || file.startsWith(`${prefix}/`);
  }
  if (!/[*?[\]]/.test(pattern)) return false;
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else source += escapeRegExp(char);
  }
  return new RegExp(`^${source}$`).test(file);
}

function normalizePatterns(root, values) {
  const normalized = stringArray(values).map((value) => normalizeRepositoryPath(root, value, { allowGlob: true }));
  if (new Set(normalized).size !== normalized.length) throw new Error("allowed_files contains duplicate paths after normalization.");
  return normalized;
}

function normalizeReceiptPaths(root, values) {
  const normalized = stringArray(values).map((value) => normalizeRepositoryPath(root, value));
  if (new Set(normalized).size !== normalized.length) throw new Error("Receipt changed_files contains duplicate paths after normalization.");
  if (normalized.some(isGoalBuddyControlPath)) throw new Error("Receipt changed_files must not claim GoalBuddy control files.");
  return normalized.sort();
}

function validateReceiptPathForms(root, allowedFiles, receiptChangedFiles) {
  const allowed = allowedFiles.map((raw) => ({
    absolute: isAbsolute(raw.trim().replace(/\\/g, "/")),
    pattern: normalizeRepositoryPath(root, raw, { allowGlob: true }),
  }));
  for (const raw of receiptChangedFiles) {
    const receiptAbsolute = isAbsolute(raw.trim().replace(/\\/g, "/"));
    const receiptPath = normalizeRepositoryPath(root, raw);
    const matchingAllowed = allowed.filter(({ pattern }) => matchesPattern(receiptPath, pattern));
    if (matchingAllowed.length > 0 && !matchingAllowed.some(({ absolute }) => absolute === receiptAbsolute)) {
      throw new Error(`Receipt changed_files path form must match allowed_files for ${raw}: use ${matchingAllowed[0].absolute ? "an absolute" : "a repository-relative"} path.`);
    }
  }
}

function stringArray(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error("Expected an array of nonempty path strings.");
  }
  return value;
}

function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths].filter((path) => JSON.stringify(before[path] || { exists: false }) !== JSON.stringify(after[path] || { exists: false })).sort();
}

function gitInventory(root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: null });
  if (result.status !== 0) throw new Error(`Could not enumerate dispatch files: ${String(result.stderr || "").trim()}`);
  return splitNul(result.stdout).map((path) => path.split(sep).join("/"));
}

function controlInventory(root) {
  const controlRoot = resolve(root, "docs", "goals");
  const paths = [];
  walk(controlRoot, root, paths);
  return paths;
}

function walk(path, root, paths) {
  let stat;
  try { stat = lstatSync(path); } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    paths.push(relative(root, path).split(sep).join("/"));
    return;
  }
  for (const entry of readdirSync(path)) walk(resolve(path, entry), root, paths);
}

function pathEvidence(root, path) {
  const absolute = resolve(root, path);
  let stat;
  try { stat = lstatSync(absolute); } catch (error) {
    if (error?.code === "ENOENT") return { exists: false };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    return { exists: true, type: "symlink", executable: false, target: readlinkSync(absolute) };
  }
  if (stat.isFile()) {
    return {
      exists: true,
      type: "file",
      executable: (stat.mode & 0o111) !== 0,
      sha256: createHash("sha256").update(readFileSync(absolute)).digest("hex"),
    };
  }
  return { exists: true, type: stat.isDirectory() ? "directory" : "other", executable: false };
}

function isGoalBuddyControlPath(path) {
  return path === "docs/goals" || path.startsWith(CONTROL_PREFIX);
}

function splitNul(buffer) {
  if (!buffer || buffer.length === 0) return [];
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
