import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const TASK_ID = /^T\d{3}$/;
const ROOT_KINDS = new Set(["repository", "git_common_dir"]);
const RECEIPT_TRANSPORTS = new Set(["git_local_report", "explicit_file"]);
const REPORT_TRANSPORTS = new Set(["ready", "unavailable", "not_applicable"]);
const DISPATCH_DISPOSITIONS = new Set(["accepted", "rejected", "not_applicable"]);
const CLOSEOUT_AUTHORITIES = new Set(["original_role", "pm_blocked_closeout"]);
const RETENTION_POLICIES = new Set(["cleanup_eligible", "retained"]);
const DISPATCH_HARNESSES = new Set(["codex", "claude-code"]);
const REJECTED_DISPATCH_CODES = new Set([
  "DISPATCH_SESSION_BIND_FAILED",
  "CODEX_SESSION_RESUME_FAILED",
  "DISPATCH_SCOPE_FAILED",
  "HARNESS_FAILED",
  "RECEIPT_IDENTITY_MISMATCH",
  "RECEIPT_MISSING",
  "RECEIPT_SCHEMA_INVALID",
]);

export function canonicalJson(value) {
  const ancestors = new Set();

  function encode(current, location) {
    if (current === null) return "null";
    if (typeof current === "string" || typeof current === "boolean") {
      return JSON.stringify(current);
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new Error(`Canonical JSON rejects non-finite numbers at ${location}.`);
      }
      return Object.is(current, -0) ? "-0" : JSON.stringify(current);
    }
    if (typeof current !== "object") {
      throw new Error(`Canonical JSON rejects ${typeof current} values at ${location}.`);
    }
    if (ancestors.has(current)) {
      throw new Error(`Canonical JSON rejects cyclic values at ${location}.`);
    }

    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        const encoded = [];
        for (let index = 0; index < current.length; index += 1) {
          if (!Object.hasOwn(current, index)) {
            throw new Error(`Canonical JSON rejects sparse arrays at ${location}[${index}].`);
          }
          encoded.push(encode(current[index], `${location}[${index}]`));
        }
        const extraKeys = Reflect.ownKeys(current).filter((key) => (
          key !== "length"
          && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= current.length)
        ));
        if (extraKeys.length > 0) {
          throw new Error(`Canonical JSON rejects arrays with extra own properties at ${location}.`);
        }
        return `[${encoded.join(",")}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`Canonical JSON rejects non-plain objects at ${location}.`);
      }
      if (Object.getOwnPropertySymbols(current).length > 0) {
        throw new Error(`Canonical JSON rejects symbol-keyed properties at ${location}.`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(current);
      const keys = Object.keys(current).sort();
      if (Reflect.ownKeys(descriptors).length !== keys.length) {
        throw new Error(`Canonical JSON rejects non-enumerable properties at ${location}.`);
      }
      return `{${keys.map((key) => {
        const descriptor = descriptors[key];
        if (!Object.hasOwn(descriptor, "value")) {
          throw new Error(`Canonical JSON rejects accessor properties at ${location}.${key}.`);
        }
        return `${JSON.stringify(key)}:${encode(descriptor.value, `${location}.${key}`)}`;
      }).join(",")}}`;
    } finally {
      ancestors.delete(current);
    }
  }

  return encode(value, "$");
}

export function canonicalJsonSha256(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function resolveArtifactRoots(cwd = process.cwd()) {
  const repository = gitPath(cwd, "--show-toplevel");
  const gitCommonDir = gitPath(cwd, "--git-common-dir");
  return Object.freeze({
    repository: realpathSync(repository),
    git_common_dir: realpathSync(gitCommonDir),
  });
}

export function createReceiptSourceContext({
  cwd = process.cwd(),
  statePath,
  taskId,
  admittedStateDigest,
}) {
  if (!TASK_ID.test(taskId || "")) throw new Error("Receipt source context taskId must be T###.");
  assertSha256(admittedStateDigest, "Receipt source context admittedStateDigest");
  const roots = resolveArtifactRoots(cwd);
  const state = realpathSync(resolve(statePath));
  assertContained(roots.repository, state);
  const boardPath = normalizeContainedArtifactPath(relative(roots.repository, state).split(sep).join("/"));
  const document = parseGoalStateText(readFileSync(state, "utf8"), { allowFallback: false });
  const task = document.tasks?.find((candidate) => candidate?.id === taskId);
  if (!task) throw new Error(`Receipt source context could not find task ${taskId}.`);
  const taskAuthority = trustedTaskAuthority(task);
  const workerSession = task.transition_evidence?.codex_worker_session ?? null;
  const activeGitDir = realpathSync(gitPath(cwd, "--git-dir"));
  assertContainedOrEqual(roots.git_common_dir, activeGitDir);
  return validateReceiptSourceContext({
    task_id: taskId,
    board_path: boardPath,
    admitted_state_digest: admittedStateDigest,
    digest_kind: "state_yaml_sha256",
    repository_root: roots.repository,
    git_common_dir: roots.git_common_dir,
    active_git_dir: activeGitDir,
    task_authority: taskAuthority,
    expected_dispatch_contract_sha256: workerSession?.dispatch_contract_sha256 ?? null,
    expected_session_binding: workerSession
      ? {
          session_id: workerSession.session_id,
          state_digest: admittedStateDigest,
        }
      : null,
    expected_brief: task.brief ?? null,
  });
}

export function validateReceiptSourceContext(value) {
  assertClosedObject(value, [
    "active_git_dir",
    "admitted_state_digest",
    "board_path",
    "digest_kind",
    "expected_brief",
    "expected_dispatch_contract_sha256",
    "expected_session_binding",
    "git_common_dir",
    "repository_root",
    "task_id",
    "task_authority",
  ], "receipt source context");
  if (!TASK_ID.test(value.task_id || "")) throw new Error("Receipt source context task_id must be T###.");
  const boardPath = normalizeContainedArtifactPath(value.board_path);
  assertSha256(value.admitted_state_digest, "Receipt source context admitted_state_digest");
  const taskAuthority = validateTaskAuthority(value.task_authority);
  const expectedContract = value.expected_dispatch_contract_sha256;
  if (expectedContract !== null) {
    assertSha256(expectedContract, "Receipt source context expected_dispatch_contract_sha256");
  }
  validateBriefBinding(value.expected_brief, "Receipt source context expected_brief");
  validateExpectedSessionBinding(value.expected_session_binding, value);
  if (value.digest_kind !== "state_yaml_sha256") {
    throw new Error("Receipt source context digest_kind must be state_yaml_sha256.");
  }
  const repositoryRoot = realpathSync(resolve(value.repository_root));
  const gitCommonDir = realpathSync(resolve(value.git_common_dir));
  const activeGitDir = realpathSync(resolve(value.active_git_dir));
  assertContainedOrEqual(gitCommonDir, activeGitDir);
  const board = realpathSync(resolve(repositoryRoot, ...boardPath.split("/")));
  assertContained(repositoryRoot, board);
  if (relative(repositoryRoot, board).split(sep).join("/") !== boardPath) {
    throw new Error("Receipt source context board_path must be canonical inside repository_root.");
  }
  return Object.freeze({
    ...value,
    board_path: boardPath,
    repository_root: repositoryRoot,
    git_common_dir: gitCommonDir,
    active_git_dir: activeGitDir,
    task_authority: taskAuthority,
  });
}

export function normalizeContainedArtifactPath(value) {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("Artifact path must be a nonempty canonical relative path.");
  }
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value) || /^[A-Za-z]:/.test(value)) {
    throw new Error(`Artifact path must not contain backslashes, control bytes, or drive syntax: ${JSON.stringify(value)}.`);
  }
  if (isAbsolute(value) || value.startsWith("/")) {
    throw new Error(`Artifact path must be relative: ${value}.`);
  }
  if (/[*?[\]{}]/.test(value)) {
    throw new Error(`Artifact path must be exact, not a glob: ${value}.`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Artifact path must not contain empty, dot, or traversal segments: ${value}.`);
  }
  return segments.join("/");
}

export function openContainedArtifact({ roots, root, path }) {
  if (!ROOT_KINDS.has(root)) throw new Error(`Unknown artifact root: ${JSON.stringify(root)}.`);
  if (!roots || typeof roots[root] !== "string") {
    throw new Error(`Artifact roots do not define ${root}.`);
  }
  const normalizedPath = normalizeContainedArtifactPath(path);
  const canonicalRoot = realpathSync(resolve(roots[root]));
  const absolute = resolve(canonicalRoot, ...normalizedPath.split("/"));
  assertContained(canonicalRoot, absolute);

  let current = canonicalRoot;
  const segments = normalizedPath.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    current = resolve(current, segments[index]);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Artifact does not exist: ${root}:${normalizedPath}.`);
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Artifact path must not contain symlinks: ${root}:${normalizedPath}.`);
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error(`Artifact ancestor is not a directory: ${root}:${normalizedPath}.`);
    }
    if (index === segments.length - 1 && !stat.isFile()) {
      throw new Error(`Artifact is not a regular file: ${root}:${normalizedPath}.`);
    }
  }

  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0),
    );
    const opened = fstatSync(descriptor);
    const named = lstatSync(absolute);
    if (!opened.isFile() || !named.isFile() || named.isSymbolicLink()) {
      throw new Error(`Artifact is not a regular file: ${root}:${normalizedPath}.`);
    }
    if (opened.dev !== named.dev || opened.ino !== named.ino) {
      throw new Error(`Artifact changed while it was being opened: ${root}:${normalizedPath}.`);
    }
    const canonical = realpathSync(absolute);
    assertContained(canonicalRoot, canonical);
    if (canonical !== absolute) {
      throw new Error(`Artifact path must not contain symlinks: ${root}:${normalizedPath}.`);
    }
    const before = fstatSync(descriptor);
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
      || namedAfter.isSymbolicLink()
      || !namedAfter.isFile()
    ) {
      throw new Error(`Artifact changed while it was being hashed: ${root}:${normalizedPath}.`);
    }
    return Object.freeze({
      root,
      path: normalizedPath,
      sha256: sha256(bytes),
      bytes,
    });
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error(`Artifact path must not contain symlinks: ${root}:${normalizedPath}.`);
    }
    if (error?.code === "ENOENT") {
      throw new Error(`Artifact does not exist: ${root}:${normalizedPath}.`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function artifactIdentity(openedArtifact) {
  return validateArtifactIdentity({
    root: openedArtifact?.root,
    path: openedArtifact?.path,
    sha256: openedArtifact?.sha256,
  });
}

export function validateArtifactIdentity(value, { retentionPolicy = false } = {}) {
  const expectedKeys = retentionPolicy
    ? ["path", "retention_policy", "root", "sha256"]
    : ["path", "root", "sha256"];
  assertClosedObject(value, expectedKeys, "artifact identity");
  if (!ROOT_KINDS.has(value.root)) throw new Error("Artifact identity root is invalid.");
  normalizeContainedArtifactPath(value.path);
  assertSha256(value.sha256, "Artifact identity sha256");
  if (retentionPolicy && !RETENTION_POLICIES.has(value.retention_policy)) {
    throw new Error("Receipt artifact retention_policy is invalid.");
  }
  return Object.freeze({ ...value });
}

export function createReceiptProvenance(fields) {
  return validateReceiptProvenance({
    kind: "goalbuddy_receipt_provenance_v1",
    ...fields,
    application_state: "applied",
  });
}

export function validateReceiptProvenance(value) {
  assertClosedObject(value, [
    "application_state",
    "closeout_authority",
    "dispatch_disposition",
    "kind",
    "origin_artifact",
    "receipt_artifact",
    "receipt_transport",
    "receipt_value_sha256",
    "report_transport",
  ], "receipt provenance");
  if (value.kind !== "goalbuddy_receipt_provenance_v1") throw new Error("Receipt provenance kind is invalid.");
  assertEnum(value.receipt_transport, RECEIPT_TRANSPORTS, "receipt_transport");
  assertEnum(value.report_transport, REPORT_TRANSPORTS, "report_transport");
  assertEnum(value.dispatch_disposition, DISPATCH_DISPOSITIONS, "dispatch_disposition");
  assertEnum(value.closeout_authority, CLOSEOUT_AUTHORITIES, "closeout_authority");
  if (value.application_state !== "applied") throw new Error("Receipt provenance application_state must be applied.");
  const receiptArtifact = validateArtifactIdentity(value.receipt_artifact, { retentionPolicy: true });
  const originArtifact = value.origin_artifact === null ? null : validateArtifactIdentity(value.origin_artifact);
  assertSha256(value.receipt_value_sha256, "receipt_value_sha256");
  assertProvenanceCombination(value);
  return Object.freeze({ ...value, receipt_artifact: receiptArtifact, origin_artifact: originArtifact });
}

export function createHeldReceipt(fields) {
  const withoutHandle = {
    kind: "goalbuddy_held_receipt_v1",
    ...fields,
    application_state: "held",
  };
  delete withoutHandle.handle;
  return validateHeldReceipt({
    ...withoutHandle,
    handle: canonicalJsonSha256(withoutHandle),
  });
}

export function validateHeldReceipt(value) {
  assertClosedObject(value, [
    "admitted_state_digest",
    "application_state",
    "board_path",
    "dispatch_contract_sha256",
    "dispatch_disposition",
    "handle",
    "kind",
    "origin_artifact",
    "receipt_transport",
    "receipt_value_sha256",
    "report_transport",
    "source_artifact",
    "task_authority_sha256",
    "task_id",
  ], "held receipt");
  if (value.kind !== "goalbuddy_held_receipt_v1") throw new Error("Held receipt kind is invalid.");
  assertSha256(value.handle, "Held receipt handle");
  if (!TASK_ID.test(value.task_id)) throw new Error("Held receipt task_id must be T###.");
  const boardPath = normalizeContainedArtifactPath(value.board_path);
  assertSha256(value.admitted_state_digest, "Held receipt admitted_state_digest");
  assertSha256(value.task_authority_sha256, "Held receipt task_authority_sha256");
  if (value.dispatch_contract_sha256 !== null) {
    assertSha256(value.dispatch_contract_sha256, "Held receipt dispatch_contract_sha256");
  }
  if (value.application_state !== "held") throw new Error("Held receipt application_state must be held.");
  assertEnum(value.receipt_transport, RECEIPT_TRANSPORTS, "receipt_transport");
  assertEnum(value.report_transport, REPORT_TRANSPORTS, "report_transport");
  assertEnum(value.dispatch_disposition, DISPATCH_DISPOSITIONS, "dispatch_disposition");
  const sourceArtifact = validateArtifactIdentity(value.source_artifact);
  const originArtifact = value.origin_artifact === null ? null : validateArtifactIdentity(value.origin_artifact);
  assertTransportCombination(value, { allowRejected: true });
  assertArtifactRootCombination(value, sourceArtifact, originArtifact);
  const withoutHandle = { ...value };
  delete withoutHandle.handle;
  if (canonicalJsonSha256(withoutHandle) !== value.handle) {
    throw new Error("Held receipt handle does not match the canonical held fields.");
  }
  assertSha256(value.receipt_value_sha256, "receipt_value_sha256");
  return Object.freeze({
    ...value,
    board_path: boardPath,
    source_artifact: sourceArtifact,
    origin_artifact: originArtifact,
  });
}

export function deriveReceiptSource({
  source,
  sourceArtifact,
  origin = null,
  originArtifact = null,
  closeoutAuthority = "original_role",
  sourceContext,
}) {
  const sourceIdentity = validateArtifactIdentity(sourceArtifact);
  const originIdentity = originArtifact === null ? null : validateArtifactIdentity(originArtifact);
  const context = validateReceiptSourceContext(sourceContext);
  assertEnum(closeoutAuthority, CLOSEOUT_AUTHORITIES, "closeout_authority");

  if (closeoutAuthority === "pm_blocked_closeout") {
    if (originIdentity === null) {
      throw new Error("pm_blocked_closeout requires one explicit rejected dispatch origin artifact.");
    }
    validateRejectedDispatch(origin, originIdentity, context);
    const receipt = directReceipt(source);
    assertReceiptIdentity(receipt, context);
    if (receipt.result !== "blocked") {
      throw new Error("pm_blocked_closeout may apply only a blocked receipt.");
    }
    return Object.freeze({
      receipt,
      admission_binding: receiptAdmissionBinding(context),
      receipt_transport: "explicit_file",
      report_transport: dispatchReportTransport(origin),
      dispatch_disposition: "rejected",
      closeout_authority: closeoutAuthority,
      receipt_artifact: Object.freeze({ ...sourceIdentity, retention_policy: "retained" }),
      origin_artifact: originIdentity,
      receipt_value_sha256: canonicalJsonSha256(receipt),
    });
  }
  if (origin !== null || originIdentity !== null) {
    throw new Error("original_role receipt sources must not supply an origin artifact.");
  }

  if (looksLikeDispatchEnvelope(source)) {
    const reportTransport = validateAcceptedDispatch(source, sourceIdentity, context);
    const ready = reportTransport === "ready";
    const receipt = directReceipt(source.receipt);
    return Object.freeze({
      receipt,
      admission_binding: receiptAdmissionBinding(context),
      receipt_transport: ready ? "git_local_report" : "explicit_file",
      report_transport: reportTransport,
      dispatch_disposition: "accepted",
      closeout_authority: closeoutAuthority,
      receipt_artifact: Object.freeze({
        ...sourceIdentity,
        retention_policy: ready ? "cleanup_eligible" : "retained",
      }),
      origin_artifact: null,
      receipt_value_sha256: canonicalJsonSha256(receipt),
    });
  }

  const receipt = directReceipt(source);
  assertReceiptIdentity(receipt, context);
  return Object.freeze({
    receipt,
    admission_binding: receiptAdmissionBinding(context),
    receipt_transport: "explicit_file",
    report_transport: "not_applicable",
    dispatch_disposition: "not_applicable",
    closeout_authority: closeoutAuthority,
    receipt_artifact: Object.freeze({ ...sourceIdentity, retention_policy: "retained" }),
    origin_artifact: null,
    receipt_value_sha256: canonicalJsonSha256(receipt),
  });
}

export function provenanceFromDerivedSource(derived) {
  const { receipt, admission_binding: _admissionBinding, ...fields } = derived;
  return createReceiptProvenance(fields);
}

export function heldReceiptFromDerivedSource({ taskId, derived }) {
  const {
    receipt,
    admission_binding: admissionBinding,
    closeout_authority: _closeoutAuthority,
    receipt_artifact,
    ...fields
  } = derived;
  return createHeldReceipt({
    ...fields,
    task_id: taskId,
    board_path: admissionBinding.board_path,
    admitted_state_digest: admissionBinding.admitted_state_digest,
    task_authority_sha256: admissionBinding.task_authority_sha256,
    dispatch_contract_sha256: admissionBinding.dispatch_contract_sha256,
    source_artifact: {
      root: receipt_artifact.root,
      path: receipt_artifact.path,
      sha256: receipt_artifact.sha256,
    },
  });
}

function receiptAdmissionBinding(context) {
  return Object.freeze({
    board_path: context.board_path,
    admitted_state_digest: context.admitted_state_digest,
    task_authority_sha256: canonicalJsonSha256(context.task_authority),
    dispatch_contract_sha256: context.expected_dispatch_contract_sha256,
  });
}

function directReceipt(value) {
  const candidate = value?.goalbuddy_receipt_v1 ?? value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || typeof candidate.result !== "string") {
    throw new Error("Artifact does not contain one direct receipt with a result field.");
  }
  canonicalJson(candidate);
  return candidate;
}

function dispatchReportTransport(value) {
  const status = value?.report_transport?.status;
  if (status === "ready" || status === "unavailable") return status;
  return "not_applicable";
}

function validateAcceptedDispatch(value, sourceArtifact, context) {
  assertObjectKeys(value, {
    required: [
      "commands",
      "board_path",
      "digest_kind",
      "dispatch_contract_sha256",
      "exit_status",
      "harness",
      "mutation",
      "ok",
      "receipt",
      "repair",
      "report_path",
      "report_transport",
      "role",
      "scope_check",
      "source_binding",
      "session_binding",
      "state_digest",
      "task_id",
    ],
    optional: ["brief"],
  }, "accepted dispatch report");
  if (value.ok !== true) throw new Error("Accepted dispatch report ok must be true.");
  if (!DISPATCH_HARNESSES.has(value.harness)) throw new Error("Accepted dispatch report harness is invalid.");
  if (value.exit_status !== 0) throw new Error("Accepted dispatch report exit_status must be zero.");
  assertDispatchContext(value, context, "Accepted dispatch report");
  assertDispatchSourceBinding(value, context, "Accepted dispatch report");
  assertReceiptIdentity(directReceipt(value.receipt), context);
  if (!value.scope_check || value.scope_check.status !== "clean"
      || !Array.isArray(value.scope_check.violations)
      || value.scope_check.violations.length !== 0) {
    throw new Error("Accepted dispatch report requires one clean scope_check with no violations.");
  }
  assertSha256(value.dispatch_contract_sha256, "Accepted dispatch report dispatch_contract_sha256");
  assertDispatchMutation(value.mutation, context, "Accepted dispatch report");

  const transport = value.report_transport;
  if (!transport || typeof transport !== "object" || Array.isArray(transport)) {
    throw new Error("Accepted dispatch report requires report_transport.");
  }
  if (transport.status === "ready") {
    assertClosedObject(transport, ["authority", "kind", "path", "status"], "ready report_transport");
    if (transport.kind !== "git_local_ephemeral_v1"
        || transport.authority !== "transport_only") {
      throw new Error("Ready report transport kind and authority are invalid.");
    }
    const sourceAbsolute = artifactAbsolutePath(sourceArtifact, context);
    const activeRelative = relative(context.active_git_dir, sourceAbsolute).split(sep).join("/");
    const expectedLocation = new RegExp(
      `^goalbuddy/dispatch-reports/${escapeRegExp(context.task_id)}-[^/]+/dispatch-report\\.json$`,
    );
    if (sourceArtifact.root !== "git_common_dir"
        || !expectedLocation.test(activeRelative)
        || !isAbsolute(value.report_path || "")
        || !isAbsolute(transport.path || "")
        || resolve(value.report_path || "") !== sourceAbsolute
        || resolve(transport.path || "") !== sourceAbsolute) {
      throw new Error("Ready dispatch report is not the exact active-worktree Git-local report artifact.");
    }
    assertApplyReceiptCommand(value.commands?.apply_receipt, context, {
      receiptPath: sourceAbsolute,
      unresolved: ["activate_task_id"],
    });
    return "ready";
  }
  if (transport.status === "unavailable") {
    assertClosedObject(transport, ["error", "kind", "status"], "unavailable report_transport");
    if (transport.kind !== "git_local_ephemeral_v1"
        || typeof transport.error !== "string"
        || transport.error.trim() === ""
        || value.report_path !== null) {
      throw new Error("Unavailable report transport must preserve one error and no report path.");
    }
    assertApplyReceiptCommand(value.commands?.apply_receipt, context, {
      receiptPath: null,
      unresolved: ["receipt_path", "activate_task_id"],
    });
    return "unavailable";
  }
  throw new Error("Accepted dispatch source must declare ready or unavailable report transport.");
}

function validateRejectedDispatch(value, originArtifact, context) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.ok !== false) {
    throw new Error("pm_blocked_closeout origin must be one rejected dispatch object.");
  }
  if (!REJECTED_DISPATCH_CODES.has(value.error_code)) {
    throw new Error("pm_blocked_closeout origin error_code is not an admitted post-launch dispatch rejection.");
  }
  if (!DISPATCH_HARNESSES.has(value.harness)
      || !Object.hasOwn(value, "exit_status")
      || value.task_id !== context.task_id
      || normalizeBoardIdentity(value.board_path, context) !== context.board_path
      || value.state_digest !== context.admitted_state_digest
      || value.digest_kind !== context.digest_kind
      || !value.scope_check
      || !["clean", "violations"].includes(value.scope_check.status)) {
    throw new Error("pm_blocked_closeout origin lacks exact post-launch dispatch identity and scope evidence.");
  }
  assertDispatchSourceBinding(value, context, "Rejected dispatch origin");
  assertRejectedReportTransport(value);
  if (originArtifact.root === "git_common_dir") {
    throw new Error("Rejected dispatch origins are retained explicit repository artifacts.");
  }
  assertDispatchMutation(value.mutation, context, "Rejected dispatch origin");
  assertRejectedCodeEvidence(value);
}

function assertDispatchContext(value, context, label) {
  if (value.task_id !== context.task_id) throw new Error(`${label} task_id does not match the admitted task.`);
  if (normalizeBoardIdentity(value.board_path, context) !== context.board_path) {
    throw new Error(`${label} board_path does not match the admitted board.`);
  }
  if (value.state_digest !== context.admitted_state_digest
      || value.digest_kind !== context.digest_kind) {
    throw new Error(`${label} state digest does not match the admitted board.`);
  }
}

function assertDispatchMutation(value, context, label) {
  assertClosedObject(value, [
    "after_digest",
    "before_digest",
    "board",
    "digest_kind",
    "product",
    "receipt_applied",
    "session_binding_preserved",
  ], `${label} mutation`);
  if (value.after_digest !== context.admitted_state_digest
      || value.digest_kind !== context.digest_kind
      || value.receipt_applied !== false
      || !["changed", "unchanged", "unknown"].includes(value.board)
      || !["observed", "none_observed", "unknown"].includes(value.product)
      || value.session_binding_preserved !== (context.expected_session_binding === null ? null : true)) {
    throw new Error(`${label} mutation evidence does not match the admitted board digest.`);
  }
  assertSha256(value.before_digest, `${label} mutation.before_digest`);
}

function assertDispatchSourceBinding(value, context, label) {
  assertClosedObject(value.source_binding, [
    "brief",
    "dispatch_contract_sha256",
    "execution_profile",
    "harness",
    "scope_authority_sha256",
    "session_binding",
    "task_authority_sha256",
    "task_role",
  ], `${label} source_binding`);
  const binding = value.source_binding;
  if (binding.harness !== value.harness
      || binding.task_role !== context.task_authority.type
      || value.role !== context.task_authority.type
      || canonicalJson(binding.brief) !== canonicalJson(context.expected_brief)
      || canonicalJson(value.brief ?? null) !== canonicalJson(context.expected_brief)
      || canonicalJson(binding.session_binding) !== canonicalJson(context.expected_session_binding)
      || canonicalJson(value.session_binding) !== canonicalJson(context.expected_session_binding)
      || binding.task_authority_sha256 !== canonicalJsonSha256(context.task_authority)
      || binding.scope_authority_sha256 !== canonicalJsonSha256(context.task_authority.allowed_files)) {
    throw new Error(`${label} source_binding does not match the trusted task, role, session, brief, and scope authority.`);
  }
  assertClosedObject(binding.execution_profile, [
    "model",
    "reasoning_effort",
    "sandbox",
    "service_tier",
  ], `${label} source_binding.execution_profile`);
  const profile = binding.execution_profile;
  for (const key of ["model", "reasoning_effort", "sandbox", "service_tier"]) {
    if (typeof profile[key] !== "string") {
      throw new Error(`${label} source_binding execution profile is invalid.`);
    }
  }
  const computedContract = dispatchContractSha256({
    task: context.task_authority,
    role: context.task_authority.type,
    harness: binding.harness,
    profile,
    brief: binding.brief,
  });
  if (binding.dispatch_contract_sha256 !== computedContract
      || value.dispatch_contract_sha256 !== computedContract
      || (context.expected_dispatch_contract_sha256 !== null
        && context.expected_dispatch_contract_sha256 !== computedContract)) {
    throw new Error(`${label} dispatch contract identity does not match trusted task authority.`);
  }
}

function assertRejectedReportTransport(value) {
  assertClosedObject(value.report_transport, ["kind", "status"], "rejected dispatch report_transport");
  if (value.report_transport.kind !== "not_applicable"
      || value.report_transport.status !== "not_applicable") {
    throw new Error("Rejected dispatch origin report_transport must be not_applicable.");
  }
}

function assertRejectedCodeEvidence(value) {
  const cleanScope = value.scope_check.status === "clean"
    && Array.isArray(value.scope_check.violations)
    && value.scope_check.violations.length === 0;
  const violatedScope = value.scope_check.status === "violations"
    && Array.isArray(value.scope_check.violations)
    && value.scope_check.violations.length > 0;
  switch (value.error_code) {
    case "DISPATCH_SCOPE_FAILED":
      if (!violatedScope) throw new Error("DISPATCH_SCOPE_FAILED requires concrete scope violations.");
      break;
    case "HARNESS_FAILED":
    case "DISPATCH_SESSION_BIND_FAILED":
      if (!cleanScope || value.receipt !== null || value.exit_status === 0) {
        throw new Error(`${value.error_code} rejected origin has incompatible harness evidence.`);
      }
      break;
    case "CODEX_SESSION_RESUME_FAILED": {
      const failedInitialResume = value.receipt === null && value.exit_status !== 0;
      const failedReceiptRepair = value.receipt !== null
        && value.repair?.attempted === true
        && Array.isArray(value.receipt_findings)
        && value.receipt_findings.length > 0;
      if (!cleanScope || (!failedInitialResume && !failedReceiptRepair)) {
        throw new Error("CODEX_SESSION_RESUME_FAILED rejected origin has incompatible resume evidence.");
      }
      break;
    }
    case "RECEIPT_MISSING":
      if (!cleanScope || value.exit_status !== 0 || value.receipt !== null) {
        throw new Error("RECEIPT_MISSING requires a successful harness, clean scope, and no receipt.");
      }
      break;
    case "RECEIPT_IDENTITY_MISMATCH":
      if (!cleanScope || value.exit_status !== 0 || value.receipt === null) {
        throw new Error("RECEIPT_IDENTITY_MISMATCH requires a successful harness, clean scope, and receipt.");
      }
      break;
    case "RECEIPT_SCHEMA_INVALID":
      if (!cleanScope || value.exit_status !== 0 || value.receipt === null
          || ((!Array.isArray(value.receipt_findings) || value.receipt_findings.length === 0)
            && value.repair?.attempted !== true)) {
        throw new Error("RECEIPT_SCHEMA_INVALID requires concrete invalid-receipt evidence.");
      }
      break;
    default:
      throw new Error("Rejected dispatch origin code is not supported.");
  }
}

function assertApplyReceiptCommand(value, context, { receiptPath, unresolved }) {
  assertClosedObject(value, [
    "activate_task_id",
    "board_path",
    "command_template",
    "digest_kind",
    "expected_state_digest",
    "operation",
    "receipt_path",
    "task_id",
    "unresolved",
  ], "dispatch apply_receipt command");
  if (value.operation !== "apply_receipt"
      || value.task_id !== context.task_id
      || normalizeBoardIdentity(value.board_path, context) !== context.board_path
      || value.expected_state_digest !== context.admitted_state_digest
      || value.digest_kind !== context.digest_kind
      || value.receipt_path !== receiptPath
      || value.activate_task_id !== null
      || canonicalJson(value.unresolved) !== canonicalJson(unresolved)
      || typeof value.command_template !== "string"
      || value.command_template.trim() === "") {
    throw new Error("Dispatch apply_receipt command does not bind the admitted task, board, digest, and source.");
  }
}

function assertReceiptIdentity(receipt, context) {
  if (receipt.task_id !== context.task_id) {
    throw new Error("Receipt task_id does not match the admitted source task.");
  }
  if (normalizeBoardIdentity(receipt.board_path, context) !== context.board_path) {
    throw new Error("Receipt board_path does not match the admitted board.");
  }
}

function normalizeBoardIdentity(value, context) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Receipt or dispatch board_path must be a nonempty path.");
  }
  const absolute = isAbsolute(value)
    ? resolve(value)
    : resolve(context.repository_root, value);
  const canonical = realpathSync(absolute);
  assertContained(context.repository_root, canonical);
  return normalizeContainedArtifactPath(relative(context.repository_root, canonical).split(sep).join("/"));
}

function artifactAbsolutePath(artifact, context) {
  const root = artifact.root === "repository" ? context.repository_root : context.git_common_dir;
  const absolute = resolve(root, ...artifact.path.split("/"));
  assertContained(root, absolute);
  return absolute;
}

function looksLikeDispatchEnvelope(value) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.hasOwn(value, "ok")
    && Object.hasOwn(value, "scope_check")
    && Object.hasOwn(value, "report_transport")
    && Object.hasOwn(value, "state_digest"),
  );
}

function trustedTaskAuthority(task) {
  const type = normalizeTaskRole(task.type);
  return Object.freeze({
    id: task.id,
    type,
    assignee: task.assignee || defaultAgent(type),
    status: task.status,
    objective: task.objective || "",
    inputs: stringList(task.inputs),
    constraints: stringList(task.constraints),
    allowed_files: stringList(task.allowed_files),
    verify: stringList(task.verify),
    stop_if: stringList(task.stop_if),
    reasoning_hint: task.reasoning_hint || null,
    expected_output: stringList(task.expected_output),
  });
}

function validateTaskAuthority(value) {
  assertClosedObject(value, [
    "allowed_files",
    "assignee",
    "constraints",
    "expected_output",
    "id",
    "inputs",
    "objective",
    "reasoning_hint",
    "status",
    "stop_if",
    "type",
    "verify",
  ], "receipt source context task_authority");
  if (!TASK_ID.test(value.id || "")) throw new Error("Task authority id must be T###.");
  if (!["scout", "worker", "judge", "pm"].includes(value.type)) throw new Error("Task authority type is invalid.");
  for (const key of ["inputs", "constraints", "allowed_files", "verify", "stop_if", "expected_output"]) {
    if (!Array.isArray(value[key]) || value[key].some((entry) => typeof entry !== "string")) {
      throw new Error(`Task authority ${key} must be an array of strings.`);
    }
  }
  canonicalJson(value);
  return Object.freeze({ ...value });
}

function validateBriefBinding(value, label) {
  if (value === null) return;
  assertClosedObject(value, ["path", "sha256"], label);
  normalizeContainedArtifactPath(value.path);
  assertSha256(value.sha256, `${label}.sha256`);
}

function validateExpectedSessionBinding(value, context) {
  if (value === null) {
    if (context.expected_dispatch_contract_sha256 !== null) {
      throw new Error("Expected dispatch contract requires an expected session binding.");
    }
    return;
  }
  assertClosedObject(value, ["session_id", "state_digest"], "receipt source context expected_session_binding");
  if (typeof value.session_id !== "string" || value.session_id.trim() === ""
      || value.state_digest !== context.admitted_state_digest
      || context.expected_dispatch_contract_sha256 === null
      || context.task_authority.type !== "worker") {
    throw new Error("Receipt source context expected_session_binding is invalid.");
  }
}

function dispatchContractSha256({ task, role, harness, profile, brief }) {
  return sha256(Buffer.from(JSON.stringify({
    version: 1,
    renderer_version: 1,
    task,
    role,
    to: harness,
    model: profile.model,
    reasoning_effort: profile.reasoning_effort,
    service_tier: profile.service_tier,
    sandbox: profile.sandbox,
    brief,
  }), "utf8"));
}

function normalizeTaskRole(value) {
  const role = String(value || "pm").toLowerCase();
  return ["scout", "worker", "judge", "pm"].includes(role) ? role : "pm";
}

function defaultAgent(role) {
  if (role === "scout") return "goal_scout";
  if (role === "worker") return "goal_worker";
  if (role === "judge") return "goal_judge";
  return "PM";
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry !== null && entry !== undefined).map(String)
    : [];
}

function assertObjectKeys(value, { required, optional = [] }, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const keys = Object.keys(value);
  const missing = required.filter((key) => !keys.includes(key));
  const extras = keys.filter((key) => !required.includes(key) && !optional.includes(key));
  if (missing.length || extras.length) {
    throw new Error(`${label} keys are invalid; missing [${missing.join(", ")}], unexpected [${extras.join(", ")}].`);
  }
}

function assertProvenanceCombination(value) {
  assertTransportCombination(value, { allowRejected: value.closeout_authority === "pm_blocked_closeout" });
  assertArtifactRootCombination(value, value.receipt_artifact, value.origin_artifact);
  if (value.closeout_authority === "pm_blocked_closeout") {
    if (value.dispatch_disposition !== "rejected" || value.origin_artifact === null) {
      throw new Error("pm_blocked_closeout provenance requires rejected dispatch disposition and an origin artifact.");
    }
  } else if (value.origin_artifact !== null) {
    throw new Error("original_role provenance must not include an origin artifact.");
  }
  if (value.receipt_artifact.retention_policy === "cleanup_eligible"
      && !(value.receipt_transport === "git_local_report"
        && value.report_transport === "ready"
        && value.dispatch_disposition === "accepted"
        && value.receipt_artifact.root === "git_common_dir")) {
    throw new Error("Only an accepted ready Git-local report may be cleanup_eligible.");
  }
}

function assertArtifactRootCombination(value, sourceArtifact, originArtifact) {
  if (value.receipt_transport === "git_local_report" && sourceArtifact.root !== "git_common_dir") {
    throw new Error("A Git-local report artifact must be below git_common_dir.");
  }
  if (value.dispatch_disposition === "rejected"
      && value.report_transport === "ready"
      && originArtifact?.root !== "git_common_dir") {
    throw new Error("A ready rejected-dispatch origin must be below git_common_dir.");
  }
}

function assertTransportCombination(value, { allowRejected }) {
  if (value.receipt_transport === "git_local_report"
      && !(value.report_transport === "ready" && value.dispatch_disposition === "accepted")) {
    throw new Error("git_local_report requires ready report transport and accepted dispatch disposition.");
  }
  if (value.report_transport === "ready"
      && value.dispatch_disposition === "accepted"
      && value.receipt_transport !== "git_local_report") {
    throw new Error("Ready report transport requires git_local_report receipt transport.");
  }
  if (value.dispatch_disposition === "rejected" && !allowRejected) {
    throw new Error("Rejected dispatch disposition is not valid for this record.");
  }
  if (value.dispatch_disposition === "rejected" && value.origin_artifact === null) {
    throw new Error("Rejected dispatch disposition requires an origin artifact.");
  }
  if (value.dispatch_disposition !== "rejected" && value.origin_artifact !== null) {
    throw new Error("An origin artifact is allowed only for rejected dispatch disposition.");
  }
  if (value.dispatch_disposition === "not_applicable" && value.report_transport !== "not_applicable") {
    throw new Error("Inapplicable dispatch requires inapplicable report transport.");
  }
  if (value.dispatch_disposition === "accepted" && value.report_transport === "not_applicable") {
    throw new Error("Accepted dispatch requires ready or unavailable report transport.");
  }
}

function assertClosedObject(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
  }
}

function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`${label} is invalid.`);
}

function assertSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be 64 lowercase hexadecimal characters.`);
  }
}

function assertContained(root, path) {
  const rel = relative(root, path);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Artifact path resolves outside its declared root.");
  }
}

function assertContainedOrEqual(root, path) {
  if (root === path) return;
  assertContained(root, path);
}

function gitPath(cwd, field) {
  const result = spawnSync("git", ["rev-parse", "--path-format=absolute", field], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`Could not resolve ${field}: ${(result.stderr || "").trim() || "git rev-parse failed"}`);
  }
  return resolve(result.stdout.trim());
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
