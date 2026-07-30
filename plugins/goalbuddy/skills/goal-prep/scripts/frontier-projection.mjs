const SOURCE_KINDS = new Set([
  "board_task",
  "stored_receipt",
  "transition_provenance",
  "held_artifact",
  "plan_or_note",
  "diff_identity",
  "review_artifact",
  "screenshot_artifact",
]);
const SHA256 = /^[a-f0-9]{64}$/;

export function createSemanticFrontier({
  resumeProjection,
  repositoryEvidence = null,
}) {
  if (!isRecord(resumeProjection)) {
    throw new TypeError("resumeProjection must be an object.");
  }
  if (repositoryEvidence !== null && !isRecord(repositoryEvidence)) {
    throw new TypeError("repositoryEvidence must be null or an object.");
  }

  const repository = repositoryEvidence || {};
  const board = isRecord(resumeProjection.board) ? resumeProjection.board : {};
  const boardPath = text(board.path);
  const activeLanes = Array.isArray(board.active_lanes)
    ? board.active_lanes.filter((lane) => isRecord(lane?.active_task))
    : [];
  const rootActiveTask = firstRecord(board.active_task, resumeProjection.active_task);
  const selectedLane = rootActiveTask
    ? activeLanes.find((lane) => lane.kind === "root") || null
    : activeLanes[0] || null;
  const activeTask = rootActiveTask || selectedLane?.active_task || null;
  const activeTaskBoardPath = text(selectedLane?.board_path) || boardPath;
  const taskSource = activeTask
    ? sourceRef({ kind: "board_task", task_id: activeTask.id, board_path: activeTaskBoardPath })
    : null;
  const goalSource = sourceRef({
    kind: "plan_or_note",
    path: text(repository.goal_path || board.goal_path),
  });

  return {
    kind: "goalbuddy_frontier_v1",
    goal: projectGoal(board, repository, goalSource),
    slice: projectSlice(activeTask, taskSource, activeLanes),
    worker: projectWorker(activeTask, resumeProjection.recovery, taskSource, activeLanes),
    evidence: projectEvidence(activeTask, repository, activeLanes),
    reviews: projectReviews(repository),
    deviations: projectDeviations(repository),
    decisions: projectDecisions(board, repository, boardPath),
    drill_down: projectDrillDown(repository),
  };
}

function projectGoal(board, repository, source) {
  const oracle = isRecord(board.oracle) ? board.oracle : {};
  const intake = isRecord(board.intake) ? board.intake : {};
  const objective = text(
    repository.goal_objective
      || intake.interpreted_outcome
      || intake.original_request,
  );
  return {
    title: text(board.title),
    objective,
    status: text(board.status) || "unknown",
    oracle: {
      signal: text(oracle.signal),
      cadence: text(oracle.cadence),
      final_proof: text(oracle.final_proof),
    },
    source: source || unavailable("plan_or_note", "The validated goal document path is unavailable."),
  };
}

function projectSlice(task, source, activeLanes = []) {
  if (!task) {
    return unavailable("board_task", "There is no validated current slice.");
  }
  const brief = isRecord(task.brief) ? task.brief : null;
  const briefPath = text(brief?.path);
  const slice = {
    status: text(task.status) || "unknown",
    id: text(task.id),
    objective: text(task.objective),
    inputs: textList(task.inputs),
    constraints: textList(task.constraints),
    expected_output: textList(task.expected_output),
    stop_conditions: textList(task.stop_if),
    brief: briefPath
      ? {
          status: "bound",
          path: briefPath,
          sha256: text(brief.sha256) || null,
          source: sourceRef({ kind: "plan_or_note", path: briefPath }),
        }
      : unavailable("plan_or_note", "The current slice has no bound brief."),
    source: source || unavailable("board_task", "The current slice source is unavailable."),
  };
  if (activeLanes.length > 1 || (activeLanes.length === 1 && activeLanes[0]?.kind !== "root")) {
    slice.active_lanes = activeLanes.map(projectActiveSliceLane);
  }
  return slice;
}

function projectWorker(task, recovery, source, activeLanes = []) {
  if (!task) {
    return unavailable("board_task", "There is no current task assignment.");
  }
  const transition = isRecord(task.transition_evidence) ? task.transition_evidence : {};
  const hasSessionBinding = isRecord(transition.codex_worker_session);
  const worker = {
    task_type: text(task.type) || "unknown",
    assignee: text(task.assignee) || "unknown",
    state: text(task.status) || "unknown",
    liveness: text(recovery?.worker_liveness) || "unknown",
    session_binding: hasSessionBinding ? "present_redacted" : "unavailable",
    source: source || unavailable("board_task", "The current Worker source is unavailable."),
  };
  if (activeLanes.length > 1 || (activeLanes.length === 1 && activeLanes[0]?.kind !== "root")) {
    worker.active_lanes = activeLanes.map(projectActiveWorkerLane);
  }
  return worker;
}

function projectEvidence(activeTask, repository, activeLanes = []) {
  return {
    changed_paths: projectRequiredItems(
      repository.changed_paths,
      projectChangedPath,
      "diff_identity",
      "Changed-path evidence was not supplied.",
    ),
    verification: projectRequiredItems(
      repository.verification,
      projectVerification,
      "stored_receipt",
      "Verification evidence was not supplied.",
    ),
    receipts: projectRequiredItems(
      repository.receipts,
      projectReceipt,
      "stored_receipt",
      "Terminal receipt evidence was not supplied.",
    ),
    provenance: projectRequiredItems(
      repository.provenance,
      projectProvenance,
      "transition_provenance",
      "Applied provenance evidence was not supplied.",
    ),
    held_receipts: projectHeldReceipts(activeTask, activeLanes),
    browser: projectRequiredItems(
      repository.browser,
      projectBrowserEvidence,
      "screenshot_artifact",
      "Decisive browser evidence was not supplied.",
    ),
  };
}

function projectChangedPath(item, source) {
  return {
    path: text(item.path),
    change: text(item.change) || "changed",
    source,
  };
}

function projectVerification(item, source) {
  return {
    check: text(item.check || item.name),
    status: text(item.status) || "unknown",
    summary: text(item.summary) || null,
    source,
  };
}

function projectReceipt(item, source) {
  return {
    task_id: text(item.task_id),
    outcome: text(item.outcome || item.result) || "unknown",
    authority: text(item.authority || item.closeout_authority) || "unknown",
    disposition: text(item.disposition || item.dispatch_disposition) || "unknown",
    summary: text(item.summary) || null,
    source,
  };
}

function projectProvenance(item, source) {
  return {
    task_id: text(item.task_id),
    application_state: text(item.application_state) || "unknown",
    receipt_transport: text(item.receipt_transport) || "unknown",
    report_transport: text(item.report_transport) || "unknown",
    dispatch_disposition: text(item.dispatch_disposition) || "unknown",
    closeout_authority: text(item.closeout_authority) || "unknown",
    evidence_status: text(item.evidence_status) || "unknown",
    source,
  };
}

function projectHeldReceipts(activeTask, activeLanes) {
  const tasks = activeLanes.length > 0
    ? activeLanes.map((lane) => lane.active_task).filter(isRecord)
    : activeTask
      ? [activeTask]
      : [];
  const projected = [];
  const seenHandles = new Set();
  for (const task of tasks) {
    const evidence = isRecord(task.transition_evidence) ? task.transition_evidence : {};
    const held = Array.isArray(evidence.held_receipts) ? evidence.held_receipts : [];
    for (const item of held) {
      const taskId = text(item?.task_id || task.id);
      const handle = text(item?.handle);
      if (seenHandles.has(handle)) continue;
      seenHandles.add(handle);
      projected.push({
        task_id: taskId,
        handle,
        state: "held_unapplied",
        receipt_transport: text(item?.receipt_transport) || "unknown",
        report_transport: text(item?.report_transport) || "unknown",
        dispatch_disposition: text(item?.dispatch_disposition) || "unknown",
        source: sourceRef({ kind: "held_artifact", task_id: taskId, handle })
          || unavailable("held_artifact", "The validated held artifact identity is unavailable."),
      });
    }
  }
  return projected;
}

function projectActiveSliceLane(lane) {
  const task = lane.active_task;
  const source = sourceRef({
    kind: "board_task",
    task_id: text(task?.id),
    board_path: text(lane.board_path),
  }) || unavailable("board_task", "Active-lane task source is unavailable.");
  const brief = isRecord(task?.brief) ? task.brief : null;
  const briefPath = text(brief?.path);
  return {
    kind: text(lane.kind) || "unknown",
    id: text(task?.id),
    task_type: text(task?.type) || "unknown",
    status: text(task?.status) || "unknown",
    objective: text(task?.objective),
    inputs: textList(task?.inputs),
    constraints: textList(task?.constraints),
    expected_output: textList(task?.expected_output),
    stop_conditions: textList(task?.stop_if),
    brief: briefPath
      ? {
          status: "bound",
          path: briefPath,
          sha256: text(brief.sha256) || null,
          source: sourceRef({ kind: "plan_or_note", path: briefPath }),
        }
      : unavailable("plan_or_note", "This active lane has no bound brief."),
    source,
  };
}

function projectActiveWorkerLane(lane) {
  const task = lane.active_task;
  const transition = isRecord(task?.transition_evidence) ? task.transition_evidence : {};
  return {
    id: text(task?.id),
    task_type: text(task?.type) || "unknown",
    assignee: text(task?.assignee) || "unknown",
    state: text(task?.status) || "unknown",
    liveness: "unknown",
    session_binding: isRecord(transition.codex_worker_session) ? "present_redacted" : "unavailable",
    source: sourceRef({
      kind: "board_task",
      task_id: text(task?.id),
      board_path: text(lane.board_path),
    }) || unavailable("board_task", "Active-lane Worker source is unavailable."),
  };
}

function projectBrowserEvidence(item, source) {
  return {
    state: text(item.state) || "unknown",
    verdict: text(item.verdict) || "unknown",
    decisive: item.decisive === true,
    summary: text(item.summary) || null,
    source,
  };
}

function projectReviews(repository) {
  const rounds = projectRequiredItems(
    repository.reviews,
    (item, source) => ({
    identity: text(item.identity) || "unknown",
    round: finiteNumber(item.round),
    reviewer: text(item.reviewer) || "unknown",
    status: text(item.status) || "unknown",
    scope_status: text(item.scope_status) || "unknown",
    findings: finiteNumber(item.findings),
    accepted_findings: finiteNumber(item.accepted_findings),
    yield: text(item.yield) || "unknown",
    selection: text(item.selection) || "unknown",
    adjudication: text(item.adjudication) || "unknown",
    source,
    }),
    "review_artifact",
    "Independent-review evidence was not supplied.",
  );
  const scopeAnomalies = Array.isArray(repository.scope_anomalies)
    ? projectSourcedItems(repository.scope_anomalies, (item, source) => ({
      kind: text(item.kind) || "scope_anomaly",
      status: text(item.status) || "open",
      detail: text(item.detail || item.summary),
      source,
    }))
    : [unavailable("review_artifact", "Review scope-anomaly evidence was not supplied.")];
  const finalReview = isRecord(repository.final_review)
    ? projectFinalReview(repository.final_review)
    : unavailable("review_artifact", "No final-review identity is available.");
  return {
    rounds,
    round_yield: rounds.filter((review) => review.status !== "unavailable").map((review) => ({
      round: review.round,
      yield: review.yield,
      accepted_findings: review.accepted_findings,
      source: review.source,
    })),
    scope_anomalies: scopeAnomalies,
    final_review: finalReview,
  };
}

function projectFinalReview(review) {
  const source = sourceRef(review.source);
  if (!source) {
    return unavailable("review_artifact", "The final review has no valid artifact source.");
  }
  return {
    status: text(review.status) || "unknown",
    identity_status: text(review.identity_status) || "unknown",
    completeness: text(review.completeness) || "unknown",
    unresolved_blockers: textList(review.unresolved_blockers),
    source,
  };
}

function projectDeviations(repository) {
  const items = projectSourcedItems(repository.deviations, (item, source) => ({
    id: text(item.id) || null,
    description: text(item.description || item.summary),
    status: text(item.status) || "unresolved",
    source,
  }));
  const acceptance = isRecord(repository.deviation_acceptance)
    ? projectDeviationAcceptance(repository.deviation_acceptance)
    : unavailable("stored_receipt", "No exact deviation-set acceptance is recorded.");
  return { items, acceptance };
}

function projectDeviationAcceptance(acceptance) {
  const source = sourceRef(acceptance.source);
  if (!source) {
    return unavailable("stored_receipt", "Deviation acceptance has no valid durable source.");
  }
  return {
    status: text(acceptance.status) || "unknown",
    exact_set: acceptance.exact_set === true,
    accepted_ids: textList(acceptance.accepted_ids),
    source,
  };
}

function projectDecisions(board, repository, boardPath) {
  const ownerGates = [
    ...projectResumeOwnerGates(board.approval_gates, boardPath),
    ...projectSourcedItems(repository.owner_gates, (item, source) => ({
      id: text(item.id || item.task_id) || null,
      status: text(item.status) || "blocked",
      decision: text(item.decision || item.required_reply),
      source,
    })),
  ];
  const unresolved = projectSourcedItems(repository.unresolved_decisions, (item, source) => ({
    id: text(item.id || item.task_id) || null,
    status: text(item.status) || "unresolved",
    decision: text(item.decision || item.summary),
    source,
  }));
  const queued = Array.isArray(board.planning_inventory?.queued_tasks)
    ? board.planning_inventory.queued_tasks
    : [];
  const queuedPlaceholders = queued.map((task) => ({
    id: text(task?.id),
    objective: text(task?.objective),
    hydration: task?.unhydrated === true || task?.needs_hydration === true
      ? "required"
      : "unknown",
    dependency_ready: task?.dependency_ready === true,
    source: sourceRef({
      kind: "board_task",
      task_id: text(task?.id),
      board_path: boardPath,
    }) || unavailable("board_task", "Queued placeholder source is unavailable."),
  })).concat(projectSourcedItems(repository.queued_placeholders, (task, source) => ({
    id: text(task.id),
    objective: text(task.objective),
    hydration: text(task.hydration) || "unknown",
    dependency_ready: task.dependency_ready === true,
    source,
  })));
  return {
    owner_gates: ownerGates,
    unresolved,
    queued_placeholders: queuedPlaceholders,
  };
}

function projectResumeOwnerGates(gates, boardPath) {
  if (!Array.isArray(gates)) return [];
  return gates.map((gate) => ({
    id: text(gate?.task_id) || null,
    status: "blocked",
    decision: text(gate?.required_reply),
    source: sourceRef({
      kind: "board_task",
      task_id: text(gate?.task_id),
      board_path: boardPath,
    }) || unavailable("board_task", "Owner-gate task source is unavailable."),
  }));
}

function projectDrillDown(repository) {
  return projectSourcedItems(repository.drill_down, (item, source) => ({
    purpose: text(item.purpose),
    label: text(item.label) || null,
    source,
  }));
}

function projectSourcedItems(value, projector) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!isRecord(item)) {
      return unavailable("validated semantic fact", "A repository-evidence entry is malformed.");
    }
    const source = sourceRef(item.source);
    if (!source) {
      return unavailable("closed source reference", "A repository-evidence entry has no valid source.");
    }
    return projector(item, source);
  });
}

function projectRequiredItems(value, projector, expectedSource, reason) {
  if (!Array.isArray(value)) return [unavailable(expectedSource, reason)];
  return projectSourcedItems(value, projector);
}

function sourceRef(value) {
  if (!isRecord(value) || !SOURCE_KINDS.has(value.kind)) return null;
  switch (value.kind) {
    case "board_task": {
      const taskId = text(value.task_id);
      const boardPath = text(value.board_path);
      if (!taskId || !boardPath) return null;
      return {
        kind: value.kind,
        task_id: taskId,
        board_path: boardPath,
      };
    }
    case "stored_receipt":
    case "transition_provenance": {
      const taskId = text(value.task_id);
      const boardPath = text(value.board_path);
      if (!taskId || !boardPath) return null;
      return {
        kind: value.kind,
        task_id: taskId,
        board_path: boardPath,
      };
    }
    case "held_artifact": {
      const taskId = text(value.task_id);
      const handle = text(value.handle);
      if (!taskId || !handle) return null;
      return { kind: value.kind, task_id: taskId, handle };
    }
    case "plan_or_note": {
      const path = text(value.path);
      return path ? { kind: value.kind, path } : null;
    }
    case "diff_identity": {
      const identity = text(value.identity || value.value);
      if (!identity) return null;
      return {
        kind: value.kind,
        identity,
        scope: textList(value.scope),
      };
    }
    case "review_artifact":
    case "screenshot_artifact": {
      const path = text(value.path);
      const sha256 = text(value.sha256);
      if (!path || !SHA256.test(sha256)) return null;
      return {
        kind: value.kind,
        path,
        sha256,
      };
    }
    default:
      return null;
  }
}

function unavailable(expectedSource, reason) {
  return {
    status: "unavailable",
    expected_source: expectedSource,
    reason,
  };
}

function firstRecord(...values) {
  return values.find(isRecord) || null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function textList(value) {
  if (value === null || value === undefined || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map(text).filter(Boolean);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : null;
}
