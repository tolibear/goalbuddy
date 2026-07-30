import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { collectReceiptFrontierEvidence } from "../../goalbuddy/scripts/frontier-evidence.mjs";

function setupRepository(t) {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-frontier-evidence-"));
  const initialized = spawnSync("git", ["init", "-q", root], { encoding: "utf8" });
  assert.equal(initialized.status, 0, initialized.stderr);
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return root;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("valid PM review, browser, and product-decision evidence remains artifact-bound", (t) => {
  const root = setupRepository(t);
  mkdirSync(join(root, "reviews"));
  mkdirSync(join(root, "screenshots"));
  mkdirSync(join(root, "docs", "goals", "example", "notes"), { recursive: true });
  const review = Buffer.from('{"review":"round one"}\n');
  const diff = Buffer.from("diff --git a/src/widget.mjs b/src/widget.mjs\n");
  const screenshot = Buffer.from("decisive screenshot");
  writeFileSync(join(root, "reviews", "round-one.json"), review);
  writeFileSync(join(root, "reviews", "round-one.diff"), diff);
  writeFileSync(join(root, "screenshots", "widget.png"), screenshot);
  writeFileSync(
    join(root, "docs", "goals", "example", "notes", "decision.md"),
    "Owner decision context.\n",
  );

  const evidence = [{
    kind: "goalbuddy_review_evidence_v1",
    identity: "round-one",
    round: 1,
    reviewer: "fresh-fable",
    status: "complete",
    scope_status: "exact",
    findings: 4,
    accepted_findings: 3,
    yield: "high",
    selection: "retain",
    adjudication: "three accepted, one rejected",
    artifact: {
      path: "reviews/round-one.json",
      sha256: sha256(review),
    },
    diff_artifact: {
      path: "reviews/round-one.diff",
      sha256: sha256(diff),
      identity: {
        kind: "content_sha256",
        value: "b".repeat(64),
      },
      scope: ["goalbuddy/scripts/frontier.mjs"],
    },
    scope_anomalies: [],
  }, {
    kind: "goalbuddy_browser_evidence_v1",
    state: "widget-expanded",
    verdict: "pass",
    decisive: true,
    summary: "The expanded state exposes the required control.",
    screenshot: {
      path: "screenshots/widget.png",
      sha256: sha256(screenshot),
    },
  }, {
    kind: "goalbuddy_product_decision_v1",
    id: "activation-copy",
    status: "unresolved",
    decision: "Choose the activation copy.",
    note: "docs/goals/example/notes/decision.md",
  }];
  const before = structuredClone(evidence);

  const result = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "pm",
    taskId: "T007",
    boardPath: "docs/goals/example/state.yaml",
    evidence,
  });

  assert.deepEqual(evidence, before);
  assert.equal(result.scope_anomalies.length, 0);
  assert.equal(result.reviews.length, 1);
  assert.deepEqual(result.reviews[0].source, {
    kind: "stored_receipt",
    task_id: "T007",
    board_path: "docs/goals/example/state.yaml",
  });
  assert.equal(result.browser.length, 1);
  assert.equal(result.browser[0].source.kind, "stored_receipt");
  assert.equal(result.decisions.length, 1);
  assert.deepEqual(result.decisions[0].source, {
    kind: "stored_receipt",
    task_id: "T007",
    board_path: "docs/goals/example/state.yaml",
  });
  assert.deepEqual(
    result.drill_down.map((entry) => entry.purpose),
    [
      "full_independent_review",
      "full_product_diff",
      "reviewed_diff_identity",
      "decisive_browser_evidence",
      "product_decision_context",
    ],
  );
});

test("a stale review digest becomes an explicit anomaly and cannot add a review", (t) => {
  const root = setupRepository(t);
  mkdirSync(join(root, "reviews"));
  writeFileSync(join(root, "reviews", "round-one.json"), '{"review":"changed"}\n');

  const result = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "judge",
    taskId: "T009",
    boardPath: "docs/goals/example/state.yaml",
    evidence: [{
      kind: "goalbuddy_review_evidence_v1",
      identity: "round-one",
      round: 1,
      reviewer: "fresh-fable",
      status: "complete",
      scope_status: "exact",
      findings: 1,
      accepted_findings: 1,
      yield: "high",
      selection: "retain",
      adjudication: "accepted",
      artifact: {
        path: "reviews/round-one.json",
        sha256: "a".repeat(64),
      },
      diff_artifact: null,
      scope_anomalies: [],
    }],
  });

  assert.deepEqual(result.reviews, []);
  assert.deepEqual(result.drill_down, []);
  assert.equal(result.scope_anomalies.length, 1);
  assert.equal(result.scope_anomalies[0].kind, "frontier_evidence_invalid");
  assert.equal(
    result.scope_anomalies[0].detail,
    "Semantic frontier evidence has an invalid or stale digest binding.",
  );
  assert.deepEqual(result.scope_anomalies[0].source, {
    kind: "stored_receipt",
    task_id: "T009",
    board_path: "docs/goals/example/state.yaml",
  });
});

test("Worker-authored semantic judgment is rejected before artifact lookup", (t) => {
  const root = setupRepository(t);
  const result = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "worker",
    taskId: "T001",
    boardPath: "docs/goals/example/state.yaml",
    evidence: [{
      kind: "goalbuddy_browser_evidence_v1",
      state: "fabricated",
      verdict: "pass",
      decisive: true,
      summary: "This must not become browser proof.",
      screenshot: {
        path: "does/not/exist.png",
        sha256: "a".repeat(64),
      },
    }],
  });

  assert.deepEqual(result.browser, []);
  assert.deepEqual(result.drill_down, []);
  assert.equal(result.scope_anomalies.length, 1);
  assert.equal(
    result.scope_anomalies[0].detail,
    "Semantic frontier evidence requires a Judge or PM receipt.",
  );
});

test("traversal and symlinked review artifacts cannot enter the semantic frontier", (t) => {
  const root = setupRepository(t);
  const external = mkdtempSync(join(tmpdir(), "goalbuddy-frontier-external-"));
  t.after(() => rmSync(external, { force: true, recursive: true }));
  writeFileSync(join(external, "review.json"), '{"review":"outside"}\n');
  symlinkSync(external, join(root, "reviews"));

  const traversal = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "pm",
    taskId: "T002",
    boardPath: "docs/goals/example/state.yaml",
    evidence: [{
      kind: "goalbuddy_product_decision_v1",
      id: "outside-note",
      status: "unresolved",
      decision: "Do not load this note.",
      note: "../outside.md",
    }],
  });
  const symlink = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "pm",
    taskId: "T002",
    boardPath: "docs/goals/example/state.yaml",
    evidence: [{
      kind: "goalbuddy_review_evidence_v1",
      identity: "outside-review",
      round: 1,
      reviewer: "fresh-fable",
      status: "complete",
      scope_status: "exact",
      findings: 0,
      accepted_findings: 0,
      yield: "none",
      selection: "stop",
      adjudication: "no findings",
      artifact: {
        path: "reviews/review.json",
        sha256: sha256(Buffer.from('{"review":"outside"}\n')),
      },
      diff_artifact: null,
      scope_anomalies: [],
    }],
  });

  assert.deepEqual(traversal.decisions, []);
  assert.equal(traversal.scope_anomalies.length, 1);
  assert.equal(
    traversal.scope_anomalies[0].detail,
    "Semantic frontier evidence references an unsafe or invalid path.",
  );
  assert.deepEqual(symlink.reviews, []);
  assert.equal(symlink.scope_anomalies.length, 1);
  assert.equal(
    symlink.scope_anomalies[0].detail,
    "Semantic frontier evidence references an unsafe or invalid path.",
  );
});

test("late review validation failure cannot leave partial semantic evidence", (t) => {
  const root = setupRepository(t);
  mkdirSync(join(root, "reviews"));
  const review = Buffer.from('{"review":"round one"}\n');
  writeFileSync(join(root, "reviews", "round-one.json"), review);
  const evidence = [{
    kind: "goalbuddy_review_evidence_v1",
    identity: "round-one",
    round: 1,
    reviewer: "fresh-fable",
    status: "complete",
    scope_status: "exact",
    findings: 1,
    accepted_findings: 1,
    yield: "high",
    selection: "retain",
    adjudication: "accepted",
    artifact: {
      path: "reviews/round-one.json",
      sha256: sha256(review),
    },
    diff_artifact: null,
    scope_anomalies: [{
      kind: "wrong_scope",
      status: "open",
      detail: "",
    }],
  }];
  const before = structuredClone(evidence);

  const result = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "judge",
    taskId: "T003",
    boardPath: "docs/goals/example/state.yaml",
    evidence,
  });

  assert.deepEqual(evidence, before);
  assert.deepEqual(result.reviews, []);
  assert.deepEqual(result.browser, []);
  assert.deepEqual(result.decisions, []);
  assert.deepEqual(result.drill_down, []);
  assert.equal(result.scope_anomalies.length, 1);
  assert.equal(result.scope_anomalies[0].kind, "frontier_evidence_invalid");
});

test("missing review artifacts and malformed digest syntax remain unavailable", (t) => {
  const root = setupRepository(t);
  for (const digest of ["abc", "A".repeat(64), "z".repeat(64)]) {
    const malformed = collectReceiptFrontierEvidence({
      goalRoot: root,
      taskType: "pm",
      taskId: "T004",
      boardPath: "docs/goals/example/state.yaml",
      evidence: [{
        kind: "goalbuddy_review_evidence_v1",
        identity: "round-one",
        round: 1,
        reviewer: "fresh-fable",
        status: "complete",
        scope_status: "exact",
        findings: 0,
        accepted_findings: 0,
        yield: "none",
        selection: "stop",
        adjudication: "no findings",
        artifact: {
          path: "reviews/missing.json",
          sha256: digest,
        },
        diff_artifact: null,
        scope_anomalies: [],
      }],
    });
    assert.deepEqual(malformed.reviews, []);
    assert.equal(
      malformed.scope_anomalies[0].detail,
      "Semantic frontier evidence has an invalid or stale digest binding.",
    );
  }

  const missing = collectReceiptFrontierEvidence({
    goalRoot: root,
    taskType: "pm",
    taskId: "T004",
    boardPath: "docs/goals/example/state.yaml",
    evidence: [{
      kind: "goalbuddy_review_evidence_v1",
      identity: "round-one",
      round: 1,
      reviewer: "fresh-fable",
      status: "complete",
      scope_status: "exact",
      findings: 0,
      accepted_findings: 0,
      yield: "none",
      selection: "stop",
      adjudication: "no findings",
      artifact: {
        path: "reviews/missing.json",
        sha256: "a".repeat(64),
      },
      diff_artifact: null,
      scope_anomalies: [],
    }],
  });
  assert.deepEqual(missing.reviews, []);
  assert.deepEqual(missing.drill_down, []);
  assert.equal(
    missing.scope_anomalies[0].detail,
    "Semantic frontier evidence references a missing artifact.",
  );
});
