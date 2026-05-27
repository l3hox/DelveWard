# Beta architecture spec: production-ready autonomous-run system

**Status**: draft, subject to review.

## Vision

An autonomous-run system suitable for production use: cheap per run, observable through a live GUI, resumable after crashes, testable in isolation, generalizable across projects beyond M4.5/DelveWard.

The system orchestrates **multi-phase planned refactors** end to end. M4.5 is its first end-to-end test workload, not its specification. The architecture must accommodate other workloads with the same shape (a plan with dependent phases, each phase = spec + worker + verify + review + integrate).

## Goals

1. **Cost discipline.** Per-step Claude invocations with bounded context. No long-lived LLM session accumulating state in prose. Estimated 5-10× reduction in runner-side tokens vs the agent-based architecture.
2. **First-class observability.** Every state transition emits a structured event. A live GUI consumes the event stream; CLI and logs derive from the same source. No "is the runner alive?" guessing.
3. **Resumability.** State persists to disk via event sourcing. The orchestrator can crash and restart from the last consistent state with no LLM re-reasoning required.
4. **Testability.** Orchestrator logic (state machine, dispatching, retry) is plain code with no LLM in the test path. The LLM is mocked at step boundaries.
5. **Generalization.** The architecture is parameterized; M4.5 is a workload, not a hardcoded special case. Extraction to a standalone tool is a config swap.

## Non-goals

- Multi-machine distribution. Single-host orchestrator is fine.
- High-availability (HA) orchestrator. A crash + manual restart from on-disk state is acceptable.
- Authentication / authorization. Localhost only.
- Replacing Claude Code as the editor / interactive shell. The orchestrator is a separate process; the user still uses Claude Code for hands-on work.
- A real workflow engine like Temporal or Airflow. Too heavy for this scale; we want ~500-1000 lines of code, not 50K.

## Component model

```
+--------------------------------------------------------------------+
|                       ORCHESTRATOR (python)                       |
|                                                                    |
|  +-- state machine: per-phase phase tracker                       |
|  +-- step dispatcher: spawns claude -p / shell subprocesses       |
|  +-- event bus: append-only events.jsonl (write-ahead log)        |
|  +-- state projector: STATUS.json derived from events             |
|  +-- HTTP server: /status, /events (SSE), /control                |
+----+---------------------+---------------------+-------------------+
     |                     |                     |
     v                     v                     v
  claude -p              shell scripts        claude -p
  (LLM steps)            (deterministic)      (LLM decisions)
     |                     |                     |
   structured            exit codes +         structured
   JSON return           log files            JSON return

+--------------------------------------------------------------------+
|                              GUI                                   |
|                                                                    |
|  - long-poll /events (SSE) for live updates                       |
|  - render phase grid + step timeline + log tail                   |
|  - controls: pause / resume / kill / retry phase / inspect logs   |
|  - implementation flexible: web (React/Vue/Svelte) or TUI         |
+--------------------------------------------------------------------+
```

### The orchestrator

A single Python process. Stays alive for the duration of a run. Responsibilities:

- Own the state machine: phase pending → in_progress → done | stalled | blocked.
- Dispatch steps: spawn subprocesses, capture stdout/stderr, parse structured return.
- Emit events: every state transition writes one line to `events.jsonl`.
- Maintain the derived projection `STATUS.json`: a compact view of the current state, rebuilt from events on demand or after each event.
- Serve HTTP: `/status`, `/events` (server-sent events), `/control` (pause/resume/kill).
- Persist enough state to be resumable from disk after a crash.

Why Python: subprocess management, JSON, asyncio, HTTP servers, type hints, easy tests. No third-party deps beyond stdlib (or one of {fastapi, starlette} if we want SSE done right).

### Steps

Two flavors:

- **LLM step**: a `claude -p` subprocess invoked with a focused prompt. Returns a structured JSON object on stdout (or fails). Examples: spec_author, spec_review, worker, council_member, council_decide, remediation_worker.
- **Shell step**: a deterministic script. Returns exit code + structured stdout. Examples: phase-verify, phase-diff, integrate-phase, a6-gate.

Each step is **atomic** and **stateless**. It receives its inputs as CLI arguments / env / files. It produces a return. The orchestrator persists the return as an event. The step itself does not maintain state across invocations.

### The event bus

`planning/m4.5/events.jsonl`. Append-only. Each line is one event in canonical JSON:

```json
{"ts": "2026-05-27T12:34:56.789Z", "type": "phase_started", "phase": "A2", "data": {...}}
```

Event types (initial set):

| Event | Emitted when |
|---|---|
| `run_started` | Orchestrator boots, validates pre-flight |
| `run_ended` | All phases done/skipped/blocked; orchestrator exits |
| `phase_started` | Phase begins (pending → in_progress) |
| `phase_ended` | Phase concludes (success/skip/stall/block) |
| `step_started` | A step subprocess is dispatched |
| `step_ended` | Step subprocess returns successfully |
| `step_failed` | Step subprocess returns non-zero or invalid output |
| `subagent_spawned` | An LLM step spawned (subprocess created) |
| `subagent_returned` | An LLM step completed, includes tokens parsed from return |
| `spec_authored` | A spec file was written and is awaiting review |
| `spec_sealed` | A spec passed review and was sealed |
| `verify_passed` | phase-verify.sh returned all green |
| `verify_failed` | phase-verify.sh returned at least one red |
| `council_finding` | One specialist's finding (critical/high/medium/low) |
| `council_decided` | The council-decide step returned its action (remediate/integrate/skip) |
| `remediation_started` | A remediation cycle begins |
| `remediation_attempt` | One attempt within a cycle |
| `remediation_succeeded` | Cycle resolved findings |
| `remediation_stalled` | No-progress detector tripped |
| `phase_blocked` | Phase cannot proceed (dep stall, sandbox failure, etc.) |
| `phase_integrated` | integrate-phase.sh succeeded |
| `budget_threshold_crossed` | Spend hit `MAX_USD` (if set) |
| `heartbeat` | Periodic liveness signal (orchestrator-driven, every N seconds) |

Schema validated at write time (pydantic model or jsonschema). Events are immutable once written. STATUS.json is a derived projection: replay the events from `run_started` to compute the current state.

### State machine (per phase)

```
pending
   -> spec_authoring (LLM step: spec-author.md)
        -> spec_authored
        -> spec_review (LLM step: ArchitectReviewer)
             -> spec_sealed
             -> [touch list rendered, deterministic]
                  -> worker_running (LLM step: Worker)
                       -> worker_returned
                       -> diff_computed (shell: phase-diff.sh)
                            -> verifying (shell: phase-verify.sh)
                                 -> verified | verify_failed
                                      -> council_running (LLM step: multiple specialists)
                                           -> council_decided
                                                -> remediating | integrating | stalled
                                                     -> remediation_running -> verifying (loop)
                                                     -> integrate_running (shell: integrate-phase.sh)
                                                          -> done
```

Each arrow is one event. The state machine is implemented as an explicit transition table in code, not as prose-following.

### Step contracts

Every step has a contract: inputs (CLI args + env + working files), structured return (JSON on stdout for LLM steps, exit code + parseable stdout for shell), side effects (files written, branches modified), and failure modes.

Documented per-step in `planning/m4.5/STEPS.md` (or split into one file per step). The orchestrator validates returns against the contract before recording events.

Examples:

**spec_author** (LLM):
- Input: `--phase A2 --plan-path PLAN.md --debt-item "core/ purity"`
- Return: `{"spec_path": "planning/m4.5/A2-spec.md", "lines": 325, "tokens_used": 100798, "errors": []}`
- Side effect: writes the spec file.
- Failure: non-zero exit, parse error, or `errors` non-empty.

**phase_verify** (shell):
- Input: `phase-verify.sh A2 .worktrees/m4.5-A2`
- Return on stdout: `VERIFY phase=A2 vitest=green tsc=green build=green smoke=green goldens=green log=...`
- Exit code: 0 = all green, 1 = any failure.
- Side effect: writes `LOG/A2-verify.log` with full details.

**council_decide** (LLM):
- Input: findings JSON from the council members, the active spec.
- Return: `{"decision": "remediate"|"integrate"|"skip", "rationale": "..."}`.
- Stateless: the orchestrator handles attempt counters and no-progress detection.

The orchestrator never embeds business logic in step prompts. Steps do their job; the orchestrator decides what step comes next.

### GUI integration

Two paths, in order of effort:

**Phase 1 (minimal)**: GUI reads `events.jsonl` directly via filesystem watch (or `tail -F`). Renders STATUS.json (also on disk) periodically. No HTTP server needed. Works for local-only operation.

**Phase 2 (richer)**: orchestrator exposes HTTP endpoints:
- `GET /status` → current STATUS.json
- `GET /events` → SSE stream of events.jsonl tail
- `POST /control/pause` → orchestrator pauses dispatching new steps
- `POST /control/resume` → resumes
- `POST /control/kill` → graceful shutdown
- `POST /control/retry?phase=A2` → re-runs a phase (after manual intervention)

The GUI itself: separate concern, not in this spec. A web app talking to `/status` + `/events` is straightforward. A TUI (textual / blessed / etc.) is also viable.

### Failure modes and resumption

**Step subprocess crash / non-zero exit**: orchestrator records `step_failed`, transitions to `verify_failed` or equivalent. If retry policy applies, dispatches a remediation step. Otherwise marks the phase stalled.

**Orchestrator crash mid-step**: on restart, orchestrator reads events.jsonl up to the last consistent state. If a step was dispatched but no return was recorded, the step is **re-dispatched** (idempotency on the step side is required: e.g., `phase-verify.sh` can run multiple times; `integrate-phase.sh` checks for an existing tag before re-tagging).

**Step idempotency requirements**:
- `phase-verify.sh`: always idempotent (read-only on the worktree, log file overwritten).
- `phase-diff.sh`: always idempotent.
- `integrate-phase.sh`: must check for existing tag and skip if present.
- LLM steps (spec_author, worker, council): re-dispatch produces a new attempt; previous attempt's output is preserved.
- `spec_seal`: check for existing sealed trailer before appending.

**Budget exceeded**: orchestrator emits `budget_threshold_crossed`, pauses dispatching new steps, awaits manual `/control/resume` (with raised cap) or shutdown.

**Stalled phase**: emits `phase_stalled`, marks transitively-dependent phases blocked, continues with the next viable phase. Revisits stalled phases at end of run (fresh worker, accumulated findings).

### Configuration

The orchestrator reads its config from one file: `planning/m4.5/run-config.yaml` (or similar).

```yaml
run_branch: m4.5-run-2
base_branch: m4.5-preflight
plan_path: planning/m4.5/PLAN.md
status_path: planning/m4.5/STATUS.json
events_path: planning/m4.5/events.jsonl
log_dir: planning/m4.5/LOG/
max_usd: 0                   # 0 = unlimited
usd_per_mtoken: 8            # estimate rate for events
council_depth: quick
http_server:
    enabled: true
    port: 8765
phases:
    A2:
        title: "Invert core/ -> enemies/, npcs/ deps"
        worker_agent: RefactoringSpecialist
        depends_on: []
    A4:
        title: "Split gameState.ts behind GameState facade"
        worker_agent: RefactoringSpecialist
        depends_on: [A2]
    ...
```

The phase list is the same shape as today's STATUS.md but lives in a config file the orchestrator reads at startup. STATUS.json is the runtime state; this is the static definition.

### Generalization stance

Everything DelveWard-specific lives in the config file or in the scripts (which can be project-overrides):

- `phases` list and worker agents → config
- File paths for `plan`, `status`, `events` → config
- Verification gates (`vitest`, `tsc`, `vite build`, `smoke`, `goldens`) → `phase-verify.sh` is project-supplied
- Spec template, worker template, etc. → `templates/*` are project-supplied
- Hook script (`hooks/sandbox.sh`) → project-supplied

The orchestrator itself is project-agnostic. Moving to another project means: new config file + new templates + new verification script. No orchestrator code changes.

When the time comes, the orchestrator extracts into its own repo (e.g., `autonomous-runner-tool`); DelveWard becomes a consumer.

## Migration from alpha

Alpha produces concrete data on:

- Whether PostToolUse hook input includes `<usage>` (informs the event extraction in β).
- Whether the thin scripts (`phase-verify.sh`, `phase-diff.sh`) are correctly shaped (they carry over as-is to β — the orchestrator just calls them).
- Whether slimming the runner prompt makes the agent-based architecture viable for production (likely no, but the experiment is cheap and informative).

Migration steps once β is greenlit:

1. Author the orchestrator (Python, ~500-1000 lines). One sprint, ~3-5 sessions.
2. Define the step contracts in `STEPS.md`. Most steps reuse alpha's scripts and templates.
3. Define events.jsonl schema.
4. Write the state machine and dispatcher.
5. Add the HTTP server.
6. Build the GUI (separate workstream; may proceed in parallel after the event schema is locked).
7. Migrate one phase at a time: orchestrator can run alongside the agent runner for comparison.
8. Once β passes a full run, retire the autonomous-runner agent. The agent file stays in the repo as documentation of the old approach.

## Open questions for review

1. **Python or another language?** Python is the safest default (subprocess, JSON, asyncio, ecosystem). Go and Rust are alternatives if compiled deployment matters. Recommendation: Python.
2. **Event schema versioning.** Should events carry a `schema_version`? Probably yes — cheap insurance.
3. **GUI technology.** Web (React/Vue/Svelte) vs TUI (textual) vs both. Web is more flexible for production; TUI is dev-friendly. Recommendation: defer; lock the event schema first.
4. **Concurrent phases.** Should the orchestrator run independent phases (e.g., A2 and A4 if their deps were both satisfied) in parallel? Cheap to add via asyncio. Recommendation: support it, default to off.
5. **External integrations.** Slack notifications? Pull-request integrations? Out of scope for v1; design hooks (`run_started`, `phase_stalled`, etc.) so integrations are listeners on the event bus.
6. **State machine description format.** Hardcoded in Python (clearest), or a YAML/JSON state-table the orchestrator interprets (more configurable, less type-safe)? Recommendation: hardcoded for v1; abstract later if a second workload needs different states.
7. **Budget enforcement granularity.** Per-step soft caps in addition to a global hard cap? Useful for catching runaway specs. Recommendation: yes, optional per-step cap in the config.
8. **Run-branch naming.** Today `m4.5-run-N`. For β, parameterize: `<workload>-run-N` where `workload` is from config. Recommendation: yes.
9. **Should the orchestrator be a Claude Code agent itself?** Tempting (gives us Read/Edit/Bash/Agent for free). But the whole point is to remove the LLM from the orchestration loop. Recommendation: no. Pure Python.
10. **How does the GUI authenticate?** Localhost only for v1, no auth. For later production deployment, OIDC or similar. Out of scope for v1.

## Sketch of the orchestrator's main loop (Python pseudocode)

```python
class Orchestrator:
    def __init__(self, config_path):
        self.cfg = load_config(config_path)
        self.events = EventBus(self.cfg.events_path)
        self.state = StateProjector(self.events)
        self.http = HttpServer(self) if self.cfg.http_server.enabled else None

    def run(self):
        self.events.emit("run_started", {})
        while not self._all_phases_terminal():
            phase = self._next_viable_phase()
            if not phase:
                break  # waiting on stalled phases or budget
            try:
                self._run_phase(phase)
            except StepFailure as e:
                self._handle_step_failure(phase, e)
        self.events.emit("run_ended", {})

    def _run_phase(self, phase):
        self.events.emit("phase_started", {"phase": phase.id})
        if not phase.spec_sealed:
            self._dispatch_step("spec_author", phase=phase)
            self._dispatch_step("spec_review", phase=phase)
            phase.seal()
        worker_return = self._dispatch_step("worker", phase=phase)
        diff = self._dispatch_step("phase_diff", phase=phase)
        verify = self._dispatch_step("phase_verify", phase=phase)
        findings = self._dispatch_step("council", phase=phase)
        decision = self._dispatch_step("council_decide", phase=phase, findings=findings)
        if decision.action == "remediate":
            self._remediation_loop(phase, findings)
        elif decision.action == "integrate":
            self._dispatch_step("integrate_phase", phase=phase)
            self.events.emit("phase_integrated", {"phase": phase.id})
        else:
            self._mark_skipped(phase, decision.rationale)
        self.events.emit("phase_ended", {"phase": phase.id, "status": phase.status})

    def _dispatch_step(self, step_name, **kwargs):
        self.events.emit("step_started", {"step": step_name, **kwargs})
        proc = self._spawn(step_name, **kwargs)
        result = self._await_and_parse(proc)
        if result.failed:
            self.events.emit("step_failed", ...)
            raise StepFailure(...)
        self.events.emit("step_ended", {"step": step_name, "return": result.data})
        return result.data
```

The loop is ~50-100 lines in real code. The bulk of complexity is in the step dispatchers, the state projector, and the HTTP server.

## Cost projection vs current architecture

Estimates for a full M4.5 run (A2 + A4 + A3 + A5 + A7, A6 conditional):

| Item | Current (run-1 shape) | β (projected) | Notes |
|---|---:|---:|---:|
| Orchestrator | $22 (47M tokens) | ~$0 | Python process, no LLM |
| Per-step LLM calls | $6 (745K tokens, subagents) | $8-12 | More steps but each bounded |
| Hidden council costs | $2-3 (not captured) | $0 | Council members emit events with token usage |
| **Total** | **~$30** | **~$10-15** | 2-3× cost reduction |

Plus reliability and observability gains that don't show up in dollars.

## Effort estimate

| Workstream | Sessions |
|---|---:|
| Orchestrator core (state machine + dispatcher + event bus) | 2-3 |
| Step contracts + scripts | 1 |
| HTTP server + event projection | 1 |
| GUI (separate, parallelizable) | 2-3 |
| End-to-end test on M4.5 workload | 1-2 |
| Migration / cleanup | 1 |
| **Total** | **~8-12 focused sessions** |

vs alpha which is 1-2 sessions for a narrower fix.

## What β explicitly throws away from the current architecture

- The `autonomous-runner` agent prompt. Becomes documentation only.
- The runner-side STATUS.md write logic (PostToolUse hook from α may carry over for transitional use).
- The runner's inline loop control (replaced by Python state machine).
- The runner's "decide remediation vs integrate" judgment (replaced by a small `council_decide` step with bounded context).

What β keeps:

- The fixture, the goldens, the smoke driver.
- The hooks/sandbox.sh PreToolUse worker sandboxing — workers still need it.
- The settings.local.template.json deny-list — same reason.
- The spec / worker / council / remediation prompt templates (they become per-step prompts, possibly with light edits).
- The phase ordering, the worker selection table, the A6 gate logic.

## Closing

The current architecture is a research prototype that taught us what production needs. Beta replaces it with the simplest production-shaped system that meets the goals: a Python orchestrator with explicit state, an event bus, and per-step subprocesses. It removes the LLM from the loop where deterministic logic suffices, keeps the LLM where judgment is required, and makes everything observable and testable.

The user's GUI is a first-class consumer of the event bus, not an afterthought.
