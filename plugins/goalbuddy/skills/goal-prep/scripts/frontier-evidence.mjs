import { posix } from "node:path";
import { compileScopedIdentityScope } from "./dispatch-scope-manifest.mjs";
import {
  normalizeContainedArtifactPath,
  openContainedArtifact,
  resolveArtifactRoots,
} from "./receipt-provenance.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_IDENTITY = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const IDENTITY_KINDS = new Set(["git_commit", "content_sha256"]);
const AUTHORITATIVE_ROLES = new Set(["judge", "pm"]);

export function collectReceiptFrontierEvidence({
  goalRoot,
  taskType,
  taskId,
  boardPath,
  evidence,
}) {
  const result = {
    reviews: [],
    scope_anomalies: [],
    browser: [],
    decisions: [],
    drill_down: [],
  };
  if (!Array.isArray(evidence)) return result;

  let artifactRoots = null;
  const roots = () => {
    artifactRoots ||= resolveArtifactRoots(goalRoot);
    return artifactRoots;
  };
  const receiptSource = {
    kind: "stored_receipt",
    task_id: taskId,
    board_path: boardPath,
  };

  for (const item of evidence) {
    if (!isRecord(item) || !isFrontierEvidenceKind(item.kind)) continue;
    try {
      if (!AUTHORITATIVE_ROLES.has(taskType)) {
        throw new Error(`frontier evidence kind ${item.kind} requires a Judge or PM receipt`);
      }
      if (item.kind === "goalbuddy_review_evidence_v1") {
        collectReviewEvidence({ item, result, roots, receiptSource });
      } else if (item.kind === "goalbuddy_browser_evidence_v1") {
        collectBrowserEvidence({ item, result, roots, receiptSource });
      } else if (item.kind === "goalbuddy_product_decision_v1") {
        collectProductDecision({ item, result, roots, receiptSource, boardPath });
      }
    } catch (error) {
      result.scope_anomalies.push({
        kind: "frontier_evidence_invalid",
        status: "open",
        detail: publicEvidenceError(error),
        source: receiptSource,
      });
    }
  }
  return result;
}

function collectReviewEvidence({ item, result, roots, receiptSource }) {
  assertExactKeys(item, [
    "accepted_findings",
    "adjudication",
    "artifact",
    "diff_artifact",
    "findings",
    "identity",
    "kind",
    "reviewer",
    "round",
    "scope_anomalies",
    "scope_status",
    "selection",
    "status",
    "yield",
  ], item.kind);
  const artifact = verifyArtifact(item.artifact, roots());
  const artifactSource = {
    kind: "review_artifact",
    path: artifact.path,
    sha256: artifact.sha256,
  };
  assertNonemptyString(item.identity, "review identity");
  assertNonemptyString(item.reviewer, "review reviewer");
  assertNonemptyString(item.status, "review status");
  assertNonemptyString(item.scope_status, "review scope_status");
  assertNonemptyString(item.yield, "review yield");
  assertNonemptyString(item.selection, "review selection");
  assertNonemptyString(item.adjudication, "review adjudication");
  assertNonnegativeInteger(item.round, "review round", { positive: true });
  assertNonnegativeInteger(item.findings, "review findings");
  assertNonnegativeInteger(item.accepted_findings, "review accepted_findings");
  if (item.accepted_findings > item.findings) {
    throw new Error("review accepted_findings cannot exceed findings");
  }
  if (!Array.isArray(item.scope_anomalies)) {
    throw new Error("review scope_anomalies must be an array");
  }
  const anomalies = item.scope_anomalies.map((anomaly) => {
    assertExactKeys(anomaly, ["detail", "kind", "status"], "review scope anomaly");
    assertNonemptyString(anomaly.kind, "review scope anomaly kind");
    assertNonemptyString(anomaly.status, "review scope anomaly status");
    assertNonemptyString(anomaly.detail, "review scope anomaly detail");
    return { ...anomaly, source: receiptSource };
  });
  const diff = item.diff_artifact === null
    ? null
    : validateDiffArtifact(item.diff_artifact, roots());
  const review = {
    identity: item.identity,
    round: item.round,
    reviewer: item.reviewer,
    status: item.status,
    scope_status: item.scope_status,
    findings: item.findings,
    accepted_findings: item.accepted_findings,
    yield: item.yield,
    selection: item.selection,
    adjudication: item.adjudication,
    source: receiptSource,
  };
  const reviewDrillDown = {
    purpose: "full_independent_review",
    label: `${item.identity} full review`,
    source: artifactSource,
  };
  const diffDrillDown = diff
    ? {
        purpose: "full_product_diff",
        label: `${item.identity} reviewed diff`,
        source: diff.artifact_source,
      }
    : null;
  const diffIdentityDrillDown = diff
    ? {
        purpose: "reviewed_diff_identity",
        label: `${item.identity} reviewed diff identity`,
        source: {
          kind: "diff_identity",
          identity: `${diff.identity.kind}:${diff.identity.value}`,
          scope: diff.scope,
        },
      }
    : null;

  result.reviews.push(review);
  result.scope_anomalies.push(...anomalies);
  result.drill_down.push(reviewDrillDown);
  if (diffDrillDown) result.drill_down.push(diffDrillDown);
  if (diffIdentityDrillDown) result.drill_down.push(diffIdentityDrillDown);
}

function collectBrowserEvidence({ item, result, roots, receiptSource }) {
  assertExactKeys(item, [
    "decisive",
    "kind",
    "screenshot",
    "state",
    "summary",
    "verdict",
  ], item.kind);
  const screenshot = verifyArtifact(item.screenshot, roots());
  assertNonemptyString(item.state, "browser state");
  assertNonemptyString(item.verdict, "browser verdict");
  assertNonemptyString(item.summary, "browser summary");
  if (typeof item.decisive !== "boolean") throw new Error("browser decisive must be boolean");
  const source = {
    kind: "screenshot_artifact",
    path: screenshot.path,
    sha256: screenshot.sha256,
  };
  result.browser.push({
    state: item.state,
    verdict: item.verdict,
    decisive: item.decisive,
    summary: item.summary,
    source: receiptSource,
  });
  result.drill_down.push({
    purpose: "decisive_browser_evidence",
    label: item.state,
    source,
  });
}

function collectProductDecision({ item, result, roots, receiptSource, boardPath }) {
  assertExactKeys(item, ["decision", "id", "kind", "note", "status"], item.kind);
  assertNonemptyString(item.id, "product decision id");
  assertNonemptyString(item.status, "product decision status");
  assertNonemptyString(item.decision, "product decision");
  if (item.note !== null) {
    const notePath = normalizeContainedArtifactPath(item.note);
    const boardRoot = posix.dirname(normalizeContainedArtifactPath(boardPath));
    if (!notePath.startsWith(`${boardRoot}/notes/`) || notePath.endsWith("/")) {
      throw new Error("product decision note must be a board-local notes path");
    }
    const note = openContainedArtifact({ roots: roots(), root: "repository", path: notePath });
    result.drill_down.push({
      purpose: "product_decision_context",
      label: item.id,
      source: { kind: "plan_or_note", path: note.path },
    });
  }
  result.decisions.push({
    id: item.id,
    status: item.status,
    decision: item.decision,
    source: receiptSource,
  });
}

function verifyArtifact(value, roots) {
  assertExactKeys(value, ["path", "sha256"], "frontier artifact binding");
  const path = normalizeContainedArtifactPath(value.path);
  if (!SHA256.test(value.sha256 || "")) {
    throw new Error("frontier artifact sha256 must be 64 lowercase hex characters");
  }
  const artifact = openContainedArtifact({ roots, root: "repository", path });
  if (artifact.sha256 !== value.sha256) {
    throw new Error(`frontier artifact digest mismatch for ${path}`);
  }
  return artifact;
}

function validateDiffArtifact(value, roots) {
  assertExactKeys(value, ["identity", "path", "scope", "sha256"], "frontier diff artifact");
  const artifact = verifyArtifact({ path: value.path, sha256: value.sha256 }, roots);
  assertExactKeys(value.identity, ["kind", "value"], "frontier diff identity");
  if (!IDENTITY_KINDS.has(value.identity.kind)) {
    throw new Error("frontier diff identity kind is invalid");
  }
  const identityPattern = value.identity.kind === "git_commit" ? GIT_IDENTITY : SHA256;
  if (!identityPattern.test(value.identity.value || "")) {
    throw new Error("frontier diff identity value is invalid");
  }
  if (!Array.isArray(value.scope) || value.scope.length === 0) {
    throw new Error("frontier diff identity scope must be a nonempty string array");
  }
  for (const entry of value.scope) assertNonemptyString(entry, "frontier diff scope entry");
  const scope = compileScopedIdentityScope(roots.repository, value.scope);
  return {
    identity: { ...value.identity },
    scope: [...scope.patterns],
    artifact_source: {
      kind: "review_artifact",
      path: artifact.path,
      sha256: artifact.sha256,
    },
  };
}

function publicEvidenceError(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/requires a Judge or PM receipt/.test(message)) {
    return "Semantic frontier evidence requires a Judge or PM receipt.";
  }
  if (/sha256|digest mismatch|identity value/.test(message)) {
    return "Semantic frontier evidence has an invalid or stale digest binding.";
  }
  if (/does not exist/.test(message)) {
    return "Semantic frontier evidence references a missing artifact.";
  }
  if (/path|symlink|scope|artifact|note/.test(message)) {
    return "Semantic frontier evidence references an unsafe or invalid path.";
  }
  return "Semantic frontier evidence does not satisfy its closed schema.";
}

function assertExactKeys(value, expected, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length
    || actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} keys must be exact`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a nonempty string`);
  }
}

function assertNonnegativeInteger(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new Error(`${label} must be ${positive ? "a positive" : "a nonnegative"} integer`);
  }
}

function isFrontierEvidenceKind(value) {
  return [
    "goalbuddy_review_evidence_v1",
    "goalbuddy_browser_evidence_v1",
    "goalbuddy_product_decision_v1",
  ].includes(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
