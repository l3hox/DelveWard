# RUN2-FEEDBACK.md

Structured post-mortem of the second autonomous-run attempt of M4.5. Run launched ~2026-05-27 21:55 local (19:55:47Z), died 2026-05-27 23:28 local (21:28:25Z) after ~92 minutes of active work. The runner is preserved on branch `m4.5-run-2`; the A2 worker's output is preserved as tag `run-2-A2-wip`.

## Summary of progress

| Phase | Status | Evidence |
|---|---|---|
| A1 | done (basis) | `STATUS.md` marks done from basis |
| A2 | **worker ran, verification caught violations, died before remediation** | sealed `A2-spec.md`, worker output `run-2-A2-wip`, no `m4.5-A2-done` tag |
| A4, A3, A5, A7, A6 | never reached | depend on A2 |

Run-2 progressed less far than run-1, which integrated A2 cleanly. The difference is the cause of death: run-1 exhausted its API budget at A4; run-2 died at A2 for an infrastructure reason unrelated to the run logic.

## Root cause: the Mac idle-slept and severed the API socket

The runner crashed with `API Error: The socket connection was closed unexpectedly`. The power log confirms the machine idle-slept:

- The laptop was on **battery** (not AC), where `pmset` shows an aggressive idle-sleep timer (`sleep 1`).
- A `caffeinate` assertion that covered earlier work **died at 20:07 local** (`PID 96933(caffeinate) ClientDied`). Nothing held the run awake afterward.
- macOS idle-sleep keys on **user (HID) inactivity**, not CPU or network load. A busy `claude` process does not prevent it without a power assertion, and the CLI holds none.
- The crash aligns with a **65-minute quiet stretch**: the last parent-runner tool call was 22:23 local, then no HID or output until the socket error surfaced at 23:28 local. The idle timer fired, the system slept, TCP was torn down, and the in-flight request died.

The session ended on that error. The CLI process did **not** exit: it lingered as a zombie (PID 6930) for ~9 h 53 m until killed during this post-mortem.

**Fix landed:** `launch-run.sh` now wraps the run in `caffeinate -ims` when available, holding the no-idle-sleep / no-disk-sleep / no-system-sleep-on-AC assertion for the lifetime of the run. Recommended additionally: run on AC power.

## What worked

1. **The verification gate caught a worker that lied.** The A2 worker (RefactoringSpecialist) self-reported PASS. The runner's independent driver-side check flagged three real deviations from the sealed spec before trusting it. This is the single most important validation of the design: "never trust worker self-report" paid off on its first real test.
2. **In-loop spec authoring + review fired.** SystemArchitect authored `A2-spec.md`, ArchitectReviewer reviewed, and the spec was sealed at 20:10:53Z with the `<!-- sealed -->` marker. The seal mechanism works.
3. **Worktree isolation worked.** The A2 worker ran in an isolated worktree; its output never polluted the run branch.
4. **The post-hoc analyzer recovered token costs the live hook could not.** `run-stats.sh` extracted exact per-subagent token counts from the session JSONL even though `STATUS.md` recorded zero.

## What broke

1. **A transport error is silently fatal.** There is no auto-resume and no supervision. One API socket drop ends the entire run with no recovery path.
2. **The crash wrote no NOTIFY.** Terminal-state detection relies on the runner writing `DONE`/`STALL`/`BLOCKED` to `NOTIFY`. An unhandled transport error bypasses that path entirely, so external monitors saw only a frozen heartbeat with no terminal signal for nine hours.
3. **Heartbeat is useless as a liveness signal during long gaps.** It only advances on parent-runner tool calls. The 65-minute gap before the crash had no heartbeat update despite the runner being alive and working. A monitor cannot distinguish "deep in a long subagent" from "dead."
4. **Token bookkeeping still reads zero live.** `STATUS.md` ended with `total_tokens: 0`. The PostToolUse hook still does not receive the `<usage>` trailer in its runtime stdin payload, confirming the deferred α risk. The trailer *is* present in the session JSONL (the analyzer reads it), so the gap is specifically the live hook's input, not the data.
5. **The zombie process did not exit on session-end-by-error.** It held the worktree lock and a process slot for hours.
6. **The worker worktree landed at `.claude/worktrees/agent-<id>`, not `.worktrees/m4.5-A2`.** The Agent tool's `isolation: "worktree"` chooses its own path. The runner's planned cleanup (`git worktree remove .worktrees/m4.5-A{N}`) would not have matched.

## Cost (exact, from run-stats.sh)

Total **$8.16** over 92.6 minutes: $6.50 runner main + $1.66 for three subagents.

| Component | Tokens | Notes |
|---|---|---|
| Main session (orchestrator) | 12,960,328 | 97% cache-read (12.56M); 164 turns, 104 tool calls |
| RefactoringSpecialist (A2 worker) | 108,074 | 75 tools, 567 s |
| SystemArchitect (A2 spec author) | 55,171 | 43 tools, 192 s |
| ArchitectReviewer (A2 spec review) | 43,898 | 17 tools, 67 s |

The cache-read dominance matches run-1: cumulative orchestrator context, replayed on every turn, is the spend, not the work. Run-2 was cheaper than run-1 only because it died earlier.

## Tool-call distribution (main session)

| Tool | Calls |
|---|---|
| Bash | 82 |
| Read | 15 |
| Edit | 3 |
| Agent | 3 |
| Write | 1 |

## Worker output quality and a spec-consistency finding

The A2 worker output (`run-2-A2-wip`, +76 / -45 across seven files) deviated from its sealed spec three ways:

- Created a **new file** `src/core/entityTypes.ts`. The spec said move the types into the **existing** `src/core/types.ts`.
- Modified `src/enemies/enemyAI.test.ts`, which is **not in the scope touch list**.
- Used **constructor injection**. The spec mandated a **module-level `registerEnemyCreator` factory**.

The notable finding: run-1's A2 worker did **the same things** (new `entityTypes.ts`, constructor injection) and run-1 integrated it cleanly. The difference is the spec. Each run re-authors the A2 spec from scratch (the lab-purity decision), and run-2's spec happened to be stricter and more prescriptive than run-1's, reclassifying the worker's natural approach as violations.

This is a real property of in-loop spec authoring: it is non-deterministic, and spec strictness varies run to run. The same worker behavior can pass one run and fail the next. Worth deciding whether spec authoring should be constrained toward a house style, or whether this variance is acceptable lab signal.

## Candidate fixes for the run system

Diagnoses, ordered by leverage. Not yet implemented beyond the caffeinate patch.

1. **Crash resilience is the priority.** A long autonomous run will hit transient API drops. Options: an external supervisor (shell loop or launchd job) that restarts `claude --resume` or re-launches from `STATUS.md` on non-zero exit; or in-runner retry around the API boundary. The caffeinate patch removes the *sleep* trigger but not the general class of transport failures.
2. **A liveness signal independent of the runner.** The PostToolUse heartbeat cannot detect a hung or crashed runner. A supervisor that checks process liveness plus session-JSONL mtime, and writes `NOTIFY` on crash, would close the silent-death gap.
3. **Make the analyzer the source of truth for tokens.** The live hook cannot see `<usage>`. Stop trying to populate `total_tokens` live; have the runner (or a wrap-up step) run `run-stats.sh` against its own session at integrate-time, or accept that token totals are a post-hoc artifact only.
4. **Correct the worktree-path assumption.** Either parse the actual path from the Agent return, or stop assuming `.worktrees/m4.5-A{N}` in cleanup logic.
