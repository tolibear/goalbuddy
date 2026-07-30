import test from "node:test";
import assert from "node:assert/strict";
import { isCompletionEligible } from "../../goalbuddy/scripts/completion-eligibility.mjs";
import { buildCompleteGoalCommand } from "../../goalbuddy/scripts/controller-commands.mjs";

function eligibilityInput(overrides = {}) {
  const { task: taskOverrides = {}, ...inputOverrides } = overrides;
  const task = {
    id: "T999",
    type: "judge",
    status: "active",
    receipt: null,
    ...taskOverrides,
  };
  return {
    goalStatus: "active",
    activeTaskId: "T999",
    task,
    tasks: [task],
    ...inputOverrides,
  };
}

test("completion eligibility exactly matches the mechanical complete preconditions", () => {
  assert.equal(isCompletionEligible(eligibilityInput()), true, "Judge is eligible");
  assert.equal(isCompletionEligible(eligibilityInput({ task: { type: "pm" } })), true, "PM is eligible");
  const omittedReceipt = eligibilityInput();
  delete omittedReceipt.task.receipt;
  assert.equal(isCompletionEligible(omittedReceipt), true, "an omitted receipt is receipt-free");
  assert.equal(
    isCompletionEligible(eligibilityInput({
      tasks: [
        { id: "T998", type: "pm", status: "blocked", receipt: { result: "blocked" } },
        { id: "T999", type: "judge", status: "active", receipt: null },
      ],
    })),
    false,
    "blocked siblings prevent completion",
  );
  assert.equal(
    isCompletionEligible(eligibilityInput({
      tasks: [
        { id: "T998", type: "worker", status: "done", receipt: { result: "done" } },
        { id: "T999", type: "judge", status: "active", receipt: null },
      ],
    })),
    true,
    "done siblings permit completion",
  );

  const negatives = [
    ["goal must be active", { goalStatus: "done" }],
    ["active_task must exactly name the task", { activeTaskId: "T998" }],
    ["task must be active", { task: { status: "queued" } }],
    ["Worker cannot complete", { task: { type: "worker" } }],
    ["Scout cannot complete", { task: { type: "scout" } }],
    ["task must be receipt-free", { task: { receipt: { result: "done" } } }],
    [
      "no other queued task is allowed",
      {
        tasks: [
          { id: "T998", type: "pm", status: "queued", receipt: null },
          { id: "T999", type: "judge", status: "active", receipt: null },
        ],
      },
    ],
    [
      "no other active task is allowed",
      {
        tasks: [
          { id: "T998", type: "pm", status: "active", receipt: null },
          { id: "T999", type: "judge", status: "active", receipt: null },
        ],
      },
    ],
  ];
  for (const [label, override] of negatives) {
    assert.equal(isCompletionEligible(eligibilityInput(override)), false, label);
  }
});

test("complete_goal command uses the positional complete grammar without a successor", () => {
  const boardPath = "/repo/docs/goals/widget/state.yaml";
  const stateDigest = "a".repeat(64);
  const command = buildCompleteGoalCommand({
    boardPath,
    taskId: "T999",
    stateDigest,
  });

  assert.deepEqual(command, {
    operation: "complete_goal",
    board_path: boardPath,
    task_id: "T999",
    expected_state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    receipt_path: null,
    unresolved: ["receipt_path"],
    command_template: command.command_template,
  });
  assert.match(
    command.command_template,
    new RegExp(`apply-receipt\\.mjs" complete "/repo/docs/goals/widget" --task T999 --receipt "<receipt-path>" --expected-state-digest ${stateDigest} --json$`),
  );
  assert.doesNotMatch(command.command_template, /--activate/);
});
