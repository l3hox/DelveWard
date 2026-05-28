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

## Theme 1 — Survive (the gate for a longer run)

Without this, run-3 dies on the next transport blip and teaches nothing new.

### 1.1 Keep-awake (landed)

`launch-run.sh` now wraps the run in `caffeinate -ims` (macOS) or `systemd-inhibit` (Linux). Removes the *sleep* trigger that killed run-2. Does not address other transport drops.

### 1.2 External supervisor with restart

A `supervise-run.sh` wrapper that owns the run lifecycle from outside the runner (the runner cannot resurrect itself):

- Launch the runner. On non-zero exit or session-end-with-error, check STATUS.md: if the run is not `DONE`/`BLOCKED`, relaunch via `claude --resume` (or a fresh runner that reconciles from STATUS.md per the existing Stricter Resume Gates in SAFETY-HATCHES).
- Cap restarts (e.g. 5) to avoid a crash loop; on cap exhaustion, write `BLOCKED supervisor-give-up` to NOTIFY.
- This also closes the silent-death gap: the supervisor writes NOTIFY on crash, which run-2's unhandled error never did.

### 1.3 Stale-watchdog that acts

A watchdog (inside the supervisor, or a sibling) that declares the run hung when **no observable activity** advances for longer than the longest legitimate operation, and then kills + triggers restart. "Observable activity" must be composite (see Theme 2), because no single parent-side signal is reliable. Run-2's hung request did not surface an error for 65 minutes; only an actor watching staleness would have caught it.

### 1.4 Per-operation wall-clock cap

Cap any single subagent or API call at a hard ceiling. A worker that exceeds it is killed and remediated rather than blocking the whole run indefinitely.

## Theme 2 — Measure (token granularity and real liveness)

### 2.1 Token harvest at each subagent boundary

Precursor 1 makes this simpler than first proposed: the data is live in the hook's `tool_response`, so no transcript read is needed.

- On `tool_name == "Agent"`, the PostToolUse hook reads `tool_response.totalTokens` directly, plus the `usage` split (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`) for exact rather than blended cost.
- Append a granular record to `planning/m4.5/LOG/subagent-tokens.jsonl`: timestamp, phase, bucket, subagent_type, name, totalTokens, the usage split, `totalDurationMs`, and `toolStats`. A per-subagent ledger written as each subagent finishes.
- Feed the number into the existing STATUS.md `stats.by_role.<bucket>.tokens` and `total_tokens` update logic, which already works once given real numbers. The fix to the run-2 bug is to read the structured field instead of regexing a non-existent text trailer.

Net: granular, mechanical, exact-cost per-subagent accounting from the hook's own stdin. Main-session tokens remain a post-hoc `run-stats.sh` artifact (they have the same subagent blind spot live).

### 2.2 Composite liveness signal

The watchdog (1.3) needs a signal that distinguishes a working subagent from a hang. No parent-side channel can: heartbeat, parent-JSONL mtime, and token usage all freeze identically during a legitimate subagent (run-2's A2 worker ran 9.4 minutes with zero parent events). Add the one signal that does move during worker execution:

- **Active-worktree file mtime.** While a worker edits files in its worktree, the directory mtime advances. The watchdog treats "newest mtime across the active worktree" plus "parent transcript mtime" as the liveness clock. Stale = both stop advancing past the threshold.

## Theme 3 — Conform (first spec-stabilization measures)

Spec authoring is non-reproducible (run-2's fresh A2 spec flipped the same worker output from pass to three violations). Full stabilization is long work; these are the cheap first measures, plus fixing the enforcement that silently failed.

### 3.1 Make worker scope enforcement actually work

Precursor 2 shows the sandbox is reachable; precursor 3 shows why run-2's wiring failed. The fix has two layers, prevention and detection:

**Prevention (the real fix): wire the sandbox into the runner session.** Move the PreToolUse sandbox from per-worktree injection (which never loaded) into the runner agent's frontmatter hooks, where every worker subagent inherits it. Two adjustments the precursors mandate:

- Enforce the write allowlist only for writes whose path is inside a worktree (`.claude/worktrees/agent-*`), so the runner's own main-repo writes (specs, STATUS) are not blocked. The hook can discriminate on the file path it already receives.
- Source the touch list from the main repo, not the worktree (which never sees the uncommitted list). The runner writes the active phase plus its rendered touch list to a fixed main-repo path; the hook reads from there rather than from `git rev-parse --show-toplevel` (which resolves to the worktree). Env vars do not work here because the active phase changes per spawn and cannot be re-exported into a long-running session's hooks.

**Detection (defense in depth): a deterministic post-worker gate.** Extend `phase-diff.sh` to compare changed files against the touch list and emit `out_of_scope=<comma-list>`. The runner treats a non-empty value as an automatic remediation trigger (same path as over-budget). Today scope violations are caught only by the runner's ad-hoc reasoning, which is exactly what failed silently in run-2 before the crash.

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
- [ ] `supervise-run.sh` exists: launches, restarts on crash with a cap, writes NOTIFY on give-up.
- [ ] Stale-watchdog kills + restarts on composite-signal staleness; dry-run verified against a simulated hang.
- [ ] Per-operation wall-clock cap wired into worker dispatch.
- [ ] Token harvest from transcript at subagent boundaries; `LOG/subagent-tokens.jsonl` populated in a dry run.
- [ ] `phase-diff.sh` emits `out_of_scope`; runner remediates on non-empty.
- [ ] `templates/spec-author.md` carries the house-style constraints.
- [ ] All existing preflight gates still green (tsc, vitest, smoke).

When met, cut `m4.5-run-3` from `m4.5-preflight` and launch under the supervisor.

## What run-3 should produce that run-2 could not

A run that survives transport blips and reaches multiple phases: the first real exercise of `phase-verify.sh`, `integrate-phase.sh`, council review, and remediation; a granular per-subagent token ledger; and a second data point on spec-authoring variance now that the template carries constraints.
