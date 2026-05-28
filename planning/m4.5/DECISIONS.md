# M4.5 — Architecture Decision Record

Consolidated decisions made during the M4.5 autonomous-run-system design, run-1, run-2, and the pre-run-3 council review. Each entry follows ADR shape: context, decision, alternatives, consequences. Intended for future maintainers, for the eventual extraction to a standalone autonomous-run tool, and for integration into the forge-* ecosystem.

ADR-M45-0001 through 0012 are the design/run-1 decisions; 0013 through 0023 capture run-2's failure analysis (idle-sleep, resilience), the empirically-corrected harness facts (hook placement, token shape, worktree mechanics), the council's run-3 blockers (gate-sees-uncommitted, deny-by-default sandbox, watchdog hardening), the tiered threat model, the live-A2 launch gate, and the StrongDM Attractor reference.

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

## ADR-M45-0013 — Host must not idle-sleep during a run; keep-awake wrapper

**Status**: accepted
**Date**: 2026-05-28

### Context

Run-2 died at ~92 min when the laptop (on battery, `pmset sleep 1`) idle-slept and severed the in-flight API socket (`socket connection closed unexpectedly`). macOS idle-sleep keys on user (HID) inactivity, not CPU/network, so a busy `claude` process does not prevent it without a power assertion. The process lingered as a zombie for ~9h with no signal. A `pmset -g log` check confirmed the sleep.

### Decision

`launch-run.sh` wraps the run in a keep-awake lock for its whole lifetime: `caffeinate -ims` (macOS), `systemd-inhibit --what=sleep:idle` (Linux), nothing if neither exists (a server that never idle-sleeps). Recommended additionally: run on AC power.

### Alternatives considered

A. Rely on the process being busy. Rejected: idle-sleep ignores process activity.
B. Disable system sleep globally. Rejected: too invasive; scoped keep-awake is cleaner and reverts on exit.

### Consequences

**Positive**: removes the run-2 failure trigger; cross-platform; no-op where unneeded; crash-safe (empty expansion under `set -u`).
**Negative**: does not address other transport drops (general API blips) — that needs the supervisor (ADR-M45-0014).

### References

- `scripts/launch-run.sh`
- `RUN2-FEEDBACK.md` root cause

---

## ADR-M45-0014 — External supervisor: watchdog + configurable resume-then-fresh restart

**Status**: accepted
**Date**: 2026-05-28

### Context

A multi-hour run will hit transient API drops. Run-2 had no recovery: one socket error ended the run, left a zombie, and wrote no terminal signal. The runner cannot resurrect itself.

### Decision

`supervise-run.sh` owns the run lifecycle from outside, in detached tmux (the runner is an interactive ScheduleWakeup loop; headless `-p` would not re-fire the loop). It restarts on crash or hang and stops on a terminal NOTIFY.

- Restart cadence is configurable via `RESUME_RETRIES` (default 1): the first N restarts `claude --resume` the same session (cheap continuity, verified to retain context); subsequent restarts scratch and launch a fresh runner that reconciles from STATUS.md.
- `MAX_RESTARTS` (default 5) caps the loop; on exhaustion the supervisor writes `BLOCKED supervisor-give-up` to NOTIFY (closing run-2's silent-death gap).
- Crash detection is primarily the stale-liveness watchdog, not process exit: an API drop leaves the runner idle-not-exited (run-2's zombie). tmux-session-ended is the secondary signal.

### Alternatives considered

A. In-runner retry. Rejected: the runner can't recover its own dead session.
B. Headless runner. Rejected: the ScheduleWakeup loop needs an interactive REPL.
C. Resume-always or fresh-always. Rejected in favor of a configurable knob (a future UI can set it).

### Consequences

**Positive**: survives transport drops; bounded restarts; terminal signal on give-up; scoped to the run via tmux, not global. Restart cadence verified with a fake-launcher loop test.
**Negative**: tmux dependency; the watchdog must act (kill + restart), so a misconfigured threshold could kill wrongly (see ADR-M45-0020).

### References

- `scripts/supervise-run.sh`
- `scripts/launch-run.sh` (`RUN_SESSION_ID` / `RUN_RESUME` / `--settings`)
- `RUN2-FEEDBACK.md` candidate fixes

---

## ADR-M45-0015 — Token accounting from structured `tool_response`, not a `<usage>` trailer

**Status**: accepted (refines ADR-M45-0004)
**Date**: 2026-05-28

### Context

ADR-M45-0004 left open whether the PostToolUse hook receives token data. Run-2 logged `total_tokens: 0`. A precursor probe (dump the hook's stdin on an Agent spawn) showed the `<usage>total_tokens: N` text trailer the hook regexed for **never existed**. The Agent `tool_response` is a structured dict: `totalTokens`, a full `usage` split (input / cache-read / cache-create / output), `totalToolUseCount`, `totalDurationMs`, `toolStats`. The hook stdin also carries `transcript_path`, `cwd`, `tool_use_id`.

### Decision

The PostToolUse hook reads `tool_response.totalTokens` (and the `usage` split for exact cost) directly from its stdin — no transcript read. It appends a per-subagent record to `LOG/subagent-tokens.jsonl` and updates STATUS. Main-session tokens remain a post-hoc `run-stats.sh` artifact.

### Alternatives considered

A. Regex a text trailer (run-2 design). Rejected: the trailer does not exist.
B. Read the transcript at each subagent boundary. Rejected as unnecessary — the data is live in the hook's stdin.

### Consequences

**Positive**: granular, exact-cost per-subagent accounting from the hook's own input; fixes the run-2 `tokens=0` bug; verified by `--self-test` and a live stdin test.
**Negative**: relies on the structured `tool_response` shape, which is empirically verified but may drift across Claude Code versions — re-verify on upgrade.

### References

- `hooks/post-tool.py`
- `RUN3-PROPOSAL.md` precursor 1

---

## ADR-M45-0016 — Hook placement: frontmatter is parent-only; `--settings` propagates to workers

**Status**: accepted
**Date**: 2026-05-28

### Context

Run-2's worker wrote out-of-scope files despite a PreToolUse sandbox meant to constrain it. A precursor showed why: agent-frontmatter hooks fire only for the runner's own tool calls (run-2's frontmatter PostToolUse never tracked the worker), while hooks loaded via `--settings` (and project settings) **do** propagate to `isolation:"worktree"` subagents. The two co-exist without overriding each other (verified directly).

### Decision

- The worker sandbox (PreToolUse) lives in `runner-settings.json`, loaded via `launch-run.sh --settings`, so it reaches workers and is scoped to the run (not global dev).
- Bookkeeping (PostToolUse) stays in the runner agent frontmatter — it fires for the runner's own Agent calls (where `tool_response.totalTokens` is available) and not inside workers (whose cwd would mis-resolve `STATUS_PATH`).

### Alternatives considered

A. Inject the sandbox into each worktree's `settings.local.json` (run-2 design). Rejected: hooks load from session settings, not the worktree, and a worktree is a separate committed-state checkout that never sees the uncommitted file (ADR-M45-0017).
B. Put the sandbox in project settings. Rejected: too global — the Bash deny-list would block normal `git push` during ordinary dev.

### Consequences

**Positive**: the sandbox actually reaches workers; co-existence with frontmatter bookkeeping verified; run-scoped. The obsolete `settings.local.template.json` was removed.
**Negative**: relies on `--settings` propagation semantics (verified empirically; re-verify on upgrade).

### References

- `runner-settings.json`, `hooks/sandbox.sh`, `scripts/launch-run.sh`
- `RUN3-PROPOSAL.md` precursor 2

---

## ADR-M45-0017 — Integration adapts to Agent-managed worktrees

**Status**: accepted
**Date**: 2026-05-28

### Context

`Agent(isolation:"worktree")` creates a worktree at `.claude/worktrees/agent-<id>` on branch `worktree-agent-<id>` — paths and branch the runner does not choose. The original `integrate-phase.sh` assumed a runner-created `.worktrees/m4.5-A{N}` on branch `m4.5-A{N}`. A probe established the base: the worktree is based on the **run branch HEAD at spawn time** (run-2's apparent "stale base" was the run branch advancing after spawn).

### Decision

- `integrate-phase.sh` takes the discovered branch + path as arguments; the runner reads both from `git worktree list` (loop step 6) and passes them (step 11). The done-tag stays `m4.5-A{N}-done`.
- New runner constraint: **never commit to the run branch between spawn and integrate**, so run-HEAD stays equal to the worktree base and the ff-merge always holds. The divergence guard remains as a backstop.
- `.claude/worktrees/` is gitignored.

### Alternatives considered

A. Have the runner create its own worktree at a known path (drop Agent isolation). Rejected: more invasive; loses the clean `.claude/worktrees/` discriminator the sandbox relies on (ADR-M45-0019).

### Consequences

**Positive**: integration works with Agent-managed worktrees; ff-merge guaranteed by the HEAD-stability constraint. Verified by a functional git test (happy-path ff + divergence refusal).
**Negative**: a runner that violates HEAD-stability gets a refused integration — caught by the guard, but it halts the phase.

### References

- `scripts/integrate-phase.sh`, `.claude/agents/autonomous-runner.md`
- `RUN3-PROPOSAL.md` precursor 3 + section 3.1c

---

## ADR-M45-0018 — The scope/verification gate must see uncommitted worker output

**Status**: accepted
**Date**: 2026-05-28

### Context

A four-specialist council review found the Conform gate inert at runtime. Workers leave changes uncommitted (worker contract); `phase-diff.sh` used `git diff BASE..HEAD` (commit-to-commit), so HEAD still equalled base → `files=0`, `out_of_scope=none`, empty patch → scope, budget, and council all passed on nothing, and a no-op worker would integrate as "done." The earlier "flagged exactly entityTypes.ts" check was a false green: it ran against committed run-2 data, the one path that won't recur live.

### Decision

`phase-diff.sh` stages the worker's output (`git add -A`) and diffs `--cached` against base, capturing modifications and new files. `files=0` now means a no-op worker → the runner remediates and never integrates a zero-diff phase. Scope matching is delegated to `scope-check.py --match` (shared with the sandbox, ADR-M45-0019).

### Alternatives considered

A. Commit in the worktree before diffing. Equivalent; staging is lighter and integrate-phase still commits.
B. Diff the working tree without staging (`git diff BASE`). Rejected: misses new files.

### Consequences

**Positive**: the gate sees real changes; no-op workers caught; verified on an uncommitted worktree (`files=4`, deep + evil flagged) and a no-op worktree (`files=0`).
**Negative**: phase-diff now mutates the worktree index (benign; integrate re-stages).

### References

- `scripts/phase-diff.sh`
- `RUN3-PROPOSAL.md` Council review (blocker 2)

---

## ADR-M45-0019 — Worker sandbox is deny-by-default, discriminated by writer cwd, canonicalized

**Status**: accepted (supersedes the alpha allow-by-default sandbox)
**Date**: 2026-05-28

### Context

The council found the worker sandbox open: it enforced the allowlist only for paths containing `.claude/worktrees/`, so a worker writing an absolute path elsewhere (main repo, its own `scope/ACTIVE` / `sandbox.sh`, `~/.claude`, `~/.zshrc`) hit a default-*allow* branch, with no Write deny backstop. The bash `case` glob also let `*` cross `/`, granting whole subtrees. With the post-hoc gate inert (ADR-M45-0018), this PreToolUse hook was the sole runtime containment — and it was bypassable.

### Decision

`scope-check.py` decides Write/Edit by **writer context** (the session `cwd`): a worker (cwd inside a worktree) may only write paths that canonicalize (`realpath`, resolving `..` and symlinks) INSIDE its worktree AND match a slash-respecting, segment-wise matcher against the committed touch list; everything else is denied. The runner's own writes (cwd in the main repo) pass. `sandbox.sh` delegates to it. `runner-settings.json` adds native Write denies for `~/.ssh` / `~/.claude` / etc. as a backstop. The active phase is read from `scope/ACTIVE` (a file), not an env var (the phase changes per spawn and can't be re-exported into a live session's hooks).

### Alternatives considered

A. Allow-by-default outside worktrees (alpha design). Rejected: the escape above.
B. Tighten the bash command deny-list as the containment. Rejected: a denylist can't contain an adversarial shell (ADR-M45-0021).

### Consequences

**Positive**: closes the write escape and the glob-leak in one change; matcher shared with phase-diff; verified live (in-scope allowed; deep-out-of-scope, outside-worktree, and `..`-escape all blocked) plus `--self-test`.
**Negative**: a worktree subdir cwd must resolve to the worktree root; relies on the hook receiving `cwd` (verified).

### References

- `hooks/scope-check.py`, `hooks/sandbox.sh`, `runner-settings.json`
- `RUN3-PROPOSAL.md` Council review (blocker 1)

---

## ADR-M45-0020 — Watchdog scoped to the active worktree; orphan GC; resume quarantine

**Status**: accepted
**Date**: 2026-05-28

### Context

The supervisor's composite-liveness signal scanned all of `.claude/worktrees`, so a leaked worktree's stale mtimes kept the liveness clock falsely fresh and could mask a real hang. Watchdog kills also orphaned worktrees/branches (reconcile only `prune`s), leaking disk and corrupting the next liveness window; and the resume path tolerated a dirty tree, which could silently integrate worker-planted main-tree files.

### Decision

- The watchdog scopes liveness to the active worktree only — the runner writes its path to `scope/ACTIVE_WORKTREE`; the supervisor reads it.
- `gc_worktrees` reclaims orphan agent worktrees + branches before each (re)launch (no runner active then).
- `quarantine_main_tree` stashes unexpected main-tree changes (anything outside `planning/m4.5/`) on resume instead of integrating them. Relies on `planning/m4.5/` being tracked so untracked files inside show with full paths (avoids `-uall`, which the repo bans).

### Alternatives considered

A. Scan all worktrees (original). Rejected: false liveness.
B. Identify the active worktree by newest ctime. Rejected: fragile; the explicit pointer file is unambiguous.

### Consequences

**Positive**: trustworthy liveness; bounded disk; planted files don't silently integrate. Verified by a functional git test.
**Negative**: depends on the runner maintaining `scope/ACTIVE_WORKTREE`; a long quiet worker operation (build/test, council) can still approach `STALE_SECONDS` — tune the threshold.

### References

- `scripts/supervise-run.sh`, `.claude/agents/autonomous-runner.md`
- `RUN3-PROPOSAL.md` Council review (blocker 3)

---

## ADR-M45-0021 — Threat model: tiered containment; a denylist can't contain an adversarial LLM

**Status**: accepted
**Date**: 2026-05-28

### Context

The run launches under `--dangerously-skip-permissions`; the sandbox is the only worker-level enforcement. Security raised that a Bash denylist (exfil via python/cp/curl, `git -C . push`, env indirection) is unwinnable against an adversarial LLM with full shell.

### Decision

Tier the containment to the use case:

- **Own repo, throwaway branch, cooperative sealed-spec workers (run-3 now):** deny-by-default writes (ADR-M45-0019) is the real boundary; the command deny-list is defense-in-depth; recommended hardening is OS-level network-egress block + read-only `$HOME` / `~/.claude` / `~/.ssh`.
- **Generalized / untrusted-input goal (post-β):** OS isolation — container + seccomp + network policy — and drop `--dangerously-skip-permissions` for an explicit allowlist.

### Alternatives considered

A. Treat regex hardening as the containment. Rejected: false confidence.
B. Require full OS isolation before run-3. Rejected: disproportionate for the user's own throwaway-branch run.

### Consequences

**Positive**: honest about what the sandbox does and doesn't guarantee; a cheap bar now, a clear bar later.
**Negative**: the cheap bar relies on workers being cooperative (sealed specs, not adversarial prompts) — true today, not for the generalized goal.

### References

- `hooks/sandbox.sh`, `SAFETY-HATCHES.md`
- `RUN3-PROPOSAL.md` Council review (disagreement resolution)

---

## ADR-M45-0022 — Pre-launch gate: one attended live A2 dry run

**Status**: accepted
**Date**: 2026-05-28

### Context

Every run-3 fix was proven on offline proxies (self-tests, fake launchers, child-session hook tests). The full live chain — real runner → worker → sandbox → diff → council → integrate — has never executed once, and the empty-diff false green showed offline proxies can mislead.

### Decision

Before any unattended run-3, run one **attended A2-only dry run** that must show all five: (1) uncommitted worker → `files>0`; (2) a deep out-of-scope / outside-worktree write blocked by the sandbox AND flagged by phase-diff; (3) clean path `out_of_scope=none`, integrate produces a non-empty diff + `m4.5-A2-done`; (4) heartbeat + `subagent-tokens.jsonl` advance (both hooks fire); (5) no spurious watchdog kill during a normal-length council. All green → proceed unattended.

### Alternatives considered

A. Launch unattended on the strength of offline tests. Rejected: the live integration is the one untested surface, and a wasted multi-hour run is expensive.

### Consequences

**Positive**: cheap insurance (one phase) against a wasted run; validates the live integration once.
**Negative**: requires an attended session for the gate.

### References

- `RUN3-PROPOSAL.md` Acceptance criteria + Council review (QA's gate)

---

## ADR-M45-0023 — StrongDM Attractor as the post-β architecture reference

**Status**: proposed
**Date**: 2026-05-28

### Context

StrongDM's Attractor is a non-interactive coding-agent spec: a run is a directed graph (Graphviz DOT), nodes are work phases with prompts, edges are NL-evaluated transitions, with an Interviewer abstraction for any human frontend. It is the same problem space as this orchestrator, more mature on workflow modeling.

### Decision

Adopt Attractor's **patterns** (not a dependency) as the reference for the post-β orchestrator: a declarative graph pipeline (vs. the current imperative loop), and the Interviewer seam (orchestrator headless, frontend pluggable — aligns with the β GUI). Model/agent-agnostic by design. Not now; a β→post-β direction.

### Alternatives considered

A. Adopt Attractor's spec/implementation directly. Premature; it is a spec, not a drop-in library (a third-party TS implementation exists).
B. Ignore it. Rejected: it validates the spec-as-design bet and offers a stronger workflow model.

### Consequences

**Positive**: a proven external reference for the graph + Interviewer model; possible fidelity measurement via attractorbench.
**Negative**: integration is real work, not `npm install`; revisit when β stabilizes.

### References

- github.com/strongdm/attractor
- `RUN3-PROPOSAL.md` (StrongDM note), `BETA-ARCHITECTURE.md`

---

## Decisions not formally captured

These are smaller / technical / already documented elsewhere; included as a cross-reference for completeness.

| Decision | Where it lives |
|---|---|
| Fix same-level stair pair validators | `src/level/levelLoader.ts`, `src/editor/EditorApp.ts` (cherry-picked to `main` as `cd8cad5`) |
| Add `@types/node` properly, split test tsconfig | `tsconfig.json`, `tsconfig.test.json`, `package.json` typecheck script |
| `.gitignore` `.worktrees/`, `.claude/worktrees/`, `.claude/scheduled_tasks.lock`, `scope/ACTIVE`, `scope/ACTIVE_WORKTREE` | `.gitignore` |
| `launch-run.sh` adopts the current branch by default (no stale `RUN_BRANCH`) | `scripts/launch-run.sh` |
| PostToolUse hook path is relative (`bash planning/m4.5/hooks/post-tool.sh`) | `.claude/agents/autonomous-runner.md` frontmatter |
| Vitest excludes `.worktrees/**` and `.claude/worktrees/**` | `vite.config.ts` test section |
| `run-stats.sh` autodetects latest JSONL transcript; takes an explicit path arg | `scripts/run-stats.sh` |
| Tail script for live JSONL monitoring | `scripts/tail-runner.sh` |
| `phase-verify.sh` / `phase-diff.sh` default `REPO_ROOT=$(pwd)` | their scripts |
| run-2 worker outputs preserved as tags `run-1-A2-wip`, `run-1-A4-wip`, `run-2-A2-wip` | git tags |

---

## Forge / cross-project notes

When extracting this work for the forge-* ecosystem or a standalone autonomous-runner tool:

- **ADR-M45-0001, 0002, 0007**: laboratory framing, branch discipline, and the separate-repo decision become the foundational principles of the standalone tool. Bring them along.
- **ADR-M45-0004, 0005, 0008, 0015**: bookkeeping mechanization, thin scripts, spec-by-path, and token-from-`tool_response` are concrete patterns for "thin orchestrator + heavy subprocesses." Generalize.
- **ADR-M45-0006, 0009, 0010, 0023**: β-specific design decisions and the Attractor reference; carry over as β is built.
- **ADR-M45-0013, 0014, 0020**: resilience — keep-awake, external supervisor, scoped watchdog with GC/quarantine — are the operational backbone of any unattended run; generalize directly.
- **ADR-M45-0016, 0017, 0018, 0019**: the empirically-corrected harness facts (hook placement, Agent-worktree mechanics, gate-sees-uncommitted, deny-by-default sandbox). These are Claude-Code-specific; re-verify against the harness version when extracting, but the *principles* (verify harness behavior; deny-by-default; gate the real flow) carry over.
- **ADR-M45-0021, 0022**: the tiered threat model and the live-gate discipline generalize as launch-readiness policy.
- **ADR-M45-0003, 0011, 0012**: project-instance specifics. The general principle (specs-as-runtime-artifacts, lab purity, observable-but-unlimited budget) generalizes; the exact values may not.

The `MarkdownSchema` skill in forge could validate this file's structure if a schema is authored later.

---

## Status legend

- **proposed**: under discussion
- **accepted**: in effect now
- **changed from v1**: an earlier version of this decision was reversed; this is the current truth
- **superseded by ADR-M45-NNNN**: replaced; see the named ADR
- **deprecated**: no longer applies but kept for historical reference
