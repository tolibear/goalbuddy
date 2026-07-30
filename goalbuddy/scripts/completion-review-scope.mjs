import { parseGoalStateText } from "../surfaces/local-goal-board/scripts/lib/goal-board.mjs";
import {
  isGoalBuddyControlPath,
  normalizeRepositoryPath,
  repositoryRoot,
} from "./dispatch-scope-manifest.mjs";

export function collectRequiredReviewPaths({
  root,
  boardSnapshots,
}) {
  const repository = repositoryRoot(root);
  if (!Array.isArray(boardSnapshots) || boardSnapshots.length === 0) {
    throw new Error("Completion review coverage requires checked root and child board snapshots.");
  }
  const paths = new Set();

  for (const snapshot of boardSnapshots) {
    if (typeof snapshot?.text !== "string") {
      throw new Error("Completion review coverage requires exact board snapshot text.");
    }
    const document = parseGoalStateText(snapshot.text, { allowFallback: false });
    for (const task of document.tasks || []) {
      if (String(task?.type || "").toLowerCase() !== "worker"
          || task?.status !== "done"
          || task?.receipt?.result !== "done") {
        continue;
      }
      if (!Array.isArray(task.receipt.changed_files) || task.receipt.changed_files.length === 0) {
        throw new Error(`Completed Worker ${task.id || "<unknown>"} lacks changed_files coverage evidence.`);
      }
      for (const changedPath of task.receipt.changed_files) {
        paths.add(canonicalExactPath(repository, changedPath, `Worker ${task.id || "<unknown>"} changed_files`));
      }
    }
  }

  const required = [...paths]
    .filter((path) => !isGoalBuddyControlPath(path))
    .sort();
  return Object.freeze(required);
}

function canonicalExactPath(root, value, label) {
  if (typeof value !== "string"
      || value.length === 0
      || value !== value.trim()
      || value.includes("\\")
      || /[\u0000-\u001f\u007f]/.test(value)
      || /[*?[\]]/.test(value)) {
    throw new Error(`${label} must name a canonical exact repository path.`);
  }
  return normalizeRepositoryPath(root, value);
}
