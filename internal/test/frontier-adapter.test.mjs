import test from "node:test";
import assert from "node:assert/strict";
import { collectCheckedRepositoryEvidence } from "../../goalbuddy/scripts/frontier.mjs";
import { createSemanticFrontier } from "../../goalbuddy/scripts/frontier-projection.mjs";

const SHA = "a".repeat(64);

function resumeProjection(overrides = {}) {
  return {
    board: {
      path: "docs/goals/example",
      goal_path: "/internal/docs/goals/example/goal.md",
      title: "Example",
      status: "active",
      oracle: {
        signal: "The outcome is proved.",
        cadence: "Per slice",
        final_proof: "Exact evidence",
      },
      intake: {
        interpreted_outcome: "Ship the verified outcome.",
      },
      active_task: {
        id: "T999",
        type: "pm",
        assignee: "PM",
        status: "active",
        objective: "Select the next slice.",
        inputs: [],
        constraints: [],
        expected_output: [],
        stop_if: [],
        transition_evidence: null,
      },
      active_lanes: [],
      approval_gates: [],
      planning_inventory: { queued_tasks: [] },
      ...overrides,
    },
    recovery: { worker_liveness: "unknown" },
  };
}

function rootSnapshot(tasks) {
  return {
    path: "state.yaml",
    state_path: "/repo/docs/goals/example/state.yaml",
    state_digest: "b".repeat(64),
    text: `version: 2
goal:
  title: Example
  slug: example
  kind: specific
  status: active
active_task: T999
tasks:
${tasks}
checks:
  dirty_fingerprint: unknown
  last_verification:
    result: unknown
    task: null
    commands: []
`,
  };
}

test("checked adapter compacts long legacy receipt history without relaying prose", () => {
  const tasks = Array.from({ length: 80 }, (_, index) => {
    const id = `T${String(index).padStart(3, "0")}`;
    return `  - id: ${id}
    type: worker
    assignee: Worker
    status: done
    objective: "Historical worker ${id}."
    receipt:
      result: done
      changed_files:
        - src/shared.mjs
      commands:
        - cmd: npm test
          status: pass
      summary: "LEAK 019f6dab-7b25-7620-9da6-4f79a0648146 .git/goalbuddy/dispatch-reports/private.json"
`;
  }).join("");
  const terminal = `  - id: T999
    type: pm
    assignee: PM
    status: active
    objective: "Select the next slice."
    receipt: null
`;
  const projection = resumeProjection();
  const repositoryEvidence = collectCheckedRepositoryEvidence({
    resumeProjection: projection,
    boardSnapshots: [rootSnapshot(`${tasks}${terminal}`)],
  });
  const frontier = createSemanticFrontier({ resumeProjection: projection, repositoryEvidence });

  assert.equal(frontier.evidence.changed_paths.length, 1);
  assert.equal(frontier.evidence.verification.length, 1);
  assert.equal(frontier.evidence.receipts.length, 1);
  assert.equal(frontier.evidence.receipts[0].summary, null);
  assert.doesNotMatch(JSON.stringify(frontier), /LEAK|019f6dab|dispatch-reports/);
  assert.ok(JSON.stringify(frontier).length < 6000);
});

test("adapter does not turn legacy note prose or traversal into drill-down paths", () => {
  const tasks = `  - id: T001
    type: pm
    assignee: PM
    status: done
    objective: "Historical prose note."
    receipt:
      result: done
      summary: "Historical."
      note: "../external-or-prose"
  - id: T002
    type: pm
    assignee: PM
    status: blocked
    objective: "Current blocked decision."
    receipt:
      result: blocked
      blocked_reason: "Owner decision required."
      summary: "Blocked."
      note: notes/T002-decision.md
  - id: T999
    type: pm
    assignee: PM
    status: active
    objective: "Select the next slice."
    receipt: null
`;
  const repositoryEvidence = collectCheckedRepositoryEvidence({
    resumeProjection: resumeProjection(),
    boardSnapshots: [rootSnapshot(tasks)],
  });

  assert.deepEqual(
    repositoryEvidence.drill_down.map((entry) => entry.source.path),
    ["docs/goals/example/goal.md", "docs/goals/example/notes/T002-decision.md"],
  );
});

test("root approval waits are not duplicated as unresolved decisions", () => {
  const tasks = `  - id: T007
    type: pm
    assignee: PM
    status: blocked
    objective: "Wait for the owner."
    receipt:
      result: blocked
      blocked_reason: "Owner decision required."
      summary: "Waiting."
      waiting_for_user_approval: true
      required_reply: "Approve the product decision."
  - id: T999
    type: pm
    assignee: PM
    status: active
    objective: "Select the next slice."
    receipt: null
`;
  const projection = resumeProjection({
    approval_gates: [{
      task_id: "T007",
      required_reply: "Approve the product decision.",
    }],
  });
  const repositoryEvidence = collectCheckedRepositoryEvidence({
    resumeProjection: projection,
    boardSnapshots: [rootSnapshot(tasks)],
  });
  const frontier = createSemanticFrontier({ resumeProjection: projection, repositoryEvidence });

  assert.deepEqual(frontier.decisions.owner_gates.map((gate) => gate.id), ["T007"]);
  assert.deepEqual(frontier.decisions.unresolved, []);
});

test("child terminal proof cannot replace the root goal final review", () => {
  const rootTasks = `  - id: T998
    type: judge
    assignee: Judge
    status: done
    objective: "Root final review."
    receipt:
      result: done
      full_outcome_complete: true
      final_review:
        status: complete
        artifact:
          path: reviews/root-final.json
          sha256: ${SHA}
        completeness_status: complete
  - id: T999
    type: pm
    assignee: PM
    status: active
    objective: "Select the next slice."
    receipt: null
`;
  const childTasks = `  - id: T010
    type: judge
    assignee: Judge
    status: done
    objective: "Child final review."
    receipt:
      result: done
      full_outcome_complete: true
      final_review:
        status: accepted_deviation
        observed_artifact:
          path: reviews/child-stale.json
          sha256: ${SHA}
          observed_failure: stale_identity
`;
  const child = {
    ...rootSnapshot(childTasks),
    path: "subgoals/T001-child/state.yaml",
    state_path: "/repo/docs/goals/example/subgoals/T001-child/state.yaml",
  };
  const repositoryEvidence = collectCheckedRepositoryEvidence({
    resumeProjection: resumeProjection(),
    boardSnapshots: [rootSnapshot(rootTasks), child],
  });
  const frontier = createSemanticFrontier({
    resumeProjection: resumeProjection(),
    repositoryEvidence,
  });

  assert.equal(frontier.reviews.final_review.status, "complete");
  assert.equal(frontier.reviews.final_review.source.task_id, "T998");
  assert.equal(
    frontier.drill_down.some((entry) => entry.source.path === "reviews/child-stale.json"),
    true,
  );
});
