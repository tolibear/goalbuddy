import { createHash } from "node:crypto";
import {
  canonicalJson,
  canonicalJsonSha256,
  normalizeContainedArtifactPath,
  openContainedArtifact,
  resolveArtifactRoots,
} from "./receipt-provenance.mjs";
import { currentArtifactIdentity } from "./current-artifact-identity.mjs";
import {
  compileScopedIdentityScope,
  matchesPattern,
  normalizeRepositoryPath,
  repositoryRoot,
} from "./dispatch-scope-manifest.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^T\d{3}$/;
const IDENTITY_KINDS = new Set(["git_commit", "content_sha256"]);
const OBSERVED_FAILURES = new Set([
  "stale_identity",
  "incomplete_scope",
  "incomplete_review",
  "unresolved_blockers",
  "invalid_schema",
]);

export const EXACT_FINAL_REVIEW_REQUIREMENT_ID = "exact-final-review";

export function validateAcceptedDeviations(value) {
  if (!Array.isArray(value)) throw new Error("accepted_deviations must be an array.");
  const seen = new Set();
  return Object.freeze(value.map((entry, index) => {
    const label = `accepted_deviations[${index}]`;
    assertClosedObject(entry, [
      "evidence",
      "observed_shortfall",
      "reason",
      "requirement",
      "requirement_id",
    ], label);
    for (const key of ["requirement_id", "requirement", "observed_shortfall", "reason"]) {
      assertNonemptyString(entry[key], `${label}.${key}`);
    }
    if (seen.has(entry.requirement_id)) {
      throw new Error(`accepted_deviations requirement_id must be unique: ${entry.requirement_id}.`);
    }
    seen.add(entry.requirement_id);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      throw new Error(`${label}.evidence must be a nonempty array.`);
    }
    entry.evidence.forEach((item, evidenceIndex) => {
      assertNonemptyString(item, `${label}.evidence[${evidenceIndex}]`);
    });
    return freezeJsonValue(entry);
  }));
}

export function deviationSetSha256(value) {
  return canonicalJsonSha256(validateAcceptedDeviations(value));
}

export function validateDeviationAcceptance(value, {
  acceptedDeviations,
  tasks,
  boardPath,
  root,
} = {}) {
  const acceptance = validateDeviationAcceptanceShape(value);
  const deviations = validateAcceptedDeviations(acceptedDeviations);
  const digest = canonicalJsonSha256(deviations);
  if (acceptance.deviation_set_sha256 !== digest) {
    throw new Error("deviation_acceptance does not bind the complete current accepted_deviations set.");
  }

  const reply = locateExactHumanReply(tasks, acceptance.task_id, acceptance.reply_index);
  const requiredReply = `approve GoalBuddy deviation set ${digest}`;
  if (reply.wait_receipt?.required_reply !== requiredReply) {
    throw new Error("deviation_acceptance does not locate the exact required owner reply.");
  }
  const replyDigest = sha256(requiredReply);
  assertSha256(reply.wait_board_digest, "deviation_acceptance reply wait_board_digest");
  if (reply.required_reply_sha256 !== replyDigest
      || reply.reply_sha256 !== replyDigest
      || reply.exact_match !== true) {
    throw new Error("deviation_acceptance exact-human reply hashes or exact-match evidence are invalid.");
  }
  if (reply.wait_receipt?.task_id !== acceptance.task_id
      || reply.wait_receipt?.result !== "blocked"
      || reply.wait_receipt?.waiting_for_user_approval !== true) {
    throw new Error("deviation_acceptance wait_receipt is not the persisted exact-human wait for its task.");
  }
  if (!sameBoardIdentity(reply.wait_receipt?.board_path, boardPath, root)) {
    throw new Error("deviation_acceptance wait_receipt does not identify the current board.");
  }
  return acceptance;
}

export function validateDeviationAcceptanceShape(value) {
  assertClosedObject(value, [
    "accepted_by",
    "deviation_set_sha256",
    "kind",
    "reply_index",
    "task_id",
  ], "deviation_acceptance");
  if (value.kind !== "goalbuddy_deviation_acceptance_v1") {
    throw new Error("deviation_acceptance.kind must be goalbuddy_deviation_acceptance_v1.");
  }
  if (value.accepted_by !== "owner") {
    throw new Error("deviation_acceptance.accepted_by must be owner.");
  }
  if (!TASK_ID.test(value.task_id)) {
    throw new Error("deviation_acceptance.task_id must be T###.");
  }
  if (!Number.isSafeInteger(value.reply_index) || value.reply_index < 0) {
    throw new Error("deviation_acceptance.reply_index must be a nonnegative safe integer.");
  }
  assertSha256(value.deviation_set_sha256, "deviation_acceptance.deviation_set_sha256");
  return freezeJsonValue(value);
}

export function validateCompletionFieldShape({
  completionDisposition,
  acceptedDeviations,
  deviationAcceptance,
  finalReview,
}) {
  const deviations = validateAcceptedDeviations(acceptedDeviations);
  const review = validateFinalReview(finalReview);
  if (completionDisposition === "exact") {
    if (deviations.length !== 0 || deviationAcceptance !== null) {
      throw new Error("Exact completion requires an empty deviation set and null deviation_acceptance.");
    }
    if (review.status !== "complete") {
      throw new Error("Exact completion requires a complete final_review.");
    }
    return Object.freeze({
      completion_disposition: "exact",
      accepted_deviations: deviations,
      deviation_acceptance: null,
      final_review: review,
    });
  }
  if (completionDisposition !== "accepted_deviation") {
    throw new Error("completion_disposition must be exact or accepted_deviation.");
  }
  if (deviations.length === 0 || deviationAcceptance === null) {
    throw new Error("accepted_deviation completion requires a nonempty set and deviation_acceptance.");
  }
  const acceptance = validateDeviationAcceptanceShape(deviationAcceptance);
  const digest = canonicalJsonSha256(deviations);
  if (acceptance.deviation_set_sha256 !== digest) {
    throw new Error("deviation_acceptance does not bind the complete current accepted_deviations set.");
  }
  const exactReviewDeviations = deviations.filter(
    (entry) => entry.requirement_id === EXACT_FINAL_REVIEW_REQUIREMENT_ID,
  );
  if (review.status === "complete") {
    if (exactReviewDeviations.length !== 0) {
      throw new Error("A complete final_review cannot accompany an accepted exact-final-review deviation.");
    }
  } else {
    if (exactReviewDeviations.length !== 1) {
      throw new Error("The accepted_deviation final_review branch requires exactly one exact-final-review deviation.");
    }
    if (review.requirement_id !== EXACT_FINAL_REVIEW_REQUIREMENT_ID
        || review.deviation_set_sha256 !== acceptance.deviation_set_sha256) {
      throw new Error("accepted_deviation final_review must bind the same exact-final-review deviation set digest.");
    }
  }
  return Object.freeze({
    completion_disposition: "accepted_deviation",
    accepted_deviations: deviations,
    deviation_acceptance: acceptance,
    final_review: review,
  });
}

export function locateExactHumanReply(tasks, taskId, replyIndex) {
  if (!Array.isArray(tasks)) throw new Error("Persisted board tasks must be an array.");
  const matches = tasks.filter((task) => task?.id === taskId);
  if (matches.length !== 1) {
    throw new Error(`deviation_acceptance must locate exactly one persisted task ${taskId}.`);
  }
  const replies = matches[0]?.transition_evidence?.exact_human_replies;
  if (!Array.isArray(replies) || !Object.hasOwn(replies, replyIndex)) {
    throw new Error(`deviation_acceptance reply_index ${replyIndex} does not exist on task ${taskId}.`);
  }
  const reply = replies[replyIndex];
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) {
    throw new Error("deviation_acceptance located malformed exact-human reply evidence.");
  }
  return reply;
}

export function validateFinalReview(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("final_review must be an object.");
  }
  if (value.status === "complete") return validateCompleteFinalReview(value);
  if (value.status === "accepted_deviation") return validateAcceptedDeviationFinalReview(value);
  throw new Error("final_review.status must be complete or accepted_deviation.");
}

export function loadFinalReviewArtifact({ root, artifact }) {
  const repository = repositoryRoot(root);
  const binding = validateArtifactBinding(artifact, "final_review.artifact");
  const opened = openContainedArtifact({
    roots: resolveArtifactRoots(repository),
    root: "repository",
    path: binding.path,
  });
  if (opened.sha256 !== binding.sha256) {
    throw new Error("final_review.artifact sha256 does not match the exact file bytes.");
  }
  let parsed;
  try {
    parsed = JSON.parse(opened.bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`final_review.artifact must contain valid JSON: ${error.message}`);
  }
  return validateFinalReviewArtifact(parsed, repository);
}

export function validateFinalReviewArtifact(value, root) {
  assertClosedObject(value, [
    "base_identity",
    "completeness_status",
    "decision",
    "kind",
    "reviewed_identity",
    "scope",
    "unresolved_blocking_findings",
    "workflow_version",
  ], "goalbuddy_final_review_v1 artifact");
  if (value.kind !== "goalbuddy_final_review_v1") {
    throw new Error("Final-review artifact kind must be goalbuddy_final_review_v1.");
  }
  assertNonemptyString(value.workflow_version, "Final-review artifact workflow_version");
  const scope = validateReviewScope(value.scope, root);
  const baseIdentity = validateIdentity(value.base_identity, "Final-review artifact base_identity");
  const reviewedIdentity = validateIdentity(value.reviewed_identity, "Final-review artifact reviewed_identity");
  if (value.completeness_status !== "complete") {
    throw new Error("Final-review artifact completeness_status must be complete.");
  }
  if (value.decision !== "complete") {
    throw new Error("Final-review artifact decision must be complete.");
  }
  assertEmptyBlockingFindings(value.unresolved_blocking_findings, "Final-review artifact");
  return Object.freeze({
    ...value,
    scope,
    base_identity: baseIdentity,
    reviewed_identity: reviewedIdentity,
    unresolved_blocking_findings: Object.freeze([]),
  });
}

export function validateFinalReviewContract({
  root,
  completionDisposition,
  acceptedDeviations,
  deviationAcceptance,
  finalReview,
  tasks,
  boardPath,
  requiredReviewPaths,
  captureCurrentIdentity = currentArtifactIdentity,
  required = false,
}) {
  const fields = [completionDisposition, acceptedDeviations, deviationAcceptance, finalReview];
  const absent = fields.every((field) => field === undefined);
  if (absent && !required) return null;
  if (fields.some((field) => field === undefined)) {
    throw new Error("Prospective completion fields must be supplied together.");
  }
  if (typeof captureCurrentIdentity !== "function") {
    throw new Error("captureCurrentIdentity must be a function.");
  }

  const shape = validateCompletionFieldShape({
    completionDisposition,
    acceptedDeviations,
    deviationAcceptance,
    finalReview,
  });
  const deviations = shape.accepted_deviations;
  const review = shape.final_review;

  if (completionDisposition === "exact") {
    const completeReview = validateCompleteReviewEvidence({
      root,
      review,
      requiredReviewPaths,
      captureCurrentIdentity,
    });
    return Object.freeze({
      completion_disposition: "exact",
      accepted_deviations: deviations,
      deviation_acceptance: null,
      final_review: review,
      ...completeReview,
    });
  }

  const acceptance = validateDeviationAcceptance(deviationAcceptance, {
    acceptedDeviations: deviations,
    tasks,
    boardPath,
    root,
  });
  if (review.status === "complete") {
    const completeReview = validateCompleteReviewEvidence({
      root,
      review,
      requiredReviewPaths,
      captureCurrentIdentity,
    });
    return Object.freeze({
      completion_disposition: "accepted_deviation",
      accepted_deviations: deviations,
      deviation_acceptance: acceptance,
      final_review: review,
      ...completeReview,
    });
  }
  if (review.observed_artifact !== null) {
    verifyObservedArtifact(root, review.observed_artifact, {
      requiredReviewPaths,
      captureCurrentIdentity,
    });
  }
  return Object.freeze({
    completion_disposition: "accepted_deviation",
    accepted_deviations: deviations,
    deviation_acceptance: acceptance,
    final_review: review,
  });
}

function validateCompleteReviewEvidence({
  root,
  review,
  requiredReviewPaths,
  captureCurrentIdentity,
}) {
  const repository = repositoryRoot(root);
  const artifact = loadFinalReviewArtifact({ root: repository, artifact: review.artifact });
  assertRepeatedReviewFieldsEqual(review, artifact);
  const requiredPaths = validateRequiredReviewPaths(repository, requiredReviewPaths, { required: true });
  assertReviewScopeCoverage(artifact.scope, requiredPaths);
  const currentIdentity = validateIdentity(captureCurrentIdentity({
    root: repository,
    scope: review.scope,
    reviewedCommit: review.reviewed_identity.kind === "git_commit"
      ? review.reviewed_identity.value
      : "",
    reviewedIdentity: review.reviewed_identity,
  }), "Current scoped identity");
  if (!jsonEqual(currentIdentity, review.reviewed_identity)) {
    throw new Error("final_review.reviewed_identity is stale for the current scoped repository bytes.");
  }
  return Object.freeze({
    artifact,
    current_identity: currentIdentity,
    required_review_paths: requiredPaths,
  });
}

function validateCompleteFinalReview(value) {
  assertClosedObject(value, [
    "artifact",
    "base_identity",
    "completeness_status",
    "reviewed_identity",
    "scope",
    "status",
    "workflow_version",
  ], "complete final_review");
  validateArtifactBinding(value.artifact, "final_review.artifact");
  assertNonemptyString(value.workflow_version, "final_review.workflow_version");
  validateIdentity(value.base_identity, "final_review.base_identity");
  validateIdentity(value.reviewed_identity, "final_review.reviewed_identity");
  if (value.scope?.kind !== "goalbuddy_review_scope_v1" || !Array.isArray(value.scope.patterns)) {
    throw new Error("final_review.scope must be a goalbuddy_review_scope_v1 object.");
  }
  assertClosedObject(value.scope, ["kind", "patterns"], "final_review.scope");
  if (value.completeness_status !== "complete") {
    throw new Error("final_review.completeness_status must be complete.");
  }
  return freezeJsonValue(value);
}

function validateAcceptedDeviationFinalReview(value) {
  assertClosedObject(value, [
    "deviation_set_sha256",
    "observed_artifact",
    "requirement_id",
    "status",
  ], "accepted_deviation final_review");
  if (value.requirement_id !== EXACT_FINAL_REVIEW_REQUIREMENT_ID) {
    throw new Error("accepted_deviation final_review requirement_id must be exact-final-review.");
  }
  assertSha256(value.deviation_set_sha256, "final_review.deviation_set_sha256");
  if (value.observed_artifact !== null) {
    assertClosedObject(value.observed_artifact, [
      "observed_failure",
      "path",
      "sha256",
    ], "final_review.observed_artifact");
    validateArtifactBinding(value.observed_artifact, "final_review.observed_artifact", {
      extraKeys: ["observed_failure"],
    });
    if (!OBSERVED_FAILURES.has(value.observed_artifact.observed_failure)) {
      throw new Error("final_review.observed_artifact.observed_failure is invalid.");
    }
  }
  return freezeJsonValue(value);
}

function validateReviewScope(value, root) {
  assertClosedObject(value, ["kind", "patterns"], "final-review scope");
  if (value.kind !== "goalbuddy_review_scope_v1") {
    throw new Error("Final-review scope kind must be goalbuddy_review_scope_v1.");
  }
  const compiled = compileScopedIdentityScope(root, value.patterns);
  return Object.freeze({ kind: value.kind, patterns: Object.freeze([...compiled.patterns]) });
}

function validateIdentity(value, label) {
  assertClosedObject(value, ["kind", "value"], label);
  if (!IDENTITY_KINDS.has(value.kind)) throw new Error(`${label}.kind is invalid.`);
  const pattern = value.kind === "git_commit" ? /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/ : SHA256;
  if (typeof value.value !== "string" || !pattern.test(value.value)) {
    throw new Error(`${label}.value is invalid for ${value.kind}.`);
  }
  return Object.freeze({ kind: value.kind, value: value.value });
}

function validateArtifactBinding(value, label, { extraKeys = [] } = {}) {
  assertClosedObject(value, ["path", "sha256", ...extraKeys], label);
  const path = normalizeContainedArtifactPath(value.path);
  assertSha256(value.sha256, `${label}.sha256`);
  return Object.freeze({ path, sha256: value.sha256 });
}

function verifyObservedArtifact(root, artifact, {
  requiredReviewPaths,
  captureCurrentIdentity,
}) {
  const repository = repositoryRoot(root);
  const opened = openContainedArtifact({
    roots: resolveArtifactRoots(repository),
    root: "repository",
    path: artifact.path,
  });
  if (opened.sha256 !== artifact.sha256) {
    throw new Error("final_review.observed_artifact sha256 does not match the exact file bytes.");
  }
  const observedFailure = deriveObservedFailure({
    repository,
    bytes: opened.bytes,
    requiredReviewPaths,
    captureCurrentIdentity,
  });
  if (observedFailure === null) {
    throw new Error("final_review.observed_artifact is a usable exact-current complete review and cannot support an exact-final-review deviation.");
  }
  if (artifact.observed_failure !== observedFailure) {
    throw new Error(`final_review.observed_artifact.observed_failure must equal the runtime-derived classification ${observedFailure}.`);
  }
}

function deriveObservedFailure({
  repository,
  bytes,
  requiredReviewPaths,
  captureCurrentIdentity,
}) {
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    return "invalid_schema";
  }

  try {
    assertClosedObject(value, [
      "base_identity",
      "completeness_status",
      "decision",
      "kind",
      "reviewed_identity",
      "scope",
      "unresolved_blocking_findings",
      "workflow_version",
    ], "observed goalbuddy_final_review_v1 artifact");
    if (value.kind !== "goalbuddy_final_review_v1") throw new Error("wrong kind");
    assertNonemptyString(value.workflow_version, "Observed final-review workflow_version");
    validateIdentity(value.base_identity, "Observed final-review base_identity");
    validateIdentity(value.reviewed_identity, "Observed final-review reviewed_identity");
    assertNonemptyString(value.completeness_status, "Observed final-review completeness_status");
    assertNonemptyString(value.decision, "Observed final-review decision");
    if (!Array.isArray(value.unresolved_blocking_findings)) throw new Error("blocking findings must be an array");
  } catch {
    return "invalid_schema";
  }

  if (value.completeness_status !== "complete" || value.decision !== "complete") {
    return "incomplete_review";
  }
  if (value.unresolved_blocking_findings.length > 0) return "unresolved_blockers";

  let scope;
  try {
    scope = validateReviewScope(value.scope, repository);
    const requiredPaths = validateRequiredReviewPaths(repository, requiredReviewPaths, { required: false });
    assertReviewScopeCoverage(scope, requiredPaths);
  } catch {
    return "incomplete_scope";
  }

  try {
    const currentIdentity = validateIdentity(captureCurrentIdentity({
      root: repository,
      scope,
      reviewedCommit: value.reviewed_identity.kind === "git_commit"
        ? value.reviewed_identity.value
        : "",
      reviewedIdentity: value.reviewed_identity,
    }), "Observed current scoped identity");
    if (!jsonEqual(currentIdentity, value.reviewed_identity)) return "stale_identity";
  } catch {
    return "stale_identity";
  }
  return null;
}

function validateRequiredReviewPaths(root, value, { required }) {
  if (!Array.isArray(value)) {
    if (!required && value === undefined) return Object.freeze([]);
    throw new Error("requiredReviewPaths must be an array of canonical repository-relative exact paths.");
  }
  const normalized = value.map((path, index) => {
    if (typeof path !== "string"
        || path.length === 0
        || path !== path.trim()
        || path.includes("\\")
        || /[\u0000-\u001f\u007f]/.test(path)
        || /[*?[\]]/.test(path)) {
      throw new Error(`requiredReviewPaths[${index}] must be a canonical repository-relative exact path.`);
    }
    const canonical = normalizeRepositoryPath(root, path);
    if (canonical !== path) {
      throw new Error(`requiredReviewPaths[${index}] must not use lexical aliases or symlinked ancestors.`);
    }
    return canonical;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("requiredReviewPaths must not contain duplicate paths.");
  }
  return Object.freeze([...normalized].sort());
}

function assertReviewScopeCoverage(scope, requiredPaths) {
  const uncovered = requiredPaths.filter(
    (path) => !scope.patterns.some((pattern) => matchesPattern(path, pattern)),
  );
  if (uncovered.length > 0) {
    throw new Error(`final_review.scope does not cover required product paths: ${uncovered.join(", ")}.`);
  }
}

function assertRepeatedReviewFieldsEqual(review, artifact) {
  for (const key of [
    "workflow_version",
    "scope",
    "base_identity",
    "reviewed_identity",
    "completeness_status",
  ]) {
    if (!jsonEqual(review[key], artifact[key])) {
      throw new Error(`final_review.${key} does not exactly match the review artifact.`);
    }
  }
}

function assertEmptyBlockingFindings(value, label) {
  if (!Array.isArray(value) || value.length !== 0) {
    throw new Error(`${label}.unresolved_blocking_findings must be an empty array.`);
  }
}

function assertClosedObject(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const expected = [...expectedKeys].sort();
  const actual = Object.keys(value).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    const missing = expected.filter((key) => !actual.includes(key));
    const extra = actual.filter((key) => !expected.includes(key));
    throw new Error(`${label} keys must be exact; missing [${missing.join(", ")}], unexpected [${extra.join(", ")}].`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a nonempty string.`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be 64 lowercase hexadecimal characters.`);
  }
}

function jsonEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sameBoardIdentity(actual, expected, root) {
  if (typeof actual !== "string" || actual.trim() === ""
      || typeof expected !== "string" || expected.trim() === ""
      || typeof root !== "string" || root.trim() === "") {
    return false;
  }
  try {
    const repository = repositoryRoot(root);
    return normalizeRepositoryPath(repository, actual) === normalizeRepositoryPath(repository, expected);
  } catch {
    return false;
  }
}

function freezeJsonValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJsonValue));
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, freezeJsonValue(item)]),
  ));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
