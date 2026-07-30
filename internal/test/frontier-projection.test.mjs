import test from "node:test";
import assert from "node:assert/strict";
import { createSemanticFrontier } from "../../goalbuddy/scripts/frontier-projection.mjs";

const SHA = "a".repeat(64);
const REVIEW_SOURCE = {
  kind: "review_artifact",
  path: "reviews/round-1.json",
  sha256: SHA,
};
const RECEIPT_SOURCE = {
  kind: "stored_receipt",
  task_id: "T001",
  board_path: "docs/goals/example/state.yaml",
};
const TASK_SOURCE = {
  kind: "board_task",
  task_id: "T001",
  board_path: "docs/goals/example/state.yaml",
};

function fixture() {
  return {
    resumeProjection: {
      board: {
        path: "docs/goals/example",
        goal_path: "docs/goals/example/goal.md",
        title: "Ship the semantic frontier",
        status: "active",
        oracle: {
          signal: "Fresh Fable parity",
          cadence: "Per material slice",
          final_proof: "Two fresh-harness journeys",
        },
        intake: {
          interpreted_outcome: "Reduce mechanics without weakening judgment.",
        },
        active_task: {
          id: "T001",
          type: "worker",
          assignee: "Codex Worker",
          status: "active",
          objective: "Implement a material product change.",
          inputs: ["Approved plan"],
          constraints: ["Do not weaken review"],
          expected_output: ["Working implementation"],
          stop_if: ["A product decision is unresolved"],
          brief: { path: "notes/T001-brief.md", sha256: SHA },
          transition_evidence: {
            codex_worker_session: {
              session_id: "019f6dab-7b25-7620-9da6-4f79a0648146",
            },
            held_receipts: [{
              kind: "goalbuddy_held_receipt_v1",
              task_id: "T001",
              handle: "b".repeat(64),
              application_state: "held",
              receipt_transport: "explicit_file",
              report_transport: "not_applicable",
              dispatch_disposition: "not_applicable",
              admitted_state_digest: "c".repeat(64),
            }],
          },
        },
        approval_gates: [{
          task_id: "T007",
          required_reply: "Approve the product decision.",
        }],
        planning_inventory: {
          queued_tasks: [{
            id: "T002",
            objective: "Hydrate the next material slice.",
            dependency_ready: true,
            needs_hydration: true,
          }],
        },
      },
      recovery: { worker_liveness: "unknown" },
      commands: {
        resume: "node secret-command-template --state-digest deadbeef",
      },
    },
    repositoryEvidence: {
      changed_paths: [{
        path: "src/frontier.mjs",
        change: "added",
        raw_receipt: { should_not: "escape" },
        source: {
          kind: "diff_identity",
          identity: "dirty-snapshot:one",
          scope: ["src/**"],
          state_digest: "must-not-escape",
        },
      }],
      verification: [{
        check: "focused Node tests",
        status: "failed",
        summary: "One assertion remains.",
        source: RECEIPT_SOURCE,
      }],
      receipts: [
        {
          task_id: "T001",
          outcome: "done",
          authority: "original_role",
          disposition: "accepted",
          summary: "Explicit terminal receipt.",
          source: RECEIPT_SOURCE,
        },
        {
          task_id: "T013",
          outcome: "blocked",
          authority: "pm_blocked_closeout",
          disposition: "rejected",
          summary: "Rejected dispatch closed honestly by PM.",
          source: {
            kind: "stored_receipt",
            task_id: "T013",
            board_path: "docs/goals/example/state.yaml",
          },
        },
      ],
      provenance: [
        {
          task_id: "T001",
          application_state: "applied",
          receipt_transport: "git_local_report",
          report_transport: "ready",
          dispatch_disposition: "accepted",
          closeout_authority: "original_role",
          evidence_status: "durable_after_report_cleanup",
          source: {
            kind: "transition_provenance",
            task_id: "T001",
            board_path: "docs/goals/example/state.yaml",
          },
        },
        {
          task_id: "T019",
          application_state: "applied",
          receipt_transport: "explicit_file",
          report_transport: "unavailable",
          dispatch_disposition: "accepted",
          closeout_authority: "original_role",
          evidence_status: "retained_dispatch_output",
          source: {
            kind: "transition_provenance",
            task_id: "T019",
            board_path: "docs/goals/example/state.yaml",
          },
        },
      ],
      reviews: [
        {
          identity: "round-one",
          round: 1,
          status: "complete",
          scope_status: "exact",
          findings: 8,
          accepted_findings: 6,
          yield: "high",
          reviewer: "independent-code-review",
          selection: "selected_for_material_diff",
          adjudication: "six_findings_accepted",
          source: REVIEW_SOURCE,
        },
        {
          identity: "round-two",
          round: 2,
          status: "complete",
          scope_status: "wrong_scope",
          findings: 1,
          accepted_findings: 0,
          yield: "diminishing",
          reviewer: "independent-code-review",
          selection: "selected_as_convergence_check",
          adjudication: "finding_rejected",
          source: {
            ...REVIEW_SOURCE,
            path: "reviews/round-2.json",
          },
        },
      ],
      scope_anomalies: [{
        kind: "unexpected_write",
        status: "open",
        detail: "Review included an unrelated generated file.",
        source: {
          ...REVIEW_SOURCE,
          path: "reviews/scope-anomaly.json",
        },
      }],
      final_review: {
        status: "complete",
        identity_status: "stale",
        completeness: "complete",
        unresolved_blockers: [],
        source: {
          ...REVIEW_SOURCE,
          path: "reviews/final.json",
        },
      },
      browser: [{
        state: "completed form",
        verdict: "accepted",
        decisive: true,
        summary: "The success state is visually correct.",
        source: {
          kind: "screenshot_artifact",
          path: "screenshots/completed-form.png",
          sha256: SHA,
        },
      }],
      deviations: [{
        id: "D001",
        description: "The final review identity is intentionally stale.",
        status: "accepted",
        source: RECEIPT_SOURCE,
      }],
      deviation_acceptance: {
        status: "accepted",
        exact_set: true,
        accepted_ids: ["D001"],
        source: RECEIPT_SOURCE,
      },
      unresolved_decisions: [{
        id: "PD001",
        status: "blocked",
        decision: "Owner must choose the activation threshold.",
        source: TASK_SOURCE,
      }],
      drill_down: [
        {
          purpose: "Inspect the full product diff.",
          source: { kind: "diff_identity", identity: "dirty-snapshot:one", scope: ["src/**"] },
        },
        {
          purpose: "Inspect decisive UI evidence.",
          source: {
            kind: "screenshot_artifact",
            path: "screenshots/completed-form.png",
            sha256: SHA,
          },
        },
      ],
      held_receipts: [{
        task_id: "T999",
        handle: "repository-side-channel-must-be-ignored",
        source: TASK_SOURCE,
      }],
    },
  };
}

test("creates the stable semantic frontier without mutating validated inputs", () => {
  const input = fixture();
  const before = structuredClone(input);
  const frontier = createSemanticFrontier(input);

  assert.deepEqual(Object.keys(frontier), [
    "kind",
    "goal",
    "slice",
    "worker",
    "evidence",
    "reviews",
    "deviations",
    "decisions",
    "drill_down",
  ]);
  assert.equal(frontier.kind, "goalbuddy_frontier_v1");
  assert.deepEqual(input, before);
  assert.deepEqual(createSemanticFrontier(input), frontier);
});

test("normal frontier is allowlisted and excludes raw control and exact Worker identity", () => {
  const frontier = createSemanticFrontier(fixture());
  const json = JSON.stringify(frontier);
  for (const forbidden of [
    "state_digest",
    "tree_digest",
    "board_tree_digest",
    "session_id",
    "019f6dab-7b25-7620-9da6-4f79a0648146",
    "\"commands\"",
    "secret-command-template",
    "checker",
    "raw_receipt",
    "unchanged_poll",
    "dispatch-reports",
  ]) {
    assert.equal(json.includes(forbidden), false, forbidden);
  }
  assert.equal(frontier.worker.session_binding, "present_redacted");
  assert.equal(frontier.worker.liveness, "unknown");
});

test("held artifacts come only from the checked resume projection", () => {
  const frontier = createSemanticFrontier(fixture());
  assert.equal(frontier.evidence.held_receipts.length, 1);
  assert.equal(frontier.evidence.held_receipts[0].task_id, "T001");
  assert.equal(frontier.evidence.held_receipts[0].handle, "b".repeat(64));
  assert.equal(frontier.evidence.held_receipts[0].source.kind, "held_artifact");
  assert.equal(JSON.stringify(frontier).includes("repository-side-channel"), false);
});

test("active child lanes remain visible without leaking their control projection", () => {
  const input = fixture();
  const rootTask = structuredClone(input.resumeProjection.board.active_task);
  const childTask = {
    ...structuredClone(rootTask),
    id: "T010",
    objective: "Implement the independent child lane.",
    transition_evidence: {
      held_receipts: [{
        task_id: "T010",
        handle: "c".repeat(64),
        receipt_transport: "explicit_file",
        report_transport: "not_applicable",
        dispatch_disposition: "not_applicable",
      }],
    },
  };
  input.resumeProjection.board.active_lanes = [
    {
      kind: "root",
      board_path: "docs/goals/example",
      state_digest: "d".repeat(64),
      prompt: "secret root prompt",
      active_task: rootTask,
    },
    {
      kind: "child",
      board_path: "docs/goals/example/subgoals/T001-child",
      state_digest: "e".repeat(64),
      prompt: "secret child prompt",
      active_task: childTask,
    },
  ];

  const frontier = createSemanticFrontier(input);
  assert.deepEqual(frontier.slice.active_lanes.map((lane) => lane.id), ["T001", "T010"]);
  assert.deepEqual(frontier.worker.active_lanes.map((lane) => lane.id), ["T001", "T010"]);
  assert.deepEqual(
    frontier.evidence.held_receipts.map((held) => held.handle),
    ["b".repeat(64), "c".repeat(64)],
  );
  assert.equal(frontier.slice.active_lanes[1].source.board_path, "docs/goals/example/subgoals/T001-child");
  assert.doesNotMatch(JSON.stringify(frontier), /state_digest|secret child prompt|secret root prompt/);
});

test("missing proof and malformed sources remain explicit instead of becoming success", () => {
  const frontier = createSemanticFrontier({
    resumeProjection: { board: {} },
    repositoryEvidence: {
      changed_paths: [{ path: "src/unproven.mjs" }],
      verification: [{
        check: "unbound check",
        status: "pass",
        source: { kind: "stored_receipt", task_id: "T001" },
      }],
      browser: [{
        state: "unbound screenshot",
        verdict: "accepted",
        decisive: true,
        source: { kind: "screenshot_artifact", path: "screenshots/unbound.png" },
      }],
      final_review: { status: "complete" },
    },
  });
  assert.equal(frontier.slice.status, "unavailable");
  assert.equal(frontier.worker.status, "unavailable");
  assert.equal(frontier.evidence.changed_paths[0].status, "unavailable");
  assert.equal(frontier.evidence.verification[0].status, "unavailable");
  assert.equal(frontier.evidence.browser[0].status, "unavailable");
  assert.equal(frontier.reviews.final_review.status, "unavailable");
  assert.equal(frontier.goal.source.status, "unavailable");
});

const retainedSituations = [
  ["active material Worker", (f) => f.worker.state === "active" && f.slice.objective.includes("material")],
  ["cleanup-safe applied provenance", (f) => (
    f.evidence.provenance[0].application_state === "applied"
    && f.evidence.provenance[0].evidence_status === "durable_after_report_cleanup"
  )],
  ["unavailable report transport", (f) => f.evidence.provenance[1].report_transport === "unavailable"],
  ["explicit terminal receipt", (f) => f.evidence.receipts[0].outcome === "done"],
  ["rejected dispatch plus PM closeout", (f) => (
    f.evidence.receipts[1].disposition === "rejected"
    && f.evidence.receipts[1].authority === "pm_blocked_closeout"
  )],
  ["held unapplied artifact", (f) => f.evidence.held_receipts[0].state === "held_unapplied"],
  ["wrong-scope review", (f) => f.reviews.rounds[1].scope_status === "wrong_scope"],
  ["early high-yield review", (f) => (
    f.reviews.round_yield[0].yield === "high"
    && f.reviews.round_yield[0].accepted_findings === 6
  )],
  ["later diminishing review", (f) => f.reviews.round_yield[1].yield === "diminishing"],
  ["blocked product decision", (f) => f.decisions.unresolved[0].status === "blocked"],
  ["scope anomaly", (f) => f.reviews.scope_anomalies[0].status === "open"],
  ["bound brief", (f) => f.slice.brief.status === "bound"],
  ["unknown session liveness", (f) => f.worker.liveness === "unknown"],
  ["exact deviation-set acceptance", (f) => f.deviations.acceptance.exact_set === true],
  ["stale final review", (f) => f.reviews.final_review.identity_status === "stale"],
  ["decisive UI screenshot", (f) => (
    f.evidence.browser[0].decisive === true
    && f.evidence.browser[0].source.kind === "screenshot_artifact"
  )],
  ["queued placeholder needing hydration", (f) => f.decisions.queued_placeholders[0].hydration === "required"],
];

for (const [name, assertion] of retainedSituations) {
  test(`retained fixture: ${name}`, () => {
    assert.equal(assertion(createSemanticFrontier(fixture())), true);
  });
}

test("exact final-review identity is distinguishable from stale identity", () => {
  const input = fixture();
  input.repositoryEvidence.final_review.identity_status = "exact_current";
  const frontier = createSemanticFrontier(input);
  assert.equal(frontier.reviews.final_review.identity_status, "exact_current");
  assert.equal(frontier.reviews.final_review.status, "complete");
});

test("an unavailable screenshot is explicit", () => {
  const input = fixture();
  delete input.repositoryEvidence.browser;
  const frontier = createSemanticFrontier(input);
  assert.equal(frontier.evidence.browser[0].status, "unavailable");
  assert.equal(frontier.evidence.browser[0].expected_source, "screenshot_artifact");
});
