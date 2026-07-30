# Put GoalBuddy Bookkeeping Below the Fable Interface

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `/Users/danielalnajjar/.agents/resources/plans.md`. It builds on the completed interface work recorded in `docs/plans/goalbuddy-interface-simplification.md` and the Worker-continuity work recorded in `docs/plans/goalbuddy-fable-efficiency-stabilization.md`, but it is self-contained: an implementer should be able to execute it without reading those earlier plans.

Status: **Canonical active GoalBuddy ExecPlan — reconciled and independently approved; Milestones 0-4 are complete on the isolated branch, the owner has authorized continued implementation through Milestone 5 and the validation gates, and live activation remains separately gated.**

## Purpose / Big Picture

GoalBuddy already preserves valuable safety facts: one active writing frontier per board, exact Codex Worker identity, atomic transitions, checked receipts, bounded write authority, immutable history, and recovery evidence. The remaining problem is that Claude/Fable can still spend attention operating those mechanisms instead of operating the software project.

After this change, a healthy GoalBuddy run should present Fable with one compact semantic frontier: the current product objective, the current slice and just-in-time plan or brief, Worker status, consequential product evidence, unresolved decisions, and the small set of semantic actions Fable may take. Digests, receipt paths, checker invocations, command templates, session identifiers, and successful transition narration remain durable and auditable but normally stay below the model-facing interface.

This work must not make Fable less involved in software quality. For every material slice, Fable continues to choose the slice strategy, author or approve the just-in-time implementation plan, author or approve the Codex operator prompt, inspect the full product diff, adjudicate independent review, personally inspect decisive screenshots for user-visible changes, decide scope changes, and accept or reject the slice. The runtime may compose bookkeeping around those decisions; it may not make them.

The observable success case is a material slice in which Fable needs one healthy-start frontier call, performs its normal planning and review judgments, then supplies one closeout decision and either an explicit receipt source or a previously persisted held-receipt handle. GoalBuddy preserves that source's provenance, validates and installs the exact receipt, hydrates and activates the chosen successor when needed, and returns the next frontier without asking Fable to copy or interpret a digest. Final completion distinguishes exact satisfaction from an owner-accepted deviation, and any required final review is bound to the exact current commit or content snapshot rather than inferred from a green checker. A shadow-mode acceptance period proves that the compact frontier omits no fact that changes Fable's judgment before it replaces the current projection.

## Progress

- [x] (2026-07-21) Re-read the current GoalBuddy repository contract, current resume projection, compact dispatch outcome, receipt applier, CLI routing, policy tests, and prior implementation plans.
- [x] (2026-07-21) Confirmed that the current runtime already implements compact resume output, Git-local dispatch-report transport, one-shot exact-session receipt repair, just-in-time hydration, exact Codex session binding, adaptive quality ladders, and a quiet-control-plane policy.
- [x] (2026-07-21) Authored this isolated ExecPlan without changing runtime code, installed skills, plugins, active boards, or user-level configuration.
- [x] (2026-07-30) Reconciled the five GoalBuddy design threads, the completed unattended GoalBuddy run, all twelve local ExecPlans, the compiled owner-doctrine board, current source, and current Claude/Omega task behavior.
- [x] (2026-07-30) Retired the receipt-index proposal, the large-autonomous-product profile and broad paid evaluation program, and the monitor milestone; transferred only the task-level brief binding and bounded runtime-correctness findings into this plan.
- [x] (2026-07-30) Replaced the false unique-report premise with explicit receipt provenance and made accepted deviations plus exact-final-review proof first-class completion requirements.
- [x] (2026-07-30) Obtained independent Goal Judge approval after resolving durable held-evidence ownership, unavailable-transport extraction, the closed final-review union, milestone sequencing, and Git-durability findings.
- [x] (2026-07-30) Obtained explicit owner approval for the reviewed-plan durability commit, isolated implementation worktree, and Milestone 0 implementation; Milestones 1-5 and activation remain separately gated.
- [x] (2026-07-30) Completed a ChatGPT Pro Milestone 0 collaboration review and local source adjudication; accepted the full bounded JSON-safe inverse, complete reserialized-receipt expectation coverage, shared completion eligibility, blocked-sibling parity, exact task-ID scanning, and positional-help wording corrections without changing the milestone architecture.
- [x] (2026-07-30) Committed the reviewed plan at `ab867f1`, created clean isolated branch `codex/goalbuddy-semantic-frontier-m0`, and established the isolated baseline: 250 Node tests and 49 Python tests passed; `npm pack --dry-run` produced a 147-file, 12.8 MB package preview.
- [x] (2026-07-30) Implemented Milestone 0: every candidate now passes strict parse, resume normalization, and exact reserialized-receipt checks before install; completion projection shares mutation eligibility; task IDs scan `T000` through `T999`; and direct help lists all five positional modes. After three independent read-only reviews and targeted fixes, `npm run check` passed 259 Node tests and 49 Python tests, and `npm run pack:dry-run` previewed 149 files at 12.8 MB.
- [x] (2026-07-30) Obtained owner authorization to continue the isolated implementation through Milestones 1-5 and all non-activation validation gates. Live installation or activation remains a separate owner-approved transaction.
- [x] (2026-07-30) Implemented and independently reviewed Milestone 1: PM task-card hydration now persists one exact repository-local JIT brief binding; Worker dispatch loads that brief automatically; exact resume preserves it; unsafe, mutable, stale, or post-contract-changed briefs fail before launch; and the Judge `worker_package` contract is a closed exact four-key object for every Judge result. The focused public suites passed 124 Node tests, the synchronized candidate passed 282 Node tests and 49 Python tests, and `npm run pack:dry-run` previewed 155 files at 12.8 MB.
- [x] (2026-07-30) Implemented and independently reviewed Milestone 2: every prospective applied receipt has durable transition-owned provenance; held receipts are authority-bound checked history; rejected dispatches close only through the exact PM blocked shape; exact deviations bind one persisted owner reply; and terminal proof remains checker-enforced against current artifacts, Worker-ledger coverage, and scoped product identity. Final adversarial fixes preserved read-only goals with an empty Worker oracle, prevented artifact-path subtraction, excluded GoalBuddy control bytes from broad product scopes, and suppressed completion for unfinished children. The synchronized candidate passed 341 Node tests and 49 Python tests; `npm run pack:dry-run` previewed 161 files at 12.8 MB.
- [x] (2026-07-30) Implemented and independently reviewed Milestone 3: `goalbuddy frontier <goal-root> --json` is a read-only shadow route over the checked root-and-child projection; every semantic claim has explicit board, receipt, transition, artifact, note, or diff provenance; malformed or missing structured review evidence becomes a bounded anomaly; active child lanes and held evidence remain visible without exposing control fields; and installed `/goal` remains on resume. The synchronized candidate passed 379 Node tests and 49 Python tests; `npm run pack:dry-run` previewed 169 files at 12.8 MB.
- [x] (2026-07-30) Completed the Milestone 3 fresh-Fable parity gate in a disposable comparison directory. Independent no-session Fable contexts made identical decisions from full materials and the frontier plus drill-down on all eleven seams for both a non-UI material slice and a UI slice, including direct screenshot inspection. The compact prompts were 75.23% and 79.47% smaller; no decision-relevant omission remained after the evaluation contract separated product scope from review-workflow scope.
- [x] (2026-07-30) Implemented and independently reviewed Milestone 4: `goalbuddy advance` captures its own checked state, requires one explicit source or exact held handle plus authority and successor, derives transport and dispatch provenance under the existing receipt lock, optionally binds and hydrates one exact task card, and returns the digest-bound successor frontier. Clean reports, bare receipts, unavailable transport, explicit and held PM rejected-dispatch closeout, held selection, hydration, linked worktrees, replay, malformed/stale evidence, and byte-preserving rejection all pass. The synchronized candidate passed 394 Node tests and 49 Python tests; `npm run pack:dry-run` previewed 169 files at 12.8 MB.
- [ ] Implement Milestone 5: promote the compact healthy path only after retained-fixture and fresh material/UI canaries preserve Fable's decisions.
- [ ] Run the complete package, mirror, isolated-install, doctor, deterministic journey, and existing-board compatibility gates.
- [ ] Obtain separate explicit approval before activating the new interface. Activation is not part of implementation.

## Surprises & Discoveries

- Observation: The current runtime is already much closer to the target architecture than the conversational description suggested.
  Evidence: `goalbuddy/scripts/resume-board.mjs` already returns a compact checked projection; `goalbuddy/scripts/dispatch-task.mjs` already stores the authoritative full report under Git metadata and returns a compact outcome; `goalbuddy/references/goal-execution.md` already says not to load Goal Prep, the compiler, raw `state.yaml`, or the exceptional reference on a healthy start.

- Observation: A separate standalone `prepare` operation is unnecessary and would weaken the existing atomic boundary.
  Evidence: `apply-receipt.mjs` already closes the source task, optionally hydrates the exact successor from a digest-bound task card, validates the candidate, and activates that successor under one board lock. The new public closeout operation should compose this existing transition instead of introducing another hydration state.

- Observation: The current resume projection mixes semantic information with recovery instructions, raw control tokens, and command templates.
  Evidence: `createResumeProjection()` returns the active objective and oracle together with state and tree digests, session IDs, recovery policy, and several digest-bound commands. A pure semantic projection can be derived without changing board truth.

- Observation: Exact Worker identity is durable, but current runtime liveness is deliberately unknown after the dispatcher process is no longer present.
  Evidence: the projection reports `worker_liveness: "unknown"`, and the bound session record warns that session identity does not prove liveness. This plan preserves that honest recovery state and does not attempt a monitoring or clean-start optimization.

- Observation: A successful Git-local dispatch report is only one receipt-source case, not the universal closeout source.
  Evidence: the current applier accepts either an authoritative dispatch wrapper or a bare receipt; dispatch transport can be unavailable; and retained real runs include rejected dispatches followed by explicit PM-authored blocked closeout receipts and held receipts that were not yet applied.

- Observation: The original `advance` design would have failed on the real T013 and T019 recovery paths and encouraged silent proof rewriting.
  Evidence: those retained runs used explicit bare blocked receipts after rejected dispatches. One receipt was rewritten after schema rejection, and another was reconstructed from rejected-dispatch output. The replacement contract preserves the rejected artifact and permits only a separately authored PM blocked closeout that cannot claim Worker proof.

- Observation: GoalBuddy currently cannot record the completion doctrine its own instructions require.
  Evidence: `goalbuddy/references/goal-execution.md` assigns material-ladder deviations to PM phase/final receipts, while `goalbuddy/scripts/receipt-contract.mjs` forbids `deviations` on both PM and Judge receipts. `full_outcome_complete: true` can therefore erase an owner-accepted shortfall instead of representing it honestly.

- Observation: Final-review freshness is prose-only.
  Evidence: the execution kernel says reviews bind to the artifact, workflow version, base/current identity, and completeness, but no completion receipt field or validator proves that the reviewed identity equals the current commit or content snapshot.

- Observation: A receipt index would add output without reducing the lead's real evidence work.
  Evidence: the retired proposal kept the complete receipt beside a new top-level index. The semantic frontier and explicit drill-down references are the correct navigation layer; receipt evidence stays lossless and singular.

- Observation: The highest-cost observed waste sits outside this plan.
  Evidence: the unattended run lost work to a wrong-scope review workflow, unavailable Omega role registration, and host overload. Native Claude tasks are useful as an ephemeral run projection but do not repair those failures or replace GoalBuddy's durable board. Omega preflight, workflow base/head/scope admission, and host-load gating require a separate plan in the owning repository.

- Observation: The two named YAML regressions are only the visible edge of the admitted receipt domain.
  Evidence: `receipt-contract.mjs` admits arbitrary JSON-safe strings, finite numbers, arrays, and plain objects with string keys, while the current serializer/parser pair also changes numeric-looking strings, exponent-form finite numbers, negative zero, nested arrays, unsafe mapping keys, and `__proto__` own-property semantics. Milestone 0 must repair this bounded inverse without becoming a general YAML implementation.

- Observation: A transition can reserialize receipt evidence it did not freshly author.
  Evidence: task addition requires `receipt: null`; session binding rewrites an existing `transition_evidence` subtree; and reply rewrites prior exact-human reply evidence before adding the newest `wait_receipt`. Exact comparison must cover every receipt-semantic value reserialized by the current transition, not only the newly supplied top-level receipt.

- Observation: The owner-authorized implementation baseline is green in the isolated worktree.
  Evidence: on branch `codex/goalbuddy-semantic-frontier-m0` at `ab867f1`, `npm run check` passed 250 Node tests and 49 Python tests, while `npm run pack:dry-run` previewed 147 files, 12.8 MB packed and 14.2 MB unpacked, without changing the worktree.

- Observation: Strict parser work can fail outside the narrow red fixture even when focused tests are green.
  Evidence: the first integrated run exposed an undefined variable in ordinary YAML comment stripping, and independent review found that unrestricted inline-colon detection changed path and URL scalars into mappings. The fixes preserve no-space object mappings, require YAML separation only for inline sequence mappings, and cover ordinary comments plus colon-bearing path and URL values.

- Observation: Resume normalization is part of candidate projectability and must tolerate the entire admitted receipt domain.
  Evidence: a JSON-safe evidence object may legally own non-callable `toString` or `valueOf` keys. Direct `String(object)` then throws even though parsing and receipt validation succeed. Object-valued display text now uses guarded JSON serialization, and the exact receipt fixture proves those keys remain data.

- Observation: The completed Milestone 0 release candidate is green and package-complete without touching the live installation.
  Evidence: the final isolated `npm run check` passed 259 Node tests and 49 Python tests; the synchronized canonical/plugin trees include `completion-eligibility.mjs`; `npm run pack:dry-run` previewed 149 files, 12.8 MB packed and 14.2 MB unpacked. No live Codex or Claude home, active board, product repository, or user configuration was changed.

- Observation: An active board's mutable `state.yaml` cannot safely serve as its own task brief.
  Evidence: persisting the brief binding mutates that file immediately, invalidating the just-recorded digest. Milestone 1 now rejects the active board state and every `docs/goals/**/state.yaml` path while continuing to admit immutable repository-local plan and brief artifacts.

- Observation: Descriptor validation must reject nonregular brief paths before a potentially blocking open, not merely after it.
  Evidence: a FIFO fixture hung when the implementation opened the path before checking its file type. The final implementation `lstat`s the terminal component, opens with `O_NONBLOCK | O_NOFOLLOW`, verifies the descriptor identity, and rejects final or ancestor symlinks without launching the Worker.

- Observation: A nominal stale-brief test does not prove the required prelaunch TOCTOU rehash.
  Evidence: independent review showed that changing the brief before dispatch would still pass if the second rehash were deleted. A deterministic Git-wrapper fixture now mutates the brief during manifest capture, after contract construction but before the second verification, and proves no harness launch or board/product mutation.

- Observation: The completed Milestone 1 candidate is green, mirrored, package-complete, and independently clear of findings.
  Evidence: canonical and plugin trees are byte-exact; the focused Milestone 1 suites passed 124 Node tests; the full candidate, which also includes the separately uncommitted Milestone 2 foundation, passed 282 Node tests and 49 Python tests; `npm run pack:dry-run` previewed 155 files at 12.8 MB; and the final adversarial re-review returned no findings.

- Observation: No currently persisted GoalBuddy field is an independent product-tree baseline.
  Evidence: state and board-tree digests cover board bytes; session, dispatch-contract, source-binding, and provenance hashes cover task/runtime authority and receipt artifacts; none preserves a pre-work product commit or manifest. The durable controller-checked product path ledger is the union of completed Worker `changed_files` across root and child boards. Final receipt `base_identity` therefore remains review provenance and cannot control required-path coverage.

- Observation: Same-user local hashes prove consistency and drift, not controller authorship.
  Evidence: a process with the same repository, board, and operating-system authority can rewrite local JSON and recompute public hashes. Cryptographic controller authorship would require a protected external signing authority, which is outside this dependency-free local board. Milestone 2 hardens safe paths, exclusive materialization, closed schemas, and transition ownership without claiming tamper-proof attestation.

- Observation: Final proof must remain machine-checkable after the completion transition, not only at its instant.
  Evidence: the first Milestone 2 checker validated only terminal field shape. A deleted review artifact or later product drift could leave a prospective completed board green. The checker now reopens the artifact, recomputes Worker-path coverage, revalidates owner acceptance, and recaptures current scoped identity.

- Observation: Product coverage and product identity need explicit control-state boundaries.
  Evidence: final receipt or review artifact paths could otherwise subtract a colliding Worker path, while a broad `docs/**` scope could include the atomic board candidate and completed `state.yaml` and stale its own review. The final implementation takes the Worker ledger as an unsubtractive union, treats a genuinely read-only union as empty, and excludes `docs/goals/` control bytes from both worktree and commit scoped identities.

- Observation: Portable dependency-free Node cannot make same-user pathname mutation cryptographically race-free.
  Evidence: Node exposes descriptor verification but no portable `openat`/`mkdirat`/`unlinkat` family. No-follow terminal opens, descriptor identity checks, exclusive creation, restricted modes, post-operation checks, and sidecar-preserving cleanup cover accidental drift and stationary path attacks. A concurrently malicious process with the same OS-user authority remains inside the explicitly accepted PM-owned local-state trust boundary and could already rewrite the artifacts directly.

- Observation: A safely hashed artifact does not by itself author the semantic judgment summarized beside it.
  Evidence: adversarial Milestone 3 review found that a screenshot cannot author its own verdict, a review file cannot author Fable's adjudication merely because its digest matches, and a note cannot author an owner decision. Review, browser, and product-decision judgments now retain the authoritative PM or Judge stored receipt as their source, while the exact hashed artifacts remain explicit drill-down evidence.

- Observation: Structured frontier evidence must be admitted atomically.
  Evidence: the first review collector appended a review before validating late nested scope anomalies and diff identity. A malformed tail could therefore leave an authoritative-looking partial review beside an invalid-evidence anomaly. The collector now validates the complete closed record and exact artifacts first, then appends once; missing, stale, unauthorized, traversal, symlink, malformed-digest, and late-failure fixtures prove that invalid evidence cannot partially survive.

- Observation: Reusing the checked child-board tree requires filesystem containment, not lexical containment alone.
  Evidence: a child `state.yaml` reached through a symlink component could pass the older `resolve()` prefix check and expose an external board to resume or frontier. One shared helper now canonicalizes the goal-root alias, rejects symlink components below it, requires a regular child state file, and preserves the existing public checker error contract.

- Observation: A single evaluation field named `scope` conflates two independent product decisions.
  Evidence: the first fresh-Fable comparison saw the same in-scope product diff and wrong-scope review workflow on both inputs, but one reviewer answered for product scope while the other answered for review scope. Splitting the evaluation seam into `product_scope` and `review_scope`, and binding changed-path identities to exact generated diff hashes, produced exact full-versus-frontier parity on the rerun.

- Observation: The shadow frontier preserved every decision-changing fact in the two material canaries while removing most control-plane input.
  Evidence: fresh no-session Fable reviewers agreed exactly on plan, operator prompt, review strategy, finding adjudication, screenshot, product scope, review scope, repair, deviation, owner gate, and acceptance. Both UI reviewers directly inspected the decisive board screenshot. Full prompts of 46,206 and 43,789 bytes reduced to 11,444 and 8,988 bytes respectively, with no omissions recorded in `/tmp/goalbuddy-m3-fable-parity/comparison-record.json`.

- Observation: A held cleanup-eligible report creates a proof-loss edge if the same artifact can later enter through the fresh-source path.
  Evidence: independent Milestone 4 review showed that explicit application could otherwise leave the held record in history while report cleanup removed the artifact that makes it checker-valid. The final lock-owned selector validates held entries and rejects any exact source-identity collision with an instruction to use its handle; the regression proves byte-identical rejection followed by successful handle consumption and eligible cleanup.

- Observation: A successful atomic install and its returned frontier need one shared checked identity even though rendering happens after the board lock.
  Evidence: two independent post-lock projections could describe different legal transitions. `createCheckedSemanticFrontier()` now requires the exact installed state digest, captures one checked root-and-child snapshot, and rechecks snapshot freshness immediately before returning. A later rendering failure reports `ADVANCE_OUTPUT_FAILED`, states that the receipt is already applied, and directs recovery to resume without replay.

- Observation: The completed Milestone 4 candidate removes Fable's digest and receipt-extraction work without weakening explicit semantic choice.
  Evidence: the public grammar has no caller digest or receipt-copy field; Fable still supplies the reviewed source or held handle, closeout authority, successor, and optional approved task card. The final synchronized candidate passed 394 Node tests and 49 Python tests, byte-exact mirror checks, linked-worktree cleanup, and a 169-file, 12.8 MB package preview; independent re-review returned no remaining blocker, high, or medium finding.

## Decision Log

- Decision: Preserve board version 2, task roles, historical receipts, exact session binding, scope enforcement, and the existing atomic transition boundary; permit only the narrow additive receipt fields required for honest completion proof.
  Rationale: Most of the durability model is sound, but accepted deviations and exact-final-review freshness cannot be enforced through prose alone. New fields apply prospectively; historical boards are not migrated or rewritten.
  Date/Author: 2026-07-30 / Codex

- Decision: Treat the semantic frontier as a pure projection over existing authoritative state and evidence, never as a second ledger.
  Rationale: A second persisted truth would create reconciliation work and repeat the bureaucracy this change is meant to remove.
  Date/Author: 2026-07-21 / Codex

- Decision: Build and evaluate the frontier in shadow mode before using it as Fable's execution interface.
  Rationale: The highest-cost failure is not a malformed field; it is a compact packet silently omitting a weak signal that would have changed Fable's plan, prompt, review, visual judgment, or acceptance decision.
  Date/Author: 2026-07-21 / Codex

- Decision: Remove Fable from bookkeeping, not from epistemic seams.
  Rationale: Fable's highest-value work is interpreting intent, integrating current repository facts, shaping implementation, reviewing diffs, adjudicating independent findings, inspecting visual evidence, and accepting semantic outcomes.
  Date/Author: 2026-07-21 / Codex

- Decision: Add one closeout-and-advance operation plus one narrow held-receipt transition rather than a generic semantic-action framework.
  Rationale: The observed repeated sequence is receipt validation, digest relay, atomic application, optional successor hydration, checker execution, and next projection. One deep operation removes that burden; the separate `hold` transition exists only to make an exact unapplied candidate recoverable across interruption and cannot apply or semantically accept it.
  Date/Author: 2026-07-21 / Codex

- Decision: Require `advance` to receive an explicit receipt source or exact held-receipt handle plus orthogonal transport, dispatch, authority, and applied provenance; never discover a supposedly unique report by scanning.
  Rationale: Clean Git-local reports, bare terminal receipts, rejected dispatch closeouts, unavailable transport, and held receipts differ on more than one axis. A single class conflated transport, dispatch outcome, closeout authority, and application state and could not preserve clean-Worker provenance after report cleanup.
  Date/Author: 2026-07-30 / Codex

- Decision: Never normalize, reconstruct, or silently convert Worker proof.
  Rationale: A rejected dispatch remains rejected. If policy permits a PM to stop that task, it authors a new blocked-only PM closeout that points to the rejected artifact; it does not edit the Worker receipt, claim passing commands, or relabel the dispatch.
  Date/Author: 2026-07-30 / Codex

- Decision: Introduce `completion_disposition`, `accepted_deviations`, and `final_review` on prospective final Judge/PM receipts.
  Rationale: `full_outcome_complete` needs a machine-checkable meaning. Exact completion and completion against an explicitly amended owner-approved oracle are both honest terminal states; missing or stale proof without acceptance is not.
  Date/Author: 2026-07-30 / Codex

- Decision: Absorb task-level JIT brief binding but retire receipt indexing.
  Rationale: Automatically binding one approved repository-local brief removes a demonstrated manual digest relay. A second description of the already-present receipt adds bytes and authority ambiguity without replacing evidence inspection.
  Date/Author: 2026-07-30 / Codex

- Decision: Close strict candidate projectability, receipt round-trip, completion-command, task-ID, and positional-help gaps before the semantic interface.
  Rationale: A compact frontier cannot be trusted if the checker can admit bytes that strict resume rejects or if it gives the lead an incomplete or invalid next action.
  Date/Author: 2026-07-30 / Codex

- Decision: Make the Milestone 0 receipt oracle cover the full currently admitted JSON-safe domain and every receipt-semantic subtree reserialized by a transition.
  Rationale: Checking only two fixtures or only the newly supplied source receipt would leave silent type changes, nested-array failures, unsafe-key corruption, prior copied wait-receipt corruption, and required null receipt slots outside the proof. The installer remains semantics-blind: callers identify stable task-relative receipt paths and expected values, while the shared gate strictly parses, normalizes, and deep-compares them before rename.
  Date/Author: 2026-07-30 / Codex

- Decision: Use one pure mechanical completion-eligibility result for both mutation and projection while leaving receipt semantics at the mutation boundary.
  Rationale: The checked projection must not advertise a command the mutator rejects. Every sibling, including a blocked task, and every referenced child board must be done before completion; unresolved work belongs in the exact accepted-deviation set rather than disappearing behind a terminal transition. Judge/PM receipt schema, `result: done`, `decision: complete`, and `full_outcome_complete: true` remain authoritative apply-time checks because they cannot be known before the receipt exists.
  Date/Author: 2026-07-30 / Codex

- Decision: Derive final-review required paths only from the checked root-and-child completed-Worker receipt ledger.
  Rationale: The final receipt controls its own `base_identity` and artifact locations, and no prior GoalBuddy field preserves a repository product baseline. Letting any of those fields add or subtract coverage lets current `HEAD` or a path collision hide Worker changes. Worker `changed_files` survives commits and includes declared ignored paths because dispatch observed and checked it at closeout; `base_identity` remains review metadata only. When no completed Worker produced product paths, the honest read-only coverage union is empty rather than invented.
  Date/Author: 2026-07-30 / Codex

- Decision: Treat GoalBuddy's board, transition code, and local artifacts as a PM-owned consistency boundary, not a cryptographic same-user attestation system.
  Rationale: Public hashes cannot prove which same-user process authored bytes. The release must reject accidental/stale/unsafe evidence and path attacks, but it must not introduce a secret, signing service, receipt registry, or false tamper-proof claim.
  Date/Author: 2026-07-30 / Codex

- Decision: Keep unselected held receipts as authority-bound, checked unapplied history after task closeout.
  Rationale: Milestone 4 consumes one selected handle atomically. Other candidates cannot silently vanish, and their presence must not make the task impossible to close through a different current receipt. Binding board identity, admitted digest, task authority, and dispatch contract prevents a held artifact from acquiring later amended authority.
  Date/Author: 2026-07-30 / Codex

- Decision: Keep full evidence available through explicit drill-down references and never replace the full diff or decisive screenshots with summaries.
  Rationale: Compression can save context but can also suppress evidence. The frontier is a navigation and decision packet, not the sole evidence store.
  Date/Author: 2026-07-21 / Codex

- Decision: Continue implementation through Milestone 5 and the complete isolated validation ladder, while preserving live activation as a separate owner transaction.
  Rationale: The owner explicitly asked the active plan run to continue after Milestone 0. Building and testing the candidate is reversible inside the isolated worktree; changing installed Codex or Claude surfaces is not and remains separately gated by this plan.
  Date/Author: 2026-07-30 / Codex

- Decision: Bind JIT briefs only to stable repository-local regular files, excluding the active board state and every GoalBuddy board `state.yaml`.
  Rationale: A brief must remain byte-identical across hydration, dispatch construction, and the immediate prelaunch rehash. Mutable board truth cannot satisfy that invariant and would create a self-invalidating binding.
  Date/Author: 2026-07-30 / Codex

- Decision: Treat brief opening as an adversarial filesystem boundary and require a nonblocking, no-follow, descriptor-verified regular file at every verification.
  Rationale: A path-only check admits symlink swaps and can block indefinitely on special files. The Worker launch gate must prove the exact safe bytes twice and fail without mutation or launch.
  Date/Author: 2026-07-30 / Codex

- Decision: Remove Worker monitoring from this plan.
  Rationale: Monitoring does not address the proven waste, current liveness remains deliberately unknown, and adding a monitor would enlarge the release before the semantic and completion boundaries are correct. Existing Ledger recovery remains unchanged.
  Date/Author: 2026-07-30 / Codex

- Decision: Do not add Smithers, Restate, a daemon, a lease service, a new durable registry, or another event database in this plan.
  Rationale: The first release can be implemented as pure projection plus composition of existing GoalBuddy operations. A larger durable substrate remains a separately justified future decision.
  Date/Author: 2026-07-21 / Codex

- Decision: Retire the large-autonomous-product compiler profile and broad paid semantic-evaluation program.
  Rationale: They duplicate the existing adaptive execution strategy, expose held-out fixtures to the implementation lane, and add expensive generation volume without measuring the observed wrong-scope, convergence, provenance, or overload failures. Only the bounded runtime-correctness prerequisite survives here.
  Date/Author: 2026-07-30 / Codex

- Decision: Carry optional frontier-only semantic evidence inside existing PM or Judge receipt `evidence` arrays rather than add a frontier sidecar or second ledger.
  Rationale: The receipt already owns the semantic judgment and board/task authority. Closed structured entries can bind exact review, diff, screenshot, and note artifacts while remaining additive and prospective; a separate persisted frontier file would create another truth to reconcile.
  Date/Author: 2026-07-30 / Codex

- Decision: Source review, browser, and product-decision judgments to their stored PM or Judge receipt; use exact hashed artifacts only as drill-down evidence.
  Rationale: File containment and digest equality prove which bytes Fable may inspect, not who authored the interpretation. Keeping judgment provenance and evidence navigation separate avoids falsely attributing decisions to screenshots, review files, or contextual notes.
  Date/Author: 2026-07-30 / Codex

- Decision: Treat invalid recognized frontier evidence as a bounded visible anomaly affecting only that claim, while continuing to project other independently valid evidence.
  Rationale: Failing the entire read-only frontier would hide unrelated valid facts and make recovery harder; silently dropping or partially accepting invalid evidence would be dishonest. Closed atomic admission plus public error categories preserves both continuity and truth.
  Date/Author: 2026-07-30 / Codex

- Decision: Evaluate product-diff scope and review-workflow scope as separate semantic seams.
  Rationale: A product diff can remain inside its approved write frontier while an independent review inspects the wrong files. One generic scope verdict loses this distinction and produced an evaluation disagreement even though both reviewers saw the same facts.
  Date/Author: 2026-07-30 / Codex

- Decision: Capture the admitted board digest inside `advance`, but keep source or held-handle choice, closeout authority, successor, and optional task card explicit.
  Rationale: The digest is concurrency control that the runtime can derive from one checked projection; the other fields are Fable's reviewed semantic choices and must never be inferred or discovered by scanning.
  Date/Author: 2026-07-30 / Codex

- Decision: Once an artifact is represented by a held receipt, every explicit receipt path must reject that exact source identity and require handle-based consumption.
  Rationale: Allowing the same source through another route can strand checked held history or delete cleanup-eligible proof. One exact handle is the durable semantic selection boundary; unselected different candidates remain checked history.
  Date/Author: 2026-07-30 / Codex

- Decision: Bind the returned semantic frontier to the exact installed receipt digest and classify post-install rendering failure separately from a rejected transition.
  Rationale: The outcome and next slice must describe one transition. If rendering fails after atomic install, reporting ordinary rejection would encourage a dangerous replay; `ADVANCE_OUTPUT_FAILED` instead preserves installed mutation truth and requires checked resume.
  Date/Author: 2026-07-30 / Codex

## Outcomes & Retrospective

Milestone 0 is complete on the isolated branch. Candidate installation now fails closed unless the exact bytes strictly parse, normalize through the resume path, and preserve every receipt-semantic subtree reserialized by that transition. The bounded serializer/parser inverse covers ambiguous strings, finite exponent numbers, negative zero, nested and empty arrays, unsafe or empty mapping keys, prototype-shaped keys, legacy indentationless sequences, ordinary comments, colon-bearing plain sequence scalars, and JSON-safe evidence objects with shadowing own keys. Projection now reports the lowest free root task ID and an exact `complete_goal` command only when the same pure mechanical predicate used by mutation says completion is legal; `apply_receipt` remains available.

The milestone added nine Node tests over the isolated baseline and no dependencies. Independent review found two high-severity edge cases before commit; both were fixed and the targeted re-reviews returned no findings. Final verification is 259 Node tests plus 49 Python tests, a byte-exact plugin mirror, and a 149-file package preview. No live installation or activation occurred.

Milestone 3 is complete in shadow mode. The normal `goalbuddy_frontier_v1` keeps the goal and oracle, current slice and bound brief, active root and child lanes, Worker state, consequential receipts and provenance, held evidence, verification, independent-review yield and scope anomalies, decisive browser evidence, deviations, owner gates, unresolved decisions, and exact drill-down references. It excludes raw board digests, command templates, checker narration, exact Worker UUIDs, report paths, raw receipts, and unchanged polls. The public command reuses the checked resume boundary, rechecks board-tree freshness immediately before output, and does not change repository or board bytes.

The adversarial pass repaired every material omission or attribution defect found before acceptance: active child lanes, root-gate duplication, child final-review overwrite, unsafe legacy note paths, invented historical authority, false cleanup status, unbounded legacy receipt narration, symlinked child boards, partial invalid review admission, unsupported artifact-attributed judgments, unsafe diff metadata, error-text leakage, and arbitrary decision-note paths. Final verification is 379 Node tests plus 49 Python tests, byte-exact mirrors, and a 169-file, 12.8 MB package preview. Independent final re-review found no blocker.

Fresh-Fable shadow comparison also passed. On the non-UI material fixture, both full and compact contexts approved the plan and prompt, required repair and another exact review, mixed the supported and unsupported findings, rejected the wrong-scope review, accepted the exact no-screenshot deviation, preserved the owner gate, and refused slice acceptance. On the UI fixture, both contexts approved the plan and prompt, directly inspected and accepted the same screenshot, accepted both product and review scope, stopped at diminishing returns, required no repair, and accepted the slice. Compact prompt bytes fell 75.23% and 79.47% without a decision mismatch. Comparison outputs remain disposable under `/tmp/goalbuddy-m3-fable-parity`; no live board or installed runtime was changed.

Milestone 4 is complete. The public `advance` boundary accepts exactly one reviewed source or held handle, one legal closeout authority, one distinct queued successor, and an optional approved task card. It internally captures checked concurrency identity; validates fresh or held receipt provenance under the existing board lock; atomically installs receipt, provenance, held-entry removal, optional hydration, source closeout, and successor activation; cleans only provenance-authorized ready reports after success; and returns a frontier bound to the exact installed transition. Retrying a completed source is rejected, while every pre-install failure preserves board and evidence bytes.

The adversarial pass closed the two material defects found after the initial green suite: exact held artifacts cannot bypass handle selection, and outcome plus frontier cannot straddle two post-lock transitions. Explicit and held original-role receipts, explicit and held rejected-dispatch PM blocked closeouts, unavailable transport, ready-report cleanup, task-card hydration, linked-worktree identity, changed held artifacts, malformed or stale sources, scope failures, illegal successors, public grammar, and replay recovery are covered. Final verification is 394 Node tests plus 49 Python tests, byte-exact canonical/plugin scripts, a 169-file, 12.8 MB package preview, and a no-finding independent re-review. No live installation or activation occurred.

Plan reconciliation remains complete: this is the only surviving GoalBuddy implementation plan; the useful task-level brief-binding and runtime-correctness work has been absorbed; the receipt index, owner profile/evaluation program, and monitor have been retired; and the closeout design now matches actual run provenance. Milestone 3 records that the shadow frontier preserved every fact that changed Fable's judgment in the two material canaries. At the end of Milestone 5, record the change in Fable-visible GoalBuddy calls and input volume together with plan, prompt, review, screenshot, scope, deviation, and completion decisions. Final completion requires reduced mechanical burden, truthful terminal semantics, exact-current-review proof when required, and no evidence of reduced product quality.

## Context and Orientation

The repository root is `/Users/danielalnajjar/Code/goalbuddy`. `goalbuddy/` is the canonical execution skill installed into Codex and Claude Code; `plugins/goalbuddy/skills/goal-prep/` is its byte-exact plugin mirror. The canonical files must be edited first, then synchronized through `npm run sync:plugin`.

A GoalBuddy board is a repository-backed goal directory containing a human-readable charter in `goal.md` and machine-valid execution state in `state.yaml`. The board remains the recovery identity for one product-writing frontier. This plan preserves board version 2 and every historical field. It prospectively adds one optional Worker `brief` binding and final Judge/PM completion fields; existing boards require no migration and completed receipts are never revalidated or rewritten.

The lead model is called Fable in this plan because the user's normal orchestrator is Claude/Fable in Claude Code. Fable owns semantic judgment. A Worker is the bounded implementation agent, normally an exact resumable Codex Exec session. A material slice is a unit of work whose decision risk or execution risk warrants just-in-time planning and independent review. A just-in-time plan or brief is current-slice implementation memory created from current repository truth rather than fully predicted when the long-running board is first compiled.

The current checked projection is produced in `goalbuddy/scripts/resume-board.mjs`. Its `createResumeProjection()` function returns valuable semantic fields, including the charter oracle, active task, recent receipt, last verification, approval gates, and planning inventory. It also returns state and board-tree digests, session identifiers, recovery instructions, and command templates. Those mechanical fields are necessary for the runtime but need not dominate Fable's context.

`goalbuddy/scripts/dispatch-task.mjs` admits the exact current task, renders its Worker prompt, launches or resumes the selected harness, captures the exact Codex thread identifier, checks the observed write frontier, validates the role-specific receipt, and stores the authoritative full report under `.git/goalbuddy/dispatch-reports/`. Its public success result is already compact and exposes only the apply-receipt operation. This plan preserves those boundaries.

`goalbuddy/scripts/apply-receipt.mjs` is the atomic mutation owner. Its exported `applyReceipt()` function validates the current receipt and successor under the board lock, optionally adds tasks or hydrates the successor, runs the checker against the candidate, atomically installs valid bytes, and deletes the consumed Git-local report only after success. The new closeout operation must call this implementation rather than reproduce it.

`goalbuddy/references/goal-execution.md` is the normative prepared-board execution kernel. `plugins/goalbuddy/commands/goal.md` is the Claude `/goal` entrypoint. `goalbuddy/SKILL.md` owns the broader installed skill contract. These instruction surfaces already contain quiet-control-plane and adaptive-execution rules; this plan should replace or sharpen existing wording rather than repeat another long policy block.

The current receipt boundary has two relevant defects. First, `apply-receipt.mjs` can serialize candidate bytes that pass the tolerant checker but fail the strict parser later used by resume; candidate installation does not yet prove strict reparse and exact receipt round-trip. Second, `receipt-contract.mjs` reserves `deviations` away from PM and Judge even though the execution kernel requires PM-owned deviation evidence. The first defect must be closed before any compact projection is trusted. The second requires a prospective, role-specific completion contract rather than reusing the Worker's separate `deviations` list.

Receipt provenance means how an exact terminal receipt reached the transition boundary and why that receipt may close the task. Do not compress this into one overloaded class. The durable applied record uses orthogonal closed fields: `receipt_transport` says whether the applying receipt came from a Git-local report or explicit repository file; `report_transport` says whether Git-local report transport was ready, unavailable, or inapplicable; `dispatch_disposition` says whether the related dispatch was accepted, rejected, or inapplicable; and `closeout_authority` says whether the original role receipt or an explicit PM blocked closeout supplied terminal meaning. Applied provenance always has `application_state: applied`. A separately typed held-receipt record, written by a narrow typed transition below, preserves an exact unapplied candidate across compaction without pretending it is task status or applied provenance.

The phrase semantic frontier means the compact information Fable needs to make the next product decision. It is not a user interface board and not new persistence. The phrase control envelope means the digests, exact command arguments, report paths, session identities, and checker facts the runtime needs to execute safely. The control envelope remains available in debug and recovery output but is not part of the normal frontier.

## Plan of Work

### Milestone 0: Make every installed candidate resumable and every projected next action exact

Strengthen the existing atomic installation path before building a smaller read model. After candidate YAML is serialized but before it is renamed over `state.yaml`, strict-parse and normalize the exact candidate bytes through the same parser used by resume. Deep-compare every receipt written or replaced by the transition with the exact JSON-safe parsed receipt value. The tolerant checker still runs, but a checker-green candidate that cannot be strictly resumed or that changes receipt meaning is rejected before mutation with the original board digest and bytes preserved.

Add red-then-green fixtures for colon-bearing keys in additive receipt mappings, nested mappings inside sequence-item mappings, and the retained checker-green/resume-red historical class. Do not replace the YAML parser generally, change the receipt grammar, or rewrite historical boards. Repair only the serializer/parser cases required to make currently supported JSON-safe receipt values round-trip exactly.

Extend the checked resume/planning projection with `complete_goal` only when the active receipt-free task is a final Judge or PM task mechanically eligible for completion. Add `next_free_task_id` as the lowest unused valid `T###`; with `T999` already occupied it returns another free three-digit ID and never suggests `T1000`. Namespace exhaustion fails explicitly. Make direct-script help enumerate the existing positional modes `receipt`, `wait`, `reply`, `complete`, and `rebind` without adding aliases or a second grammar.

The milestone is accepted when the historical failure shape is checker-green and strict-resume-green after a successful transition, deliberate projection failure leaves the original digest and bytes unchanged, completion appears only when mechanically legal, and every projected task ID is valid and unused.

### Milestone 1: Bind one approved JIT brief to the Worker task

Create `goalbuddy/scripts/brief-binding.mjs` as the sole owner of repository-relative path normalization, safe regular-file opening, exact byte hashing, persisted-shape validation, and binding equality. A PM-owned task card may contain one path-only ingress field:

    "brief": "docs/goals/<slug>/notes/<slice>-execplan.md"

During the existing locked hydration transition, resolve the repository root, reject absolute paths, backslashes, traversal, globs, symlinks, missing files, non-regular files, and out-of-root targets, then persist only:

    brief:
      path: docs/goals/<slug>/notes/<slice>-execplan.md
      sha256: <64 lowercase hex>

The field is optional and Worker-only. A Judge `worker_package` cannot grant it. Export the shared `worker_package` validator and make it reject every key outside `objective`, `allowed_files`, `verify`, and `stop_if` at receipt admission rather than later hydration.

Dispatch automatically consumes the task binding, verifies it while constructing the dispatch contract, and re-hashes the same file immediately before harness launch. Preserve the current manual `--brief` and `--brief-sha256` path for historical tasks and explicit direct dispatch. If task and CLI bindings are both present, they must match exactly; a partial pair, disagreement, stale bytes, unsafe path, or session-binding mismatch fails before launch and leaves board and product bytes unchanged.

The milestone is accepted through public hydration, dispatch, exact-resume, and rejection fixtures. It adds no receipt index, public prompt dump, resume-projection copy of the brief contents, or second planning authority.

### Milestone 2: Persist provenance and make terminal proof machine-checkable

Create a dependency-free provenance helper and extend the atomic receipt transition so every newly applied receipt stores one `goalbuddy_receipt_provenance_v1` object at `task.transition_evidence.receipt_provenance` before any successful report cleanup. The receipt itself remains byte-for-byte equivalent as parsed JSON data; provenance is adjacent transition evidence, not an injected receipt field.

The exact prospective applied-provenance shape is:

    kind: goalbuddy_receipt_provenance_v1
    receipt_transport: git_local_report | explicit_file
    report_transport: ready | unavailable | not_applicable
    dispatch_disposition: accepted | rejected | not_applicable
    closeout_authority: original_role | pm_blocked_closeout
    application_state: applied
    receipt_artifact:
      root: git_common_dir | repository
      path: <normalized path below that root>
      sha256: <64 lowercase hex>
      retention_policy: cleanup_eligible | retained
    origin_artifact: null | {
      root: git_common_dir | repository,
      path: <normalized path below that root>,
      sha256: <64 lowercase hex>
    }
    receipt_value_sha256: <64 lowercase hex>

Paths must resolve to safely opened, non-symlink regular files below the declared root. `receipt_value_sha256` is SHA-256 over a dependency-free canonical JSON encoding that recursively sorts object keys, preserves array order and scalar values, and accepts only the existing JSON-safe receipt domain. A clean Git-local report may remain cleanup-eligible because its path, source digest, exact receipt digest, and authority survive atomically in the board. A bare receipt, rejected dispatch artifact, transport-unavailable dispatch output, or PM closeout source is retained. The record describes cleanup policy, not a cleanup outcome it cannot know before installation.

Add one separate prospective held-receipt collection at `task.transition_evidence.held_receipts`. Each entry has the exact closed shape:

    kind: goalbuddy_held_receipt_v1
    handle: <64 lowercase hex>
    task_id: T###
    board_path: <normalized repository-relative state.yaml path>
    admitted_state_digest: <64 lowercase hex>
    task_authority_sha256: <64 lowercase hex>
    dispatch_contract_sha256: null | <64 lowercase hex>
    application_state: held
    receipt_transport: git_local_report | explicit_file
    report_transport: ready | unavailable | not_applicable
    dispatch_disposition: accepted | rejected | not_applicable
    source_artifact: {
      root: git_common_dir | repository,
      path: <normalized path below that root>,
      sha256: <64 lowercase hex>
    }
    origin_artifact: null | {
      root: git_common_dir | repository,
      path: <normalized path below that root>,
      sha256: <64 lowercase hex>
    }
    receipt_value_sha256: <64 lowercase hex>

`handle` is the canonical-JSON SHA-256 of every other field in the entry. Create `goalbuddy/scripts/goal-operation.mjs` in this milestone with `holdReceipt()` and the digest-bound typed transition `goalbuddy hold <goal-root> --task T004 --source <exact-path> [--origin-artifact <exact-path>] --expected-state-digest <sha256> --json`, before frontier work. The PM/Fable lane alone chooses to hold. The runtime safely opens and fully validates the same source/origin combinations later accepted by `advance`, derives the embedded or direct exact receipt and all transport fields, verifies current board/task identity and receipt admissibility, and atomically appends the nonduplicate entry through the existing board lock and candidate installer without applying a receipt or changing task status. The authority fields prevent later task or dispatch-contract changes from granting new authority to an old candidate. An unselected candidate remains checked unapplied history if another receipt closes the task. The transition returns the handle and next checked projection.

`advance` accepts either a new `--source` plus optional `--origin-artifact`, or one mutually exclusive `--held-receipt <handle>`. For the held form it resolves exactly one persisted entry on the active task, reopens and rehashes every referenced artifact, revalidates the derived receipt and current board/task identity, and atomically removes that entry only in the same successful installation that applies the receipt. Missing, changed, stale-task, duplicate, malformed, or already-consumed handles fail without board mutation. Resume and frontier project these checked persisted entries; no transcript, process memory, directory scan, or native task list is an authoritative held-evidence source.

Do not add PM conversion in this release. A rejected dispatch may close only through `pm_blocked_closeout`: a new PM-authored blocked receipt for the active source task with `result: blocked`, exact task and board identity, `authored_by: pm`, nonempty `summary`, `blocked_reason`, `remaining_blockers`, and evidence references. It may not claim passing commands, successful scope, or Worker authorship. The original rejected artifact is preserved as `origin_artifact`. Original role receipts continue through the existing role validator. The shared validator receives both source-task role and receipt-author role so this one cross-role blocked shape is explicit rather than masquerading as a Worker receipt.

Extend prospective final Judge and PM receipts with a completion disposition, a canonical deviation set, a deviation-set acceptance locator, and an exact final-review binding:

    completion_disposition: exact | accepted_deviation
    accepted_deviations:
      - requirement_id: <unique stable nonempty string>
        requirement: <nonempty string>
        observed_shortfall: <nonempty string>
        reason: <nonempty string>
        evidence: [<nonempty evidence references>]
    deviation_acceptance: null | {
      kind: goalbuddy_deviation_acceptance_v1,
      accepted_by: owner,
      task_id: T###,
      reply_index: <nonnegative integer>,
      deviation_set_sha256: <64 lowercase hex>
    }
    final_review:
      # Closed discriminated union; status selects one exact branch.
      status: complete
      artifact:
        path: <canonical repository-relative regular JSON file>
        sha256: <64 lowercase hex>
      workflow_version: <nonempty workflow identity>
      scope:
        kind: goalbuddy_review_scope_v1
        patterns: [<closed dispatch-scope patterns>]
      base_identity: { kind: git_commit | content_sha256, value: <identity> }
      reviewed_identity: { kind: git_commit | content_sha256, value: <identity> }
      completeness_status: complete

    # Or, only when exact-final-review is in the accepted deviation set:
    final_review:
      status: accepted_deviation
      requirement_id: exact-final-review
      deviation_set_sha256: <same digest as deviation_acceptance>
      observed_artifact: null | {
        path: <canonical repository-relative regular file>,
        sha256: <64 lowercase hex>,
        observed_failure: stale_identity | incomplete_scope | incomplete_review | unresolved_blockers | invalid_schema
      }

Compute `deviation_set_sha256` over the canonical JSON encoding of the complete ordered `accepted_deviations` array. One owner reply accepts the complete set, not an individual entry. Before requesting approval, the PM enters the existing exact-human wait with the exact required reply `approve GoalBuddy deviation set <sha256>`. Completion locates `task_id` and `reply_index` in persisted `transition_evidence.exact_human_replies`, verifies that the stored wait receipt contains that exact phrase for the recomputed set digest, and verifies the existing exact-match hashes. Reordering, adding, removing, or changing a deviation invalidates the approval. A Judge may cite this persisted acceptance but may not create one.

For `completion_disposition: exact`, `accepted_deviations` is empty and `deviation_acceptance` is null. For `accepted_deviation`, the set is nonempty and the acceptance locator passes the exact binding above. Worker `deviations` keeps its existing separate meaning: in-scope engineering choices against task text.

For the `complete` branch, the review artifact is a safely opened repository-relative `goalbuddy_final_review_v1` JSON object. It repeats `workflow_version`, the exact closed scope, base identity, reviewed identity, `completeness_status`, decision, and unresolved blocking findings. The receipt's artifact digest must match exact file bytes, and every repeated field must deep-equal the artifact. Review scope reuses the existing dispatch-scope grammar and manifest rules: exact repository-relative paths and bounded terminal `/**` trees only, with the same path-kind, symlink, mode, and content evidence. The external coverage oracle is the exact union of completed Worker `changed_files` from the checked root and child boards; receipt-supplied `base_identity` is repeated review provenance and cannot define this union. At the last possible pre-rename gate, recompute current identity over the exact review scope. Use Git `HEAD` only when the scoped product state exactly matches the clean reviewed commit; otherwise use the deterministic content-manifest SHA-256. `reviewed_identity` must match current bytes, completeness must be `complete`, and unresolved blocking findings must be empty. The checker repeats artifact, coverage, acceptance, and current-identity validation for the persisted prospective completion.

For the `accepted_deviation` branch, the validator recomputes the complete deviation-set digest, requires the same digest in `deviation_acceptance` and `final_review`, requires exactly one entry in that set with stable `requirement_id: exact-final-review`, and verifies the exact owner reply. Other separately identified deviations may remain in the same whole-set approval. The branch does not require or permit the complete branch's `workflow_version`, `scope`, identities, or `completeness_status`. A stale or otherwise unusable review may be retained only as optional `observed_artifact`; the runtime safely hashes it and derives `observed_failure`, while the accepted deviation's `observed_shortfall`, `reason`, and evidence remain the semantic explanation. If no usable file exists, `observed_artifact` is null. This branch records an owner-approved missing requirement; it never represents the review as current or complete.

Every GoalBuddy final completion requires the `complete` branch unless the exact-final-review deviation and its exact owner acceptance satisfy the `accepted_deviation` branch. There is no self-asserted `not_required` state. A green checker, test suite, Worker claim, or non-current review cannot substitute.

Update the execution kernel, task template, receipt specification, role examples, shared validator, checker completion rules, provenance serialization, and public tests together. `full_outcome_complete: true` then means the oracle is satisfied exactly or as formally amended by the exact accepted deviation set. Historical receipts and completed boards remain untouched. Accept this milestone only after clean provenance, transport-unavailable, rejected-dispatch PM closeout, source-digest mismatch, exact completion, deviation-set mutation, unrelated exact reply, stale review, dirty-snapshot review, wrong scope, replay, and byte-preservation fixtures pass.

### Milestone 3: Prove a provenance-aware semantic frontier in shadow mode

Create `goalbuddy/scripts/frontier-projection.mjs` as a pure, dependency-free projection module. Export `createSemanticFrontier({ resumeProjection, repositoryEvidence })`. The function reads and writes no files; its inputs are already validated facts and its output is one `goalbuddy_frontier_v1` object. Checked held-receipt entries come only through `resumeProjection`; there is no caller-supplied held-evidence side channel.

The frontier contains the goal and oracle; current slice identity, objective, inputs, constraints, expected output, stop conditions, and bound brief reference; Worker state; changed paths and verification; durable applied provenance and explicit held-evidence handles; review identities, round yield, and scope anomalies; decisive browser evidence; accepted deviations and their exact acceptance; owner gates; unresolved decisions; and drill-down references. Every summarized claim names its source as a board task, stored receipt, transition provenance, explicit held artifact, plan or note path, diff identity, review artifact, or screenshot artifact. Missing proof is `unavailable` or an explicit anomaly, never inferred success.

The normal frontier excludes raw state and tree digests, raw receipt JSON, checker logs, command templates, exact Worker UUIDs, internal report paths Fable does not need to inspect, and unchanged polling events. A separate debug form may retain control fields for deterministic tests and recovery. The frontier is navigation, not a second ledger or replacement for the full diff, review, receipt, or decisive screenshots.

Refactor `goalbuddy/scripts/resume-board.mjs` only enough to reuse its checked projection builder and project validated `transition_evidence.held_receipts`. Add `goalbuddy frontier <goal-root> --json` as an explicit shadow-only route; installed `/goal` continues to use the current projection until Milestone 5.

Retained or faithful fixtures must cover a material Worker awaiting dispatch; applied clean provenance after report cleanup; transport-unavailable success; an explicit terminal receipt; a rejected dispatch followed by `pm_blocked_closeout`; a held/unapplied artifact; a wrong-scope workflow; an early review round with many accepted findings; a later diminishing-return review; a blocked product decision; a scope anomaly; a bound brief; unknown exact-session liveness; an exact deviation-set acceptance; stale and exact final-review identities; a UI slice with decisive screenshots; and a queued placeholder needing hydration.

The milestone is accepted only when an independent fresh-context Fable reviewer makes the same planning, operator-prompt, review-selection, finding-adjudication, screenshot, scope, repair, deviation, and acceptance decisions from the frontier plus drill-down as from the full current materials. Every decision-changing omission is a frontier defect. Token reduction alone is not acceptance.

### Milestone 4: Compose explicit-source closeout and successor activation

Extend the Milestone 2 `goalbuddy/scripts/goal-operation.mjs` with its second and only other public operation, `advance`, consuming a held-receipt entry when requested. Do not create a generic action dispatcher or semantic workflow language. The `advance` CLI shape is:

    goalbuddy advance <goal-root> \
      --task T004 \
      (--source <exact-path> [--origin-artifact <exact-path>] | \
       --held-receipt <handle>) \
      --closeout-authority original_role | pm_blocked_closeout \
      --activate T005 \
      [--task-card <path>] \
      [--json]

Fable chooses the exact applying source or persisted held handle, closeout authority, successor, and optional approved task card. `--source` and `--held-receipt` are mutually exclusive; `--origin-artifact` is legal only with a new source. GoalBuddy derives and validates the orthogonal transport and dispatch fields from the exact artifacts; neither Fable nor the runtime guesses a class, and the operation never scans Git metadata or a build directory for a unique candidate. A held receipt remains held until Fable supplies its exact handle to a later legal `advance`.

For a clean report, validate its successful authoritative wrapper, task and board identities, admitted digest, clean scope, embedded receipt, and source digest. For a bare terminal receipt, validate the explicit file and apply no report-cleanup policy. For report-transport-unavailable success, accept the retained exact dispatch-output artifact itself as `--source`; validate `ok: true`, task and board identities, admitted digest, clean scope, `report_transport.status: unavailable`, and the embedded exact receipt, then derive that receipt without asking Fable to copy or reconstruct a second JSON file. For a rejected dispatch, allow only a `pm_blocked_closeout` source and require the rejected origin artifact; never copy fields into a faux successful report, invent command status, or relabel scope.

When a task card is supplied, compute its digest inside `advance` and pass exact path and digest into the existing atomic hydration transition. Call the extended `applyReceipt()` behavior under its one board lock so receipt, provenance, optional hydration, source closeout, and successor activation install together. Do not create another lock or write board bytes directly. After success, only a provenance-recorded, GoalBuddy-owned clean report with `retention_policy: cleanup_eligible` may be removed. The provenance record and receipt digest survive.

Every wrong task, authority mismatch, stale board, illegal successor, malformed source, missing or mismatched origin, scope failure, receipt failure, hydration failure, checker failure, or retry after successful application has a bounded truthful result. Rejection preserves board bytes and every source artifact. A crash after atomic installation but before output recovers through checked resume and cannot replay the receipt.

The milestone is accepted when Fable no longer relays a digest, extracts an embedded receipt, or reconstructs closeout JSON, but still explicitly chooses the reviewed source or held handle, legal authority, successor, and optional approved task card.

### Milestone 5: Promote the frontier while pinning Fable's quality responsibilities

Update `goalbuddy/references/goal-execution.md`, `goalbuddy/SKILL.md`, `plugins/goalbuddy/commands/goal.md`, and `goalbuddy/templates/goal.md` by replacing the current healthy-path mechanics with `frontier` and explicit-source `advance`. Keep the execution kernel normative and remove superseded wording in the same cutover.

The normative language retains these Fable-owned seams for material work: slice strategy; current-repository research when useful; JIT ExecPlan authoring and hardening; Codex operator-prompt authoring or approval; full product-diff review; independent-review selection and adjudication; direct decisive-screenshot inspection for UI-visible work; unexpected-write and scope decisions; review convergence judgment; accepted-deviation judgment; and final acceptance. A green checker, test result, Worker completion claim, receipt, or native task completion is evidence, not semantic completion.

A healthy prepared `/goal` start loads only the charter, compact execution kernel, and semantic frontier. It does not load Goal Prep, the compiler, raw `state.yaml`, or exceptional reference material unless compilation, structural amendment, or a named recovery trigger requires them. Genuine new-session or post-compaction uncertainty still invokes the existing Ledger audit. Claude's native task list may mirror the active run for visibility, ownership, and dependency release, but it is optional ephemeral projection and never a second authoritative ledger.

Add policy tests that fail if installed surfaces omit the Fable-owned seams, auto-accept semantic work, expose raw control fields in the normal frontier, load compiler/prep material during healthy execution, route ordinary closeout through Keeper, or treat a native task list as board truth. Keep plugin mirrors byte-exact.

Promotion requires retained-fixture parity plus two fresh-harness journeys. The non-UI material journey shows Fable authoring or approving the plan and operator prompt, inspecting the full diff, adjudicating independent review, recording exact final-review identity, and advancing once. The UI journey shows Fable directly inspecting decisive screenshots before advance. Both preserve exact receipts and valid board state. Activation remains a separate owner-approved transaction.

## Concrete Steps

Before implementation, obtain the independent plan review and explicit owner start approval recorded in `Progress`. Commit this reviewed file together with the narrow `.gitignore` allowlist on the current branch. Verify `git ls-files --error-unmatch docs/plans/goalbuddy-semantic-frontier.md` succeeds and the commit contains the exact reviewed plan. Do not create an implementation worktree from an untracked or merely allowlisted plan.

Then work only in an isolated GoalBuddy branch and worktree. Do not edit `/Users/danielalnajjar/Code/goalbuddy` directly if it is serving installed runtime work. From `/Users/danielalnajjar/Code/goalbuddy`, create a dedicated worktree and branch using a descriptive name such as `codex/goalbuddy-semantic-frontier`. Confirm the new worktree contains this plan and is clean before editing.

Before implementation, run the current baseline:

    cd /path/to/isolated/goalbuddy-worktree
    npm run check
    npm run pack:dry-run

Record the exact baseline test totals in `Progress` and `Surprises & Discoveries`. Do not hard-code the current count from an older plan because this repository changes frequently.

For Milestone 0, first preserve red fixtures for the checker-green/resume-red class, additive colon-bearing keys, nested mappings in sequence items, missing completion projection, and `T999` with a lower free ID. Then strengthen candidate admission and the compact projection. Run focused apply, strict-parser, resume, controller-command, checker, and CLI tests after each coherent change.

For Milestone 1, add the brief-binding module and integrate it through locked hydration, shared receipt admission, task checking, dispatch, and exact resume. Use a marker harness to prove every stale or unsafe binding fails before launch. Do not edit the plugin mirror by hand.

For Milestone 2, create `goal-operation.mjs` with only `holdReceipt()`, then add canonical JSON hashing, durable applied provenance, the typed held-receipt transition and collection, the PM blocked-closeout shape, deviation-set acceptance, the closed final-review union, and exact-current scoped identity. Update all prospective receipt, transition-evidence, checker, template, CLI, and spec owners together. Replay historical fixtures read-only.

For Milestone 3, add the pure frontier module and shadow-only CLI route over the validated Milestone 2 evidence shapes. Run focused frontier, resume, and policy tests. Generate comparison artifacts only under a disposable temporary directory or ignored test-fixture root; never write them into live board directories.

For Milestone 4, extend the existing operation module with `advanceGoal()` and add the explicit-source-or-held-handle CLI route. Reuse exports from `apply-receipt.mjs`; if a helper must be exported, export the narrow existing implementation rather than copy it. Run operation, receipt, dispatch, linked-worktree, checker, provenance, cleanup, and retry tests. Inspect `git status --short` after each failure-path test to prove cleanup and byte preservation.

For Milestone 5, edit canonical instruction surfaces and synchronize plugin mirrors:

    npm run sync:plugin
    npm run check
    npm run pack:dry-run

Build isolated Codex and Claude homes, install the candidate into both, run `goalbuddy contract --json`, and run both target doctors. Record installed-path checksums or byte-exact doctor evidence, but do not activate the candidate in the user's live homes.

At every stopping point, update `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective`. Commit coherent milestones on the isolated branch. Do not push, install live, migrate boards, or alter user configuration without a separate explicit request.

## Validation and Acceptance

Run `npm run check` from the isolated GoalBuddy worktree and require every Node and Python test to pass. Run `npm run pack:dry-run` and inspect the package contents for the new canonical scripts and mirrored skill files. Run the byte-exact mirror tests after every canonical skill edit.

The runtime-correctness acceptance fixture must prove strict reparse and exact JSON-safe receipt equality before install, byte-identical rejection on deliberate projection failure, legal `complete_goal` projection only at an eligible final audit, the lowest unused valid `next_free_task_id`, explicit namespace exhaustion, and accurate positional help.

The task-brief acceptance fixture must prove path-only ingress, atomic `{path, sha256}` persistence, automatic dispatch consumption, exact CLI agreement, historical manual dispatch, exact-session resumption, shared rejection of extra `worker_package` keys, and no harness launch or board mutation on missing, unsafe, symlinked, stale, partial, or contradictory bindings.

The terminal-evidence acceptance fixture must prove orthogonal provenance fields, canonical receipt digest stability, source and origin artifact containment/digests, durable clean-Worker provenance after eligible report cleanup, digest-bound held-receipt persistence and checked consumption, rejected-dispatch PM blocked closeout without Worker claims, refusal of any PM done conversion, exact deviation-set approval, rejection of an unrelated exact reply, both branches of the closed final-review union, review-artifact digest and metadata equality, closed-scope identity recomputation, and unchanged historical receipts.

The semantic frontier acceptance fixture must demonstrate all of the following observable behavior:

- A healthy material task returns the product objective, plan or brief pointer, consequential evidence, unresolved decisions, and drill-down references.
- The normal JSON contains no raw state digest, board-tree digest, exact Worker UUID, raw receipt object, or low-level command template.
- A blocked task, held receipt, provenance change, wrong-scope review, diminishing review yield, accepted deviation, stale review, failed verification, missing review artifact, or unavailable screenshot is explicit rather than summarized as healthy.
- A fresh reviewer can request the full diff, complete review, or decisive screenshot without reading raw board state.
- The frontier command does not change any repository or board byte.

The `advance` acceptance fixture must demonstrate that Fable supplies the reviewed source task, either an exact source path or exact held-receipt handle, legal closeout authority, selected successor, and optional approved task card. GoalBuddy derives and validates transport and dispatch disposition, atomically installs receipt, provenance, held-entry removal when applicable, and optional hydration, and returns the next frontier. Exercise clean report, bare receipt, unavailable report transport, retained T013/T019-style rejected-dispatch PM closeout, and held evidence. Every stale source, stale or changed held artifact, mismatched handle, malformed source, illegal PM closeout, scope failure, or checker rejection leaves the board byte-identical and preserves all evidence.

The completion acceptance fixture must prove exact completion, whole-set owner-accepted deviation, mutation or reordering after acceptance, missing or unrelated exact-human acceptance, Judge citation of an existing acceptance, stale Git review, stale dirty-snapshot review, review-artifact digest mismatch, artifact/receipt metadata disagreement, incomplete review, wrong closed scope, clean current review, accepted `exact-final-review` deviation, replay rejection, and byte preservation. A green checker or test suite without a matching final-review binding cannot complete a goal.

The fresh-Fable quality acceptance must compare the compact path with the current path on at least two material slices. Record Fable-visible GoalBuddy calls and input volume, retries, manual digest or receipt manipulation, plan quality, operator-prompt quality, diff-review findings, independent-review yield by round, screenshot adjudication, scope decisions, accepted deviations, final-review identity, and reopened or post-acceptance defects. The target is a substantial reduction in mechanical work with no missing constraint or weaker decision. Any quality regression blocks promotion even if token use improves.

The final compatibility gate must exercise an existing 0.5 board without migration. It must resume, dispatch or use a retained dispatch fixture, advance, and recover while preserving every historical receipt byte and all existing board semantics. The new completion fields are prospective and additive; they may not reinterpret completed history.

## Idempotence and Recovery

The frontier is read-only and can be regenerated safely. Shadow artifacts are disposable and must never become authority. Re-running `frontier` against unchanged board and repository evidence must produce semantically identical output except for explicitly non-authoritative timestamps, which should be avoided if possible.

`advance` is intentionally not silently idempotent after success: once a receipt has been consumed and the successor activated, repeating the same command must report that the source task is no longer current rather than applying it twice. A failure before atomic installation leaves the board unchanged and the dispatch report available. A crash after atomic installation but before printing the frontier is recovered through the normal checked projection; it must not replay the receipt.

If shadow evaluation reveals that the frontier omits decision-relevant information, expand the frontier schema and fixtures before changing `/goal`. If the frontier cannot remain compact without hiding evidence, preserve the current projection and document the failed experiment.

If exact receipt provenance cannot be established but the candidate artifact is valid enough for the typed held contract, use the digest-bound `goalbuddy hold` transition and escalate; otherwise preserve the file outside board authority and report that it could not be held. Do not infer missing transport, dispatch, or authority fields. If current artifact identity cannot be reproduced, completion fails closed. If the deviation-set approval does not bind the exact current set, the goal remains incomplete.

Activation is a separate transaction. Existing live sessions may retain old instructions, so activate only after checking live Worker quiescence and following the repository's isolated install and doctor procedure. Existing boards are not rewritten as part of activation.

## Artifacts and Notes

Keep shadow comparison artifacts under a disposable or explicitly ignored test-fixture location. The minimum comparison record for each seam should contain the source fixture identifier, current resume output path, semantic frontier output path, decision-relevant facts used by the reviewer, omissions found, and disposition. Do not store full Worker transcripts in Fable-facing artifacts.

At completion, add a short evidence record to this section containing the final branch and commit, test totals, package dry-run result, Codex and Claude doctor results, strict-projectability proof, provenance fixture disposition, accepted-deviation and exact-review proof, shadow-comparison disposition, and fresh-Fable journey disposition.

Expected healthy behavior should resemble:

    Fable receives goalbuddy_frontier_v1.
    Fable plans, prompts, and reviews the material slice.
    Fable invokes goalbuddy advance with the exact source, legal closeout authority, and successor.
    GoalBuddy returns the accepted product outcome and the next goalbuddy_frontier_v1.

The user-facing conversation should discuss product progress, review status, blockers, and decisions. It should not narrate successful digest relay, receipt transport, checker invocation, report cleanup, or successor installation.

## Interfaces and Dependencies

The implementation remains dependency-free and uses Node.js standard-library modules already permitted by the repository.

In `goalbuddy/scripts/frontier-projection.mjs`, define a pure export with this conceptual shape:

    export function createSemanticFrontier({
      resumeProjection,
      repositoryEvidence = null,
    }) -> goalbuddy_frontier_v1

The returned object must have stable top-level sections named `goal`, `slice`, `worker`, `evidence`, `reviews`, `deviations`, `decisions`, and `drill_down`. Exact nested fields may be refined during shadow evaluation, but no raw control field may silently migrate into the semantic form.

In `goalbuddy/scripts/goal-operation.mjs`, define the Milestone 2 export with this conceptual shape:

    export function holdReceipt({
      goalRoot,
      taskId,
      sourcePath,
      originArtifactPath = "",
      expectedStateDigest,
    }) -> { ok, handle, projection } | public failure

In Milestone 4, extend that same module with the narrow closeout export:

    export function advanceGoal({
      goalRoot,
      taskId,
      sourcePath = "",
      heldReceipt = "",
      closeoutAuthority,
      originArtifactPath = "",
      activateTaskId,
      taskCardPath = "",
    }) -> { ok, outcome, frontier } | public failure

`holdReceipt()` uses the existing board lock and candidate installer; it writes only the exact checked held-receipt entry. `advanceGoal()` requires exactly one of `sourcePath` or `heldReceipt`, derives orthogonal provenance from the exact artifacts, validates the selected closeout authority, calls existing dispatch-report and role-receipt validation as applicable, then reuses `applyReceipt()` behavior. Neither export scans for sources, reconstructs proof, or writes board bytes directly.

In `goalbuddy/scripts/brief-binding.mjs`, expose narrow operations equivalent to:

    export function bindBrief({ goalRoot, path }) -> { path, sha256 }
    export function verifyBrief({ goalRoot, binding }) -> { path, sha256 }

Both functions operate on one safely opened regular file inside the repository and return no file contents.

In a focused provenance module, expose canonical JSON hashing, contained artifact identity, provenance derivation, and provenance validation. Extend `applyReceipt()` with one internal provenance parameter and serialize that exact validated record beside the receipt under the existing board lock. Public low-level receipt application derives `original_role` provenance from its exact file; `advance` supplies the richer validated descriptor.

Add one dependency-free current-artifact identity helper used only by final-review validation. For a clean Git state it returns the exact current commit identity. For a dirty or intentionally uncommitted reviewed scope it returns a deterministic SHA-256 over a sorted manifest containing path, file kind, mode, and content digest. It must reuse the closed scope compiler plus path/file-kind rules in `goalbuddy/scripts/dispatch-scope-manifest.mjs`. The review-artifact loader safely opens the declared repository-relative JSON file, verifies its byte digest and exact schema, and deep-compares every duplicated receipt field before recomputing current identity.

Add the CLI route `hold` in Milestone 2 and routes `frontier` and `advance` in their later milestones in `internal/cli/goal-maker.mjs`. Keep the existing `resume`, `dispatch`, `receipt`, and typed transition surfaces for recovery and compatibility. Do not create aliases beyond the canonical command names.

`receipt-contract.mjs` remains the shared role boundary. Prospectively allow `completion_disposition`, `accepted_deviations`, `deviation_acceptance`, and `final_review` only on final Judge/PM receipts. Add the separately named blocked-only PM closeout validator for a rejected source task; do not disguise it as the source task's role receipt. Reject all terminal-completion fields on Worker and Scout receipts. Keep Worker `deviations` as a string array with its existing task-local meaning. `receipt_provenance` belongs to transition evidence and is validated by both the checker and transition code, never accepted from an untrusted receipt.

## Explicitly Out of Scope

This plan does not add a receipt index, `large-autonomous-product` profile, broad or paid semantic-evaluation program, Worker monitor, daemon, lease, registry, second ledger, native-task authority graph, deterministic semantic scheduler, visual board, Smithers/Restate runtime, or general workflow engine.

It does not automate reviewer selection or semantic acceptance; normalize, reconstruct, or silently convert a receipt; migrate active boards; rewrite historical receipts; weaken `allowed_files`; remove the checker; replace exact Codex session binding; merge Worker transcripts into Fable context; activate an installed runtime; or repair OmegaCode role registration, workflow base/head/scope admission, review convergence, or host-load gating. Those Omega concerns belong to a separate owner-repository plan.

It does not remove Fable from material planning, Codex prompt authoring or approval, full-diff review, independent-review selection and adjudication, decisive screenshot inspection, scope decisions, accepted-deviation judgment, or final acceptance. Any implementation that does so violates the purpose even if all deterministic tests pass.

## Revision Note

2026-07-21: Initial plan created after inspecting the current GoalBuddy 0.5 source. The inspection narrowed the conversational proposal in two important ways: the runtime already contains most low-level safety and compact-transport features, and successor hydration already belongs inside the atomic receipt transition. The plan therefore adds a shadow-tested semantic projection and one deep closeout operation before considering monitoring, rather than creating a new orchestration architecture.

2026-07-30: Reconciled the five GoalBuddy design threads, the completed unattended run, twelve ExecPlans, the compiled owner-doctrine board, current source contracts, and current Claude/Omega task behavior. This revision makes Semantic Frontier the sole surviving implementation plan; absorbs task-level brief binding and the bounded Slice 0 runtime-correctness work; replaces unique-report discovery with explicit receipt provenance; adds honest accepted-deviation and exact-final-review completion semantics; and retires the receipt index, owner profile/evaluation program, and monitor because they do not address the observed failure modes.

2026-07-30: Hardened the reconciled plan after independent Goal Judge review. The applied-provenance fields are now orthogonal and a digest-bound `hold` transition is the only durable source of recoverable held receipts; transport-unavailable dispatch output is consumed directly without a Fable-authored receipt copy; final review is a closed union that distinguishes exact current proof from an owner-accepted missing requirement; evidence schemas precede the shadow frontier; and a pre-worktree Git durability gate prevents implementation from starting from an untracked plan.

2026-07-30: Recorded owner authorization for the durability commit, isolated worktree, and Milestone 0 only, together with the adjudicated ChatGPT Pro findings. The architecture is unchanged, but the Milestone 0 oracle now explicitly covers the complete bounded JSON-safe serializer/parser inverse, every reserialized receipt-semantic subtree, shared completion eligibility including blocked-sibling parity, exact `T000` through `T999` allocation, and accurate positional-help wording. Milestones 1-5 and activation still require separate authorization.

2026-07-30: Completed Milestone 0 on the isolated branch. Root verification and independent review repaired ordinary-comment handling, colon-bearing plain sequence scalars, and object display normalization for shadowing own keys before the final green run. The canonical/plugin runtime trees are synchronized, the package contains the new shared eligibility module, and Milestones 1-5 plus activation remain untouched and separately gated.

2026-07-30: Recorded the owner's instruction to continue the active plan through Milestones 1-5 and the complete isolated validation ladder. This expands implementation authority beyond Milestone 0 but does not authorize live installation, user-configuration changes, or activation.

2026-07-30: Hardened Milestone 2 after three independent completion, provenance, and public-surface reviews. The revision makes every unfinished sibling and non-done child block completion; makes the completed-board checker revalidate retained final-review bytes, Worker-ledger coverage, owner acceptance, and current scoped identity; removes final-receipt control over the coverage oracle; binds held receipts to admitted board/task/dispatch authority while preserving unselected entries as checked history; materializes Git-local reports through no-follow verified directories; and unlinks only the authenticated report during cleanup. It also records the PM-owned same-user trust boundary instead of making an unsupportable cryptographic-authorship claim.

2026-07-30: Closed the final Milestone 2 adversarial findings. Receipt and review artifact paths can no longer subtract Worker-ledger paths; read-only goals preserve an empty product-coverage union; scoped product identity excludes `docs/goals/` control bytes so broad scopes do not self-stale; and the public resume projection suppresses completion for a checker-green parent that still references an active child. The independent completion and surface re-reviews returned no findings, while the provenance re-review confirmed that the remaining concurrent same-user pathname race is the plan's explicit local trust boundary rather than a dependency-free JavaScript defect.

2026-07-30: Completed Milestone 3 in shadow mode. The pure frontier projection and checked read-only CLI now expose product decisions and exact drill-down evidence without relaying control-plane mechanics. Adversarial review repaired child-lane omission, unsafe child and artifact paths, partial invalid-evidence admission, false semantic attribution to artifacts, unbounded legacy narration, root/child authority errors, and stale or missing proof handling. A disposable fresh-Fable comparison first exposed an ambiguous evaluation seam, split product scope from review-workflow scope, then produced exact full-versus-frontier parity across eleven decisions on both non-UI and screenshot-inspected UI slices with 75.23% and 79.47% smaller prompts. The final candidate passes 379 Node tests and 49 Python tests, mirrors byte-exactly, and remains unactivated.
