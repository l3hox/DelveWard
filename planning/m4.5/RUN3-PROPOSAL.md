# RUN3-PROPOSAL.md

Improvement proposal for `m4.5-run-3`, the second iteration of alpha. Run-3 is still alpha (same agent-based architecture, same A2 to A7 ordering), not the β redesign. Its job is to run **longer** than run-2 (which died at A2), exercise the machinery run-2 never reached, and produce richer telemetry.

Grounded in [RUN2-FEEDBACK](RUN2-FEEDBACK.md). Three themes, in dependency order: **Survive**, **Measure**, **Conform**. Each measure is sized for run-3; the deep work each opens is flagged separately.

## Why run-2 taught us little past A2

Run-2 ran 92 minutes and died evaluating A2 worker deviations. It never reached `phase-verify.sh`, `integrate-phase.sh`, the multi-phase loop, council review, or remediation. The expensive machinery alpha was built to validate is still unexercised. Run-3's first requirement is simply to **not die**, so the loop runs long enough to generate data.

## Precursors (verify before run-3, not during)

Alpha defined a "verify first, then build" discipline and then skipped it twice. Three cheap experiments must run on `m4.5-preflight` before cutting run-3. Each is a tiny, throwaway probe.

1. **PostToolUse stdin shape.** Install a hook that dumps its raw stdin to a file, trigger one Agent spawn, inspect. Confirms whether `transcript_path` is present and whether `tool_response` carries the `<usage>` trailer. This single test closes the question alpha has carried since the start.
2. **Worker sandbox reachability.** Spawn one `Agent(isolation:"worktree")` with the intended `settings.local.json` + `sandbox.sh` injection and attempt an out-of-scope write. Confirms whether the PreToolUse sandbox fires at all in an Agent-managed worktree. Run-2 evidence says it does not; verify directly.
3. **Worktree sees the rendered touch list.** Check whether a file rendered uncommitted in the main repo is visible in the Agent-created worktree. Run-2 evidence says no (the worktree is a clean checkout). Determines whether the touch list must be committed or injected by another channel.

The precursor results decide the exact shape of the Measure and Conform work below. Do not build on assumptions these probes can settle in minutes.

## Precursor results

### Precursor 1 (resolved 2026-05-28): PostToolUse stdin is rich and structured

A controlled child `claude` session with a stdin-dump hook settled this. Findings:

- `transcript_path` **is** present in hook stdin (alongside `session_id`, `cwd`, `permission_mode`, `tool_use_id`, `duration_ms`).
- The result field is `tool_response` (a dict), not `tool_result`.
- The `<usage>` **text trailer does not exist.** Run-2's `total_tokens` stayed 0 because the hook regexed for `<usage>total_tokens: N`, a format the payload never had.
- An Agent call's `tool_response` is a structured object carrying everything we wanted, live: `totalTokens`, a full `usage` breakdown (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`), `totalToolUseCount`, `totalDurationMs`, and `toolStats` (`bashCount`, `editFileCount`, `linesAdded`, `linesRemoved`).

Consequence: token harvest is **live in the hook**, no transcript read required. Read `tool_response.totalTokens` directly and the `usage` split for exact (not blended) cost. Still to confirm on an `isolation:"worktree"` worker that the shape holds (precursor 2 covers that worker).

### Precursor 2 (resolved 2026-05-28): PreToolUse hooks DO reach worktree subagents

A child git repo with a PreToolUse hook (logs every fire, blocks any path containing `FORBIDDEN`) spawned an `isolation:"worktree"` subagent that attempted to write `FORBIDDEN.txt`. The hook fired for the subagent's Write, with the file path inside `.claude/worktrees/agent-<id>/`, and blocked it; the file was never created. So a sandbox **is** reachable inside workers, overturning the run-2 inference.

The run-2 failure was the wiring channel, not unreachability. The sandbox was meant to be injected into the worktree's `settings.local.json`, but hooks propagate from the **runner session's** settings (proven here), and the runner's frontmatter carried only a PostToolUse hook, no PreToolUse sandbox. The fix is to wire the sandbox into the runner session's hooks, where every worker subagent inherits it.

Two caveats this surfaces: (a) a parent-session hook also fires for the runner's own writes, so it must enforce the allowlist only for writes whose path is inside a worktree; (b) the hook must source the touch list from the main repo, since (per precursor 3) the worker never sees the uncommitted rendered list.

### Precursor 3 (resolved 2026-05-28): worktrees see only committed state

A local git probe (render an uncommitted file in the main repo, add a detached worktree at HEAD, check visibility) confirmed the uncommitted file is **not visible** in the worktree. This validates the run-2 mechanism: the runner renders `scope/A{N}.touch.txt` uncommitted in the main repo, so a worker in its worktree never sees it. Even if the sandbox loaded, its allowlist would be stale or absent. Conform 3.1's "commit or inject the touch list before the worker spawns" is therefore required, not optional.

## Council review (2026-05-28): NO-GO until blockers land

A four-specialist review (Dev, QA, Ops, Security) found two failures the offline tests masked. Binding status: **NO-GO as-is; run attended, not unattended, until the blockers below and the live gate pass.**

Criticals:
- **The Conform gate is inert at runtime.** Workers leave changes uncommitted; `phase-diff.sh` diffs `BASE..HEAD` → zero files → `out_of_scope=none`, so scope/budget/council all pass on nothing and a no-op worker integrates as "done." The earlier "flagged entityTypes.ts" result was a false green (it ran against *committed* run-2 data).
- **The sandbox write-allowlist is open.** It enforces only inside `.claude/worktrees/`; a worker writing an absolute path to the main repo, its own `scope/ACTIVE`/`sandbox.sh`, or `$HOME` hits default-*allow*. With the post-hoc gate inert, this PreToolUse hook is the sole runtime containment, and it is bypassable. The bash `case` glob also lets `*` cross `/`, granting whole subtrees.
- **The watchdog corrupts its own liveness.** `newest_under` scans all worktrees, so a leaked worktree's stale mtimes mask a real hang; quiet long work false-kills; kills orphan worktrees; resume tolerates a dirty tree → silently integrates worker-planted files.

Blockers (must land):
1. Sandbox deny-by-default, discriminating by writer context (cwd in a worktree = worker → canonicalize target, require inside the active worktree AND in the touch list; deny otherwise); slash-respecting matcher against the committed list.
2. Commit worker changes in the worktree before diffing (not bare `git add -A`); match `out_of_scope` with the anchored matcher.
3. Watchdog: scope liveness to the active worktree; GC orphaned worktrees/branches on restart; quarantine (do not silently integrate) unexpected main-tree changes on resume.

Live gate (before cutting run-3): one **attended A2-only dry run** proving all five — uncommitted worker → diff commits → files>0; deep out-of-scope write blocked by sandbox AND flagged by phase-diff; outside-worktree write blocked; integrate yields non-empty diff + done-tag; watchdog survives a >15-min council pause.

Cheap hardening for unattended: OS egress block + read-only `~/.claude`/`~/.ssh`; supervisor PushNotification on terminal exit; `MAX_RESTARTS` progress-reset per done-tag. Generalized/untrusted goal (post-β): container + seccomp + network policy; drop `--dangerously-skip-permissions` for an allowlist.

## Theme 1 — Survive (the gate for a longer run)

Without this, run-3 dies on the next transport blip and teaches nothing new.

### 1.1 Keep-awake (landed)

`launch-run.sh` now wraps the run in `caffeinate -ims` (macOS) or `systemd-inhibit` (Linux). Removes the *sleep* trigger that killed run-2. Does not address other transport drops.

### 1.2 External supervisor with restart (built, tested)

`supervise-run.sh` owns the run lifecycle from outside the runner (the runner cannot resurrect itself). It runs the runner in a detached tmux session, restarts on crash or hang, and stops on a terminal NOTIFY.

- Restart cadence is configurable via `RESUME_RETRIES` (default 1): the first restart resumes the same session (`claude --resume`, verified to retain context); subsequent restarts scratch the session and launch a fresh runner that reconciles from STATUS.md per the Stricter Resume Gates. `RESUME_RETRIES=0` always scratches; a higher value resumes more first. (A future UI can set this.)
- `MAX_RESTARTS` (default 5) caps the crash loop; on exhaustion the supervisor writes `BLOCKED supervisor-give-up` to NOTIFY, closing the silent-death gap that run-2's unhandled error left open.
- `launch-run.sh` gained `RUN_SESSION_ID` (a known id so the supervisor can `--resume` it) and `RUN_RESUME` (fresh vs resume command), reusing one launch path.
- Validated with real executions against fake launchers (no tokens spent): `--self-test` (helpers + cadence across `RESUME_RETRIES`); a loop test confirming fresh → resume(same id) → fresh(new id), give-up NOTIFY, and clean exit on terminal `DONE`; and two watchdog tests that actually trip the kill paths — no-activity/grace kill+restart, and active-then-stale kill driven off a worktree file (proving the composite signal's worktree arm). The only path left for run-3 itself is the full live integration (real `claude` runner, real transcript), whose components are each verified by the precursors.

### 1.3 Stale-watchdog that acts (built, tested)

The supervisor's watchdog declares the run hung when **no observable activity** advances past `STALE_SECONDS` (default 900), then kills the tmux session and triggers restart. Activity is composite (Theme 2.2): `max(transcript mtime, newest active-worktree file mtime)`, because no single parent-side signal is reliable. A `GRACE_SECONDS` (default 180) window covers startup before the transcript exists. Run-2's hung request did not surface an error for 65 minutes; the watchdog is the actor that catches exactly this.

### 1.4 Per-operation wall-clock cap (scoped down for run-3)

A true per-subagent wall-clock cap needs runner-side support: a subagent cannot be killed from outside the runner, and the Agent tool's `max_turns` bounds turns, not wall-clock. For run-3 the composite-staleness watchdog (1.3) covers the hang case at the run level: a wedged subagent freezes both the transcript and its worktree files, trips staleness, and the supervisor restarts the whole run from the last done-tag. Finer per-subagent caps are deferred until they prove necessary.

## Theme 2 — Measure (token granularity and real liveness)

### 2.1 Token harvest at each subagent boundary

Precursor 1 makes this simpler than first proposed: the data is live in the hook's `tool_response`, so no transcript read is needed.

- On `tool_name == "Agent"`, the PostToolUse hook reads `tool_response.totalTokens` directly, plus the `usage` split (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`) for exact rather than blended cost.
- Append a granular record to `planning/m4.5/LOG/subagent-tokens.jsonl`: timestamp, phase, bucket, subagent_type, name, totalTokens, the usage split, `totalDurationMs`, and `toolStats`. A per-subagent ledger written as each subagent finishes.
- Feed the number into the existing STATUS.md `stats.by_role.<bucket>.tokens` and `total_tokens` update logic, which already works once given real numbers. The fix to the run-2 bug is to read the structured field instead of regexing a non-existent text trailer.

Net: granular, mechanical, exact-cost per-subagent accounting from the hook's own stdin. Main-session tokens remain a post-hoc `run-stats.sh` artifact (they have the same subagent blind spot live).

Built and tested. `post-tool.py` now reads `tool_response.totalTokens` plus the `usage` split, updates STATUS, and appends to `LOG/subagent-tokens.jsonl`. Verified by `--self-test` (structured extraction, JSON-string fallback, phase parsing, ledger round-trip) and an end-to-end stdin test with a realistic Agent payload: STATUS went to `total_tokens: 39686` and the ledger captured the per-subagent record with its cache-read split. This fixes the run-2 `tokens=0` bug.

### 2.2 Composite liveness signal

The watchdog (1.3) needs a signal that distinguishes a working subagent from a hang. No parent-side channel can: heartbeat, parent-JSONL mtime, and token usage all freeze identically during a legitimate subagent (run-2's A2 worker ran 9.4 minutes with zero parent events). Add the one signal that does move during worker execution:

- **Active-worktree file mtime.** While a worker edits files in its worktree, the directory mtime advances. The watchdog treats "newest mtime across the active worktree" plus "parent transcript mtime" as the liveness clock. Stale = both stop advancing past the threshold.

## Theme 3 — Conform (first spec-stabilization measures)

Spec authoring is non-reproducible (run-2's fresh A2 spec flipped the same worker output from pass to three violations). Full stabilization is long work; these are the cheap first measures, plus fixing the enforcement that silently failed.

### 3.1 Make worker scope enforcement actually work (built, tested)

Two layers, prevention and detection, both built and verified offline.

**Prevention: the sandbox is loaded via `--settings`, not frontmatter.** A placement finding surfaced while wiring this: agent-frontmatter hooks fire only in the runner's own session (run-2's frontmatter PostToolUse never tracked the worker), while hooks in `--settings` (and project settings) propagate to `isolation:"worktree"` subagents. Verified directly: a `--settings` PreToolUse hook fired inside a worker worktree and blocked the write. So the sandbox lives in `runner-settings.json`, loaded by `launch-run.sh` via `--settings`, scoped to the run (not global dev) and inherited by workers. Two precursor-mandated adjustments, both implemented in `sandbox.sh`:

- Enforce the allowlist only for writes whose path is inside `.claude/worktrees/<agent>/`; the runner's own main-repo writes pass. Verified: runner write allowed, worker in-scope write allowed, worker out-of-scope write blocked.
- Source the active phase from `planning/m4.5/scope/ACTIVE` and the touch list from the main repo (derived from the worktree path), since the worktree never sees the uncommitted list (precursor 3). The runner writes `ACTIVE` before each spawn. Env vars don't work here (the phase changes per spawn, can't be re-exported into a live session's hooks).

**Detection: `phase-diff.sh` emits `out_of_scope`.** It compares changed files against the touch list (same glob matching as the sandbox) and emits `out_of_scope=none | <comma-list> | no-touch-list`. The runner remediates on any non-`none` value. Verified against real run-2 data: against the actual A2 worker output it flagged exactly `src/core/entityTypes.ts,src/enemies/enemyAI.test.ts` — the two files run-2 caught only by ad-hoc reasoning.

### 3.1c Worktree integration mismatch (resolved)

The Agent tool's `isolation:"worktree"` manages its own path (`.claude/worktrees/agent-<id>`) and branch (`worktree-agent-<id>`), but a probe settled the base question: it bases the worktree on the **run branch HEAD at spawn time**, not a stale commit. Run-2's apparent stale base was the run branch advancing *after* the worker spawned.

Fixed (Option A, adapt):
- `integrate-phase.sh` now takes the discovered branch + path as arguments instead of assuming `m4.5-A{N}` / `.worktrees/m4.5-A{N}`; the runner reads both from `git worktree list` (step 6) and passes them (step 11). The done-tag stays `m4.5-A{N}-done`.
- A new runner constraint forbids committing to the run branch between spawn and integrate, so run-HEAD stays equal to the worktree base and the ff-merge always holds; `integrate-phase.sh` keeps its divergence guard as a backstop.
- `.claude/worktrees/` is gitignored so an Agent worktree can't be embedded or trip the clean-tree check.

Verified offline against a faithful Agent-style worktree: happy-path ff-merge with the discovered branch (tag + LOG written), and the divergence guard refusing (exit 6, no tag) when the run branch advanced.

### 3.2 Constrain the spec-author template

Add house-style rules to `templates/spec-author.md` that reduce the authoring variance:

- Prefer modifying existing files; introduce a new file only when no existing file is a natural home, and justify it inline.
- Inspect the dependency-injection patterns already used in the touched modules and prescribe the least-invasive one that matches existing style, rather than inventing a pattern.
- Emit the touch list and budget in a fixed, machine-parseable block (already partly true; tighten it).

### 3.3 Deferred (the long work)

Acknowledged as out of scope for run-3, flagged so it is not forgotten: deterministic or example-driven spec authoring, a spec linter that rejects specs violating house rules before any worker runs, and the option of a human seal between authoring and worker dispatch. These are β-scale, not first measures.

## Out of scope for run-3 (still β)

The orchestrator rewrite, the GUI, the per-step subprocess model, and live budget enforcement remain β. Run-3 keeps the agent-based runner intact and changes only what the three themes above require.

## Acceptance criteria for "preflight ready for run-3"

- [x] Precursors 1 to 3 run and their results recorded in this file.
- [x] `supervise-run.sh` exists: launches, restarts on crash with a cap, writes NOTIFY on give-up.
- [x] Stale-watchdog kills + restarts on composite-signal staleness; verified against simulated hangs (grace and stale branches).
- [x] Hang handling: watchdog covers the run-level case; finer per-subagent cap deferred (see 1.4).
- [x] Token harvest from the hook's `tool_response` at subagent boundaries; `LOG/subagent-tokens.jsonl` populated in a dry run.
- [~] `phase-diff.sh` emits `out_of_scope` — but the council found it is a runtime **false green** (diffs `BASE..HEAD` on an uncommitted worktree → zero files). The run-2 verification used committed data. Needs blocker 2 (commit-then-diff) + anchored matcher before this counts.
- [x] `templates/spec-author.md` carries the house-style constraints.
- [x] Sandbox is loaded via `--settings`, reaches workers, and now enforces deny-by-default (the policy fix below).
- [x] **BLOCKER 1 (done):** `scope-check.py` decides writes by writer context — runner writes pass; worker writes must canonicalize (realpath, resolves `..`/symlinks) INSIDE the active worktree AND match a slash-respecting matcher against the committed touch list; else denied. Native Write denies for `~/.ssh`/`~/.claude`/etc. as backstop. Verified by `--self-test` and a live child-session test (in-scope allowed; deep-out-of-scope and outside-worktree blocked).
- [ ] **BLOCKER 2:** commit worker changes in the worktree before `phase-diff`/verify/council; no-op worker caught.
- [ ] **BLOCKER 3:** watchdog scoped to active worktree; orphan GC on restart; quarantine unexpected main-tree changes on resume.
- [ ] **LIVE GATE:** one attended A2-only dry run passing all five assertions (see Council review section).
- [x] Worktree integration mismatch (3.1c) resolved — `integrate-phase.sh` takes the discovered branch/path; runner keeps HEAD stable; verified offline.
- [x] tsc + vitest green after the Conform changes (778 tests). Smoke not re-run (no `src/` changes); re-run at launch.

When met, cut `m4.5-run-3` from `m4.5-preflight` and launch under the supervisor.

## What run-3 should produce that run-2 could not

A run that survives transport blips and reaches multiple phases: the first real exercise of `phase-verify.sh`, `integrate-phase.sh`, council review, and remediation; a granular per-subagent token ledger; and a second data point on spec-authoring variance now that the template carries constraints.
