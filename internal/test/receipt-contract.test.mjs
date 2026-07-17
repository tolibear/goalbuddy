import test from "node:test";
import assert from "node:assert/strict";
import { assertTaskReceipt, receiptExample, validateTaskReceipt } from "../../goalbuddy/scripts/receipt-contract.mjs";

const roles = ["worker", "judge", "scout", "pm"];
const results = ["done", "blocked"];

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
