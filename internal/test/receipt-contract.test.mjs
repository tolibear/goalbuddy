import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPmBlockedCloseoutReceipt,
  assertTaskReceipt,
  receiptExample,
  validatePmBlockedCloseoutReceipt,
  validateTaskReceipt,
  validateWorkerPackage,
} from "../../goalbuddy/scripts/receipt-contract.mjs";

const roles = ["worker", "judge", "scout", "pm"];
const results = ["done", "blocked"];
const TERMINAL_FIELDS = Object.freeze({
  completion_disposition: "exact",
  accepted_deviations: [],
  deviation_acceptance: null,
  final_review: {
    status: "complete",
    artifact: {
      path: "reviews/final.json",
      sha256: "a".repeat(64),
    },
    workflow_version: "omega-review@1",
    scope: {
      kind: "goalbuddy_review_scope_v1",
      patterns: ["src/**"],
    },
    base_identity: {
      kind: "git_commit",
      value: "b".repeat(40),
    },
    reviewed_identity: {
      kind: "git_commit",
      value: "b".repeat(40),
    },
    completeness_status: "complete",
  },
});

test("every role and result has a distinct valid exact example", () => {
  const rendered = new Set();
  for (const role of roles) {
    for (const result of results) {
      const receipt = receiptExample({ role, result });
      rendered.add(JSON.stringify(receipt));
      assert.deepEqual(validateTaskReceipt(receipt, {
        role,
        taskId: "T001",
        boardPath: "docs/goals/example/state.yaml",
        verify: role === "worker" && result === "done" ? ["npm test"] : [],
      }), [], `${role}/${result}`);
    }
  }
  assert.equal(rendered.size, roles.length * results.length);
});

test("validation is pure and preserves additive JSON-safe evidence", () => {
  const receipt = { ...receiptExample({ role: "worker", result: "done" }), product_evidence: { artifact: "dist/report.json" } };
  const before = structuredClone(receipt);
  assert.deepEqual(validateTaskReceipt(receipt, {
    role: "worker",
    taskId: "T001",
    boardPath: "docs/goals/example/state.yaml",
    verify: ["npm test"],
  }), []);
  assert.deepEqual(receipt, before);
  assert.equal(assertTaskReceipt(receipt, { role: "worker", taskId: "T001", boardPath: receipt.board_path, verify: ["npm test"] }), receipt);
});

test("new receipts accept only canonical board-local note pointers", () => {
  const base = receiptExample({ role: "scout", result: "done" });
  for (const note of ["notes/T001-evidence.md", "notes/nested/T001.md"]) {
    const receipt = { ...base, note };
    assert.deepEqual(validateTaskReceipt(receipt, {
      role: "scout",
      taskId: "T001",
      boardPath: receipt.board_path,
    }), [], note);
  }

  for (const note of ["", ".context/T001.md", "prose evidence", "../escape.md", "notes/../escape.md", "notes\\T001.md", "/tmp/T001.md", "notes/"]) {
    const receipt = { ...base, note };
    assert.ok(validateTaskReceipt(receipt, {
      role: "scout",
      taskId: "T001",
      boardPath: receipt.board_path,
    }).some((finding) => finding.path === "note"), note);
  }
});

test("rejects malformed Worker proof without normalization", () => {
  const bareCommands = { ...receiptExample({ role: "worker", result: "done" }), commands: ["npm test"] };
  const findings = validateTaskReceipt(bareCommands, { role: "worker", taskId: "T001", boardPath: bareCommands.board_path, verify: ["npm test"] });
  assert.equal(findings[0].code, "RECEIPT_SCHEMA_INVALID");
  assert.ok(findings.some((finding) => finding.path === "commands[0]"));
  assert.ok(findings.some((finding) => finding.path === "commands" && /missing passing/.test(finding.message)));
  assert.deepEqual(bareCommands.commands, ["npm test"]);

  const nonPassing = { ...receiptExample({ role: "worker", result: "done" }), commands: [{ cmd: "npm test", status: "fail" }] };
  assert.ok(validateTaskReceipt(nonPassing, { role: "worker", taskId: "T001", boardPath: nonPassing.board_path, verify: ["npm test"] })
    .some((finding) => finding.path === "commands[0].status"));
});

test("rejects identity, duplicate paths, missing verification, and wrong-role fields", () => {
  const receipt = {
    ...receiptExample({ role: "worker", result: "done" }),
    task_id: "T999",
    board_path: "wrong/state.yaml",
    changed_files: ["src/example.mjs", "src/example.mjs"],
    decision: "approved",
  };
  const findings = validateTaskReceipt(receipt, {
    role: "worker",
    taskId: "T001",
    boardPath: "docs/goals/example/state.yaml",
    verify: ["npm test", "npm run lint"],
  });
  for (const path of ["task_id", "board_path", "changed_files[1]", "decision", "commands"]) {
    assert.ok(findings.some((finding) => finding.path === path), path);
  }
});

test("rejects zero-change completed Worker and invalid Judge vocabulary", () => {
  const worker = { ...receiptExample({ role: "worker", result: "done" }), changed_files: [] };
  assert.ok(validateTaskReceipt(worker, { role: "worker", taskId: "T001", boardPath: worker.board_path, verify: ["npm test"] })
    .some((finding) => /at least one changed file/.test(finding.message)));

  const judge = { ...receiptExample({ role: "judge", result: "done" }), decision: "looks_good" };
  assert.ok(validateTaskReceipt(judge, { role: "judge", taskId: "T001", boardPath: judge.board_path })
    .some((finding) => finding.path === "decision"));
});

test("blocked Worker preserves failure evidence and blocked role requirements", () => {
  const blocked = receiptExample({ role: "worker", result: "blocked" });
  assert.deepEqual(validateTaskReceipt(blocked, { role: "worker", taskId: "T001", boardPath: blocked.board_path }), []);
  const withoutReason = { ...blocked };
  delete withoutReason.blocked_reason;
  assert.ok(validateTaskReceipt(withoutReason, { role: "worker", taskId: "T001", boardPath: blocked.board_path })
    .some((finding) => finding.path === "blocked_reason"));
});

test("Judge worker_package is one exact four-key closed object at shared receipt admission", () => {
  const valid = {
    objective: "Implement the approved slice.",
    allowed_files: ["src/example.mjs"],
    verify: ["npm test"],
    stop_if: ["Need broader authority."],
  };
  assert.deepEqual(validateWorkerPackage(valid), []);
  for (const workerPackage of [
    { ...valid, brief: "docs/goals/example/notes/slice.md" },
    { ...valid, arbitrary_authority: true },
    { objective: valid.objective, allowed_files: valid.allowed_files, verify: valid.verify },
  ]) {
    assert.ok(validateWorkerPackage(workerPackage).some((finding) => finding.path === "worker_package" && /keys must be exact/.test(finding.message)));
    for (const result of ["done", "blocked"]) {
      const receipt = { ...receiptExample({ role: "judge", result }), worker_package: workerPackage };
      assert.ok(validateTaskReceipt(receipt, { role: "judge", taskId: "T001", boardPath: receipt.board_path })
        .some((finding) => finding.path === "worker_package"));
    }
  }
});

test("PM blocked closeout is a separately validated exact closed eight-key object", () => {
  const receipt = {
    result: "blocked",
    task_id: "T013",
    board_path: "docs/goals/example/state.yaml",
    authored_by: "pm",
    summary: "Preserved the rejected dispatch and stopped the source task.",
    blocked_reason: "The rejected Worker dispatch cannot supply terminal proof.",
    remaining_blockers: ["A replacement Worker task must address the rejected dispatch."],
    evidence: ["artifacts/T013-rejected-dispatch.json"],
  };
  const context = {
    taskId: "T013",
    boardPath: "docs/goals/example/state.yaml",
  };

  assert.deepEqual(validatePmBlockedCloseoutReceipt(receipt, context), []);
  assert.equal(assertPmBlockedCloseoutReceipt(receipt, context), receipt);
  assert.deepEqual(receipt, {
    result: "blocked",
    task_id: "T013",
    board_path: "docs/goals/example/state.yaml",
    authored_by: "pm",
    summary: "Preserved the rejected dispatch and stopped the source task.",
    blocked_reason: "The rejected Worker dispatch cannot supply terminal proof.",
    remaining_blockers: ["A replacement Worker task must address the rejected dispatch."],
    evidence: ["artifacts/T013-rejected-dispatch.json"],
  });
});

test("PM blocked closeout rejects done conversion, passing commands, Worker authorship, and scope claims", () => {
  const base = {
    result: "blocked",
    task_id: "T013",
    board_path: "docs/goals/example/state.yaml",
    authored_by: "pm",
    summary: "Preserved the rejected dispatch and stopped the source task.",
    blocked_reason: "The rejected Worker dispatch cannot supply terminal proof.",
    remaining_blockers: ["A replacement Worker task is required."],
    evidence: ["artifacts/T013-rejected-dispatch.json"],
  };
  const context = { taskId: "T013", boardPath: base.board_path };
  const cases = [
    [{ ...base, result: "done" }, "result"],
    [{ ...base, commands: [{ cmd: "npm test", status: "pass" }] }, "$"],
    [{ ...base, authored_by: "worker" }, "authored_by"],
    [{ ...base, changed_files: ["src/example.mjs"] }, "$"],
    [{ ...base, scope_clean: true }, "$"],
    [{ ...base, full_outcome_complete: true }, "$"],
    [{ ...base, arbitrary_proof: "not allowed" }, "$"],
  ];

  for (const [receipt, expectedPath] of cases) {
    const findings = validatePmBlockedCloseoutReceipt(receipt, context);
    assert.ok(findings.some((finding) => finding.path === expectedPath), JSON.stringify(receipt));
    assert.throws(
      () => assertPmBlockedCloseoutReceipt(receipt, context),
      (error) => error.code === "RECEIPT_SCHEMA_INVALID" && Array.isArray(error.findings) && error.findings.length > 0,
    );
  }
});

test("PM blocked closeout requires nonempty summary, reason, blockers, and evidence references", () => {
  const base = {
    result: "blocked",
    task_id: "T013",
    board_path: "docs/goals/example/state.yaml",
    authored_by: "pm",
    summary: "Preserved the rejected dispatch and stopped the source task.",
    blocked_reason: "The rejected Worker dispatch cannot supply terminal proof.",
    remaining_blockers: ["A replacement Worker task is required."],
    evidence: ["artifacts/T013-rejected-dispatch.json"],
  };
  const context = { taskId: "T013", boardPath: base.board_path };

  for (const [field, value] of [
    ["summary", undefined],
    ["summary", ""],
    ["blocked_reason", undefined],
    ["blocked_reason", ""],
    ["remaining_blockers", undefined],
    ["remaining_blockers", []],
    ["remaining_blockers", [""]],
    ["evidence", undefined],
    ["evidence", []],
    ["evidence", [""]],
    ["evidence", [{ path: "artifacts/T013-rejected-dispatch.json" }]],
  ]) {
    const receipt = { ...base };
    if (value === undefined) delete receipt[field];
    else receipt[field] = value;
    assert.ok(validatePmBlockedCloseoutReceipt(receipt, context)
      .some((finding) => finding.path === field || finding.path.startsWith(`${field}[`)), `${field}: ${JSON.stringify(value)}`);
  }
});

test("PM blocked closeout rejects task and board identity mismatches", () => {
  const base = {
    result: "blocked",
    task_id: "T013",
    board_path: "docs/goals/example/state.yaml",
    authored_by: "pm",
    summary: "Preserved the rejected dispatch and stopped the source task.",
    blocked_reason: "The rejected Worker dispatch cannot supply terminal proof.",
    remaining_blockers: ["A replacement Worker task is required."],
    evidence: ["artifacts/T013-rejected-dispatch.json"],
  };
  const context = { taskId: "T013", boardPath: base.board_path };

  assert.ok(validatePmBlockedCloseoutReceipt({ ...base, task_id: "T014" }, context)
    .some((finding) => finding.path === "task_id"));
  assert.ok(validatePmBlockedCloseoutReceipt({ ...base, board_path: "docs/goals/other/state.yaml" }, context)
    .some((finding) => finding.path === "board_path"));
  const missingContext = validatePmBlockedCloseoutReceipt(base);
  assert.ok(missingContext.some((finding) => finding.path === "context.taskId"));
  assert.ok(missingContext.some((finding) => finding.path === "context.boardPath"));
});

test("terminal completion fields require caller-proven mechanical finality", () => {
  const receipt = {
    ...receiptExample({ role: "judge", result: "done" }),
    decision: "complete",
    full_outcome_complete: true,
    ...TERMINAL_FIELDS,
  };
  const context = {
    role: "judge",
    taskId: "T001",
    boardPath: receipt.board_path,
  };

  assert.ok(validateTaskReceipt(receipt, context)
    .some((finding) => finding.path === "full_outcome_complete" && /mechanically final/.test(finding.message)));
  assert.deepEqual(validateTaskReceipt(receipt, {
    ...context,
    terminalCompletionEligible: true,
  }), []);
});

test("final Judge and PM examples render one structurally valid exact-completion contract", () => {
  for (const role of ["judge", "pm"]) {
    const receipt = receiptExample({
      role,
      result: "done",
      terminalCompletionEligible: true,
    });
    assert.deepEqual(validateTaskReceipt(receipt, {
      role,
      taskId: "T001",
      boardPath: receipt.board_path,
      terminalCompletionEligible: true,
    }), [], role);
    assert.equal(receipt.completion_disposition, "exact");
    assert.equal(receipt.final_review.status, "complete");
  }
});

test("terminal completion fields are all required together and remain forbidden on Worker and Scout receipts", () => {
  const judge = {
    ...receiptExample({ role: "judge", result: "done" }),
    decision: "complete",
    full_outcome_complete: true,
    ...TERMINAL_FIELDS,
  };
  delete judge.final_review;
  assert.ok(validateTaskReceipt(judge, {
    role: "judge",
    taskId: "T001",
    boardPath: judge.board_path,
    terminalCompletionEligible: true,
  }).some((finding) => /supplied together/.test(finding.message)));

  for (const role of ["worker", "scout"]) {
    const receipt = {
      ...receiptExample({ role, result: "done" }),
      ...TERMINAL_FIELDS,
    };
    const findings = validateTaskReceipt(receipt, {
      role,
      taskId: "T001",
      boardPath: receipt.board_path,
      verify: role === "worker" ? ["npm test"] : [],
    });
    for (const key of Object.keys(TERMINAL_FIELDS)) {
      assert.ok(findings.some((finding) => finding.path === key), `${role}:${key}`);
    }
  }
});

test("terminal completion rejects contradictory blocker and missing-evidence claims", () => {
  const base = {
    ...receiptExample({ role: "judge", result: "done" }),
    decision: "complete",
    full_outcome_complete: true,
    ...TERMINAL_FIELDS,
  };
  for (const [field, value] of [
    ["blocked_tasks", ["T999"]],
    ["missing_evidence", ["Current proof is still missing."]],
    ["required_board_updates", ["Add a repair task."]],
    ["remaining_blockers", ["Owner decision remains."]],
    ["blocked_reason", "The goal is not actually complete."],
    ["waiting_for_user_approval", false],
  ]) {
    const receipt = { ...base, [field]: value };
    const findings = validateTaskReceipt(receipt, {
      role: "judge",
      taskId: "T001",
      boardPath: receipt.board_path,
      terminalCompletionEligible: true,
    });
    assert.ok(findings.some((finding) => finding.path === field), field);
  }
});

test("full outcome completion cannot bypass terminal proof and cannot issue a Worker package", () => {
  for (const role of ["judge", "pm"]) {
    const receipt = {
      ...receiptExample({ role, result: "done" }),
      full_outcome_complete: true,
    };
    const findings = validateTaskReceipt(receipt, {
      role,
      taskId: "T001",
      boardPath: receipt.board_path,
      terminalCompletionEligible: true,
    });
    assert.ok(findings.some((finding) => (
      finding.path === "full_outcome_complete"
      && /terminal completion requires/.test(finding.message)
    )), role);
  }

  const judge = {
    ...receiptExample({ role: "judge", result: "done" }),
    decision: "complete",
    full_outcome_complete: true,
    worker_package: {
      objective: "Repair work remains.",
      allowed_files: ["src/example.mjs"],
      verify: ["npm test"],
      stop_if: ["Need broader authority."],
    },
    ...TERMINAL_FIELDS,
  };
  assert.ok(validateTaskReceipt(judge, {
    role: "judge",
    taskId: "T001",
    boardPath: judge.board_path,
    terminalCompletionEligible: true,
  }).some((finding) => finding.path === "worker_package" && /terminal completion/.test(finding.message)));
});
