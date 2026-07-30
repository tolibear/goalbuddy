import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";

const BRIEF_KEYS = Object.freeze(["path", "sha256"]);
const SHA256 = /^[a-f0-9]{64}$/;
const GLOB_META = /[*?[\]{}]/;

export function bindBrief({ goalRoot, path }) {
  const normalizedPath = normalizeBriefPath(path);
  const context = repositoryContext(goalRoot);
  assertNotMutableGoalControl(context, normalizedPath);
  return Object.freeze({
    path: normalizedPath,
    sha256: hashBriefFile(context.root, normalizedPath),
  });
}

export function verifyBrief({ goalRoot, binding }) {
  assertBriefBinding(binding);
  const context = repositoryContext(goalRoot);
  assertNotMutableGoalControl(context, binding.path);
  const verified = Object.freeze({
    path: binding.path,
    sha256: hashBriefFile(context.root, binding.path),
  });
  if (!isDeepStrictEqual(binding, verified)) {
    throw briefError(`Brief digest mismatch for ${binding.path}: expected ${binding.sha256}, got ${verified.sha256}.`);
  }
  return verified;
}

export function assertBriefBinding(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding) || Object.getPrototypeOf(binding) !== Object.prototype) {
    throw briefError("Brief binding must be an object with exactly path and sha256.");
  }
  const missing = BRIEF_KEYS.filter((key) => !Object.hasOwn(binding, key));
  const extras = Object.keys(binding).filter((key) => !BRIEF_KEYS.includes(key));
  if (missing.length || extras.length) {
    throw briefError(`Brief binding keys must be exact; missing [${missing.join(", ")}], unexpected [${extras.join(", ")}].`);
  }
  normalizeBriefPath(binding.path);
  if (!SHA256.test(binding.sha256 || "")) {
    throw briefError("Brief binding sha256 must contain exactly 64 lowercase hex characters.");
  }
  return binding;
}

export function equalBriefBindings(left, right) {
  assertBriefBinding(left);
  assertBriefBinding(right);
  return left.path === right.path && left.sha256 === right.sha256;
}

function normalizeBriefPath(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw briefError("Brief path must be a nonempty repository-relative string without surrounding whitespace.");
  }
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || isAbsolute(value) || /^[A-Za-z]:/.test(value)) {
    throw briefError("Brief path must use repository-relative forward-slash syntax.");
  }
  if (GLOB_META.test(value)) throw briefError("Brief path must name one exact file, not a glob.");
  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw briefError("Brief path must not contain empty, dot, or traversal segments.");
  }
  return value;
}

function repositoryContext(goalRoot) {
  const anchor = resolve(goalRoot || ".");
  let cwd = anchor;
  let boardPath = "";
  try {
    if (!lstatSync(anchor).isDirectory()) {
      cwd = dirname(anchor);
      boardPath = anchor;
    } else {
      boardPath = resolve(anchor, "state.yaml");
    }
  } catch {
    cwd = dirname(anchor);
  }
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw briefError(`Brief binding requires a Git repository: ${(result.stderr || "").trim() || "git rev-parse failed"}`);
  }
  const root = realpathSync(resolve(result.stdout.trim()));
  const boardRelative = boardPath ? relative(root, boardPath).split(sep).join("/") : "";
  return {
    root,
    boardPath: boardRelative && boardRelative !== ".." && !boardRelative.startsWith("../") && !isAbsolute(boardRelative)
      ? boardRelative
      : "",
  };
}

function assertNotMutableGoalControl(context, path) {
  if (path === context.boardPath || (path.startsWith("docs/goals/") && path.endsWith("/state.yaml"))) {
    throw briefError("Brief path must not identify mutable GoalBuddy state.yaml control data.");
  }
}

function hashBriefFile(root, path) {
  const absolute = resolve(root, ...path.split("/"));
  const rel = relative(root, absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw briefError("Brief path must resolve to one file inside the repository.");
  }

  let current = root;
  const segments = path.split("/");
  for (const [index, segment] of segments.entries()) {
    current = resolve(current, segment);
    let entry;
    try {
      entry = lstatSync(current);
    } catch (error) {
      throw briefError(`Brief file is unavailable at ${path}: ${error.message}`);
    }
    if (entry.isSymbolicLink()) throw briefError(`Brief path must not contain symlinks: ${path}.`);
    if (index === segments.length - 1 && !entry.isFile()) {
      throw briefError(`Brief path must identify a regular file: ${path}.`);
    }
  }

  let fd;
  try {
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(fd);
    if (!opened.isFile()) throw briefError(`Brief path must identify a regular file: ${path}.`);
    const canonical = realpathSync(absolute);
    if (canonical !== absolute) throw briefError(`Brief path must not contain symlinks: ${path}.`);
    const named = statSync(canonical);
    if (opened.dev !== named.dev || opened.ino !== named.ino) {
      throw briefError(`Brief file changed while it was being safely opened: ${path}.`);
    }
    const before = fstatSync(fd);
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) {
      throw briefError(`Brief file changed while it was being hashed: ${path}.`);
    }
    return createHash("sha256").update(bytes).digest("hex");
  } catch (error) {
    if (error?.code === "BRIEF_BINDING_INVALID") throw error;
    throw briefError(`Brief file could not be safely opened at ${path}: ${error.message}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function briefError(message) {
  const error = new Error(message);
  error.code = "BRIEF_BINDING_INVALID";
  return error;
}
