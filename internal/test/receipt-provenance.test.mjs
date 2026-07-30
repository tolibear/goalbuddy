import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  artifactIdentity,
  canonicalJson,
  canonicalJsonSha256,
  createHeldReceipt,
  createReceiptProvenance,
  createReceiptSourceContext,
  deriveReceiptSource,
  heldReceiptFromDerivedSource,
  openContainedArtifact,
  provenanceFromDerivedSource,
  resolveArtifactRoots,
  validateHeldReceipt,
  validateReceiptProvenance,
} from "../../goalbuddy/scripts/receipt-provenance.mjs";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeRepo() {
  const parent = mkdtempSync(join(tmpdir(), "goalbuddy-provenance-"));
  const root = join(parent, "repository");
  mkdirSync(join(root, "receipts"), { recursive: true });
  mkdirSync(join(root, "docs", "goals", "one"), { recursive: true });
  writeFileSync(join(root, "README.md"), "fixture\n");
  writeFileSync(join(root, "docs", "goals", "one", "state.yaml"), `version: 2
goal:
  title: one
  slug: one
  kind: specific
  status: active
active_task: T004
tasks:
  - id: T004
    type: worker
    assignee: Worker
    status: active
    objective: complete
    allowed_files:
      - src/widget.mjs
    verify:
      - "true"
    stop_if:
      - stop
    receipt: null
`);
  git(root, ["init", "-q"]);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.name=GoalBuddy Test", "-c", "user.email=goalbuddy@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  return { parent, root };
}

const RECEIPT = Object.freeze({
  result: "done",
  task_id: "T004",
  board_path: "docs/goals/one/state.yaml",
  summary: "complete",
  evidence: [{ kind: "test", values: [3, -0, 1] }],
});

function makeSourceFixture() {
  const fixture = makeRepo();
  const statePath = join(fixture.root, "docs", "goals", "one", "state.yaml");
  const admittedStateDigest = "9".repeat(64);
  const context = createReceiptSourceContext({
    cwd: fixture.root,
    statePath,
    taskId: "T004",
    admittedStateDigest,
  });
  const receipt = { ...RECEIPT, board_path: statePath };
  return { ...fixture, statePath, admittedStateDigest, context, receipt };
}

function dispatchMutation(context) {
  return {
    board: "unchanged",
    product: "none_observed",
    receipt_applied: false,
    before_digest: context.admitted_state_digest,
    after_digest: context.admitted_state_digest,
    digest_kind: context.digest_kind,
    session_binding_preserved: null,
  };
}

function contractSha256(context, executionProfile, harness = "codex") {
  return createHash("sha256").update(JSON.stringify({
    version: 1,
    renderer_version: 1,
    task: context.task_authority,
    role: context.task_authority.type,
    to: harness,
    model: executionProfile.model,
    reasoning_effort: executionProfile.reasoning_effort,
    service_tier: executionProfile.service_tier,
    sandbox: executionProfile.sandbox,
    brief: context.expected_brief,
  })).digest("hex");
}

function dispatchSourceBinding(context, harness = "codex") {
  const executionProfile = {
    model: harness === "codex" ? "gpt-5.6-sol" : "",
    reasoning_effort: harness === "codex" ? "medium" : "",
    service_tier: harness === "codex" ? "default" : "",
    sandbox: "danger-full-access",
  };
  return {
    task_role: context.task_authority.type,
    harness,
    task_authority_sha256: canonicalJsonSha256(context.task_authority),
    scope_authority_sha256: canonicalJsonSha256(context.task_authority.allowed_files),
    dispatch_contract_sha256: contractSha256(context, executionProfile, harness),
    execution_profile: executionProfile,
    brief: context.expected_brief,
    session_binding: context.expected_session_binding,
  };
}

function applyReceiptCommand(context, receiptPath, unresolved) {
  return {
    operation: "apply_receipt",
    board_path: resolve(context.repository_root, context.board_path),
    task_id: context.task_id,
    expected_state_digest: context.admitted_state_digest,
    digest_kind: context.digest_kind,
    receipt_path: receiptPath,
    activate_task_id: null,
    unresolved,
    command_template: "goalbuddy receipt fixture",
  };
}

function acceptedDispatch(context, receipt, { reportPath = null, status = "unavailable" } = {}) {
  const ready = status === "ready";
  const sourceBinding = dispatchSourceBinding(context);
  return {
    ok: true,
    board_path: resolve(context.repository_root, context.board_path),
    harness: "codex",
    task_id: context.task_id,
    role: "worker",
    exit_status: 0,
    receipt,
    scope_check: { status: "clean", violations: [] },
    repair: { attempted: false, succeeded: false, failure: null },
    state_digest: context.admitted_state_digest,
    digest_kind: context.digest_kind,
    mutation: dispatchMutation(context),
    commands: {
      apply_receipt: applyReceiptCommand(
        context,
        ready ? reportPath : null,
        ready ? ["activate_task_id"] : ["receipt_path", "activate_task_id"],
      ),
    },
    session_binding: null,
    dispatch_contract_sha256: sourceBinding.dispatch_contract_sha256,
    source_binding: sourceBinding,
    brief: null,
    report_path: ready ? reportPath : null,
    report_transport: ready
      ? {
        kind: "git_local_ephemeral_v1",
        status: "ready",
        path: reportPath,
        authority: "transport_only",
      }
      : {
        kind: "git_local_ephemeral_v1",
        status: "unavailable",
        error: "Git-local transport unavailable in fixture.",
      },
  };
}

test("canonical JSON sorts recursive object keys while preserving arrays, scalars, and negative zero", () => {
  const left = { z: "last", a: [true, -0, { z: 1, a: 2 }], nullish: null };
  const right = { nullish: null, a: [true, -0, { a: 2, z: 1 }], z: "last" };
  assert.equal(
    canonicalJson(left),
    '{"a":[true,-0,{"a":2,"z":1}],"nullish":null,"z":"last"}',
  );
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.equal(canonicalJsonSha256(left), canonicalJsonSha256(right));
  assert.notEqual(canonicalJsonSha256(-0), canonicalJsonSha256(0));

  const prototypeShaped = Object.create(null);
  Object.defineProperty(prototypeShaped, "__proto__", {
    value: { constructor: "data" },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  assert.equal(canonicalJson(prototypeShaped), '{"__proto__":{"constructor":"data"}}');
});

test("canonical JSON rejects unsafe or ambiguous JavaScript values", () => {
  const sparse = [];
  sparse.length = 1;
  const cyclic = {};
  cyclic.self = cyclic;
  const accessor = {};
  Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
  const hidden = {};
  Object.defineProperty(hidden, "value", { enumerable: false, value: 1 });
  for (const value of [
    undefined,
    1n,
    Symbol("x"),
    () => {},
    Number.NaN,
    Infinity,
    sparse,
    cyclic,
    new Date(0),
    new Map(),
    accessor,
    hidden,
  ]) {
    assert.throws(() => canonicalJson(value), /Canonical JSON rejects/);
  }
});

test("contained artifact opening returns exact repository and common-dir identities in a linked worktree", () => {
  const { parent, root } = makeRepo();
  const linked = join(parent, "linked");
  try {
    git(root, ["worktree", "add", "-q", "-b", "linked-test", linked]);
    const roots = resolveArtifactRoots(linked);
    assert.equal(roots.repository, realpathSync(linked));
    assert.notEqual(roots.git_common_dir, join(linked, ".git"));

    mkdirSync(join(linked, "receipts"), { recursive: true });
    writeFileSync(join(linked, "receipts", "receipt.json"), '{"result":"done"}\n');
    mkdirSync(join(roots.git_common_dir, "goalbuddy"), { recursive: true });
    writeFileSync(join(roots.git_common_dir, "goalbuddy", "report.json"), '{"ok":true}\n');

    const repositoryArtifact = openContainedArtifact({
      roots,
      root: "repository",
      path: "receipts/receipt.json",
    });
    const reportArtifact = openContainedArtifact({
      roots,
      root: "git_common_dir",
      path: "goalbuddy/report.json",
    });
    assert.deepEqual(artifactIdentity(repositoryArtifact), {
      root: "repository",
      path: "receipts/receipt.json",
      sha256: "61da0aa41a9610d01a86c7384aa7859a57b9b3db230aeccfeaf78cfa7443f191",
    });
    assert.equal(reportArtifact.root, "git_common_dir");
    assert.deepEqual(reportArtifact.bytes, Buffer.from('{"ok":true}\n'));
  } finally {
    git(root, ["worktree", "remove", "--force", linked]);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("contained artifact opening rejects unsafe paths, symlinks, missing paths, and nonregular files", () => {
  const { parent, root } = makeRepo();
  try {
    const roots = resolveArtifactRoots(root);
    writeFileSync(join(root, "receipts", "real.json"), "{}\n");
    symlinkSync("real.json", join(root, "receipts", "final-link.json"));
    symlinkSync("receipts", join(root, "linked-receipts"));
    mkdirSync(join(root, "receipts", "directory"));
    const fifo = join(root, "receipts", "fifo.json");
    const mkfifo = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    assert.equal(mkfifo.status, 0, mkfifo.stderr);

    for (const path of [
      join(root, "receipts", "real.json"),
      "../outside.json",
      "receipts\\real.json",
      "C:/receipts/real.json",
      "receipts/*.json",
      "receipts/{real,other}.json",
      "receipts/line\nbreak.json",
      "receipts/missing.json",
      "receipts/final-link.json",
      "linked-receipts/real.json",
      "receipts/directory",
      "receipts/fifo.json",
    ]) {
      assert.throws(
        () => openContainedArtifact({ roots, root: "repository", path }),
        /relative|traversal|backslashes|control|drive|glob|does not exist|symlinks|regular file/,
        path,
      );
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("applied provenance constructors and validators enforce the exact closed schema", () => {
  const artifact = {
    root: "repository",
    path: "receipts/receipt.json",
    sha256: "a".repeat(64),
    retention_policy: "retained",
  };
  const provenance = createReceiptProvenance({
    receipt_transport: "explicit_file",
    report_transport: "not_applicable",
    dispatch_disposition: "not_applicable",
    closeout_authority: "original_role",
    receipt_artifact: artifact,
    origin_artifact: null,
    receipt_value_sha256: canonicalJsonSha256(RECEIPT),
  });
  assert.deepEqual(validateReceiptProvenance(provenance), provenance);
  assert.throws(() => validateReceiptProvenance({ ...provenance, extra: true }), /contain exactly/);
  assert.throws(() => validateReceiptProvenance({
    ...provenance,
    receipt_artifact: { ...artifact, retention_policy: "cleanup_eligible" },
  }), /Only an accepted ready Git-local report/);
  assert.throws(() => validateReceiptProvenance({
    ...provenance,
    closeout_authority: "pm_blocked_closeout",
  }), /requires rejected dispatch disposition/);
});

test("held receipt handle hashes every other field and rejects mutation", () => {
  const held = createHeldReceipt({
    task_id: "T004",
    board_path: "docs/goals/example/state.yaml",
    admitted_state_digest: "c".repeat(64),
    task_authority_sha256: "d".repeat(64),
    dispatch_contract_sha256: null,
    receipt_transport: "explicit_file",
    report_transport: "unavailable",
    dispatch_disposition: "accepted",
    source_artifact: {
      root: "repository",
      path: "receipts/output.json",
      sha256: "b".repeat(64),
    },
    origin_artifact: null,
    receipt_value_sha256: canonicalJsonSha256(RECEIPT),
  });
  assert.deepEqual(validateHeldReceipt(held), held);
  assert.throws(() => validateHeldReceipt({ ...held, task_id: "T005" }), /handle does not match/);
  assert.throws(() => validateHeldReceipt({ ...held, unexpected: null }), /contain exactly/);
});

test("source derivation authenticates the active-worktree Git-local report before cleanup eligibility", () => {
  const fixture = makeSourceFixture();
  try {
    const reportDirectory = join(
      fixture.context.active_git_dir,
      "goalbuddy",
      "dispatch-reports",
      "T004-fixture",
    );
    mkdirSync(reportDirectory, { recursive: true });
    const reportPath = join(reportDirectory, "dispatch-report.json");
    writeFileSync(reportPath, "{}\n");
    const roots = resolveArtifactRoots(fixture.root);
    const sourceArtifact = {
      root: "git_common_dir",
      path: relative(roots.git_common_dir, reportPath).split(sep).join("/"),
      sha256: "c".repeat(64),
    };
    const source = acceptedDispatch(fixture.context, fixture.receipt, {
      reportPath,
      status: "ready",
    });
    const derived = deriveReceiptSource({
      source,
      sourceArtifact,
      sourceContext: fixture.context,
    });
    assert.equal(derived.receipt, source.receipt);
    assert.deepEqual(provenanceFromDerivedSource(derived), {
      kind: "goalbuddy_receipt_provenance_v1",
      receipt_transport: "git_local_report",
      report_transport: "ready",
      dispatch_disposition: "accepted",
      closeout_authority: "original_role",
      application_state: "applied",
      receipt_artifact: {
        ...sourceArtifact,
        retention_policy: "cleanup_eligible",
      },
      origin_artifact: null,
      receipt_value_sha256: canonicalJsonSha256(fixture.receipt),
    });

    const fabricated = {
      ...source,
      report_path: join(fixture.context.git_common_dir, "goalbuddy", "dispatch-reports", "T004-fake", "dispatch-report.json"),
      report_transport: {
        ...source.report_transport,
        path: join(fixture.context.git_common_dir, "goalbuddy", "dispatch-reports", "T004-fake", "dispatch-report.json"),
      },
    };
    assert.throws(() => deriveReceiptSource({
      source: fabricated,
      sourceArtifact,
      sourceContext: fixture.context,
    }), /exact active-worktree Git-local report/);
    assert.throws(() => deriveReceiptSource({
      source: { ...source, state_digest: "0".repeat(64) },
      sourceArtifact,
      sourceContext: fixture.context,
    }), /state digest/);
    assert.throws(() => deriveReceiptSource({
      source: {
        ...source,
        receipt: { ...fixture.receipt, task_id: "T005" },
      },
      sourceArtifact,
      sourceContext: fixture.context,
    }), /Receipt task_id/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("source derivation keeps bare and transport-unavailable artifacts retained", () => {
  const fixture = makeSourceFixture();
  try {
    const bare = deriveReceiptSource({
      source: fixture.receipt,
      sourceArtifact: {
        root: "repository",
        path: "receipts/receipt.json",
        sha256: "d".repeat(64),
      },
      sourceContext: fixture.context,
    });
    assert.equal(bare.report_transport, "not_applicable");
    assert.equal(bare.dispatch_disposition, "not_applicable");
    assert.equal(bare.receipt_artifact.retention_policy, "retained");
    const additiveBare = deriveReceiptSource({
      source: { ...fixture.receipt, ok: true },
      sourceArtifact: {
        root: "repository",
        path: "receipts/additive-receipt.json",
        sha256: "7".repeat(64),
      },
      sourceContext: fixture.context,
    });
    assert.equal(additiveBare.dispatch_disposition, "not_applicable");

    const unavailable = deriveReceiptSource({
      source: acceptedDispatch(fixture.context, fixture.receipt),
      sourceArtifact: {
        root: "repository",
        path: "receipts/dispatch-output.json",
        sha256: "e".repeat(64),
      },
      sourceContext: fixture.context,
    });
    assert.equal(unavailable.receipt_transport, "explicit_file");
    assert.equal(unavailable.report_transport, "unavailable");
    assert.equal(unavailable.dispatch_disposition, "accepted");
    assert.equal(unavailable.receipt_artifact.retention_policy, "retained");
    assert.equal(heldReceiptFromDerivedSource({ taskId: "T004", derived: unavailable }).task_id, "T004");

    const partialWrapper = acceptedDispatch(fixture.context, fixture.receipt);
    delete partialWrapper.source_binding;
    assert.throws(() => deriveReceiptSource({
      source: partialWrapper,
      sourceArtifact: {
        root: "repository",
        path: "receipts/partial-wrapper.json",
        sha256: "6".repeat(64),
      },
      sourceContext: fixture.context,
    }), /missing \[source_binding\]/);

    const forgedRole = acceptedDispatch(fixture.context, fixture.receipt);
    forgedRole.role = "judge";
    forgedRole.source_binding.task_role = "judge";
    assert.throws(() => deriveReceiptSource({
      source: forgedRole,
      sourceArtifact: {
        root: "repository",
        path: "receipts/forged-role.json",
        sha256: "5".repeat(64),
      },
      sourceContext: fixture.context,
    }), /trusted task, role, session, brief, and scope authority/);

    const forgedContract = acceptedDispatch(fixture.context, fixture.receipt);
    forgedContract.dispatch_contract_sha256 = "4".repeat(64);
    forgedContract.source_binding.dispatch_contract_sha256 = "4".repeat(64);
    assert.throws(() => deriveReceiptSource({
      source: forgedContract,
      sourceArtifact: {
        root: "repository",
        path: "receipts/forged-contract.json",
        sha256: "3".repeat(64),
      },
      sourceContext: fixture.context,
    }), /dispatch contract identity/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});

test("source derivation requires exact post-launch rejected origin proof for PM blocked closeout", () => {
  const fixture = makeSourceFixture();
  try {
    const blocked = { ...fixture.receipt, result: "blocked" };
    const sourceArtifact = {
      root: "repository",
      path: "receipts/pm-closeout.json",
      sha256: "f".repeat(64),
    };
    const originArtifact = {
      root: "repository",
      path: "receipts/rejected-dispatch.json",
      sha256: "1".repeat(64),
    };
    const origin = {
      ok: false,
      error_code: "DISPATCH_SCOPE_FAILED",
      board_path: fixture.statePath,
      state_digest: fixture.context.admitted_state_digest,
      digest_kind: fixture.context.digest_kind,
      harness: "codex",
      task_id: "T004",
      role: "worker",
      exit_status: 0,
      receipt: null,
      scope_check: { status: "violations", violations: ["out of scope"] },
      brief: null,
      session_binding: null,
      dispatch_contract_sha256: dispatchSourceBinding(fixture.context).dispatch_contract_sha256,
      source_binding: dispatchSourceBinding(fixture.context),
      report_transport: { kind: "not_applicable", status: "not_applicable" },
      mutation: dispatchMutation(fixture.context),
    };
    const derived = deriveReceiptSource({
      source: blocked,
      sourceArtifact,
      origin,
      originArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    });
    assert.equal(derived.dispatch_disposition, "rejected");
    assert.equal(derived.closeout_authority, "pm_blocked_closeout");
    assert.deepEqual(derived.origin_artifact, originArtifact);
    assert.throws(() => deriveReceiptSource({
      source: fixture.receipt,
      sourceArtifact,
      origin,
      originArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    }), /only a blocked receipt/);
    assert.throws(() => deriveReceiptSource({
      source: blocked,
      sourceArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    }), /requires one explicit rejected dispatch origin/);
    assert.throws(() => deriveReceiptSource({
      source: blocked,
      sourceArtifact,
      origin: { ...origin, scope_check: { status: "skipped" } },
      originArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    }), /post-launch dispatch identity/);
    assert.throws(() => deriveReceiptSource({
      source: blocked,
      sourceArtifact,
      origin: {
        ...origin,
        report_transport: {
          kind: "git_local_ephemeral_v1",
          status: "ready",
        },
      },
      originArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    }), /report_transport must be not_applicable/);
    assert.throws(() => deriveReceiptSource({
      source: blocked,
      sourceArtifact,
      origin: {
        ...origin,
        error_code: "RECEIPT_MISSING",
      },
      originArtifact,
      closeoutAuthority: "pm_blocked_closeout",
      sourceContext: fixture.context,
    }), /RECEIPT_MISSING requires/);
  } finally {
    rmSync(fixture.parent, { recursive: true, force: true });
  }
});
