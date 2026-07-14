import { createHash } from "node:crypto";
import { posix } from "node:path";

export const BOARD_TREE_VERSION = 1;

export function normalizeBoardTreeEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("board tree must contain at least the root state.yaml");
  }

  const seen = new Set();
  const normalized = entries.map((entry) => {
    const path = normalizeBoardTreePath(entry?.path);
    const stateDigest = String(entry?.state_digest || "");
    if (!/^[a-f0-9]{64}$/.test(stateDigest)) {
      throw new Error(`board tree entry ${path} has an invalid state digest`);
    }
    if (seen.has(path)) throw new Error(`board tree contains duplicate path: ${path}`);
    seen.add(path);
    return { ...entry, path, state_digest: stateDigest };
  });

  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

export function boardTreeDigest(entries) {
  const boards = normalizeBoardTreeEntries(entries).map(({ path, state_digest }) => ({ path, state_digest }));
  return createHash("sha256")
    .update(JSON.stringify({ version: BOARD_TREE_VERSION, boards }))
    .digest("hex");
}

export function normalizeBoardTreePath(value) {
  const raw = String(value || "").replace(/\\/g, "/");
  if (!raw || raw.startsWith("/") || /^[A-Za-z]:\//.test(raw)) {
    throw new Error(`board tree path must be relative: ${raw || "<missing>"}`);
  }
  const normalized = posix.normalize(raw).replace(/^\.\//, "");
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`board tree path escapes the goal root: ${raw}`);
  }
  if (posix.basename(normalized) !== "state.yaml") {
    throw new Error(`board tree path must name state.yaml: ${raw}`);
  }
  return normalized;
}
