import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  deviationSetSha256,
  loadFinalReviewArtifact,
  validateAcceptedDeviations,
  validateDeviationAcceptance,
  validateFinalReview,
  validateFinalReviewArtifact,
  validateFinalReviewContract,
} from "../../goalbuddy/scripts/final-review-contract.mjs";
import { scopedContentIdentity } from "../../goalbuddy/scripts/current-artifact-identity.mjs";

const EXACT_REVIEW_DEVIATION = Object.freeze({
  requirement_id: "exact-final-review",
  requirement: "Bind final acceptance to an exact current review.",
  observed_shortfall: "No usable exact-current review is available.",
  reason: "The owner accepts this missing requirement for this completion only.",
  evidence: ["reviews/final.json"],
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-final-review-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "reviews"), { recursive: true });
  writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "goalbuddy@example.test"], { cwd: root });
  execFileSync("git", ["config", "user.name", "GoalBuddy Test"], { cwd: root });
  execFileSync("git", ["add", "src/widget.mjs"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  return root;
}

function head(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function writeReviewArtifact(root, metadata, path = "reviews/final.json") {
  const artifact = {
    kind: "goalbuddy_final_review_v1",
    ...metadata,
  };
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(join(root, path), bytes);
  return {
    path,
    sha256: sha256(bytes),
  };
}

function exactReviewFixture(root, overrides = {}) {
  const identity = Object.freeze({ kind: "git_commit", value: head(root) });
  const metadata = {
    workflow_version: "omega-review@1",
    scope: { kind: "goalbuddy_review_scope_v1", patterns: ["src/**"] },
    base_identity: identity,
    reviewed_identity: identity,
    completeness_status: "complete",
    decision: "complete",
    unresolved_blocking_findings: [],
    ...overrides,
  };
  const artifact = writeReviewArtifact(root, metadata);
  const {
    decision: _decision,
    unresolved_blocking_findings: _unresolvedBlockingFindings,
    ...reviewMetadata
  } = metadata;
  return {
    completionDisposition: "exact",
    acceptedDeviations: [],
    deviationAcceptance: null,
    requiredReviewPaths: ["src/widget.mjs"],
    finalReview: {
      status: "complete",
      artifact,
      ...reviewMetadata,
    },
  };
}

function acceptanceEvidence(deviations, {
  requiredReply = null,
  taskId = "T009",
  replyIndex = 0,
  boardPath = "docs/goals/example/state.yaml",
} = {}) {
  const digest = deviationSetSha256(deviations);
  const phrase = requiredReply ?? `approve GoalBuddy deviation set ${digest}`;
  const phraseDigest = sha256(phrase);
  const replies = [];
  replies[replyIndex] = {
    wait_board_digest: "a".repeat(64),
    required_reply_sha256: phraseDigest,
    reply_sha256: phraseDigest,
    exact_match: true,
    wait_receipt: {
      result: "blocked",
      task_id: taskId,
      board_path: boardPath,
      waiting_for_user_approval: true,
      required_reply: phrase,
      blocked_reason: "Owner approval is required.",
      summary: "Waited for exact deviation-set approval.",
    },
  };
  return {
    acceptance: {
      kind: "goalbuddy_deviation_acceptance_v1",
      accepted_by: "owner",
      task_id: taskId,
      reply_index: replyIndex,
      deviation_set_sha256: digest,
    },
    tasks: [{
      id: taskId,
      transition_evidence: { exact_human_replies: replies },
    }],
  };
}

test("canonical accepted-deviation digest preserves order and validates exact owner evidence", () => {
  const root = makeRepository();
  try {
  const first = {
    requirement_id: "coverage",
    requirement: "Cover the public boundary.",
    observed_shortfall: "One platform is unavailable.",
    reason: "The owner accepts the platform omission.",
    evidence: ["reports/platform.md"],
  };
  const deviations = [first, EXACT_REVIEW_DEVIATION];
  const { acceptance, tasks } = acceptanceEvidence(deviations);

  const validated = validateAcceptedDeviations(deviations);
  assert.equal(validated.length, 2);
  assert.equal(deviationSetSha256(deviations), acceptance.deviation_set_sha256);
  assert.deepEqual(validateDeviationAcceptance(acceptance, {
    acceptedDeviations: deviations,
    tasks,
    boardPath: "docs/goals/example/state.yaml",
    root,
  }), acceptance);
  assert.notEqual(deviationSetSha256([...deviations].reverse()), acceptance.deviation_set_sha256);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("deviation acceptance rejects mutation, reordering, and an unrelated exact reply", () => {
  const root = makeRepository();
  try {
  const deviations = [{
    requirement_id: "coverage",
    requirement: "Cover the public boundary.",
    observed_shortfall: "One platform is unavailable.",
    reason: "The owner accepts the platform omission.",
    evidence: ["reports/platform.md"],
  }, EXACT_REVIEW_DEVIATION];
  const { acceptance, tasks } = acceptanceEvidence(deviations);

  assert.throws(() => validateDeviationAcceptance(acceptance, {
    acceptedDeviations: [...deviations].reverse(),
    tasks,
    boardPath: "docs/goals/example/state.yaml",
    root,
  }), /complete current accepted_deviations set/);
  assert.throws(() => validateDeviationAcceptance(acceptance, {
    acceptedDeviations: [{ ...deviations[0], reason: "Mutated." }, deviations[1]],
    tasks,
    boardPath: "docs/goals/example/state.yaml",
    root,
  }), /complete current accepted_deviations set/);

  const unrelated = acceptanceEvidence(deviations, { requiredReply: "approve something else" });
  assert.throws(() => validateDeviationAcceptance(acceptance, {
    acceptedDeviations: deviations,
    tasks: unrelated.tasks,
    boardPath: "docs/goals/example/state.yaml",
    root,
  }), /exact required owner reply/);
  assert.throws(() => validateDeviationAcceptance(acceptance, {
    acceptedDeviations: deviations,
    tasks,
    boardPath: "docs/goals/other/state.yaml",
    root,
  }), /current board/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete final review loads exact artifact bytes and validates current clean Git identity", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    const result = validateFinalReviewContract({ root, ...fixture, required: true });
    assert.equal(result.completion_disposition, "exact");
    assert.deepEqual(result.current_identity, fixture.finalReview.reviewed_identity);
    assert.equal(result.artifact.kind, "goalbuddy_final_review_v1");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("review artifact rejects byte-digest and duplicated-metadata mismatches", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    assert.throws(() => validateFinalReviewContract({
      root,
      ...fixture,
      finalReview: {
        ...fixture.finalReview,
        artifact: { ...fixture.finalReview.artifact, sha256: "0".repeat(64) },
      },
    }), /sha256 does not match/);

    assert.throws(() => validateFinalReviewContract({
      root,
      ...fixture,
      finalReview: { ...fixture.finalReview, workflow_version: "different@2" },
    }), /does not exactly match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("safe artifact loading rejects symlinks and closed artifact schema rejects extra keys", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    symlinkSync("final.json", join(root, "reviews", "linked.json"));
    assert.throws(() => loadFinalReviewArtifact({
      root,
      artifact: {
        path: "reviews/linked.json",
        sha256: fixture.finalReview.artifact.sha256,
      },
    }), /symlink/);

    const artifact = JSON.parse(readFileSync(join(root, "reviews", "final.json"), "utf8"));
    artifact.extra = true;
    const binding = writeReviewArtifact(root, artifact, "reviews/extra.json");
    assert.throws(() => loadFinalReviewArtifact({ root, artifact: binding }), /unexpected \[extra\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale reviewed Git commit is rejected after the scoped product changes", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 2;\n");
    execFileSync("git", ["add", "src/widget.mjs"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "change product"], { cwd: root });
    assert.throws(() => validateFinalReviewContract({ root, ...fixture }), /stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale dirty-snapshot identity is rejected when scoped bytes mutate", () => {
  const root = makeRepository();
  try {
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 2;\n");
    const scope = { kind: "goalbuddy_review_scope_v1", patterns: ["src/**"] };
    const identity = scopedContentIdentity({ root, scope });
    const fixture = exactReviewFixture(root, {
      scope,
      reviewed_identity: identity,
    });
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 3;\n");
    assert.throws(() => validateFinalReviewContract({ root, ...fixture }), /stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete review rejects incomplete decisions, wrong closed scope, and unresolved blockers", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    assert.throws(() => validateFinalReview({
      ...fixture.finalReview,
      completeness_status: "partial",
    }), /completeness_status must be complete/);
    const unsafeArtifact = {
      kind: "goalbuddy_final_review_v1",
      workflow_version: fixture.finalReview.workflow_version,
      scope: { kind: "goalbuddy_review_scope_v1", patterns: ["src/**/*.mjs"] },
      base_identity: fixture.finalReview.base_identity,
      reviewed_identity: fixture.finalReview.reviewed_identity,
      completeness_status: "complete",
      decision: "complete",
      unresolved_blocking_findings: [],
    };
    assert.throws(() => validateFinalReviewArtifact(unsafeArtifact, root), /Unsafe scoped identity path|bounded terminal/);
    const incompleteArtifact = {
      ...unsafeArtifact,
      scope: fixture.finalReview.scope,
      decision: "reject",
    };
    assert.throws(() => validateFinalReviewArtifact(incompleteArtifact, root), /decision must be complete/);
    assert.throws(() => validateFinalReviewArtifact({
      ...incompleteArtifact,
      decision: "complete",
      unresolved_blocking_findings: ["Finding remains."],
    }, root), /must be an empty array/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("complete review scope must cover every externally required product path", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root, {
      scope: {
        kind: "goalbuddy_review_scope_v1",
        patterns: ["missing-never-reviewed.txt"],
      },
    });
    assert.throws(() => validateFinalReviewContract({
      root,
      ...fixture,
      requiredReviewPaths: ["src/widget.mjs"],
    }), /does not cover required product paths: src\/widget\.mjs/);
    assert.equal(validateFinalReviewContract({
      root,
      ...fixture,
      requiredReviewPaths: [],
    }).completion_disposition, "exact");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted exact-final-review deviation binds the same whole-set approval", () => {
  const root = makeRepository();
  try {
    const deviations = [EXACT_REVIEW_DEVIATION];
    const { acceptance, tasks } = acceptanceEvidence(deviations);
    const result = validateFinalReviewContract({
      root,
      completionDisposition: "accepted_deviation",
      acceptedDeviations: deviations,
      deviationAcceptance: acceptance,
      tasks,
      boardPath: "docs/goals/example/state.yaml",
      finalReview: {
        status: "accepted_deviation",
        requirement_id: "exact-final-review",
        deviation_set_sha256: acceptance.deviation_set_sha256,
        observed_artifact: null,
      },
      required: true,
    });
    assert.equal(result.completion_disposition, "accepted_deviation");

    assert.throws(() => validateFinalReviewContract({
      root,
      completionDisposition: "accepted_deviation",
      acceptedDeviations: deviations,
      deviationAcceptance: acceptance,
      tasks,
      boardPath: "docs/goals/example/state.yaml",
      finalReview: {
        status: "accepted_deviation",
        requirement_id: "exact-final-review",
        deviation_set_sha256: "f".repeat(64),
        observed_artifact: null,
      },
    }), /same exact-final-review deviation set digest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted product deviations retain an exact complete final review", () => {
  const root = makeRepository();
  try {
    const deviations = [{
      requirement_id: "platform-coverage",
      requirement: "Exercise every supported platform.",
      observed_shortfall: "One unavailable platform was not exercised.",
      reason: "The owner accepts this bounded omission.",
      evidence: ["reviews/platform-gap.md"],
    }];
    const { acceptance, tasks } = acceptanceEvidence(deviations);
    const fixture = exactReviewFixture(root);
    const result = validateFinalReviewContract({
      root,
      completionDisposition: "accepted_deviation",
      acceptedDeviations: deviations,
      deviationAcceptance: acceptance,
      tasks,
      boardPath: "docs/goals/example/state.yaml",
      requiredReviewPaths: fixture.requiredReviewPaths,
      finalReview: fixture.finalReview,
    });
    assert.equal(result.completion_disposition, "accepted_deviation");
    assert.equal(result.final_review.status, "complete");
    assert.deepEqual(result.current_identity, fixture.finalReview.reviewed_identity);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted-deviation branch requires exactly one exact-final-review requirement", () => {
  const root = makeRepository();
  try {
    const deviations = [{
      ...EXACT_REVIEW_DEVIATION,
      requirement_id: "different-requirement",
    }];
    const { acceptance, tasks } = acceptanceEvidence(deviations);
    assert.throws(() => validateFinalReviewContract({
      root,
      completionDisposition: "accepted_deviation",
      acceptedDeviations: deviations,
      deviationAcceptance: acceptance,
      tasks,
      boardPath: "docs/goals/example/state.yaml",
      finalReview: {
        status: "accepted_deviation",
        requirement_id: "exact-final-review",
        deviation_set_sha256: acceptance.deviation_set_sha256,
        observed_artifact: null,
      },
    }), /exactly one exact-final-review deviation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted exact-final-review observed artifact uses a runtime-derived failure classification", () => {
  const root = makeRepository();
  try {
    const deviations = [EXACT_REVIEW_DEVIATION];
    const { acceptance, tasks } = acceptanceEvidence(deviations);
    const fixture = exactReviewFixture(root);
    writeFileSync(join(root, "src", "widget.mjs"), "export const widget = 2;\n");
    const observedArtifact = {
      ...fixture.finalReview.artifact,
      observed_failure: "stale_identity",
    };
    const base = {
      root,
      completionDisposition: "accepted_deviation",
      acceptedDeviations: deviations,
      deviationAcceptance: acceptance,
      tasks,
      boardPath: "docs/goals/example/state.yaml",
      requiredReviewPaths: ["src/widget.mjs"],
      finalReview: {
        status: "accepted_deviation",
        requirement_id: "exact-final-review",
        deviation_set_sha256: acceptance.deviation_set_sha256,
        observed_artifact: observedArtifact,
      },
    };
    assert.equal(validateFinalReviewContract(base).final_review.status, "accepted_deviation");
    assert.throws(() => validateFinalReviewContract({
      ...base,
      finalReview: {
        ...base.finalReview,
        observed_artifact: {
          ...observedArtifact,
          observed_failure: "incomplete_review",
        },
      },
    }), /runtime-derived classification stale_identity/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("immediate identity recapture uses the injectable seam and rejects its stale result", () => {
  const root = makeRepository();
  try {
    const fixture = exactReviewFixture(root);
    let calls = 0;
    const result = validateFinalReviewContract({
      root,
      ...fixture,
      captureCurrentIdentity(input) {
        calls += 1;
        assert.equal(input.scope.kind, "goalbuddy_review_scope_v1");
        return fixture.finalReview.reviewed_identity;
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.current_identity.value, head(root));

    assert.throws(() => validateFinalReviewContract({
      root,
      ...fixture,
      captureCurrentIdentity() {
        return { kind: "content_sha256", value: "9".repeat(64) };
      },
    }), /stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prospective-only contract leaves absent historical fields untouched and rejects partial or extra-key contracts", () => {
  assert.equal(validateFinalReviewContract({}), null);
  assert.throws(() => validateFinalReviewContract({
    completionDisposition: "exact",
  }), /supplied together/);
  assert.throws(() => validateAcceptedDeviations([{
    ...EXACT_REVIEW_DEVIATION,
    extra: true,
  }]), /unexpected \[extra\]/);
  assert.throws(() => validateFinalReview({
    status: "accepted_deviation",
    requirement_id: "exact-final-review",
    deviation_set_sha256: "a".repeat(64),
    observed_artifact: null,
    extra: true,
  }), /unexpected \[extra\]/);
});
