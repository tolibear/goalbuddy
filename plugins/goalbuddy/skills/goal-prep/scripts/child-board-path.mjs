import { lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { normalizeBoardTreePath } from "./board-tree.mjs";

export function resolveContainedChildState(goalRoot, declaredPath) {
  const path = normalizeBoardTreePath(declaredPath);
  if (path === "state.yaml") {
    throw new Error("Child board path may not reuse the root state.yaml.");
  }

  const root = resolve(goalRoot);
  const statePath = resolve(root, ...path.split("/"));
  const canonicalRoot = realpathSync(root);
  let canonicalState;
  try {
    canonicalState = realpathSync(statePath);
  } catch (error) {
    throw new Error(`Child board state is unavailable at ${path}: ${error.message}`);
  }
  const expectedCanonicalState = resolve(canonicalRoot, ...path.split("/"));
  if (
    canonicalState !== expectedCanonicalState
    || !canonicalState.startsWith(`${canonicalRoot}${sep}`)
  ) {
    throw new Error(`Child board path must not escape the goal root or contain symlink components: ${path}.`);
  }
  if (!lstatSync(statePath).isFile()) {
    throw new Error(`Child board path must identify a regular state.yaml file: ${path}.`);
  }
  return Object.freeze({ path, statePath });
}
