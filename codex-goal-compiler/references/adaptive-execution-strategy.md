# Adaptive Execution Strategy

How a compiled goal carries quality policy. The GoalBuddy execution contract
(`references/goal-execution.md` in the installed Goal Prep skill, section
"Adaptive Execution Strategy") governs runtime behavior; this reference tells
the compiler what to emit so the orchestrator can apply it. The design
rationale lives in the GoalBuddy repository at
`docs/spec/adaptive-execution-strategy.md`.

## Principle

The compiler emits durable structure plus strategy, never a schedule. Durable
structure is the outcome, constraints, vertical slices, dependencies, proof
requirements, and owner gates. Strategy is the charter's `## Execution
Strategy` section: the principles the orchestrator uses at each seam to choose
planning horizon, review depth, simplification cadence, implementation lane,
and Judge tier. Do not pre-plan every slice in detail, do not hardcode
workflow invocations onto task cards, and do not name vendor skills in board
or charter text — capabilities are semantic (plan hardening, implementation
review, simplification) and each harness maps them to its native tools at
runtime.

## What the compiler instantiates

Fill the goal template's `## Execution Strategy` section from the source
plan/spec and conversation context:

- **Planning horizon** — choose upfront, just-in-time, or hybrid (`upfront |
  just_in_time | hybrid`), with one line of
  why. Default `just_in_time` for large multi-slice product goals (author or
  revise each slice plan at its seam); `upfront` only when the source spec is
  already decision-complete per slice; `hybrid` when some subprograms deserve
  their own complete plan while the rest stays just-in-time.
- **Quality ladder** — restate the normal ladder for material slices:
  hardened plan → bounded Worker implementation → PM diff review →
  independent implementation review → adjudicated fixes → verification →
  receipt. The lead orchestrator must review every diff. Keep small mechanical
  slices light when materiality and live evidence justify it; do not turn the
  ladder into ceremony for its own sake. Simplification is available as a
  review lens and as a standalone pass after large or cross-cutting changes.
- **Materiality refinements** — the contract's categorical list (auth, money,
  permissions, migrations, data integrity, public contracts, irreversible
  actions, meaningful interaction changes) is the floor. Add goal-specific
  entries the source spec reveals (for example a provider webhook surface or a
  public API namespace). Never narrow the floor, and never express materiality
  as orchestrator confidence.
- **Risk triggers** — decision risk (ambiguity, architecture, competing
  approaches, unverified external assumptions) or execution risk (blast
  radius, integration breadth, long autonomous duration, difficult
  verification); either axis alone justifies planning and independent review.
- **Deviation recording** — downward deviations from the ladder on material
  slices are recorded in PM-owned evidence: the next phase-gate or final-audit
  Judge/PM receipt the PM authors. Never appended to a Worker's receipt —
  Worker `deviations` keeps its receipt-spec meaning — and no board notes or
  new schema fields.

## Adaptive write scope

Compile the narrowest truthful Worker authority envelope for each slice; do
not force a large greenfield slice to predict every future filename:

- exact files for small, decision-complete work and sensitive ownership
  boundaries;
- bounded component or directory globs for broad vertical slices that may
  legitimately create or reorganize files;
- never a repository-wide convenience glob merely to avoid planning;
- empty scope on future queued Worker placeholders when the implementation
  boundary is not yet known, followed by atomic just-in-time hydration of
  `allowed_files`, `verify`, and `stop_if` immediately before activation.

The source plan's file list is evidence, not automatically the execution
envelope. Preserve it verbatim when it is complete. Otherwise choose the
smallest bounded envelope that truthfully covers the approved slice and put
forbidden boundaries in `stop_if`. Crossing the active envelope blocks the
Worker; scope is never widened retroactively after writes exist.

## Proof requirements stay on slices

Each material slice's card carries its proof requirement through the official
GoalBuddy surfaces (verify commands, expected receipt evidence). The strategy
section states policy; it never duplicates or replaces per-slice proof. At
runtime the orchestrator may tighten a slice's proof contract, never silently
loosen it.

## Boundaries

- This reference adds no board schema, statuses, Keeper operations, or agent
  roles. If a compile appears to need one, the source contract or board design
  is incomplete — stop and report.
- The strategy section may not pre-authorize skipping review on named future
  slices; skip decisions happen at the seam with live evidence.
- Judge routing stays behavioral: lead-orchestrator seams (architecture,
  taste, ambiguity, board restructuring, workflow adjudication, final
  completion) versus routine delegated Judge checks (readiness, scope,
  verification adequacy, dependencies, post-fix rechecks), with escalation
  when a finding would change board structure, a task's authority model, or
  the owner contract. Model identities are runtime routing choices and never
  appear in charter or board text.
