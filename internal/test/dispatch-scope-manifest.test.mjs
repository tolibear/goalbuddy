import { chmodSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { captureDispatchManifest, compareDispatchScope } from "../../goalbuddy/scripts/dispatch-scope-manifest.mjs";

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
