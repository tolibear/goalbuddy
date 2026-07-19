import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const canonicalSkill = readFileSync("goalbuddy/SKILL.md", "utf8");
const pluginSkill = readFileSync("plugins/goalbuddy/skills/goal-prep/SKILL.md", "utf8");
const canonicalOpenAI = readFileSync("goalbuddy/agents/openai.yaml", "utf8");
const pluginOpenAI = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/openai.yaml", "utf8");
const canonicalExecution = readFileSync("goalbuddy/references/goal-execution.md", "utf8");
const pluginExecution = readFileSync("plugins/goalbuddy/skills/goal-prep/references/goal-execution.md", "utf8");
const canonicalExecutionReference = readFileSync("goalbuddy/references/goal-execution-reference.md", "utf8");
const pluginExecutionReference = readFileSync("plugins/goalbuddy/skills/goal-prep/references/goal-execution-reference.md", "utf8");
const claudeGoalCommand = readFileSync("plugins/goalbuddy/commands/goal.md", "utf8");
const canonicalAgentsTemplate = readFileSync("goalbuddy/templates/agents.md", "utf8");
const pluginAgentsTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/agents.md", "utf8");
const canonicalGoalTemplate = readFileSync("goalbuddy/templates/goal.md", "utf8");
const pluginGoalTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/goal.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const changelog = readFileSync("CHANGELOG.md", "utf8");
const releaseNotes = readFileSync("docs/releases/0.5.0.md", "utf8");
const receiptSpec = readFileSync("docs/spec/receipt-v1.md", "utf8");
const adaptiveSpec = readFileSync("docs/spec/adaptive-execution-strategy.md", "utf8");
const compilerReference = readFileSync("codex-goal-compiler/references/goalbuddy-compiler.md", "utf8");

const PREPARED_GOAL_COMMAND_MAX_BYTES = 2418;
const EXECUTION_CONTRACT_MAX_BYTES = 18000;

function fakeCodexBin(root) {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, "codex");
  writeFileSync(path, [
    "#!/bin/sh",
    "if [ \"$1\" = \"--version\" ]; then echo \"codex-cli 0.128.0\"; exit 0; fi",
    "if [ \"$1\" = \"login\" ] && [ \"$2\" = \"status\" ]; then echo \"Logged in with ChatGPT\"; exit 0; fi",
    "if [ \"$1\" = \"features\" ] && [ \"$2\" = \"list\" ]; then echo \"goals                               under development  true\"; exit 0; fi",
    "if [ \"$1\" = \"plugin\" ] && [ \"$2\" = \"marketplace\" ] && [ \"$3\" = \"add\" ]; then echo \"Added marketplace goalbuddy\"; exit 0; fi",
    "exit 2",
    "",
  ].join("\n"));
  chmodSync(path, 0o755);
  return bin;
}

test("Goal Prep invocation boundary keeps $goal-prep prepare-only", () => {
  for (const text of [canonicalSkill, pluginSkill]) {
    assert.match(text, /\$goal-prep`: prepare intake, `goal\.md`, `state\.yaml`, and the starter `\/goal` command, then stop/);
    assert.match(text, /During a `\$goal-prep` turn, do not perform the user's requested work/);
    assert.match(text, /Do not refresh or load named skills/);
    assert.match(text, /Do not load that skill, browse that repo, or generate those assets during `\$goal-prep`/);
    assert.match(text, /read GoalBuddy's update ownership/);
    assert.match(text, /check_status: managed_local/);
    assert.match(text, /must not consult or recommend the upstream npm package/);
    assert.match(text, /Intent -> Oracle -> Surface -> Loop -> Proof/);
    assert.match(text, /No oracle, no serious goal/);
    assert.match(text, /Do you want the local GoalBuddy board for this goal\?/);
    assert.match(text, /use the local GoalBuddy board as the default work surface/i);
    assert.match(text, /start the local board before filling the task list/);
    assert.match(text, /node <skill-path>\/surfaces\/local-goal-board\/scripts\/local-goal-board\.mjs --goal docs\/goals\/<slug>/);
    assert.match(text, /do not assume the existing process is stale and do not stop it/);
    assert.match(text, /First check `http:\/\/127\.0\.0\.1:41737\/api\/boards`/);
    assert.match(text, /shared multi-board hub/);
    assert.match(text, /run the GoalBuddy CLI through the user's install channel/);
    assert.match(text, /Codex in-app Browser/);
    assert.match(text, /do not install a GoalBuddy catalog item/);
    assert.match(text, /A good task is the largest safe useful slice/);
    assert.match(text, /Safe does not mean small/);
    assert.match(text, /references\/goal-execution\.md/);
    assert.match(text, /each board has at most one active task/);
    assert.match(text, /depth-one child boards/);
    assert.match(text, /Task ids must match the `T###` shape/);
    assert.match(text, /explicitly invokes `\$goal-prep` on a one-change task/);
    assert.match(text, /Always start `state\.yaml` from `templates\/state\.yaml`/);
    assert.match(text, /scan environment reality before seeding/);
  }
});

test("Goal Prep is explicit or compiler-internal across Codex and Claude", () => {
  for (const text of [canonicalSkill, pluginSkill]) {
    assert.match(text, /^disable-model-invocation: true$/m);
    assert.match(text, /^user-invocable: true$/m);
    assert.match(text, /Goal Prep is an explicit or compiler-internal backend/);
    assert.match(text, /Do not select it implicitly for generic goalization, route selection, or board-compilation requests/);
    assert.match(text, /Decision-complete new-board compilation belongs to Codex Goal Compiler/);
    assert.match(text, /After the compiler accepts its source contract/);
    assert.match(text, /explicitly load this `SKILL\.md` as its declared board-preparation dependency/);
    assert.match(text, /Compiler-internal invocation:[\s\S]*default is file-only/);
    assert.match(text, /Direct `\$goal-prep` or `\/goal-prep` invocation:[\s\S]*local GoalBuddy board as the default work surface/);
    assert.match(text, /for compiler-internal invocation, preserve the compiler-supplied surface and default to file-only/);
    assert.match(text, /for compiler-internal invocation, return the board result to the compiler without another question or user-facing checkpoint/);
  }
  for (const text of [canonicalOpenAI, pluginOpenAI]) {
    assert.match(text, /^\s*allow_implicit_invocation: false$/m);
    assert.doesNotMatch(text, /^\s*allow_implicit_invocation: true$/m);
    assert.match(text, /Use \$goal-prep because I explicitly selected Goal Prep/);
  }
});

test("the compact execution kernel carries every healthy-run invariant", () => {
  const requiredHeadings = [
    "Start and board truth",
    "Authority roles",
    "One write frontier and child boards",
    "Worker authority and stop conditions",
    "Adaptive execution strategy",
    "Dispatch and exact-session continuation",
    "Exact receipts and proof",
    "Typed transitions and exceptional Keeper work",
    "Quiet control plane",
    "Recovery triggers",
    "Final completion",
  ];
  for (const text of [canonicalExecution, pluginExecution]) {
    for (const heading of requiredHeadings) assert.match(text, new RegExp(`## ${heading}`));
    assert.match(text, /state_digest.*state_yaml_sha256/);
    assert.match(text, /board\.tree\.digest.*board_tree_sha256/);
    assert.match(text, /at most one active task and one write-capable Worker/);
    assert.match(text, /depth-one child board/);
    assert.match(text, /allowed_files/);
    assert.match(text, /stop_if/);
    assert.match(text, /A completion claim alone is not proof/);
    assert.match(text, /Never use `codex exec resume --last`/);
    assert.match(text, /exactly one receipt-only repair/);
    assert.match(text, /goalbuddy_receipt_v1/);
    assert.match(text, /full_outcome_complete: true/);
  }
  assert.equal(pluginExecution, canonicalExecution);
  assert.ok(Buffer.byteLength(canonicalExecution) <= EXECUTION_CONTRACT_MAX_BYTES);
});

test("exceptional syntax stays in one non-normative reference", () => {
  assert.equal(pluginExecutionReference, canonicalExecutionReference);
  for (const heading of ["Child-board recipe", "Worktree board-home recipe", "Immutable-history recovery", "Exact-human wait and reply", "Role receipt examples", "Amendment and hydration", "Keeper request and runtime rebind", "Dispatch failure recovery", "Failure-specific recovery"]) {
    assert.match(canonicalExecutionReference, new RegExp(`## ${heading}`));
  }
  assert.match(canonicalExecutionReference, /The executable source is `scripts\/receipt-contract\.mjs`/);
  assert.doesNotMatch(canonicalExecutionReference, /"changed_files"\s*:/);
  assert.doesNotMatch(canonicalExecutionReference, /## Adaptive execution strategy/);
});

test("prepared /goal stays a compact execution entrypoint", () => {
  assert.ok(Buffer.byteLength(claudeGoalCommand) <= PREPARED_GOAL_COMMAND_MAX_BYTES);
  assert.match(claudeGoalCommand, /references\/goal-execution\.md/);
  assert.match(claudeGoalCommand, /read only that charter and the installed Goal Prep kernel/);
  assert.match(claudeGoalCommand, /do not search source repos, locate alternate copies, or compare mirrors/);
  assert.match(claudeGoalCommand, /compact explicit-board resume projection/);
  assert.match(claudeGoalCommand, /Do not load Goal Prep, Codex Goal Compiler, raw `state\.yaml`, or `references\/goal-execution-reference\.md` on a healthy start/);
  assert.match(claudeGoalCommand, /Load only the exceptional-reference recipe named by a kernel trigger/);
  assert.match(claudeGoalCommand, /If the kernel cannot be read, fail closed/);
  assert.doesNotMatch(claudeGoalCommand, /codex-goal-compiler|handoff-prompts|goalbuddy-compiler/);
  assert.doesNotMatch(claudeGoalCommand, /Read the complete `state\.yaml`|Read every reference|Each board has at most one active task/);
});

test("one-location board edits stay direct only when no board read is needed", () => {
  assert.equal(pluginGoalTemplate, canonicalGoalTemplate);
  assert.equal(pluginAgentsTemplate, canonicalAgentsTemplate);

  for (const text of [canonicalExecution, pluginExecution, canonicalSkill, pluginSkill, canonicalGoalTemplate, pluginGoalTemplate, canonicalAgentsTemplate, pluginAgentsTemplate]) {
    assert.match(text, /one[- ]location/);
    assert.match(text, /board read|without reading the board/);
    assert.match(text, /checker/);
    assert.doesNotMatch(text, /for every full-board inspection and every mutation/);
  }

  assert.match(canonicalExecution, /Complete canonical decisions use the deterministic digest-bound CLI directly/);
  assert.match(canonicalExecution, /receipt closeout plus successor activation/);
  assert.match(canonicalExecution, /deterministic digest-bound CLI/);
  assert.match(canonicalExecution, /only when no board read is needed/);
  assert.match(canonicalExecution, /otherwise use Keeper/);
});

test("current public contracts agree on typed transition ownership and exact dispatch admission", () => {
  assert.equal(pluginExecution, canonicalExecution);

  for (const text of [canonicalExecution, readme, changelog, releaseNotes, receiptSpec, adaptiveSpec, compilerReference]) {
    assert.match(text, /typed transition/i);
    assert.doesNotMatch(text, /Keeper remains mandatory for every board read and nontrivial mutation/);
    assert.doesNotMatch(text, /gives the receipt to Board Keeper/);
    assert.doesNotMatch(text, /unless parallel write scopes are provably disjoint/);
  }

  assert.match(canonicalExecution, /--expected-state-digest <sha256>/);
  assert.doesNotMatch(canonicalExecution, /--status done/);
  assert.match(canonicalExecution, /observes the before\/after write frontier/);
  assert.match(canonicalExecution, /stores its authoritative full report in private Git-local transport and returns a compact outcome/);
  assert.match(canonicalExecution, /Do not reconstruct a digest or materialize dispatch JSON by hand/);
  assert.match(readme, /match receipt `changed_files` exactly/);
  assert.match(releaseNotes, /one exact checker-admitted current task/);
  assert.match(receiptSpec, /The receipt's `result` is the sole source of terminal status/);
  assert.match(adaptiveSpec, /subagent receipts pass losslessly to the\n   deterministic typed transition/);
  assert.match(compilerReference, /A dirty baseline is supported and preserved/);
  assert.match(changelog, /Public failures are compact and actionable/);
});

test("the quiet control plane keeps mechanics internal without hiding real blockers", () => {
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /## Quiet control plane/);
    assert.match(text, /GoalBuddy is internal operating state, not the subject of routine user conversation/);
    assert.match(text, /Keep successful resume, prompt rendering, digest relay, receipt application, Keeper\/Ledger work, polling, checker runs, and next-task activation backstage/);
    assert.match(text, /A malformed request rejected before mutation should be corrected silently when safe/);
    assert.match(text, /the user asks/);
    assert.match(text, /recovery is discrepant or uncertain/);
    assert.match(text, /runtime itself blocks product work after bounded repair/);
  }

  assert.doesNotMatch(claudeGoalCommand, /raw `state\.yaml`.*healthy start.*read/i);

  for (const text of [canonicalGoalTemplate, pluginGoalTemplate]) {
    assert.match(text, /Keep routine successful GoalBuddy control-plane mechanics backstage/);
    assert.match(text, /User updates describe product progress, reviews, real blockers, required decisions, and completion evidence/);
  }
});

test("every shipped execution fallback uses child boards as parallel recovery identity", () => {
  assert.equal(pluginAgentsTemplate, canonicalAgentsTemplate);

  for (const text of [canonicalExecution, canonicalAgentsTemplate, pluginAgentsTemplate]) {
    assert.match(text, /at most one active task/);
    assert.match(text, /depth-one child board/);
    assert.match(text, /parallel-plan/);
    assert.match(text, /Worktrees isolate bytes but never replace board recovery identity|worktrees isolate bytes but do not prove semantic independence/);
    assert.doesNotMatch(text, /unless disjoint write scopes are proven/);
    assert.doesNotMatch(text, /unless disjoint write scopes are explicit/);
  }
});

test("mode boundaries stay clean across both documents", () => {
  for (const text of [canonicalSkill, pluginSkill, canonicalExecution, pluginExecution]) {
    assert.doesNotMatch(text, /npx goalbuddy board/);
    assert.doesNotMatch(text, /goalbuddy prompt docs\/goals/);
    assert.doesNotMatch(text, /goalbuddy parallel-plan docs\/goals/);
  }
  assert.doesNotMatch(canonicalSkill, /## Continuation Rule|## Computed Gate|## Completion\n/);
  assert.doesNotMatch(canonicalExecution, /## Guided Intake Surface|## Seed Boards|What `\$goal-prep` Does/);
});

test("slice policy is simple and mirrored across templates and agent payloads", () => {
  const canonicalState = readFileSync("goalbuddy/templates/state.yaml", "utf8");
  const pluginState = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/state.yaml", "utf8");
  const canonicalWorker = readFileSync("goalbuddy/agents/goal_worker.toml", "utf8");
  const pluginWorker = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_worker.toml", "utf8");
  const canonicalJudge = readFileSync("goalbuddy/agents/goal_judge.toml", "utf8");
  const pluginJudge = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_judge.toml", "utf8");

  assert.equal(pluginState, canonicalState);
  assert.equal(pluginWorker, canonicalWorker);
  assert.equal(pluginJudge, canonicalJudge);
  assert.doesNotMatch(canonicalState, /Pick small reviewable work/);
  assert.match(canonicalState, /Pick the largest safe useful slice with the narrowest truthful allowed_files envelope/);
  assert.match(canonicalState, /bounded component or directory globs for broad vertical slices that may create files/);
  assert.match(canonicalState, /max_consecutive_tiny_tasks: 2/);
  assert.match(canonicalWorker, /model_reasoning_effort = "high"/);
  assert.match(canonicalWorker, /complete the whole assigned slice/i);
  assert.match(canonicalWorker, /Never stop with uncommitted changes and no receipt/);
  assert.match(canonicalWorker, /deviations list/);
  assert.match(canonicalWorker, /result-specific done or blocked shape supplied in the current rendered task prompt/);
  assert.doesNotMatch(canonicalWorker, /"result": "done \| blocked"/);
  assert.match(canonicalJudge, /largest safe useful slice/i);
  assert.match(canonicalJudge, /written plan's file list as evidence, not automatically the authority envelope/);
  assert.match(canonicalJudge, /narrowest truthful scope/);
  assert.match(canonicalJudge, /queued placeholder for later atomic hydration/);
});

test("recovery ledger is a read-only reconciler rather than a task actor", () => {
  const canonicalLedger = readFileSync("goalbuddy/agents/goal_ledger.toml", "utf8");
  const pluginLedger = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_ledger.toml", "utf8");
  const claudeLedger = readFileSync("plugins/goalbuddy/agents/goal-ledger.md", "utf8");

  assert.equal(pluginLedger, canonicalLedger);
  assert.match(canonicalLedger, /model = "gpt-5\.6-sol"/);
  assert.match(canonicalLedger, /model_reasoning_effort = "medium"/);
  assert.match(canonicalLedger, /default_permissions = ":read-only"/);
  assert.match(canonicalLedger, /Never edit the board/);
  assert.match(canonicalLedger, /Never.*dispatch a task/);
  assert.match(canonicalLedger, /goalbuddy_ledger_audit_v1/);
  assert.match(canonicalLedger, /state_digest/);
  assert.match(canonicalLedger, /board_tree_digest/);
  assert.match(canonicalLedger, /active_lanes/);
  assert.match(canonicalLedger, /every depth-one child `state\.yaml`/);
  assert.match(canonicalLedger, /Reconcile every `board\.active_lanes` entry/);
  assert.match(canonicalLedger, /exact bundled `commands\.resume` command/);
  assert.doesNotMatch(canonicalLedger, /Run `goalbuddy resume/);
  assert.match(canonicalLedger, /SHA-256 before and after/);
  assert.match(canonicalLedger, /main_agent_action.*continue.*congruent/s);
  assert.match(claudeLedger, /model: claude-opus-4-8/);
  assert.match(claudeLedger, /effort: high/);
  assert.match(claudeLedger, /goalbuddy_ledger_audit_v1/);
  assert.match(claudeLedger, /board_tree_digest/);
  assert.match(claudeLedger, /active_lanes/);
});

test("board keeper is a low-reasoning control-plane writer rather than a task actor", () => {
  const canonicalKeeper = readFileSync("goalbuddy/agents/goal_keeper.toml", "utf8");
  const pluginKeeper = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_keeper.toml", "utf8");
  const claudeKeeper = readFileSync("plugins/goalbuddy/agents/goal-keeper.md", "utf8");

  assert.equal(pluginKeeper, canonicalKeeper);
  assert.match(canonicalKeeper, /model = "gpt-5\.6-sol"/);
  assert.match(canonicalKeeper, /model_reasoning_effort = "low"/);
  assert.match(canonicalKeeper, /default_permissions = ":workspace"/);
  assert.match(canonicalKeeper, /goalbuddy_keeper_request_v1/);
  assert.match(canonicalKeeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(canonicalKeeper, /The PM owns meaning/);
  assert.match(canonicalKeeper, /Never stage, commit, push/);
  assert.match(canonicalKeeper, /Run `checker_command` after every mutation/);
  assert.match(canonicalKeeper, /Never paste the board/);
  assert.match(canonicalKeeper, /Reject `apply_receipt`, `apply_amendment`, `apply_hydration`, `enter_exact_human_wait`, `resume_exact_human_reply`, and `complete_goal` requests/);
  assert.match(canonicalKeeper, /canonical deterministic transitions owned directly by the PM/);
  assert.match(canonicalKeeper, /rebind_goalbuddy/);
  assert.match(canonicalKeeper, /require exactly `transition: null`/);
  assert.match(canonicalKeeper, /"transition": null/);
  assert.match(canonicalKeeper, /"control": null/);
  assert.match(canonicalKeeper, /never substitute a fully-null transition or control object/);
  assert.match(canonicalKeeper, /immutable_history_authorized/);
  assert.match(canonicalKeeper, /immutable_history_compatible/);
  assert.match(canonicalKeeper, /--allow-immutable-history/);
  assert.match(canonicalKeeper, /inspect \| rebind_goalbuddy \| update_control \| repair/);
  assert.doesNotMatch(canonicalKeeper, /\| add_task \|/);
  assert.match(claudeKeeper, /model: claude-opus-4-8/);
  assert.match(claudeKeeper, /effort: low/);
  assert.match(claudeKeeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(claudeKeeper, /Reject `apply_receipt`, `apply_amendment`, `apply_hydration`, `enter_exact_human_wait`, `resume_exact_human_reply`, and `complete_goal` requests/);
  assert.match(claudeKeeper, /rebind_goalbuddy/);
  assert.match(claudeKeeper, /require exactly `transition: null`/);
  assert.match(claudeKeeper, /"transition": null/);
  assert.match(claudeKeeper, /"control": null/);
  assert.match(claudeKeeper, /never substitute a fully-null transition or control object/);
  assert.match(claudeKeeper, /immutable_history_authorized/);
  assert.match(claudeKeeper, /immutable_history_compatible/);
});

test("Codex install keeps Goal Prep in the plugin and removes compatibility skill folders", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-policy-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = {
      ...process.env,
      HOME: root,
      PATH: `${fakeCodexBin(root)}${delimiter}${process.env.PATH}`,
    };
    const install = spawnSync(process.execPath, [
      "internal/cli/goal-maker.mjs",
      "install",
      "--codex-home",
      codexHome,
      "--json",
    ], {
      encoding: "utf8",
      env,
    });
    assert.equal(install.status, 0, install.stderr);
    const report = JSON.parse(install.stdout);
    const installedPluginSkill = readFileSync(join(report.cache_path, "skills", "goal-prep", "SKILL.md"), "utf8");
    const installedOpenAI = readFileSync(join(report.cache_path, "skills", "goal-prep", "agents", "openai.yaml"), "utf8");
    assert.equal(existsSync(join(codexHome, "skills", "goal-maker", "SKILL.md")), false);
    assert.equal(existsSync(join(codexHome, "skills", "goalbuddy", "SKILL.md")), false);
    assert.match(installedPluginSkill, /During a `\$goal-prep` turn, do not perform the user's requested work/);
    assert.match(installedPluginSkill, /^disable-model-invocation: true$/m);
    assert.match(installedOpenAI, /^\s*allow_implicit_invocation: false$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt spec stays consistent with the shipped contracts", () => {
  const spec = readFileSync("docs/spec/receipt-v1.md", "utf8");
  assert.match(spec, /goalbuddy_receipt_v1/);
  assert.match(spec, /worker_package/);
  assert.match(spec, /lists \*\*only passing commands\*\*/);
  assert.match(spec, /blocked_reason/);
  assert.match(spec, /`T` followed by exactly three digits/);
  assert.match(spec, /harness: codex \| claude-code/);
  const execution = readFileSync("goalbuddy/references/goal-execution.md", "utf8");
  for (const field of ["blocked_reason", "changed_files", "full_outcome_complete"]) {
    assert.match(execution, new RegExp(field), `${field} missing from execution contract`);
  }
});

test("adaptive execution strategy governs quality routing in contract and charter", () => {
  const canonicalGoalTemplate = readFileSync("goalbuddy/templates/goal.md", "utf8");
  const pluginGoalTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/goal.md", "utf8");
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /## Adaptive execution strategy/);
    assert.match(text, /Decision risk/);
    assert.match(text, /Execution risk/);
    assert.match(text, /If unsure whether a seam is material, treat it as material/);
    assert.match(text, /dispatch it directly with an outcome-oriented operator prompt/);
    assert.match(text, /Claude resolves semantic capabilities to its native workflow planning, review, simplify, browser-QA, and Codex Exec routes/);
    assert.match(text, /Codex resolves them to its native Omega planning\/review, browser-QA, and Worker routes/);
    assert.match(text, /A completion claim alone is not proof/);
    assert.match(text, /exact current bytes/);
    assert.match(text, /not a prediction contest/);
    assert.match(text, /bounded file, directory, or analyzable glob scope/);
    assert.match(text, /Do not widen an already-active task after writes exist/);
    assert.doesNotMatch(text, /review only at risk or phase boundaries/);
  }
  for (const text of [canonicalGoalTemplate, pluginGoalTemplate]) {
    assert.match(text, /## Execution Strategy/);
    assert.match(text, /Planning horizon: `upfront \| just_in_time \| hybrid`/);
    assert.match(text, /hardened plan → bounded Worker implementation → PM diff review → independent implementation review/);
    assert.match(text, /When unsure, treat the slice as material/);
    assert.match(text, /recorded in the PM's own evidence at the next phase-gate or final-audit receipt, never appended to a Worker receipt/);
    assert.match(text, /do not skip independent review on a material slice on confidence alone/);
    assert.doesNotMatch(text, /review only at phase\/risk\/final boundaries/);
  }
});

test("harness capabilities stay semantic rather than becoming board truth", () => {
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /Board truth names capabilities and proof, not vendor skill names/);
    assert.match(text, /Claude resolves semantic capabilities/);
    assert.match(text, /Codex resolves them/);
    assert.doesNotMatch(text, /workflow-plan|workflow-review|omega-plan|omega-review/);
  }
});
