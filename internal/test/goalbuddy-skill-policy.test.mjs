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
const claudeGoalCommand = readFileSync("plugins/goalbuddy/commands/goal.md", "utf8");
const canonicalAgentsTemplate = readFileSync("goalbuddy/templates/agents.md", "utf8");
const pluginAgentsTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/agents.md", "utf8");
const canonicalGoalTemplate = readFileSync("goalbuddy/templates/goal.md", "utf8");
const pluginGoalTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/goal.md", "utf8");

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

test("the execution contract carries the /goal runtime rules", () => {
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /governs `\/goal` runs/);
    assert.match(text, /node <skill-path>\/scripts\/render-task-prompt\.mjs docs\/goals\/<slug>/);
    assert.match(text, /node <skill-path>\/scripts\/resume-board\.mjs docs\/goals\/<slug> --json/);
    assert.match(text, /node <skill-path>\/scripts\/parallel-plan\.mjs docs\/goals\/<slug>/);
    assert.match(text, /board\.tree\.digest/);
    assert.match(text, /every root\/child board in `board\.tree\.boards`/);
    assert.match(text, /Each board may have at most one active task/);
    assert.match(text, /depth-one child board/);
    assert.match(text, /Separate branches or worktrees preserve bytes but do not prove semantic independence/);
    assert.match(text, /same checker-validated root\/child snapshots as resume/);
    assert.match(text, /Operator Escalation/);
    assert.match(text, /ask the operator one concise question before creating the external artifact/);
    assert.match(text, /This section applies after the user starts `\/goal Follow docs\/goals\/<slug>\/goal\.md\.`/);
    assert.match(text, /exact human reply is the only remaining blocker/);
    assert.match(text, /waiting_for_user_approval: true/);
    assert.match(text, /exact_human_approval_can_terminal_wait: true/);
    assert.match(text, /Queued dependents remain inert/);
    assert.match(text, /No receipt may claim `decision: complete`/);
    assert.match(text, /required_reply: "<exact string>"/);
    assert.match(text, /sole `exact_human_reply` shape/);
    assert.match(text, /do not invent or interpret approval classes/);
    assert.match(text, /Board Health Stewardship/);
    assert.match(text, /Keeper is on demand or warm within one uninterrupted session, not an always-on poller/);
    assert.match(text, /node <skill-path>\/scripts\/check-goal-state\.mjs docs\/goals\/<slug>/);
    assert.match(text, /Repair only GoalBuddy control files/);
    assert.match(text, /Never edit product implementation files during board-health work/);
    assert.match(text, /goalbuddy_receipt_v1/);
    assert.match(text, /full_outcome_complete: true/);
    assert.match(text, /A `done` Worker receipt must list only passing commands/);
    assert.match(text, /result: blocked/);
    assert.match(text, /blocked_reason/);
    assert.match(text, /do not widen its `allowed_files` mid-flight/);
    assert.match(text, /Boards Move Between Harnesses/);
    assert.match(text, /never reconstruct progress from chat history/);
    assert.match(text, /optional `harness` field/);
    assert.match(text, /### Mixed Fleets/);
    assert.match(text, /receipt may still be in flight/);
    assert.match(text, /run the full goal oracle suite/);
    assert.match(text, /node <skill-path>\/scripts\/apply-receipt\.mjs docs\/goals\/<slug>/);
    assert.match(text, /goalbuddy complete docs\/goals\/<slug>/);
    assert.match(text, /node <skill-path>\/scripts\/dispatch-task\.mjs docs\/goals\/<slug> --to codex/);
    assert.match(text, /Never dispatch externally by default/);
    assert.match(text, /The dispatcher never edits `state\.yaml`/);
    assert.match(text, /### Board Keeper/);
    assert.match(text, /goalbuddy_keeper_request_v1/);
    assert.match(text, /goalbuddy_keeper_receipt_v1/);
    assert.match(text, /apply_amendment/);
    assert.match(text, /--add-tasks task-cards\.json/);
    assert.match(text, /apply_hydration/);
    assert.match(text, /--hydrate-task T042/);
    assert.match(text, /Product-specific approval phrases and boundary classifications are not task-card fields/);
    assert.match(text, /Do not embed a long task payload in prose/);
    assert.match(text, /For `rebind_goalbuddy`, set `transition: null` exactly/);
    assert.match(text, /Do not send an all-null transition object/);
    assert.match(text, /may directly apply one narrow, one-location mutation only when the exact file, location, old value, and new value are already known/);
    assert.match(text, /if the PM needs or expects to need any board read, use Keeper from the outset/);
    assert.match(text, /does not participate in an atomic receipt, status-plus-successor, scope, authority, approval, or completion transition/);
    assert.match(text, /run the bundled checker immediately/);
    assert.doesNotMatch(text, /for every full-board inspection and every mutation/);
    assert.match(text, /Ledger remains independently read-only/);
    assert.match(text, /`wait_agent` polling timeout while the target agent still reports `running` is only a polling interval expiry/);
    assert.match(text, /Continue polling the same live agent/);
    assert.match(text, /do not interrupt, replace, redispatch, declare a timeout, or trigger PM fallback solely because a poll expired/);
    assert.match(text, /absence is not evidence of inactivity during reading, analysis, planning, or verification/);
    assert.match(text, /Read-only Judge and Ledger work, plus inspection-only Keeper work, may never create allowed-file diffs/);
    assert.match(text, /configured job\/runtime deadline is actually exceeded/);
    assert.match(text, /Preserve the one-agent\/no-duplicate-dispatch rule/);
    assert.doesNotMatch(text, /After one `wait_agent` timeout/);
  }
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

  assert.match(canonicalExecution, /multi-location mutations, receipts, task cards/);
  assert.match(canonicalExecution, /if the PM needs or expects to need any board read, use Keeper from the outset/);
  assert.match(canonicalExecution, /If the edit misses its expected context or the checker fails, restore only that edit and route the operation to Keeper/);
  assert.match(canonicalExecution, /do not reclassify it as a narrow direct edit/);
});

test("the quiet control plane keeps mechanics internal without hiding real blockers", () => {
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /## Quiet Control Plane/);
    assert.match(text, /GoalBuddy is internal operating state, not the subject of routine user conversation/);
    assert.match(text, /Keep every safety mechanism in this contract, but keep successful mechanics backstage/);
    assert.match(text, /Do not narrate routine successful control-plane events/);
    assert.match(text, /a malformed control-plane request that was rejected before mutation and can be corrected safely/);
    assert.match(text, /Do not use `GoalBuddy`, `board`, `Keeper`, `Ledger`, `digest`, `receipt`, `checker`, or a `T###` identifier in a routine user update/);
    assert.match(text, /The authentication slice is verified; I’m moving to session revocation/);
    assert.match(text, /the user asks about GoalBuddy or its mechanics/);
    assert.match(text, /recovery is discrepant or uncertain/);
    assert.match(text, /is the actual blocker after bounded retry/);
    assert.match(text, /Never hide a real discrepancy, approval gate, failed verification, possible duplicate Worker, or unsafe state/);
    assert.match(text, /communication boundary, not a reduction in durable proof/);
    assert.match(text, /product-facing progress updates under the Quiet Control Plane/);
  }

  for (const text of [canonicalSkill, pluginSkill, claudeGoalCommand]) {
    assert.match(text, /Routine successful board, Keeper, Ledger, digest, receipt, checker, prompt-rendering, and polling mechanics stay out of user-facing updates|Keep routine successful board, Keeper, Ledger, digest, receipt, checker, prompt-rendering, and polling mechanics out of user-facing updates/);
  }

  for (const text of [canonicalGoalTemplate, pluginGoalTemplate]) {
    assert.match(text, /Keep routine successful GoalBuddy control-plane mechanics backstage/);
    assert.match(text, /User updates describe product progress, reviews, real blockers, required decisions, and completion evidence/);
  }
});

test("every shipped execution fallback uses child boards as parallel recovery identity", () => {
  assert.equal(pluginAgentsTemplate, canonicalAgentsTemplate);

  for (const text of [claudeGoalCommand, canonicalAgentsTemplate, pluginAgentsTemplate]) {
    assert.match(text, /at most one active task/);
    assert.match(text, /depth-one child board/);
    assert.match(text, /parallel-plan/);
    assert.match(text, /Worktrees isolate bytes but never replace board recovery identity/);
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
  assert.match(canonicalState, /Pick the largest safe useful slice with clear allowed_files, verify commands, and stop conditions/);
  assert.match(canonicalState, /max_consecutive_tiny_tasks: 2/);
  assert.match(canonicalWorker, /model_reasoning_effort = "high"/);
  assert.match(canonicalWorker, /complete the whole assigned slice/i);
  assert.match(canonicalWorker, /Never stop with uncommitted changes and no receipt/);
  assert.match(canonicalWorker, /"deviations": \[\]/);
  assert.match(canonicalJudge, /largest safe useful slice/i);
  assert.match(canonicalJudge, /copy the plan section's own file list into allowed_files verbatim/);
});

test("recovery ledger is a read-only reconciler rather than a task actor", () => {
  const canonicalLedger = readFileSync("goalbuddy/agents/goal_ledger.toml", "utf8");
  const pluginLedger = readFileSync("plugins/goalbuddy/skills/goal-prep/agents/goal_ledger.toml", "utf8");
  const claudeLedger = readFileSync("plugins/goalbuddy/agents/goal-ledger.md", "utf8");

  assert.equal(pluginLedger, canonicalLedger);
  assert.match(canonicalLedger, /model = "gpt-5\.6-sol"/);
  assert.match(canonicalLedger, /model_reasoning_effort = "medium"/);
  assert.match(canonicalLedger, /sandbox_mode = "read-only"/);
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
  assert.match(canonicalKeeper, /sandbox_mode = "workspace-write"/);
  assert.match(canonicalKeeper, /goalbuddy_keeper_request_v1/);
  assert.match(canonicalKeeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(canonicalKeeper, /The PM owns meaning/);
  assert.match(canonicalKeeper, /Never stage, commit, push/);
  assert.match(canonicalKeeper, /Run `checker_command` after every mutation/);
  assert.match(canonicalKeeper, /Never paste the board/);
  assert.match(canonicalKeeper, /apply_amendment/);
  assert.match(canonicalKeeper, /apply_hydration/);
  assert.match(canonicalKeeper, /enter_exact_human_wait/);
  assert.match(canonicalKeeper, /resume_exact_human_reply/);
  assert.match(canonicalKeeper, /complete_goal/);
  assert.match(canonicalKeeper, /rebind_goalbuddy/);
  assert.match(canonicalKeeper, /require exactly `transition: null`/);
  assert.match(canonicalKeeper, /"transition": null/);
  assert.match(canonicalKeeper, /"control": null/);
  assert.match(canonicalKeeper, /never substitute a fully-null transition or control object/);
  assert.match(canonicalKeeper, /immutable_history_authorized/);
  assert.match(canonicalKeeper, /immutable_history_compatible/);
  assert.match(canonicalKeeper, /--allow-immutable-history/);
  assert.match(canonicalKeeper, /reply_file_path/);
  assert.match(canonicalKeeper, /not authenticated human identity or product authorization/);
  assert.match(canonicalKeeper, /task_cards_path/);
  assert.match(canonicalKeeper, /hydrate_task_id/);
  assert.match(canonicalKeeper, /task_card_path/);
  assert.match(canonicalKeeper, /task_card_sha256/);
  assert.doesNotMatch(canonicalKeeper, /\| add_task \|/);
  assert.match(claudeKeeper, /model: claude-opus-4-8/);
  assert.match(claudeKeeper, /effort: low/);
  assert.match(claudeKeeper, /goalbuddy_keeper_receipt_v1/);
  assert.match(claudeKeeper, /enter_exact_human_wait/);
  assert.match(claudeKeeper, /resume_exact_human_reply/);
  assert.match(claudeKeeper, /complete_goal/);
  assert.match(claudeKeeper, /rebind_goalbuddy/);
  assert.match(claudeKeeper, /require exactly `transition: null`/);
  assert.match(claudeKeeper, /"transition": null/);
  assert.match(claudeKeeper, /"control": null/);
  assert.match(claudeKeeper, /never substitute a fully-null transition or control object/);
  assert.match(claudeKeeper, /immutable_history_authorized/);
  assert.match(claudeKeeper, /immutable_history_compatible/);
  assert.match(claudeKeeper, /not authenticated human identity or product authorization/);
});

test("Codex install keeps Goal Prep in the plugin and removes compatibility skill folders", () => {
  const root = mkdtempSync(join(tmpdir(), "goalbuddy-policy-"));
  try {
    const codexHome = join(root, "codex-home");
    const env = {
      ...process.env,
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
  for (const field of ["worker_package", "blocked_reason", "changed_files", "full_outcome_complete"]) {
    assert.match(execution, new RegExp(field), `${field} missing from execution contract`);
  }
});

test("adaptive execution strategy governs quality routing in contract and charter", () => {
  const canonicalGoalTemplate = readFileSync("goalbuddy/templates/goal.md", "utf8");
  const pluginGoalTemplate = readFileSync("plugins/goalbuddy/skills/goal-prep/templates/goal.md", "utf8");
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /## Adaptive Execution Strategy/);
    assert.match(text, /Decision risk: ambiguity, architectural choices, competing approaches/);
    assert.match(text, /Execution risk: blast radius, integration breadth, long autonomous duration/);
    assert.match(text, /auth, money, permissions, migrations, data integrity, public contracts, irreversible actions/);
    assert.match(text, /When unsure, treat the slice as material/);
    assert.match(text, /PM confidence alone is never a sufficient reason to skip independent review/);
    assert.match(text, /record that downward deviation in PM-owned evidence/);
    assert.match(text, /Never append it to a Worker's receipt/);
    assert.match(text, /a clean review does not close a phase gate, and a Judge decision does not replace review evidence/);
    assert.match(text, /Model identity for either tier is a runtime routing choice, never board data/);
    assert.match(text, /\| Plan hardening \| Workflow Plan \| Omega Plan \|/);
    assert.match(text, /A completion claim alone is not proof/);
    assert.match(text, /tightened at runtime and never silently loosened/);
    assert.match(text, /Decisive verification must prove the exact current bytes/);
    assert.match(text, /preserve the checkpoint, repair and retry only the failed gate/);
    assert.match(text, /never enter board truth/);
    assert.match(text, /Independent implementation review is not a Judge task/);
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

test("native harness goal loops are documented without becoming board truth", () => {
  for (const text of [canonicalExecution, pluginExecution]) {
    assert.match(text, /## Native Harness Goal Loops/);
    assert.match(text, /judges the goal condition\s+against the conversation transcript only/);
    assert.match(text, /surface decisive proof in turn text/);
    assert.match(text, /A prose-only turn does not itself suppress continuation/);
    assert.match(text, /do\s+not make meaningless tool calls merely to keep the loop alive/);
    assert.match(text, /`budget_limited`\s+with wrap-up\s+steering/);
    assert.match(text, /Do not let a harness evaluator's "achieved" verdict or a wrap-up steering\s+message substitute for that receipt/);
  }
});
