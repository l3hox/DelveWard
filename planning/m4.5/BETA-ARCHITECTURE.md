# Beta architecture spec: production-ready autonomous-run system

**Status**: v2, draft.

## Vision

An autonomous-run system suitable for production use: cheap per run, observable through a live GUI, resumable after crashes, testable in isolation, generalizable across projects beyond M4.5/DelveWard.

The system orchestrates multi-phase planned refactors end to end. M4.5 is its first end-to-end test workload, not its specification. The architecture accommodates other workloads with the same shape: a plan with dependent phases, each phase = spec + worker + verify + review + integrate.

## Goals

1. **Cost discipline.** Per-step Claude invocations with bounded context. No long-lived LLM session accumulating state in prose. Estimated 5-10× reduction in main-process tokens vs the agent-based architecture.
2. **First-class observability.** Every state transition emits a structured event. A live GUI consumes the event stream; CLI and logs derive from the same source. No "is the runner alive?" guessing.
3. **Resumability.** State persists to disk via atomic `STATUS.json` writes plus an append-only audit log. The orchestrator can crash and restart from the last consistent state with no LLM re-reasoning required.
4. **Testability.** Orchestrator logic (state machine, dispatching, retry) is plain Python with no LLM in the test path. LLM steps are mocked at subprocess boundary.
5. **Generalization within shape.** The architecture is parameterized for workloads that match the "phases with spec / worker / verify / review / integrate" shape. M4.5 is the first; future workloads with the same shape are config-only. Workloads with a different shape (e.g., no council, or two workers per phase) require code changes.

## Non-goals

- Multi-machine distribution. Single-host orchestrator is fine.
- High-availability (HA). A crash + manual restart from on-disk state is acceptable.
- Authentication beyond a localhost loopback token. See §Security for the explicit boundary.
- Replacing Claude Code as the editor / interactive shell.
- A real workflow engine like Temporal or Airflow. The target is ~1500-2500 lines of code.

## Component model

```
+--------------------------------------------------------------------+
|                       ORCHESTRATOR (python)                       |
|                                                                    |
|  +-- state machine: per-phase phase tracker                       |
|  +-- STATUS.json (source of truth, atomic write)                  |
|  +-- events.jsonl (append-only audit log)                         |
|  +-- step dispatcher: spawns claude -p / shell subprocesses       |
|  +-- LLM return parser: strip fences, validate, retry             |
|  +-- HTTP server: /status, /events (SSE), /control                |
|  +-- orchestrator.log (stdlib logging — runtime diagnostics)      |
+----+---------------------+---------------------+-------------------+
     |                     |                     |
     v                     v                     v
  claude -p              shell scripts        claude -p
  (LLM steps)            (deterministic)      (LLM decisions)
     |                     |                     |
   structured            exit codes +         structured
   JSON return           sidecar state        JSON return

+--------------------------------------------------------------------+
|                              GUI                                   |
|                                                                    |
|  - SSE /events with bearer-token (loopback only)                  |
|  - render phase grid + step timeline + log tail                   |
|  - controls: pause / resume / kill / retry phase / inspect logs   |
+--------------------------------------------------------------------+
```

### The orchestrator

A single Python process. Stays alive for the duration of a run. Responsibilities:

- Own the state machine: phase pending → in_progress → done | stalled | blocked.
- Dispatch steps: spawn subprocesses with explicit env allowlists, capture stdout/stderr, parse structured returns.
- Maintain `STATUS.json` as the source of truth via atomic writes (`.tmp` + rename).
- Append every state transition to `events.jsonl` for observability and post-hoc analysis.
- Write Python runtime diagnostics to `orchestrator.log` (separate from event domain log).
- Serve HTTP: `/status`, `/events` (server-sent events), `/control` (pause/resume/kill/retry).
- Persist enough state to be resumable from disk after a crash.

Why Python: subprocess management, JSON, asyncio, HTTP servers, type hints, easy tests. Dependencies kept minimal: `pydantic` for schemas, `fastapi` or stdlib `http.server` for SSE.

### Steps

Two flavors:

- **LLM step**: a `claude -p` subprocess. Returns structured JSON on stdout. Permission mode is a per-step contract field (default: deny / no bypass). Subject to the LLM return parser before validation.
- **Shell step**: a deterministic script. Returns exit code + structured stdout. Examples: phase-verify, phase-diff, integrate-phase, a6-gate.

Each step is atomic, stateless, and idempotent. It receives inputs as CLI args / env / files (no shared memory with the orchestrator). It produces a return. The orchestrator records the result in `STATUS.json` and appends an event.

## State model

**`STATUS.json` is the source of truth.** Written atomically (`.tmp` + rename) on every state transition. Crash recovery reads `STATUS.json` directly — no event replay required.

**`events.jsonl` is an append-only audit log.** Captures the same transitions for observability (SSE stream, post-hoc analysis, GUI replay). Never read by the orchestrator on the hot path. If `events.jsonl` and `STATUS.json` diverge, `STATUS.json` wins; the divergence is logged for diagnosis but does not block the run.

This is deliberately **not event sourcing**. The schema-versioning, replay-consistency, and projection-vs-state-drift problems are not worth their cost at 5-50 phases. Atomic `STATUS.json` writes are simple, fast, and crash-safe.

### `STATUS.json` shape

```yaml
schema_version: 1
run_branch: m4.5-run-2
base_branch: m4.5-preflight
started_at: 2026-05-28T08:30:00Z
last_heartbeat_at: 2026-05-28T08:30:15Z
config_path: planning/m4.5/run-config.yaml
http_port: 49213                # OS-assigned; written to STATUS.json
http_token: <64 chars hex>       # required for /control/* (see §Security)
loopback_only: true
budget:
    max_usd: 0                   # 0 = unlimited
    estimated_usd: 0.00
    per_step_caps:               # optional hard caps; subprocess killed on hit
        spec_author: 5.00
        worker: 10.00
        council_member: 2.00
phases:
    A1: { status: done, finished_at: ... }
    A2:
        status: in_progress
        title: "Invert core/ -> enemies/, npcs/ deps"
        depends_on: []
        worker_agent: RefactoringSpecialist
        current_step: worker_running
        attempts: 1
        cross_phase_findings_in: []    # see §Cross-phase memory
        spec:
            path: planning/m4.5/A2-spec.md
            sealed: true
            sealed_at: 2026-05-28T08:35:00Z
        worker:
            worktree: .worktrees/m4.5-A2
            pid: 12345
            started_at: 2026-05-28T08:42:00Z
            attempt_dir: .worktrees/m4.5-A2.attempts/1
    A3: { status: pending, depends_on: [A4] }
    ...
stats:
    agents_spawned: 6
    total_tokens: 482140
    estimated_usd: 3.86
    by_role:
        spec_author:       { spawned: 2, tokens: 61400 }
        spec_review:       { spawned: 2, tokens: 28800 }
        phase_worker:      { spawned: 2, tokens: 184500 }
        phase_remediation: { spawned: 1, tokens: 72300 }
        council:           { spawned: 10, tokens: 135140 }
```

### `events.jsonl` shape

One JSON object per line. Schema validated at write time against `events.schema.json` (published artifact, see §Schema artifacts). Append-only, never rewritten. Carries `schema_version` from line 1.

Events go through the redaction filter before write (see §Security — credential redaction).

Event types:

| Event | Emitted when |
|---|---|
| `run_started` | Orchestrator boots, validates pre-flight |
| `run_ended` | All phases terminal; orchestrator exits |
| `heartbeat` | Every 15s while alive; GUI flags absence as "wedged" |
| `phase_started` | pending → in_progress |
| `phase_ended` | Phase concludes (done/skipped/stalled/blocked) |
| `step_started` | A step subprocess is dispatched |
| `step_ended` | Step subprocess returned successfully (with parsed result) |
| `step_failed` | Step subprocess failed (with raw stdout/stderr paths) |
| `subagent_spawned` | An LLM step subprocess created |
| `subagent_returned` | LLM step completed; includes tokens parsed from `<usage>` |
| `spec_authored` | Spec file written, awaiting review |
| `spec_sealed` | Spec passed review |
| `verify_passed` / `verify_failed` | phase-verify.sh emitted one-line result |
| `council_finding` | One specialist finding (with normalized schema, see §Council findings) |
| `council_decided` | council_decide step returned action (remediate/integrate/skip) |
| `remediation_attempt_started` / `_succeeded` / `_stalled` | Remediation cycle events |
| `phase_blocked` | Phase cannot proceed (dep stall, sandbox failure, etc.) |
| `phase_integrated` | integrate-phase.sh succeeded fully through all sub-steps |
| `budget_threshold_crossed` | Spend hit `MAX_USD` (run-level) or per-step cap |
| `auth_expired` | `claude -p` stderr matched auth-error pattern; orchestrator pauses |
| `concurrent_phase_lock_acquired` / `_released` | When concurrent phases are enabled (§Concurrency) |

### Torn-write handling

`events.jsonl` is append-only with line-buffered writes. On orchestrator crash, the final line may be truncated. The replay path (used by post-hoc analyzer and GUI startup) tolerates a truncated final line:

```python
def parse_events(path):
    with open(path) as f:
        for line in f:
            try: yield json.loads(line)
            except json.JSONDecodeError: continue  # torn final line
```

`STATUS.json` writes are atomic (.tmp + rename), so it's either the old version or the new version — never partial.

## State machine

The state machine has ~25 distinct states. Implemented as a hardcoded transition table in Python. Concrete state list:

```
pending
  -> spec_authoring
      -> spec_authored
      -> spec_review_attempt
          -> spec_review_passed
          -> spec_review_failed_attempt_N      (loop up to 3)
          -> spec_review_stalled
      -> spec_sealed
  -> touch_list_rendered
  -> worker_dispatched
      -> worker_returned
      -> worker_failed                          (retry policy applies)
  -> diff_computed
  -> verifying
      -> verified
      -> verify_failed
  -> council_dispatched
      -> council_collecting
      -> council_returned
      -> council_member_timeout                 (one member exceeded budget)
  -> council_decided
      -> remediating
          -> remediation_attempt_N              (up to 10)
              -> remediation_succeeded
              -> remediation_stalled
      -> integrating
          -> integrate_committed
          -> integrate_tagged
          -> integrate_logged
          -> integrated                         (terminal: done)
      -> skipped                                (terminal)
  -> stalled                                    (terminal until end-of-run revisit)
  -> blocked                                    (terminal — dependency stalled)
```

Plus orthogonal states: `budget_paused`, `auth_paused`, `user_paused`. These don't transition the phase; they pause dispatching.

The transition table is the source of legal transitions. Any attempted transition not in the table is a bug; the orchestrator emits `step_failed` with `invalid_transition` and halts the phase.

## Step contracts

Every step has a contract: inputs, permission mode, env allowlist, structured return, side effects, idempotency rules, failure modes. Each contract lives in `STEPS.md` (one section per step).

### Common contract fields

```yaml
step_name: spec_author
flavor: llm                              # llm | shell
agent: SystemArchitect                   # for llm steps
permission_mode: default                 # default | bypass — see §Security
env_allowlist:                           # explicit, default empty
    - PATH
    - HOME
    - CLAUDE_*                           # for LLM steps
budget_usd: 5.00                         # hard cap; subprocess killed on hit
timeout_seconds: 1800
inputs:
    - phase_id: A2
    - spec_path: planning/m4.5/A2-spec.md
    - cross_phase_findings: [...]        # §Cross-phase memory
return_schema: step-spec-author.schema.json
idempotency: write_and_attempt           # see §Idempotency
side_effects:
    - writes: ${spec_path}
    - emits: spec_authored event
```

### Idempotency rules (per step flavor)

| Step | Idempotency rule |
|---|---|
| spec_author | `write_and_attempt`: on re-dispatch, write to `${spec_path}.attempt-N`; orchestrator picks the latest attempt that has not been sealed. |
| spec_review | Stateless: takes spec path + returns verdict. Idempotent by construction. |
| spec_seal | Check for existing sealed trailer before appending. |
| touch_list_render | Idempotent: overwrites `scope/A{N}.touch.txt`. |
| worker | `worktree_reset_then_attempt`: before re-dispatch, `git -C <worktree> reset --hard <base_ref>` AND `git -C <worktree> clean -fd`. Worker writes are then re-attempted from a clean tree. Failed attempt content is preserved in `.worktrees/<branch>.attempts/<N>/` (via stash + rename). |
| phase_diff | Stateless: idempotent by construction. |
| phase_verify | Stateless: idempotent by construction (read-only on worktree, log file overwritten). |
| council_member | Stateless per spawn: re-dispatch produces a fresh round of findings. Previous findings are kept under `LOG/<phase>/council-attempt-<N>.json`. |
| council_decide | Stateless: takes findings JSON, returns decision. Idempotent. |
| remediation_worker | `worktree_partial_attempt`: on re-dispatch, **inspects** the worktree state (does not reset). If the worktree was modified by a prior attempt, the new attempt continues from where it left off; if not, it starts fresh. Each attempt's diff is captured to `LOG/<phase>/remediation-attempt-<N>.patch`. |
| integrate_phase | `sub_step_checkpoint`: writes `LOG/<phase>/integrate.state` after each sub-step (`merged`, `tagged`, `logged`, `done`). On re-dispatch, reads the file and resumes forward from the last completed sub-step. |

### Integrate-phase sub-step protocol

`integrate-phase.sh A{N}` operates as a small state machine of its own:

```
read LOG/A{N}/integrate.state (or initialize as "init")

if state in (init, ):
    perform commit; write state := "committed sha=<sha>"
if state in (committed):
    perform ff-merge; write state := "merged"
if state in (merged):
    perform tag; write state := "tagged"
if state in (tagged):
    write LOG/A{N}.md entry; write state := "logged"
if state == "logged":
    write state := "done"; emit phase_integrated

each step is individually idempotent (tag check, merge --ff-only is no-op
if already up-to-date, log appends only if not present).
```

The orchestrator reads `integrate.state` after a re-dispatch to determine whether the previous attempt completed.

### Council findings schema

`council_finding` events carry a normalized JSON object:

```json
{
    "phase": "A2",
    "by": "SoftwareDeveloper",
    "severity": "critical|high|medium|low",
    "category": "correctness|security|performance|maintainability|test|other",
    "file": "src/core/gameState.ts",
    "line_start": 412,
    "line_end": 419,
    "summary": "...",
    "evidence": "code excerpt or specific quote",
    "recommendation": "specific change to make"
}
```

`council_decide` consumes a list of these and returns:

```json
{
    "decision": "remediate" | "integrate" | "skip",
    "rationale": "...",
    "addressed_severity_threshold": "high"
}
```

The orchestrator validates both shapes against `findings.schema.json` and `decision.schema.json` (see §Schema artifacts).

### LLM return parser

`claude -p` returns are subject to lenient parsing before validation:

```python
def parse_llm_return(raw_stdout: str, schema: BaseModel) -> Result:
    # 1. Strip markdown fences if present
    stripped = re.sub(r'^```(?:json)?\n', '', raw_stdout, flags=re.M)
    stripped = re.sub(r'\n```$', '', stripped, flags=re.M)

    # 2. Find first { ... last } (assumes JSON, not array root)
    start = stripped.find('{')
    end = stripped.rfind('}')
    if start == -1 or end == -1 or end <= start:
        return Failure(raw=raw_stdout, reason='no_json_object')
    candidate = stripped[start:end+1]

    # 3. Try parse
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as e:
        return Failure(raw=raw_stdout, reason=f'json_decode: {e}')

    # 4. Validate against pydantic schema
    try:
        return Success(schema.model_validate(data))
    except ValidationError as e:
        return Failure(raw=raw_stdout, reason=f'schema: {e}')
```

On failure: emit `step_failed` with the raw stdout written to `LOG/<phase>/<step>-raw-stdout.txt` (path referenced in event, content not embedded). Retry policy: one retry with a "your previous response was not valid JSON; here is the schema; respond with only JSON" follow-up. After two failures, halt the phase.

## Schema artifacts

Published as files in `schemas/` directory of the orchestrator repo. Both orchestrator (pydantic models) and GUI (TypeScript types) validate against them.

| Schema | Purpose |
|---|---|
| `status.schema.json` | The `STATUS.json` shape |
| `events.schema.json` | Every event type, with discriminator on `type` |
| `findings.schema.json` | Council finding shape (per-finding) |
| `decision.schema.json` | Council decide return shape |
| `step-<name>.schema.json` | One per LLM step's return shape |

`schema_version` is carried in `STATUS.json` and each event. Locked at v1 from day one. Breaking changes require version bump and an `events.jsonl` migration script (offline; the GUI's replay-from-old-version is out of scope for v1).

## Step dispatcher

```python
async def dispatch_step(self, step_name: str, **inputs) -> StepResult:
    contract = self.contracts[step_name]

    env = {k: os.environ[k] for k in contract.env_allowlist if k in os.environ}

    cmd = contract.build_command(**inputs)
    if contract.flavor == 'llm':
        if contract.permission_mode == 'bypass':
            cmd.insert(0, '--dangerously-skip-permissions')
        else:
            # default deny — runner does not pass the bypass flag
            pass

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        env=env,                                  # explicit allowlist
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=contract.working_directory,
    )

    # Per-step budget cap as a hard timer killer
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=contract.timeout_seconds
        )
    except asyncio.TimeoutError:
        proc.kill()
        return StepResult.timeout(stderr_path=write_stderr(stderr))

    if proc.returncode != 0:
        # Detect auth-expiry pattern in stderr before generic failure
        if AUTH_PATTERN.search(stderr.decode()):
            return StepResult.auth_expired(stderr_path=write_stderr(stderr))
        return StepResult.failed(returncode=proc.returncode,
                                 stderr_path=write_stderr(stderr))

    if contract.flavor == 'llm':
        return parse_llm_return(stdout.decode(), contract.return_schema)
    return parse_shell_return(stdout.decode(), contract.return_schema)
```

Explicit choices:

- **env passed explicitly, never inherited as a whole.** Each step gets only the variables in its allowlist. Workers don't get `GITHUB_TOKEN`; verifiers don't get `ANTHROPIC_API_KEY`.
- **Per-step bypass.** `permission_mode: bypass` adds `--dangerously-skip-permissions` to the command. Default is **deny**. Only `worker` and `remediation_worker` are bypass; `spec_author`, `spec_review`, `council_member`, `council_decide` run without bypass.
- **Auth-expiry detection.** A specific stderr pattern from `claude -p` (e.g., "authentication failed", "credit limit") triggers `auth_expired` rather than generic `step_failed`. The orchestrator pauses dispatching and waits for `/control/resume`.
- **Per-step hard budget caps** kill the subprocess via timeout. Soft warnings are not in the design — past a cap, the step dies and emits `budget_threshold_crossed`.

## Cross-phase memory

`spec_author` for phase A{N} receives the list of findings from prior phases' councils. This is the **one** cross-step LLM judgment case in the architecture.

Implementation: when the orchestrator transitions phase A{N} into `spec_authoring`, it collects all findings with severity ≥ medium from all previously-completed phases and passes them as `cross_phase_findings` input. The spec author is instructed (in its prompt template) to address relevant findings in the new spec's Goal or DO NOT sections.

`STATUS.json` tracks which findings each phase's spec consumed (`cross_phase_findings_in: [...]`) so the GUI can show the dependency graph.

This is the only design seam where the LLM does cross-step reasoning. Everything else is per-step.

## Concurrency (open question, scoped explicitly)

**Default: serial.** Phases run one at a time. No concurrent workers, no concurrent worktree operations.

**Opt-in via config: `concurrency.max_parallel_phases: 1` (default), increase to enable.**

When enabled, the orchestrator coordinates:

- **Per-phase worktrees** are already isolated (`.worktrees/m4.5-A{N}`). No file-system races on the worktree itself.
- **Shared run branch**: `integrate-phase.sh` takes a `flock` on `.worktrees/.integrate.lock`. Only one phase merges at a time. Other concurrent phases queue at the integrate step.
- **Tag namespace**: tags are per-phase (`m4.5-A{N}-done`), naturally non-colliding.
- **Per-subprocess env**: workers and councils each get isolated env (already true via the env allowlist). `M45_ACTIVE_PHASE` is per-process, not global.
- **Rate-limit awareness**: orchestrator caps total in-flight LLM steps to `concurrency.max_llm_calls` (default 3). Subagent fan-out is counted (a council with 3 members = 3 in-flight). When the cap is hit, new spawns queue.
- **`events.jsonl` write race**: writes are line-buffered + flush. Multiple coroutines append safely on POSIX (atomic up to PIPE_BUF for single-line writes). Orchestrator wraps appends in an asyncio lock for safety.

If concurrency is disabled, none of this coordination is engaged. The serial path stays clean.

For M4.5 with 5-6 phases, concurrency is unlikely to be worth the complexity. It's documented here so the option exists; default config disables it.

## Configuration

The orchestrator reads its config from one file specified on the CLI: `autonomous-runner run --config planning/m4.5/run-config.yaml`.

```yaml
schema_version: 1
run_branch: m4.5-run-2
base_branch: m4.5-preflight
plan_path: planning/m4.5/PLAN.md
status_path: planning/m4.5/STATUS.json
events_path: planning/m4.5/events.jsonl
orchestrator_log_path: planning/m4.5/orchestrator.log
log_dir: planning/m4.5/LOG/
schemas_dir: planning/m4.5/schemas/    # consumer-supplied or tool defaults
templates_dir: planning/m4.5/templates/
scripts_dir: planning/m4.5/scripts/
hooks_dir: planning/m4.5/hooks/

budget:
    max_usd: 0                          # 0 = unlimited (still tracked)
    per_step_caps:                      # optional; absent = no cap on that step
        spec_author: 5.00
        worker: 10.00
        council_member: 2.00

heartbeat:
    interval_seconds: 15
    stale_threshold_seconds: 60         # GUI flags after this

http_server:
    enabled: true
    bind: "127.0.0.1"                   # forced; config-level override rejected
    port: 0                             # 0 = OS-assigned; actual port written to STATUS.json

concurrency:
    max_parallel_phases: 1
    max_llm_calls: 3

council:
    depth: quick                        # quick | full
    members:
        - SoftwareDeveloper
        - QaTester
        - SystemArchitect

remediation:
    max_attempts: 10
    no_progress_window: 5

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

The phase list is the only DelveWard-specific operational binding. Templates, scripts, schemas, and hooks are paths into the consumer's filesystem; the orchestrator does not bundle any.

## GUI integration

### Phase 1 (minimal)

GUI reads `events.jsonl` + `STATUS.json` directly via filesystem watch. No HTTP needed. Works for local-only operation. Schema validation via the published `schemas/*.json` artifacts.

### Phase 2 (HTTP)

Orchestrator exposes:

- `GET /status` → `STATUS.json` body
- `GET /events?since=<offset>` → JSON array of events since offset (polling)
- `GET /stream` → SSE stream of events as they're appended
- `POST /control/pause` → orchestrator pauses dispatching new steps
- `POST /control/resume` → resumes
- `POST /control/kill` → graceful shutdown (sends SIGTERM to in-flight subprocesses, waits, exits)
- `POST /control/retry?phase=A2` → re-runs a phase from `pending` (validated against the config's phase IDs allowlist)
- `POST /control/budget?max_usd=N` → raise the cap (cannot lower below current spend)

All `/control/*` endpoints require a bearer token from `STATUS.json.http_token` (random 64-hex generated on startup, file mode 0600). The token defeats CSRF and DNS-rebinding from other localhost apps.

Bind is hardcoded to `127.0.0.1` in code. Config-level overrides to `0.0.0.0` are rejected with a clear error. Port defaults to 0 (OS-assigned), with the actual port written to `STATUS.json.http_port` for the GUI to read.

The schema for `/control/retry?phase` validates against the config's `phases:` keys. Any other value returns 400.

## Failure modes and recovery

### Step subprocess crash / non-zero exit

Orchestrator records `step_failed` with the stderr path. Retry policy is per-step (defined in `STEPS.md`); see §Idempotency for what re-dispatch looks like.

### Orchestrator crash mid-step

On restart, the orchestrator:

1. Reads `STATUS.json` (the last committed state).
2. For any phase with `current_step` set, treats that step as in-flight at crash time. Idempotency rules determine whether to re-dispatch fresh or resume.
3. For `integrate_phase` specifically: reads `integrate.state` and resumes forward.
4. For LLM steps: re-dispatches if the previous return wasn't recorded (worktree-reset for worker, fresh spawn for the rest).
5. Validates schema before resuming; if `STATUS.json` is unparseable, exits with `BLOCKED corrupt-status` and asks for manual intervention.

### Subprocess zombies

PID file at `planning/m4.5/run.pid`. On orchestrator startup, reads existing PID file; if PID is alive, exits with `BLOCKED double-start`. On graceful shutdown, removes the file.

For child subprocesses: tracked in `STATUS.json.phases.<id>.worker.pid`. On startup, the orchestrator sends `kill -0` to any recorded PID; if alive but the phase status says crashed, sends SIGTERM, waits, then SIGKILL.

### Auth expiry mid-run

When `claude -p` stderr matches the auth-expiry pattern, orchestrator emits `auth_expired`, pauses dispatching, and waits for the user to refresh credentials and `POST /control/resume`. Different from `step_failed` because no remediation can fix it; only the user can.

### Budget exceeded

Same shape as auth expiry: emit `budget_threshold_crossed`, pause, wait for `/control/budget?max_usd=N` or `/control/kill`.

### Laptop sleep / network drop

macOS App Nap may suspend the orchestrator process. On wake, asyncio sees clock skew; subprocess timeouts may have fired spuriously. Orchestrator handles this by re-checking subprocess liveness after every coroutine wake. Network drops cause `claude -p` to fail with a network error, which is treated as a transient `step_failed` with one auto-retry.

## Security

### Credential redaction

The event bus has a write-time redaction filter. Every event passes through:

```python
SECRET_PATTERNS = [
    re.compile(r'(gh[opusr]_[A-Za-z0-9]{36,})'),
    re.compile(r'(ghp_[A-Za-z0-9]{36,})'),
    re.compile(r'(sk-ant-[A-Za-z0-9_-]{50,})'),
    re.compile(r'(ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN)=([^\s]+)'),
    re.compile(r'(Bearer\s+[A-Za-z0-9._-]+)'),
    # ... extensible via config
]

def redact(s: str) -> str:
    for pat in SECRET_PATTERNS:
        s = pat.sub('<REDACTED>', s)
    return s
```

`events.jsonl`, `orchestrator.log`, and `LOG/<phase>/<step>-stderr.txt` all pass through redaction at the write boundary.

`.gitignore` adds:

```
events.jsonl
orchestrator.log
.worktrees/
.run.pid
```

Pre-commit hook on the consumer repo refuses commits containing these paths.

### Permission scope per step

Permission modes:

| Step | Mode |
|---|---|
| spec_author | default (no bypass) |
| spec_review | default |
| council_member | default |
| council_decide | default |
| worker | **bypass** (writes code) |
| remediation_worker | **bypass** |
| shell steps | n/a (no `claude -p`) |

The `--dangerously-skip-permissions` flag is added only by the dispatcher for `bypass` steps.

### Worker sandbox hook gate

Before any `bypass`-mode step is spawned, the orchestrator verifies:

1. `hooks/sandbox.sh` exists, is executable, and passes its self-test (`hooks/sandbox.sh --self-test` exits 0).
2. The static deny-list (`settings.local.template.json`) is materialized into the worktree's `.claude/settings.local.json` with `{REPO_ROOT}` substituted.

If either check fails, the orchestrator refuses to spawn the worker and marks the phase `blocked` with reason `sandbox_unavailable`.

### Env allowlist (re-stated)

Default empty. Each step contract declares which env vars it inherits. Explicit, auditable.

### HTTP server

- Binds 127.0.0.1 in code; config cannot override.
- Default port 0 (OS-assigned); actual port written to `STATUS.json` for GUI.
- Bearer token required on `/control/*` (random 64-hex in `STATUS.json` mode 0600).
- `/control/retry?phase=X` validates X against the config's phase ID allowlist.

This is **not production-grade authentication**. It's a loopback boundary. Any reverse-proxy or tunnel exposure requires a real auth retrofit; the spec calls this out and the config refuses non-loopback bind.

## Observability

Three streams, intentionally separate:

| Stream | Audience | Schema |
|---|---|---|
| `STATUS.json` | GUI (state), CLI (`autonomous-runner status`) | `status.schema.json` |
| `events.jsonl` | GUI (timeline), post-hoc analysis, audit | `events.schema.json` |
| `orchestrator.log` | Developer / ops debugging — Python exceptions, subprocess stderr summaries, severity-tagged | Free-form text, stdlib logging format |

Subprocess stderr (when a step fails) is persisted to `LOG/<phase>/<step>-stderr.txt`; events reference the path, never embed the content.

Heartbeat: every 15 s while the orchestrator is alive. GUI flags absence after 60 s as "wedged".

## Generalization stance (honest scope)

The orchestrator is generalizable to **workloads matching this state-machine shape**: plan with dependent phases, each phase = spec_author → spec_review → seal → touch_render → worker → diff → verify → council → decide → (remediate | integrate | skip).

Workloads requiring different shape (no council, two workers per phase, dynamic phase generation) require code changes. The honest framing is "config-only generalization for shape-compatible workloads."

Project-supplied at deployment:

- Phase list and worker agent assignments (`run-config.yaml`)
- Verification script (`phase-verify.sh` — project knows what "verified" means)
- Prompt templates (`templates/*` — project knows what its specs / workers / councils should look like)
- Hook script (`hooks/sandbox.sh`)
- Optionally: integrate-phase override, smoke driver, goldens, fixtures

Tool-supplied (in the orchestrator repo):

- Orchestrator binary + state machine
- Default `phase-diff.sh` and `integrate-phase.sh` (project can override)
- Default schemas
- Default step contracts (project can extend)

## Deployment

Standalone repo, installable via `pipx` or `uv tool install`. The DelveWard repository becomes a consumer.

```
autonomous-runner/                          (new repo)
├── pyproject.toml                          (console entry: autonomous-runner)
├── src/autonomous_runner/
│   ├── __init__.py
│   ├── orchestrator.py
│   ├── state.py
│   ├── events.py
│   ├── dispatcher.py
│   ├── parser.py
│   ├── http_server.py
│   ├── schemas/                            (default schemas)
│   ├── steps/                              (default step contracts)
│   └── scripts/                            (default shell helpers)
├── tests/
├── docs/
└── examples/m4-5/                          (reference config + templates)
```

DelveWard's `planning/m4.5/` keeps:

- `run-config.yaml`
- `templates/` (project's worker prompts, with project-specific terminology)
- `scripts/phase-verify.sh` (DelveWard's verification — vitest, tsc, build, smoke, goldens)
- `hooks/sandbox.sh`
- `goldens/`, `fixture1.json` etc.
- `PLAN.md`, `STATUS.json`, `events.jsonl`, `LOG/`

User installs: `uv tool install autonomous-runner` (or `pipx install autonomous-runner`).

User runs from DelveWard: `autonomous-runner run --config planning/m4.5/run-config.yaml`.

Per-user defaults at `~/.config/autonomous-runner/defaults.yaml`. Per-project config overrides defaults.

## Migration from alpha

Alpha lives on `m4.5-preflight` and exercises:

- PostToolUse hook for bookkeeping (validates whether tool results carry `<usage>` in hook input)
- `phase-verify.sh` and `phase-diff.sh` thin scripts
- Slim runner prompt
- Spec carryforward decision

Alpha's deliverables that **carry into β**:

- `phase-verify.sh` and `phase-diff.sh` — exact scripts, used by the orchestrator
- `hooks/sandbox.sh` and `settings.local.template.json` — unchanged
- Fixture, goldens, smoke driver — unchanged
- Prompt templates — adapted into per-step prompts with placeholders

Alpha's deliverables that **do not carry**:

- The autonomous-runner Claude agent — replaced by Python orchestrator
- PostToolUse bookkeeping hook — replaced by per-step events emitted by the orchestrator
- Runner-side STATUS.md write logic — replaced by orchestrator atomic writes

Migration plan:

1. α completes, run-2 produces data. Document findings in `RUN2-FEEDBACK.md`.
2. Bootstrap the `autonomous-runner` repo (α.5, separate session).
3. Build β iteratively: orchestrator core → step contracts → HTTP/SSE → GUI (parallelizable from event-schema lock).
4. Migrate one phase at a time on a fresh `m4.5-run-3` branch; orchestrator-driven from the start.
5. Once β passes a full run, retire the agent files and merge to `main` (the original M4.5 goal).

## Cost projection

For a full M4.5 run (A2 + A4 + A3 + A5 + A7, A6 conditional):

| Item | Current (run-1) | β (projected) |
|---:|---:|---:|
| Long-lived orchestrator | $22 (47M tokens) | ~$0 (Python, no LLM) |
| Per-step LLM calls (captured) | $6 (745K tokens) | $10-16 |
| Per-step LLM calls (council, uncaptured) | $2-3 (est) | $4-6 (captured via subagent_returned events) |
| **Total** | **~$30** | **~$14-22** |

Plus the reliability, observability, testability, and resumability gains.

## Effort estimate

| Workstream | Sessions |
|---|---:|
| Orchestrator repo bootstrap (α.5) | 1 |
| Orchestrator core (state, dispatcher, parser, events) | 3-4 |
| Step contracts + default scripts | 1-2 |
| HTTP server + SSE | 1 |
| Schema artifacts + tests | 1 |
| GUI (parallelizable after event schema lock) | 2-3 |
| End-to-end test on M4.5 workload | 1-2 |
| Migration / cleanup | 1 |
| **Total** | **~10-14 focused sessions** |

Total β line items: ~1500-2500 LoC orchestrator code, plus ~500 LoC test fixtures, plus 2-3K LoC GUI.

## Remaining open questions

These survive the v2 rewrite. Worth deciding before implementation starts.

1. **Language**: Python is the safest default. Go or Rust if compiled deployment matters more than fast iteration. **Recommendation: Python.**
2. **GUI technology**: web (React/Vue/Svelte) vs TUI (textual) vs both. **Recommendation: defer; lock the event schema first, GUI follows.**
3. **Concurrent phases**: default off, opt-in via config. Worth designing concrete tests before enabling. **Recommendation: keep disabled in M4.5; enable for workloads where parallelism actually pays.**
4. **Council depth versioning**: as model versions evolve, council decisions drift. Locked via golden test suite (see §Testability strategy below — needs to be added). Question: who maintains the golden suite? **Recommendation: orchestrator repo ships defaults; consumers override.**
5. **Multi-LLM provider support**: today the orchestrator assumes `claude -p`. Future may want OpenAI / Gemini per step. Out of scope for v1; the dispatcher's command construction is the seam.
6. **Idempotency for spec_author and council_member**: re-dispatch produces a new attempt; the orchestrator picks the "latest unsealed" or "latest finding round". What if two attempts disagree substantively? **Currently: latest wins. Open.**
7. **Cross-phase memory window size**: as findings accumulate, the spec_author input grows. Cap at top-K findings by severity? **Open. Default: all severity ≥ medium, capped at 20 findings.**

## Testability strategy

A summary; full coverage is in `TESTING.md` (to be authored alongside the orchestrator).

- **State machine unit tests**: fake step registry returns canned results; the orchestrator transitions through every legal state. No LLM in test path.
- **Step contract tests**: each step's input/output schema validates against fixtures.
- **LLM return parser tests**: a corpus of real `claude -p` outputs (with fences, preambles, truncation) is checked into `tests/fixtures/`. Parser must handle every example.
- **Event replay tests**: load a recorded `events.jsonl` from a real run, replay through state projection, assert `STATUS.json` matches an expected fixture.
- **Council-decide golden suite**: hand-curated findings JSONs paired with expected decisions and allowed rationale keywords. Catches LLM decision drift across model versions.
- **Torn-write fixture**: an `events.jsonl` with a truncated final line; parser must skip it cleanly.
- **Property test**: for every prefix of a recorded event log, the state projection is well-formed.
- **Idempotency tests**: simulate orchestrator crash at every sub-step of `integrate-phase.sh`; verify re-dispatch reaches `phase_integrated`.
- **HTTP contract tests**: round-trip every event type through SSE; validate against `events.schema.json`.

## What β explicitly throws away from α

- The autonomous-runner Claude agent (`.claude/agents/autonomous-runner.md`). Becomes documentation-only.
- α's PostToolUse bookkeeping hook (orchestrator writes events directly).
- Runner-side STATUS.md maintenance (Python orchestrator owns it).

What β keeps:

- The fixture (`fixture1.json`), goldens, smoke driver.
- The PreToolUse worker sandbox hook (`hooks/sandbox.sh`) — workers still need it.
- The static `settings.local.template.json` deny-list.
- All prompt templates (adapted into per-step prompts).
- Phase ordering, worker selection table, A6 gate logic.

## Closing

This is a small, opinionated, project-scoped Python orchestrator with explicit state, an audit log, per-step subprocess isolation, and a structured event stream the GUI consumes. The LLM remains the workload but not the loop. Critical operational concerns (idempotency, secret redaction, env allowlist, bypass scope) are first-class.

M4.5 is the first workload. The orchestrator extracts cleanly to its own repo at α.5, with DelveWard becoming a consumer. Future workloads matching this state-machine shape are config-only; workloads with different shape require code changes that are scoped within the orchestrator repo, not the consumer.
