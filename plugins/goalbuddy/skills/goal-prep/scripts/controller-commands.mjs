import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const applyReceiptScript = resolve(dirname(fileURLToPath(import.meta.url)), "apply-receipt.mjs");

function commandContext({ boardPath, taskId, stateDigest, receiptPath }) {
  const receiptArgument = JSON.stringify(receiptPath === null ? "<receipt-path>" : receiptPath);
  const prefix = `node ${JSON.stringify(applyReceiptScript)} ${JSON.stringify(dirname(boardPath))} --task ${taskId} --receipt ${receiptArgument} --expected-state-digest ${stateDigest}`;
  return { receiptArgument, prefix };
}

export function buildApplyReceiptCommand({ boardPath, taskId, stateDigest, receiptPath = null, activateTaskId = null }) {
  const { prefix } = commandContext({ boardPath, taskId, stateDigest, receiptPath });
  const activateArgument = activateTaskId ?? "<T###>";

  return {
    operation: "apply_receipt",
    board_path: boardPath,
    task_id: taskId,
    expected_state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    receipt_path: receiptPath,
    activate_task_id: activateTaskId,
    unresolved: [
      ...(receiptPath === null ? ["receipt_path"] : []),
      ...(activateTaskId === null ? ["activate_task_id"] : []),
    ],
    command_template: `${prefix} --activate ${activateArgument} --json`,
  };
}

export function buildApplyHydrationCommand({ boardPath, taskId, stateDigest, hydrateTaskId }) {
  const { prefix } = commandContext({ boardPath, taskId, stateDigest, receiptPath: null });
  return {
    operation: "apply_hydration",
    board_path: boardPath,
    task_id: taskId,
    expected_state_digest: stateDigest,
    digest_kind: "state_yaml_sha256",
    receipt_path: null,
    hydrate_task_id: hydrateTaskId,
    task_card_path: null,
    task_card_sha256: null,
    activate_task_id: hydrateTaskId,
    unresolved: ["receipt_path", "task_card_path", "task_card_sha256"],
    command_template: `${prefix} --hydrate-task ${hydrateTaskId} --task-card "<task-card-path>" --task-card-sha256 <sha256> --activate ${hydrateTaskId} --json`,
  };
}
