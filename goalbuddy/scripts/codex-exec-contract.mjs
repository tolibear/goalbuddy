// Codex emits RFC 9562 UUIDs for persisted thread identities, including UUIDv7.
const CODEX_THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODEX_SERVICE_TIERS = new Set(["default", "fast", "flex"]);
const CODEX_SOL_REASONING_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

export function isCodexThreadId(value) {
  return CODEX_THREAD_ID.test(String(value || ""));
}

export function isCodexServiceTier(value) {
  return CODEX_SERVICE_TIERS.has(String(value || "").toLowerCase());
}

export function isCodexSolReasoningEffort(value) {
  return CODEX_SOL_REASONING_EFFORTS.has(String(value || "").toLowerCase());
}
