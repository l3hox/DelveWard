# M4.5 — Architecture Decision Record

Consolidated decisions made during the M4.5 autonomous-run-system design and run-1. Each entry follows ADR shape: context, decision, alternatives, consequences. Intended for future maintainers, for the eventual extraction to a standalone autonomous-run tool, and for integration into the forge-* ecosystem.

ID format: `ADR-M45-NNNN`. Dates are in 2026 unless noted.

---

## ADR-M45-0001 — Laboratory framing: the system is the deliverable

**Status**: accepted
**Date**: 2026-05-27

### Context

M4.5 began as an architectural cleanup phase for DelveWard (driven by the developer council's findings against `gameState.ts` and `main.ts`). Mid-design it became clear that the *autonomous-run system* needed to build the refactor was itself a substantial product with potential for reuse on other projects.

### Decision

The primary deliverable of M4.5 is the **autonomous-run system**, not the DelveWard refactor. The refactor is the test workload. Whatever lands in this work is intended to be **generalized and extracted** for cross-project use.

### Alternatives considered

A. Refactor as primary deliverable; the run system is just tooling. Implication: the run system stays DelveWard-specific and gets discarded once the refactor lands.
B. Build the refactor manually (no autonomous system). Implication: faster for this one refactor; nothing reusable.

### Consequences

**Positive**:
- Investment in the system pays off across future projects.
- Reframes "failed runs" as data points rather than setbacks.
- Drives the generalization stance through every artifact.

**Negative**:
- More effort total than the refactor would have taken alone.
- The DelveWard refactor itself moves slower because design quality of the run system matters more than refactor speed.

### References

- `PLAN.md` §Framing
- `RUN1-FEEDBACK.md`

---

## ADR-M45-0002 — Branch discipline: throwaway runs from preflight basis, never deleted

**Status**: accepted
**Date**: 2026-05-27

### Context

Iterating an autonomous-run design needs a workflow where failed attempts are preserved (for study) without polluting `main`, and where the plan can be improved between attempts.

### Decision

- `m4.5-preflight` is the **iteration basis**. All plan/scripts/templates/hooks/goldens live here.
- Each run attempt is a separate `m4.5-run-N` branch cut from preflight.
- The autonomous runner operates only on the run branch. Never on `main`.
- After a run, the user decides keep or iterate. **No run branch is ever deleted** — it's preserved as a study artifact.
- `main` is touched only when the user is satisfied with both the system and the resulting refactor.

### Alternatives considered

A. Run autonomously on `main` with revert-on-failure. Rejected: destructive to shared state, irrecoverable on intermediate states.
B. Delete failed run branches. Rejected: loses learning data; the cost of branch retention (git refs) is negligible compared to the value of comparing N runs.
C. Squash-merge each run before discarding. Rejected: defeats the lab purpose of comparing approaches.

### Consequences

**Positive**:
- Failed runs are full study artifacts; can be replayed, diffed, compared.
- `main` stays clean.
- Plan iteration is decoupled from refactor iteration.

**Negative**:
- Branch namespace grows unboundedly over the project's life.
- Cherry-picking between branches has friction.

### References

- `PLAN.md` §Branch discipline
- `CLAUDE.md` M4.5 section

---

## ADR-M45-0003 — Spec authoring is in-loop, not pre-flight

**Status**: accepted (changed from v1)
**Date**: 2026-05-27 (v2 of M4.5 plan)

### Context

V1 of the plan had specs (A2-spec.md … A7-spec.md) authored pre-flight and committed to `m4.5-preflight` before launching a run. The user pushed back: pre-committed specs lock the plan; iterating the plan would force re-authoring specs every time.

### Decision

A2…A7 specs are authored **in-loop** by `SystemArchitect`, reviewed by `ArchitectReviewer`, then sealed. A6 is conditional, gated by `scripts/a6-gate.sh`.

### Alternatives considered

A. Pre-commit all specs (v1 design). Rejected: locks plan, expensive to iterate.
B. Hybrid: commit some, author others in-loop. Rejected: complicates the runner's logic.
C. Author specs on demand (in-loop) but cache to preflight after first successful run for cheaper subsequent runs. Considered but explicitly rejected per ADR-M45-0011.

### Consequences

**Positive**:
- Plan can be iterated freely between runs.
- Each run re-authors specs, testing reproducibility across model versions.
- Specs become run artifacts rather than committed-once contracts.

**Negative**:
- Each run pays ~$5-10 in SystemArchitect + ArchitectReviewer spawns for spec authoring.
- Spec content is in working tree (not preflight) and lost if the run is discarded without explicit preservation. Mitigated by always committing specs onto the run branch before exit.

### References

- `PLAN.md` §Shape step 4
- `ALPHA-SCOPE.md` Resolved decisions #1
- `templates/spec-author.md`

---

## ADR-M45-0004 — Bookkeeping mechanized via PostToolUse hook

**Status**: accepted
**Date**: 2026-05-27

### Context

Run-1 showed that prose-based instructions to the runner ("update STATUS.md.last_heartbeat_at every iteration", "update stats.by_role.<bucket>.tokens after every Agent spawn") were silently skipped under load. Heartbeat updated only once across 2h 12min; spawn counts undercounted by 60%; tokens stuck at 0 throughout.

### Decision

A PostToolUse hook (`planning/m4.5/hooks/post-tool.sh` / `.py`) fires on every tool call. It owns:

- `STATUS.md.last_heartbeat_at` (updated every fire)
- `STATUS.md.stats.agents_spawned` and `stats.by_role.<bucket>.spawned` (on Agent calls)
- `STATUS.md.stats.total_tokens`, `stats.by_role.<bucket>.tokens`, and `stats.estimated_usd` (when `<usage>` is in the tool result)

The runner agent prompt drops all bookkeeping prose. The runner does not write these fields itself.

### Alternatives considered

A. Keep prose-based instructions (run-1 design). **Rejected**: empirically broken.
B. Wrapper script around Agent calls. **Rejected**: infeasible; Agent is a runtime tool, not a CLI command.
C. Scheduled heartbeat refresh via cron / ScheduleWakeup. **Rejected**: interrupts the runner mid-work, adds context overhead, doesn't fix stats.
D. Post-hoc analysis only (no live tracking). Considered, but live visibility is needed for the eventual GUI.

### Consequences

**Positive**:
- Mechanical reliability — independent of LLM behavior.
- Zero runner-context cost; hook output is side-effect-only.
- Removes a class of prompt instructions that the LLM consistently dropped.

**Negative**:
- Hook semantics depend on Claude Code's PostToolUse hook input format. Verification deferred to runtime (see `ALPHA-SCOPE.md` resolved decision #2).
- If `<usage>` is not in hook input, tokens fall back to post-hoc via `run-stats.sh`.

### References

- `hooks/post-tool.py` (implementation + self-test)
- `PLAN.md` §Shape (bookkeeping note)
- `RUN1-FEEDBACK.md` "What broke"
- `~/AutonomousRunLessons.md` "Validate prompts the way you validate code"

---

## ADR-M45-0005 — Thin verification scripts offload I/O from the runner

**Status**: accepted
**Date**: 2026-05-27

### Context

Run-1 cost analysis: the runner consumed 47M tokens (45.6M cache-read), costing $22.34 of a $30 run. Cache-read tokens dominated because every tool result stayed in context and was re-cached on every subsequent turn. The biggest single-turn context bloat came from the runner running `vitest`, `tsc`, `npm run build`, `smoke.mjs` and reading multi-thousand-line outputs.

### Decision

Two thin shell scripts encapsulate heavy I/O:

- `scripts/phase-verify.sh` runs all verification gates and emits a single structured line (`VERIFY phase=A2 vitest=green tsc=green ... log=...`). Full output to disk; runner reads only the summary.
- `scripts/phase-diff.sh` runs `git diff --stat` + content hash and emits a single line (`DIFF phase=A2 files=N lines_added=N ... patch=...`). Full patch to disk.

The runner branches on the one-line summary. Detail is read on demand only when remediation is needed.

### Alternatives considered

A. Runner reads outputs directly (run-1 shape). Rejected: cache-read cost.
B. Spawn a verification subagent that returns a summary. Considered for β — it pushes the I/O cost into the subagent's bounded context instead. May replace shell scripts in β.
C. Heredoc-style summaries inlined into prompts. Rejected: brittle.

### Consequences

**Positive**:
- Estimated 3-5× reduction in runner-context tokens for verification-heavy phases.
- Explicit script contracts (one line out, full log to disk, exit code semantics).
- Scripts are reusable in β as default verification implementations.

**Negative**:
- Two more scripts to maintain.
- Project-specific verification gates (vitest, tsc, smoke, goldens) are now hardcoded in the verify script; consumer projects override with their own.

### References

- `scripts/phase-verify.sh`, `scripts/phase-diff.sh`
- `RUN1-FEEDBACK.md` "Cost observations"

---

## ADR-M45-0006 — Beta drops event sourcing; STATUS.json atomic write + events.jsonl audit

**Status**: accepted (changed from β v1)
**Date**: 2026-05-27 (β v2)

### Context

β v1 proposed event sourcing as the primary state mechanism: events.jsonl as the write-ahead log, STATUS.json as a derived projection rebuilt from events on crash recovery. Council pushback (Architect, Dev, QA): at 5-50 phases, the operational complexity (schema versioning, projection-vs-state-drift detection, replay logic) is not worth its cost. The mutable-vs-projection conflict in the v1 pseudocode was a symptom.

### Decision

In β:

- **`STATUS.json` is the source of truth.** Written atomically (`.tmp` + rename) on every state transition. Crash recovery reads it directly; no event replay required.
- **`events.jsonl` is an append-only audit log.** Captures the same transitions for observability (SSE stream, post-hoc analysis, GUI replay). Never read by the orchestrator on the hot path.
- If they diverge, `STATUS.json` wins; the divergence is logged but doesn't block the run.

### Alternatives considered

A. Event sourcing (β v1 design). Rejected per council.
B. Pure log, no atomic state. Rejected: crash recovery would need full replay every restart.
C. SQLite or similar embedded DB. Rejected: overkill at this scale.

### Consequences

**Positive**:
- Simpler crash recovery: `STATUS.json` already encodes the answer.
- Schema-versioning concern is bounded to the events log (which the orchestrator doesn't depend on for correctness).
- GUI story unchanged: SSE on `events.jsonl` is the same.

**Negative**:
- Two-file consistency to manage. Mitigated by treating divergence as observability data, not a correctness gate.
- Some state must be derivable from `STATUS.json` alone (no "look at events for the full story" in the runner's logic).

### References

- `BETA-ARCHITECTURE.md` §State model
- `RUN1-FEEDBACK.md` Open questions

---

## ADR-M45-0007 — Beta is a separate repo with a pure-Python orchestrator

**Status**: accepted
**Date**: 2026-05-27

### Context

The β architecture promises generalization across projects. Keeping β in the DelveWard repo with project-specific paths hardcoded would fake the generalization. The orchestrator code also fundamentally differs from the rest of DelveWard (Python, not TypeScript; tool, not game).

### Decision

- α.5 (between α and β implementation) bootstraps a new standalone repo (working name TBD: candidates `phase-runner`, `conduit`, `staged`).
- The orchestrator is **pure Python** with stdlib + pydantic + a minimal HTTP server (fastapi or stdlib). No Claude Code agent.
- DelveWard becomes the first consumer. Project-specific bits (config, templates, verification script, hooks, fixtures, goldens) stay in DelveWard.
- Install via `pipx` or `uv tool install`.

### Alternatives considered

A. Keep β in DelveWard as `planning/m4.5/orchestrator/`. Rejected: doesn't enforce generalization.
B. Build the orchestrator as a Claude Code agent (using Read/Edit/Bash/Agent tools "for free"). **Rejected**: defeats the purpose of removing the LLM from the orchestration loop.
C. Use Go or Rust for compiled deployment. Considered; Python wins on iteration speed for the prototype. Recompile in a later language if performance demands.

### Consequences

**Positive**:
- Generalization is structurally enforced; orchestrator code can't reach into DelveWard internals.
- Independent test suite (no Three.js, no vitest, no fixtures).
- Standard packaging path (pyproject + entry point).

**Negative**:
- Cross-repo coordination overhead.
- Local dev requires `pip install -e .` from a sibling directory or similar.
- Bootstrap cost (~1 session) before any β work happens.

### References

- `BETA-ARCHITECTURE.md` §Deployment, §Generalization stance
- `BETA-ARCHITECTURE.md` Open question #9

---

## ADR-M45-0008 — Spec is passed to workers by file path, not inlined

**Status**: accepted
**Date**: 2026-05-27 (α)

### Context

V1 of the worker prompt template inlined the full sealed spec via `{{SPEC_CONTENT}}`. Cost analysis showed specs (A2: 325 lines, A4: 297 lines, ~5K tokens each) re-cached every runner turn during the worker's run, contributing to the 45.6M cache-read total.

### Decision

The worker template references the spec by path: `{{SPEC_PATH}}`. The worker reads the spec once at start with a single `Read` call. The runner never inlines spec content into the worker prompt.

Same applies to `remediation.md`.

### Alternatives considered

A. Inline full content (v1). Rejected: cache-read cost.
B. Inline a summary (Goal + Scope + After only). Considered; rejected because the worker also needs Steps, DO NOT, Budget. Cleaner to pass the whole file by path.
C. Pass spec via stdin to the spawn. Not supported by Claude Code Agent tool today.

### Consequences

**Positive**:
- Reduced per-spawn context size by ~5K tokens.
- Specs are first-class files (referenced, not embedded).
- Edits to a spec mid-cycle (during remediation) automatically reach the worker on its next Read.

**Negative**:
- Worker incurs one extra Read tool call per spawn.
- If the spec is deleted before the worker spawns (shouldn't happen, but possible during ad-hoc cleanup), the worker fails. Mitigated by the runner verifying spec existence before dispatch.

### References

- `templates/worker.md`
- `templates/remediation.md`
- `RUN1-FEEDBACK.md` Cost observations

---

## ADR-M45-0009 — Per-step bypass + env allowlist in β

**Status**: accepted
**Date**: 2026-05-27 (β v2)

### Context

Current architecture launches with `--dangerously-skip-permissions` at the parent level, which propagates to all subagents (per `VERIFY-MODE.md`). Security council flagged that this is wider than necessary: only `worker` and `remediation_worker` write code; `spec_author`, `spec_review`, `council_member`, `council_decide` write at most one known path or nothing.

Additionally, `subprocess.Popen` defaults inherit the full parent env including `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, shell history vars — wider than each step needs.

### Decision

In β:

- **`permission_mode` is a per-step contract field.** Default `default` (no bypass). Only `worker` and `remediation_worker` use `bypass`.
- **`env_allowlist` is a per-step contract field.** Default empty. Each step explicitly lists which env vars to inherit. Workers under bypass don't get `GITHUB_TOKEN`; verifiers don't get `ANTHROPIC_API_KEY`.
- The orchestrator's step dispatcher enforces both by constructing the command + env explicitly.

### Alternatives considered

A. Bypass everything (current design). Rejected: wider blast radius than needed.
B. Separate runner per permission scope. Rejected: complicates orchestration without commensurate benefit.

### Consequences

**Positive**:
- Tighter security boundary; least-privilege per step.
- Smaller credential blast radius if a step is compromised.
- Auditable per-step contracts.

**Negative**:
- More per-step configuration to write and maintain.
- New failure mode: a step missing an env var it needs because the allowlist was wrong. Caught early via step contract tests.

### References

- `BETA-ARCHITECTURE.md` §Step contracts, §Security
- `VERIFY-MODE.md`

---

## ADR-M45-0010 — DeveloperCouncil reviews every phase's diff (quick mode default)

**Status**: accepted
**Date**: 2026-05-27

### Context

Beyond automated verification (compile, test, smoke), some classes of regression are only catchable by human-substitute review: subtle correctness bugs, hidden coupling regressions, naming drift, silent contract breakage that doesn't have tests.

### Decision

- Every phase's clean diff is reviewed by `DeveloperCouncil` (multi-specialist Skill) before integration.
- Default depth: **quick** (Round 1 + synthesis; one pass per specialist; no debate round).
- Full 3-round mode is opt-in via `COUNCIL_DEPTH=full` for high-stakes phases.
- Critical/high findings → trigger remediation. Medium/low → logged only.

### Alternatives considered

A. Single reviewer agent. Rejected: misses cross-domain concerns (security, ops, etc.).
B. No council; rely on automated gates. Rejected: automated gates can't catch everything.
C. Full 3-round mode by default. Rejected: ~3× the tokens for marginal additional signal on most phases.

### Consequences

**Positive**:
- Catches issues automated gates miss (run-1 example: A2 council triggered a real remediation cycle).
- Cost is predictable (~6 specialist spawns per phase in quick mode).
- Specialist composition is configurable per phase (default: Dev + QA + Architect, plus contextual adds).

**Negative**:
- Extra ~$2-3 per phase for council spawns.
- Council teammates (when spawned via Agent tool with `team_name`) don't return `<usage>` trailers in the spawn result; their token costs need post-hoc analysis. (Run-1 observed.)

### References

- `templates/council.md`
- `PLAN.md` §Auto-remediation loop
- `RUN1-FEEDBACK.md` Subagent breakdown

---

## ADR-M45-0011 — Spec re-authored every run (no carryforward)

**Status**: accepted (resolved 2026-05-27)
**Date**: 2026-05-27 (ALPHA-SCOPE.md resolved decision #1)

### Context

After run-1 produced a validated A2-spec.md, the question was whether to carry it forward to `m4.5-preflight` to skip authoring on subsequent runs (saving ~$5-10 per run), or to re-author each run.

### Decision

Re-author from scratch each run. No spec carryforward.

### Alternatives considered

A. Carry validated specs forward to preflight. Saves spawn costs but reduces lab purity.
B. Carry forward but mark "from prior run" so re-author can compare. Considered; complexity outweighs benefit.

### Consequences

**Positive**:
- Lab purity preserved; each run starts from clean state.
- Tests whether spec authoring is reproducible across model versions (a real laboratory question).
- Makes runs more directly comparable.

**Negative**:
- ~$5-10 cost per run for re-authoring previously-validated specs.

### References

- `ALPHA-SCOPE.md` Resolved decisions #1

---

## ADR-M45-0012 — `MAX_USD=0` unlimited budget by default

**Status**: accepted
**Date**: 2026-05-27

### Context

The user is running on a Claude Code subscription with a 5-hour usage window. Budget caps inside the runner are operationally simpler if "unlimited" is a real state, so observation runs can produce data without artificial cutoffs.

### Decision

`MAX_USD=0` means **unlimited** (no cap). Spend is still tracked in `STATUS.md.stats.estimated_usd` for visibility, but the budget guard step in the loop is skipped when `MAX_USD == 0`. Positive values enforce a hard cap.

### Alternatives considered

A. Always require a positive cap. Rejected: forces users to predict cost before they've observed it.
B. Default to a conservative cap (e.g. $50). Rejected: still arbitrary for the first observation.
C. Soft cap (warn but don't stop). Rejected per Ops council ("soft caps that warn get ignored at 3am").

### Consequences

**Positive**:
- Observation runs aren't truncated by an arbitrary cap.
- Tracking is unaffected; we always know the actual spend.
- User can tighten on subsequent runs with confidence based on observed cost.

**Negative**:
- A runaway run can consume the full 5h window. User's explicit acceptance: "worst case it consumes my whole 5h window. If that's the case, I'll have a look on what can I do about it."

### References

- `PLAN.md` §Decisions #4
- `BETA-ARCHITECTURE.md` §Configuration

---

## Decisions not formally captured

These are smaller / technical / already documented elsewhere; included as a cross-reference for completeness.

| Decision | Where it lives |
|---|---|
| Fix same-level stair pair validators | `src/level/levelLoader.ts`, `src/editor/EditorApp.ts` (cherry-picked to `main` as `cd8cad5`) |
| Add `@types/node` properly, split test tsconfig | `tsconfig.json`, `tsconfig.test.json`, `package.json` typecheck script |
| `.gitignore` `.worktrees/` + `.claude/scheduled_tasks.lock` | `.gitignore` |
| Drop `-p` from `launch-run.sh` | `scripts/launch-run.sh` |
| PostToolUse hook path is relative (`bash planning/m4.5/hooks/post-tool.sh`) | `.claude/agents/autonomous-runner.md` frontmatter |
| Vitest excludes `.worktrees/**` | `vite.config.ts` test section |
| `run-stats.sh` autodetects latest JSONL transcript | `scripts/run-stats.sh` |
| Tail script for live JSONL monitoring | `scripts/tail-runner.sh` |
| `phase-verify.sh` and `phase-diff.sh` default `REPO_ROOT=$(pwd)` | their scripts |

---

## Forge / cross-project notes

When extracting this work for the forge-* ecosystem or a standalone autonomous-runner tool:

- **ADR-M45-0001, 0002, 0007**: laboratory framing, branch discipline, and the separate-repo decision become the foundational principles of the standalone tool. Bring them along.
- **ADR-M45-0004, 0005, 0008**: bookkeeping mechanization, thin scripts, spec-by-path are concrete patterns for "thin orchestrator + heavy subprocesses." Generalize.
- **ADR-M45-0006, 0009, 0010**: β-specific design decisions; carry over as β is built.
- **ADR-M45-0003, 0011, 0012**: project-instance specifics. The general principle (specs-as-runtime-artifacts, lab purity, observable-but-unlimited budget) generalizes; the exact values may not.

The `MarkdownSchema` skill in forge could validate this file's structure if a schema is authored later.

---

## Status legend

- **proposed**: under discussion
- **accepted**: in effect now
- **changed from v1**: an earlier version of this decision was reversed; this is the current truth
- **superseded by ADR-M45-NNNN**: replaced; see the named ADR
- **deprecated**: no longer applies but kept for historical reference
