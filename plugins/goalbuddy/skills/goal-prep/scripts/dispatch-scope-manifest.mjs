import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const CONTROL_PREFIX = "docs/goals/";

export function repositoryRoot(cwd = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Dispatch scope verification requires a git repository: ${(result.stderr || "").trim()}`);
  return realpathSync(resolve(result.stdout.trim()));
}

export function compileDispatchScope(root, allowedFiles) {
  const patterns = normalizePatterns(root, allowedFiles);
  const exactPaths = [];
  const treePrefixes = [];
  for (const pattern of patterns) {
    if (!/[*?[\]]/.test(pattern)) {
      exactPaths.push(pattern);
      continue;
    }
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (prefix && prefix !== "." && !/[*?[\]]/.test(prefix)) {
        assertSafeTreePrefix(root, prefix);
        treePrefixes.push(prefix);
        continue;
      }
    }
    throw new Error(`Unsafe dispatch scope ${pattern}: ignored-file observation supports exact paths or a bounded terminal directory/** tree.`);
  }
  return Object.freeze({
    root: canonicalAbsolutePath(root),
    patterns: Object.freeze([...patterns]),
    exactPaths: Object.freeze([...exactPaths]),
    treePrefixes: Object.freeze([...treePrefixes]),
  });
}

export function compileScopedIdentityScope(root, patterns) {
  const canonicalRoot = canonicalAbsolutePath(root);
  const values = stringArray(patterns);
  if (values.length === 0) throw new Error("Scoped identity requires at least one path pattern.");
  const normalized = values.map((value) => {
    if (value !== value.trim() || value.includes("\\") || isAbsolute(value)) {
      throw new Error(`Scoped identity paths must be canonical repository-relative paths: ${value}`);
    }
    const path = normalizeRepositoryPath(canonicalRoot, value, { allowGlob: true });
    if (path !== value) {
      throw new Error(`Scoped identity paths must be canonical repository-relative paths without lexical aliases or symlinked ancestors: ${value}`);
    }
    if (!/[*?[\]]/.test(path)) return path;
    if (path.endsWith("/**")) {
      const prefix = path.slice(0, -3);
      if (prefix && !/[*?[\]]/.test(prefix)) {
        assertSafeTreePrefix(canonicalRoot, prefix);
        return path;
      }
    }
    throw new Error(`Unsafe scoped identity path ${value}: use an exact path or bounded terminal directory/** tree.`);
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("Scoped identity contains duplicate paths after normalization.");
  }
  return Object.freeze({
    kind: "goalbuddy_review_scope_v1",
    root: canonicalRoot,
    patterns: Object.freeze([...normalized]),
    exactPaths: Object.freeze(normalized.filter((path) => !path.endsWith("/**"))),
    treePrefixes: Object.freeze(normalized.filter((path) => path.endsWith("/**")).map((path) => path.slice(0, -3))),
  });
}

export function captureScopedIdentityManifest(root, { scope }) {
  const canonicalRoot = canonicalAbsolutePath(root);
  if (!scope || scope.root !== canonicalRoot) {
    throw new Error("Scoped identity scope and manifest must use one repository root.");
  }
  const paths = new Set(scope.exactPaths.filter((path) => !isGoalBuddyControlPath(path)));
  for (const prefix of scope.treePrefixes) {
    if (isGoalBuddyControlPath(prefix)) continue;
    paths.add(prefix);
    walkIdentity(resolve(canonicalRoot, prefix), canonicalRoot, paths);
  }
  const entries = {};
  for (const path of [...paths].filter((entry) => !isGoalBuddyControlPath(entry)).sort()) {
    entries[path] = scopedPathEvidence(canonicalRoot, path);
  }
  return Object.freeze({
    kind: "goalbuddy_scoped_manifest_v1",
    patterns: Object.freeze([...scope.patterns]),
    entries: Object.freeze(entries),
  });
}

export function captureDispatchManifest(root, { scope = null } = {}) {
  const canonicalRoot = canonicalAbsolutePath(root);
  if (scope && scope.root !== canonicalRoot) throw new Error("Dispatch scope and manifest must use one repository root.");
  const paths = new Set(gitInventory(root));
  for (const path of controlInventory(root)) paths.add(path);
  for (const path of scope?.exactPaths || []) paths.add(path);
  for (const prefix of scope?.treePrefixes || []) {
    const scopedPaths = [];
    walk(resolve(root, prefix), root, scopedPaths);
    for (const path of scopedPaths) paths.add(path);
  }
  const entries = {};
  for (const path of [...paths].sort()) entries[path] = pathEvidence(root, path);
  return { root: canonicalRoot, entries };
}

export function compareDispatchScope({ before, after, scope = null, role, allowedFiles, receiptChangedFiles, authorizedControlSha256 = {} }) {
  const authority = compareDispatchAuthority({ before, after, scope, role, allowedFiles, authorizedControlSha256 });
  const rawAllowed = stringArray(allowedFiles);
  const rawReceiptPaths = stringArray(receiptChangedFiles);
  const receiptPaths = normalizeReceiptPaths(before.root, rawReceiptPaths);
  validateReceiptPathForms(before.root, rawAllowed, rawReceiptPaths);
  const observedSet = new Set(authority.changed_files);
  const receiptSet = new Set(receiptPaths);
  const missingReceiptChanges = authority.changed_files.filter((path) => !receiptSet.has(path));
  const extraReceiptClaims = receiptPaths.filter((path) => !observedSet.has(path));
  const receiptViolations = [
    ...missingReceiptChanges.map((path) => `Observed change missing from receipt: ${path}`),
    ...extraReceiptClaims.map((path) => `Receipt claims unchanged file: ${path}`),
  ];
  if (["scout", "judge"].includes(String(role || "").toLowerCase()) && receiptPaths.length > 0) {
    receiptViolations.push("Read-only task claimed file changes.");
  }
  return {
    ...authority,
    status: authority.status === "clean" && receiptViolations.length === 0 ? "clean" : "violations",
    receipt_changed_files: receiptPaths,
    missing_receipt_changes: missingReceiptChanges,
    extra_receipt_claims: extraReceiptClaims,
    violations: [...new Set([...authority.violations, ...receiptViolations])],
  };
}

export function compareDispatchAuthority({ before, after, scope = null, role, allowedFiles, authorizedControlSha256 = {} }) {
  if (before.root !== after.root) throw new Error("Dispatch manifests must use one repository root.");
  const observed = changedPaths(before.entries, after.entries);
  const authorizedControlChanges = observed.filter((path) => isGoalBuddyControlPath(path) && after.entries[path]?.sha256 === authorizedControlSha256[path]);
  const controlChanges = observed.filter((path) => isGoalBuddyControlPath(path) && !authorizedControlChanges.includes(path));
  const productChanges = observed.filter((path) => !isGoalBuddyControlPath(path));
  const rawAllowed = stringArray(allowedFiles);
  const normalizedAllowed = scope?.patterns || normalizePatterns(before.root, rawAllowed);
  if (scope && scope.root !== before.root) throw new Error("Dispatch scope and manifests must use one repository root.");
  const outOfScope = productChanges.filter((path) => !normalizedAllowed.some((pattern) => matchesPattern(path, pattern)));
  const readOnlyViolation = ["scout", "judge"].includes(String(role || "").toLowerCase())
    && productChanges.length > 0;
  const violations = [
    ...controlChanges.map((path) => `GoalBuddy control file changed: ${path}`),
    ...outOfScope.map((path) => `Changed file outside allowed_files: ${path}`),
  ];
  if (readOnlyViolation) violations.push("Read-only task observed file changes.");
  return {
    status: violations.length > 0 ? "violations" : "clean",
    changed_files: productChanges,
    receipt_changed_files: [],
    control_changes: controlChanges,
    authorized_control_changes: authorizedControlChanges,
    out_of_scope: outOfScope,
    missing_receipt_changes: [],
    extra_receipt_claims: [],
    violations: [...new Set(violations)],
  };
}

function assertSafeTreePrefix(root, prefix) {
  const absolute = resolve(root, prefix);
  let current = absolute;
  while (current !== root && current.startsWith(`${root}${sep}`)) {
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) {
        const target = realpathSync(current);
        const rel = relative(root, target);
        if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
          throw new Error(`Unsafe dispatch scope ${prefix}/**: symlinked prefix escapes the repository.`);
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    current = dirname(current);
  }
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

function walkIdentity(path, root, paths) {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const repositoryPath = relative(root, path).split(sep).join("/");
  if (isGoalBuddyControlPath(repositoryPath)) return;
  paths.add(repositoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  for (const entry of readdirSync(path)) walkIdentity(resolve(path, entry), root, paths);
}

function scopedPathEvidence(root, path) {
  const absolute = resolve(root, path);
  assertScopedParent(root, absolute);
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return Object.freeze({ kind: "missing", mode: null, content_sha256: null });
    }
    throw error;
  }
  if (stat.isSymbolicLink()) {
    return Object.freeze({
      kind: "symlink",
      mode: "120000",
      content_sha256: createHash("sha256").update(readlinkSync(absolute, { encoding: "buffer" })).digest("hex"),
    });
  }
  if (stat.isFile()) {
    return Object.freeze({
      kind: "file",
      mode: (stat.mode & 0o111) !== 0 ? "100755" : "100644",
      content_sha256: createHash("sha256").update(readScopedFile(root, absolute, path)).digest("hex"),
    });
  }
  if (stat.isDirectory()) {
    return Object.freeze({ kind: "directory", mode: "040000", content_sha256: null });
  }
  throw new Error(`Scoped identity rejects non-file repository objects: ${path}`);
}

function assertScopedParent(root, absolute) {
  const parent = dirname(absolute);
  let canonicalParent;
  try {
    canonicalParent = realpathSync(parent);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  const rel = relative(root, canonicalParent);
  if (
    canonicalParent !== parent
    || rel === ".."
    || rel.startsWith(`..${sep}`)
    || isAbsolute(rel)
  ) {
    throw new Error(`Scoped identity path has an unsafe or symlinked ancestor: ${relative(root, absolute).split(sep).join("/")}`);
  }
}

function readScopedFile(root, absolute, path) {
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0),
    );
    const before = fstatSync(descriptor);
    const namedBefore = lstatSync(absolute);
    if (!before.isFile() || !namedBefore.isFile() || namedBefore.isSymbolicLink()) {
      throw new Error(`Scoped identity requires a regular file: ${path}`);
    }
    if (before.dev !== namedBefore.dev || before.ino !== namedBefore.ino) {
      throw new Error(`Scoped identity file changed while it was opened: ${path}`);
    }
    const canonical = realpathSync(absolute);
    const rel = relative(root, canonical);
    if (
      canonical !== absolute
      || rel === ".."
      || rel.startsWith(`..${sep}`)
      || isAbsolute(rel)
    ) {
      throw new Error(`Scoped identity file escaped through a symlink: ${path}`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const namedAfter = lstatSync(absolute);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.length !== after.size
      || after.dev !== namedAfter.dev
      || after.ino !== namedAfter.ino
      || !namedAfter.isFile()
      || namedAfter.isSymbolicLink()
    ) {
      throw new Error(`Scoped identity file changed while it was hashed: ${path}`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
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

export function isGoalBuddyControlPath(path) {
  return path === "docs/goals" || path.startsWith(CONTROL_PREFIX);
}

function splitNul(buffer) {
  if (!buffer || buffer.length === 0) return [];
  return buffer.toString("utf8").split("\0").filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}
