import { chmodSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import {
  captureDispatchManifest,
  captureScopedIdentityManifest,
  compareDispatchScope,
  compileDispatchScope,
  compileScopedIdentityScope,
} from "../../goalbuddy/scripts/dispatch-scope-manifest.mjs";
import {
  currentArtifactIdentity,
  scopedContentIdentity,
} from "../../goalbuddy/scripts/current-artifact-identity.mjs";

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-scope-manifest-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs", "goals", "one"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), "docs/\nignored/\n");
  writeFileSync(join(root, "README.md"), "base\n");
  writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 1;\n");
  writeFileSync(join(root, "src", "delete.mjs"), "delete me\n");
  writeFileSync(join(root, "src", "rename.mjs"), "rename me\n");
  writeFileSync(join(root, "src", "executable.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o644 });
  writeFileSync(join(root, "docs", "goals", "one", "state.yaml"), "version: 2\n");
  git(root, ["init", "-q"]);
  git(root, ["add", "-A"]);
  git(root, ["add", "-f", "docs/goals/one/state.yaml"]);
  git(root, ["-c", "user.name=GoalBuddy Test", "-c", "user.email=goalbuddy@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  return root;
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("bounded manifest detects every declared change type and ignored GoalBuddy controls", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, "README.md"), "base\npre-dirty\n");
    const before = captureDispatchManifest(root);

    writeFileSync(join(root, "README.md"), "base\npre-dirty\nchanged again\n");
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 2;\n");
    rmSync(join(root, "src", "delete.mjs"));
    renameSync(join(root, "src", "rename.mjs"), join(root, "src", "renamed.mjs"));
    chmodSync(join(root, "src", "executable.sh"), 0o755);
    symlinkSync("widget.mjs", join(root, "src", "link.mjs"));
    writeFileSync(join(root, "src", "line\nbreak.txt"), "unusual pathname\n");
    writeFileSync(join(root, "docs", "goals", "one", "ignored-note.md"), "must still be observed\n");

    const after = captureDispatchManifest(root);
    const productChanges = [
      "README.md",
      "src/delete.mjs",
      "src/executable.sh",
      "src/line\nbreak.txt",
      "src/link.mjs",
      "src/rename.mjs",
      "src/renamed.mjs",
      "src/widget.mjs",
    ];
    const report = compareDispatchScope({
      before,
      after,
      role: "worker",
      allowedFiles: ["README.md", "src/**"],
      receiptChangedFiles: productChanges,
    });
    assert.equal(report.status, "violations");
    assert.deepEqual(report.changed_files, productChanges);
    assert.deepEqual(report.control_changes, ["docs/goals/one/ignored-note.md"]);
    assert.deepEqual(report.out_of_scope, []);
    assert.deepEqual(report.missing_receipt_changes, []);
    assert.deepEqual(report.extra_receipt_claims, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("absolute allowed and receipt paths reconcile a second edit to an already-dirty file", () => {
  const root = makeRepo();
  try {
    const readme = join(root, "README.md");
    writeFileSync(readme, "base\npre-dirty\n");
    const before = captureDispatchManifest(root);
    writeFileSync(readme, "base\npre-dirty\nchanged again\n");
    const after = captureDispatchManifest(root);
    const report = compareDispatchScope({
      before,
      after,
      role: "worker",
      allowedFiles: [readme],
      receiptChangedFiles: [readme],
    });
    assert.equal(report.status, "clean");
    assert.deepEqual(report.changed_files, ["README.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt paths must preserve the absolute or repository-relative form of allowed_files", () => {
  const root = makeRepo();
  try {
    const widget = join(root, "src", "widget.mjs");
    const before = captureDispatchManifest(root);
    writeFileSync(widget, "export const widget = 2;\n");
    const after = captureDispatchManifest(root);
    assert.throws(() => compareDispatchScope({
      before,
      after,
      role: "worker",
      allowedFiles: [widget],
      receiptChangedFiles: ["src/widget.mjs"],
    }), /path form must match allowed_files.*absolute/);
    assert.throws(() => compareDispatchScope({
      before,
      after,
      role: "worker",
      allowedFiles: ["src/widget.mjs"],
      receiptChangedFiles: [widget],
    }), /path form must match allowed_files.*repository-relative/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt reconciliation rejects duplicate, extra, and out-of-root path claims", () => {
  const root = makeRepo();
  try {
    const before = captureDispatchManifest(root);
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 2;\n");
    const after = captureDispatchManifest(root);
    assert.throws(() => compareDispatchScope({
      before, after, role: "worker", allowedFiles: ["src/**"], receiptChangedFiles: ["src/widget.mjs", "./src/widget.mjs"],
    }), /duplicate paths after normalization/);
    const extra = compareDispatchScope({
      before, after, role: "worker", allowedFiles: ["src/**"], receiptChangedFiles: ["src/widget.mjs", "src/delete.mjs"],
    });
    assert.deepEqual(extra.extra_receipt_claims, ["src/delete.mjs"]);
    assert.throws(() => compareDispatchScope({
      before, after, role: "worker", allowedFiles: ["src/**"], receiptChangedFiles: [resolve(root, "..", "outside.mjs")],
    }), /outside the dispatch repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("declared ignored trees reconcile created, modified, deleted, mode, and symlink changes", () => {
  const root = makeRepo();
  try {
    writeFileSync(join(root, ".gitignore"), "docs/\nignored/\n.context/\n");
    mkdirSync(join(root, ".context", "infra", "lane-a"), { recursive: true });
    writeFileSync(join(root, ".context", "infra", "lane-a", "modify.md"), "before\n");
    writeFileSync(join(root, ".context", "infra", "lane-a", "delete.md"), "delete\n");
    writeFileSync(join(root, ".context", "infra", "lane-a", "mode.sh"), "#!/bin/sh\n", { mode: 0o644 });
    symlinkSync("modify.md", join(root, ".context", "infra", "lane-a", "link.md"));
    const scope = compileDispatchScope(root, [".context/infra/**"]);
    const before = captureDispatchManifest(root, { scope });

    writeFileSync(join(root, ".context", "infra", "lane-a", "modify.md"), "after\n");
    rmSync(join(root, ".context", "infra", "lane-a", "delete.md"));
    chmodSync(join(root, ".context", "infra", "lane-a", "mode.sh"), 0o755);
    rmSync(join(root, ".context", "infra", "lane-a", "link.md"));
    symlinkSync("mode.sh", join(root, ".context", "infra", "lane-a", "link.md"));
    writeFileSync(join(root, ".context", "infra", "lane-a", "created.md"), "created\n");

    const after = captureDispatchManifest(root, { scope });
    const changed = [
      ".context/infra/lane-a/created.md",
      ".context/infra/lane-a/delete.md",
      ".context/infra/lane-a/link.md",
      ".context/infra/lane-a/mode.sh",
      ".context/infra/lane-a/modify.md",
    ];
    const report = compareDispatchScope({ before, after, scope, role: "worker", allowedFiles: [".context/infra/**"], receiptChangedFiles: changed });
    assert.equal(report.status, "clean");
    assert.deepEqual(report.changed_files, changed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scope compilation rejects repository-wide and unbounded wildcard inventory", () => {
  const root = makeRepo();
  try {
    assert.throws(() => compileDispatchScope(root, ["**"]), /Unsafe dispatch scope/);
    assert.throws(() => compileDispatchScope(root, [".context\/*\/receipt.json"]), /Unsafe dispatch scope/);
    assert.throws(() => compileDispatchScope(root, [resolve(root, "..", "outside/**")]), /outside the dispatch repository/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("closed identity scope accepts only canonical exact paths and terminal trees", () => {
  const root = makeRepo();
  try {
    const scope = compileScopedIdentityScope(root, ["README.md", "src/**"]);
    assert.deepEqual(scope.patterns, ["README.md", "src/**"]);
    assert.deepEqual(scope.exactPaths, ["README.md"]);
    assert.deepEqual(scope.treePrefixes, ["src"]);
    for (const pattern of [
      resolve(root, "README.md"),
      "src\\widget.mjs",
      "../outside.mjs",
      "src/*.mjs",
      "src/**/nested",
      "**",
    ]) {
      assert.throws(() => compileScopedIdentityScope(root, [pattern]), /repository-relative|outside|Unsafe scoped identity/);
    }
    assert.throws(() => compileScopedIdentityScope(root, ["./src/widget.mjs"]), /canonical repository-relative/);
    assert.throws(() => compileScopedIdentityScope(root, []), /at least one path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("closed identity scope rejects a symlinked ancestor instead of silently remapping it", () => {
  const root = makeRepo();
  try {
    symlinkSync("src", join(root, "alias"));
    assert.throws(
      () => compileScopedIdentityScope(root, ["alias/**"]),
      /canonical repository-relative paths without lexical aliases or symlinked ancestors/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scoped identity manifest records sorted path kind, mode, and content evidence", () => {
  const root = makeRepo();
  try {
    symlinkSync("widget.mjs", join(root, "src", "link.mjs"));
    chmodSync(join(root, "src", "executable.sh"), 0o755);
    const scope = compileScopedIdentityScope(root, ["missing.json", "src/**"]);
    const manifest = captureScopedIdentityManifest(root, { scope });
    assert.deepEqual(Object.keys(manifest.entries), [
      "missing.json",
      "src",
      "src/delete.mjs",
      "src/executable.sh",
      "src/link.mjs",
      "src/rename.mjs",
      "src/widget.mjs",
    ]);
    assert.deepEqual(manifest.entries["missing.json"], {
      kind: "missing",
      mode: null,
      content_sha256: null,
    });
    assert.equal(manifest.entries.src.kind, "directory");
    assert.equal(manifest.entries["src/executable.sh"].mode, "100755");
    assert.equal(manifest.entries["src/link.mjs"].kind, "symlink");
    assert.match(manifest.entries["src/widget.mjs"].content_sha256, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current artifact identity uses HEAD only for an exact scoped match", () => {
  const root = makeRepo();
  try {
    const scope = { kind: "goalbuddy_review_scope_v1", patterns: ["src/**"] };
    const head = gitOutput(root, ["rev-parse", "HEAD"]);
    assert.deepEqual(currentArtifactIdentity({ root, scope, reviewedCommit: head }), {
      kind: "git_commit",
      value: head,
    });
    assert.equal(currentArtifactIdentity({
      root,
      scope,
      reviewedIdentity: { kind: "content_sha256", value: "f".repeat(64) },
    }).kind, "content_sha256");

    writeFileSync(join(root, "README.md"), "out-of-scope dirty\n");
    assert.deepEqual(currentArtifactIdentity({ root, scope, reviewedCommit: head }), {
      kind: "git_commit",
      value: head,
    });

    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 9;\n");
    const dirty = currentArtifactIdentity({ root, scope, reviewedCommit: head });
    assert.equal(dirty.kind, "content_sha256");
    assert.equal(dirty.value, scopedContentIdentity({ root, scope }).value);
    assert.match(dirty.value, /^[a-f0-9]{64}$/);

    const repeated = currentArtifactIdentity({ root, scope, reviewedCommit: head });
    assert.deepEqual(repeated, dirty);
    assert.equal(
      currentArtifactIdentity({ root, scope, reviewedCommit: "0".repeat(40) }).kind,
      "content_sha256",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("broad product scopes exclude GoalBuddy control bytes from current identity", () => {
  const root = makeRepo();
  try {
    const scope = ["docs/**"];
    const clean = currentArtifactIdentity({ root, scope });
    assert.equal(clean.kind, "git_commit");

    writeFileSync(join(root, "docs", "goals", "one", "state.yaml"), "version: 2\ngoal:\n  status: done\n");
    writeFileSync(
      join(root, "docs", "goals", ".one.goalbuddy-state-candidate-123"),
      "candidate\n",
    );
    assert.deepEqual(
      currentArtifactIdentity({ root, scope }),
      clean,
      "board transitions and their same-filesystem candidate are control state, not reviewed product bytes",
    );

    writeFileSync(join(root, "docs", "product.md"), "real product change\n");
    assert.equal(currentArtifactIdentity({ root, scope }).kind, "content_sha256");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("untracked scoped bytes and mode changes affect identity while unrelated changes do not", () => {
  const root = makeRepo();
  try {
    const scope = ["src/**"];
    const clean = currentArtifactIdentity({ root, scope });
    assert.equal(clean.kind, "git_commit");

    writeFileSync(join(root, "outside.txt"), "unrelated\n");
    assert.deepEqual(currentArtifactIdentity({ root, scope }), clean);

    writeFileSync(join(root, "src", "new.mjs"), "new\n");
    const untracked = currentArtifactIdentity({ root, scope });
    assert.equal(untracked.kind, "content_sha256");

    rmSync(join(root, "src", "new.mjs"));
    chmodSync(join(root, "src", "executable.sh"), 0o755);
    const modeChanged = currentArtifactIdentity({ root, scope });
    assert.equal(modeChanged.kind, "content_sha256");
    assert.notEqual(modeChanged.value, untracked.value);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("current artifact identity rejects staged bytes hidden behind restored working-tree bytes", () => {
  const root = makeRepo();
  try {
    const scope = ["src/**"];
    const path = join(root, "src", "widget.mjs");
    const reviewed = readFileSync(path, "utf8");
    writeFileSync(path, "export const widget = 'staged-only';\n");
    git(root, ["add", "src/widget.mjs"]);
    writeFileSync(path, reviewed);

    assert.throws(
      () => currentArtifactIdentity({ root, scope }),
      /staged bytes that differ from the current working tree/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function gitOutput(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
