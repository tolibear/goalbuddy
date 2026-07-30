export function completionEligibility({
  goalStatus,
  activeTaskId,
  task,
  tasks = [],
}) {
  const taskId = task?.id ?? activeTaskId ?? "<unknown>";
  if (goalStatus !== "active") {
    return { eligible: false, reason: "goal_not_active", message: "complete requires goal.status active.", blocking_task_ids: [] };
  }
  if (!task || task.id !== activeTaskId) {
    return { eligible: false, reason: "active_task_mismatch", message: `complete requires active_task ${taskId}.`, blocking_task_ids: [] };
  }
  if (task.status !== "active") {
    return { eligible: false, reason: "task_not_active", message: `complete requires task ${taskId} to be active.`, blocking_task_ids: [] };
  }
  if (!["judge", "pm"].includes(task.type)) {
    return { eligible: false, reason: "task_role_ineligible", message: "complete requires a Judge or PM audit task.", blocking_task_ids: [] };
  }
  if (Object.hasOwn(task, "receipt") && task.receipt !== null) {
    return { eligible: false, reason: "task_has_receipt", message: `complete requires task ${taskId} to be receipt-free.`, blocking_task_ids: [] };
  }
  const blockingTaskIds = tasks.filter((candidate) => (
    candidate?.id !== task.id
    && ["queued", "active"].includes(candidate?.status)
  )).map((candidate) => candidate.id);
  if (blockingTaskIds.length > 0) {
    return {
      eligible: false,
      reason: "unfinished_sibling_tasks",
      message: `complete requires no other queued or active tasks; found ${blockingTaskIds.join(", ")}.`,
      blocking_task_ids: blockingTaskIds,
    };
  }
  return { eligible: true, reason: null, message: null, blocking_task_ids: [] };
}

export function isCompletionEligible(input) {
  return completionEligibility(input).eligible;
}
