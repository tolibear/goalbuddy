import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectRequiredReviewPaths } from "../../goalbuddy/scripts/completion-review-scope.mjs";

function repository() {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-review-coverage-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "docs", "goals", "example"), { recursive: true });
  writeFileSync(join(root, "src", "root.mjs"), "root\n");
  writeFileSync(join(root, "src", "child.mjs"), "child\n");
  writeFileSync(join(root, "src", "deleted.mjs"), "deleted\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "goalbuddy@example.test"], { cwd: root });
  execFileSync("git", ["config", "user.name", "GoalBuddy Test"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
  return root;
}

function snapshot(task) {
  const transitionEvidence = task.persistedArtifactPath
    ? [
        "    transition_evidence:",
        "      receipt_provenance:",
        "        receipt_artifact:",
        "          root: repository",
        `          path: ${task.persistedArtifactPath}`,
      ]
    : [];
  return {
    text: [
      "version: 2",
      "tasks:",
      `  - id: ${task.id}`,
      "    type: worker",
      "    status: done",
      ...transitionEvidence,
      "    receipt:",
      "      result: done",
      `      task_id: ${task.id}`,
      "      board_path: docs/goals/example/state.yaml",
      "      changed_files:",
      ...task.changedFiles.map((path) => `        - ${path}`),
      "      commands:",
      "        - cmd: npm test",
      "          status: pass",
      "      summary: complete",
      "      deviations: []",
      "",
    ].join("\n"),
  };
}

function readOnlySnapshot() {
  return {
    text: [
      "version: 2",
      "tasks:",
      "  - id: T900",
      "    type: judge",
      "    status: done",
      "    receipt: null",
      "",
    ].join("\n"),
  };
}

test("review coverage unions completed Workers across root and child snapshots, including missing paths", () => {
  const root = repository();
  try {
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [
        snapshot({ id: "T001", changedFiles: ["src/root.mjs", "src/deleted.mjs"] }),
        snapshot({ id: "T002", changedFiles: ["src/child.mjs"] }),
      ],
      baseIdentity: { kind: "git_commit", value: base },
    });
    assert.deepEqual(paths, ["src/child.mjs", "src/deleted.mjs", "src/root.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review coverage does not let receipt-selected Git metadata expand or define the Worker path oracle", () => {
  const root = repository();
  try {
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    writeFileSync(join(root, "src", "outside-worker.mjs"), "out of band\n");
    writeFileSync(join(root, "reviews.json"), "{}\n");
    writeFileSync(join(root, "docs", "goals", "example", "state.yaml"), "control\n");
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [snapshot({ id: "T001", changedFiles: ["src/root.mjs"] })],
      baseIdentity: { kind: "git_commit", value: base },
      excludedPaths: ["reviews.json"],
    });
    assert.deepEqual(paths, ["src/root.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review coverage cannot subtract a Worker path that collides with receipt or review artifacts", () => {
  const root = repository();
  try {
    writeFileSync(join(root, "reviews.json"), "{}\n");
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [
        snapshot({
          id: "T001",
          changedFiles: ["reviews.json", "src/root.mjs"],
          persistedArtifactPath: "reviews.json",
        }),
      ],
      excludedPaths: ["reviews.json"],
    });
    assert.deepEqual(paths, ["reviews.json", "src/root.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt-selected content identities cannot substitute current Git dirt for Worker history", () => {
  const root = repository();
  try {
    writeFileSync(join(root, "src", "child.mjs"), "dirty child\n");
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [snapshot({ id: "T001", changedFiles: ["src/root.mjs"] })],
      baseIdentity: { kind: "content_sha256", value: "a".repeat(64) },
    });
    assert.deepEqual(paths, ["src/root.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("read-only boards with no completed Worker paths require no product review coverage", () => {
  const root = repository();
  try {
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [readOnlySnapshot()],
    });
    assert.deepEqual(paths, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("completed Workers that changed only GoalBuddy control paths require no product review coverage", () => {
  const root = repository();
  try {
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [
        snapshot({
          id: "T001",
          changedFiles: ["docs/goals/example/state.yaml"],
        }),
      ],
    });
    assert.deepEqual(paths, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted missing-review completion can derive coverage from Worker history without a review base", () => {
  const root = repository();
  try {
    const paths = collectRequiredReviewPaths({
      root,
      boardSnapshots: [snapshot({ id: "T001", changedFiles: ["src/root.mjs"] })],
      baseIdentity: null,
    });
    assert.deepEqual(paths, ["src/root.mjs"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
