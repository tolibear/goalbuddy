import test from "node:test";
import assert from "node:assert/strict";
import { completionEligibility } from "../../goalbuddy/scripts/completion-eligibility.mjs";

function finalAuditTask() {
  return {
    id: "T999",
    type: "judge",
    status: "active",
    receipt: null,
  };
}

test("terminal completion requires every sibling task to be done", () => {
  const task = finalAuditTask();
  const result = completionEligibility({
    goalStatus: "active",
    activeTaskId: task.id,
    task,
    tasks: [
      { id: "T001", type: "worker", status: "done" },
      { id: "T002", type: "scout", status: "blocked" },
      task,
    ],
  });

  assert.deepEqual(result, {
    eligible: false,
    reason: "unfinished_sibling_tasks",
    message: "complete requires every other task to be done; found T002.",
    blocking_task_ids: ["T002"],
  });
});

test("terminal completion remains eligible when every sibling task is done", () => {
  const task = finalAuditTask();
  const result = completionEligibility({
    goalStatus: "active",
    activeTaskId: task.id,
    task,
    tasks: [
      { id: "T001", type: "worker", status: "done" },
      { id: "T002", type: "scout", status: "done" },
      task,
    ],
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.blocking_task_ids, []);
});

test("terminal completion rejects a done parent task whose referenced subgoal is unfinished", () => {
  const task = finalAuditTask();
  const result = completionEligibility({
    goalStatus: "active",
    activeTaskId: task.id,
    task,
    tasks: [
      {
        id: "T001",
        type: "worker",
        status: "done",
        subgoal: {
          path: "subgoals/research/state.yaml",
          status: "active",
          depth: 1,
        },
      },
      task,
    ],
  });

  assert.deepEqual(result, {
    eligible: false,
    reason: "unfinished_subgoals",
    message: "complete requires every referenced subgoal to be done; found T001.",
    blocking_task_ids: ["T001"],
  });
});

test("terminal completion permits a done parent task whose referenced subgoal is done", () => {
  const task = finalAuditTask();
  const result = completionEligibility({
    goalStatus: "active",
    activeTaskId: task.id,
    task,
    tasks: [
      {
        id: "T001",
        type: "worker",
        status: "done",
        subgoal: {
          path: "subgoals/research/state.yaml",
          status: "done",
          depth: 1,
        },
      },
      task,
    ],
  });

  assert.equal(result.eligible, true);
  assert.deepEqual(result.blocking_task_ids, []);
});
