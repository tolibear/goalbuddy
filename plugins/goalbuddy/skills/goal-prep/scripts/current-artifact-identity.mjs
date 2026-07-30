import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  captureScopedIdentityManifest,
  compileScopedIdentityScope,
  isGoalBuddyControlPath,
  matchesPattern,
  repositoryRoot,
} from "./dispatch-scope-manifest.mjs";
import { canonicalJson, canonicalJsonSha256 } from "./receipt-provenance.mjs";

export function currentArtifactIdentity({
  root,
  scope,
  reviewedCommit = "",
  reviewedIdentity = null,
}) {
  const repository = repositoryRoot(root);
  const compiledScope = normalizeScope(repository, scope);
  assertNoDivergentStagedState(repository, compiledScope);
  const currentManifest = captureScopedIdentityManifest(repository, { scope: compiledScope });
  const head = git(repository, ["rev-parse", "HEAD"]).trim();
  if (reviewedIdentity !== null
      && !["git_commit", "content_sha256"].includes(reviewedIdentity?.kind)) {
    throw new Error("reviewedIdentity must be a git_commit or content_sha256 identity.");
  }
  if (reviewedIdentity?.kind === "content_sha256"
      && !/^[a-f0-9]{64}$/.test(reviewedIdentity.value)) {
    throw new Error("Reviewed content_sha256 identity must be 64 lowercase hexadecimal characters.");
  }
  const expectedCommit = reviewedIdentity?.kind === "git_commit"
    ? reviewedIdentity.value
    : reviewedCommit;
  if (expectedCommit && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(expectedCommit)) {
    throw new Error("Reviewed Git commit must be a full lowercase object identity.");
  }
  const commitEligible = reviewedIdentity?.kind !== "content_sha256"
    && (!expectedCommit || expectedCommit === head);

  if (commitEligible) {
    const headManifest = captureCommitScopedIdentityManifest(repository, {
      scope: compiledScope,
      commit: head,
    });
    if (canonicalJson(currentManifest) === canonicalJson(headManifest)) {
      assertNoDivergentStagedState(repository, compiledScope);
      return Object.freeze({ kind: "git_commit", value: head });
    }
  }
  assertNoDivergentStagedState(repository, compiledScope);
  return Object.freeze({
    kind: "content_sha256",
    value: canonicalJsonSha256(currentManifest),
  });
}

function assertNoDivergentStagedState(root, scope) {
  const staged = new Set(scopedChangedPaths(root, [
    "diff",
    "--cached",
    "--name-only",
    "--no-renames",
    "-z",
    "HEAD",
    "--",
  ], scope));
  if (staged.size === 0) return;
  const worktree = scopedChangedPaths(root, [
    "diff",
    "--name-only",
    "--no-renames",
    "-z",
    "--",
  ], scope);
  const divergent = worktree.filter((path) => staged.has(path));
  if (divergent.length > 0) {
    throw new Error(`Scoped Git index contains staged bytes that differ from the current working tree: ${divergent.join(", ")}.`);
  }
}

function scopedChangedPaths(root, args, scope) {
  return splitNul(gitBuffer(root, args))
    .filter((path) => !isGoalBuddyControlPath(path))
    .filter((path) => scope.patterns.some((pattern) => matchesPattern(path, pattern)))
    .sort();
}

export function scopedContentIdentity({ root, scope }) {
  const repository = repositoryRoot(root);
  const compiledScope = normalizeScope(repository, scope);
  return Object.freeze({
    kind: "content_sha256",
    value: canonicalJsonSha256(captureScopedIdentityManifest(repository, { scope: compiledScope })),
  });
}

export function captureCommitScopedIdentityManifest(root, { scope, commit = "HEAD" }) {
  const repository = repositoryRoot(root);
  const compiledScope = normalizeScope(repository, scope);
  const resolvedCommit = git(repository, ["rev-parse", `${commit}^{commit}`]).trim();
  const output = gitBuffer(repository, ["ls-tree", "-r", "-t", "-z", resolvedCommit]);
  const entries = {};

  for (const record of splitNul(output)) {
    const tab = record.indexOf("\t");
    if (tab < 0) throw new Error("git ls-tree returned a malformed record.");
    const [mode, type, object] = record.slice(0, tab).split(" ");
    const path = record.slice(tab + 1);
    if (isGoalBuddyControlPath(path)) continue;
    if (!compiledScope.patterns.some((pattern) => matchesPattern(path, pattern))) continue;
    if (type === "tree") {
      entries[path] = Object.freeze({ kind: "directory", mode: "040000", content_sha256: null });
      continue;
    }
    if (type !== "blob") throw new Error(`Scoped commit contains unsupported Git object type ${type}: ${path}`);
    const bytes = gitBuffer(repository, ["cat-file", "blob", object]);
    entries[path] = Object.freeze({
      kind: mode === "120000" ? "symlink" : "file",
      mode,
      content_sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }

  for (const exactPath of compiledScope.exactPaths) {
    if (!isGoalBuddyControlPath(exactPath) && !Object.hasOwn(entries, exactPath)) {
      entries[exactPath] = Object.freeze({ kind: "missing", mode: null, content_sha256: null });
    }
  }
  for (const prefix of compiledScope.treePrefixes) {
    if (!isGoalBuddyControlPath(prefix) && !Object.hasOwn(entries, prefix)) {
      entries[prefix] = Object.freeze({ kind: "missing", mode: null, content_sha256: null });
    }
  }

  return Object.freeze({
    kind: "goalbuddy_scoped_manifest_v1",
    patterns: Object.freeze([...compiledScope.patterns]),
    entries: Object.freeze(Object.fromEntries(Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)))),
  });
}

function normalizeScope(root, scope) {
  if (Array.isArray(scope)) return compileScopedIdentityScope(root, scope);
  if (scope?.kind === "goalbuddy_review_scope_v1" && Array.isArray(scope.patterns)) {
    return compileScopedIdentityScope(root, scope.patterns);
  }
  if (scope?.root === root && Array.isArray(scope.patterns)) return scope;
  throw new Error("Current artifact identity requires a closed GoalBuddy review scope.");
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}: ${(result.stderr || "").trim()}`);
  }
  return result.stdout;
}

function gitBuffer(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: null });
  if (result.status !== 0) {
    throw new Error(`Git command failed: git ${args.join(" ")}: ${String(result.stderr || "").trim()}`);
  }
  return result.stdout;
}

function splitNul(buffer) {
  if (!buffer?.length) return [];
  return buffer.toString("utf8").split("\0").filter(Boolean);
}
