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

**Fix landed:** `launch-run.sh` now wraps the run in a keep-awake lock for its whole lifetime: `caffeinate -ims` on macOS, `systemd-inhibit --what=sleep:idle` on Linux, nothing if neither exists (a server that never idle-sleeps). Recommended additionally: run on AC power. This removes the *sleep* trigger but not the general class of transport drops (see Candidate fixes).

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

## Liveness and telemetry: what signal would have caught this

Reconstructed from the runner's session JSONL (285 timestamped events). The question: is any telemetry channel a reliable "the runner is alive and progressing" signal? Answer: not on its own, and the reason is structural.

**Every parent-side channel froze at the same instant.** The last real activity was 20:23:52 (an assistant turn ending "Let me run the diff script"). The next event is the socket error at 21:28:25. So across the 64.5-minute death window: the STATUS.md heartbeat (last tool call 20:23:16), the JSONL mtime (last event 20:23:52), and the token counter (cache-read frozen at 126,753) all stopped within 36 seconds of each other. No parent channel was meaningfully earlier than the heartbeat.

**The subagent blind spot is the core problem.** While a subagent runs, the parent session emits *zero* events to its own transcript. Evidence: the A2 worker ran from 20:11:21 (Agent tool_use) to 20:20:48 (its tool_result) with no parent events in between, a legitimate 9.4-minute silence. Heartbeat, parent-JSONL mtime, and token usage all freeze identically during a normal subagent as during a hang. None of them can tell "deep in a 9-minute worker" apart from "dead."

Consequences for a liveness design:

| Signal | Advances on | Blind during | Verdict |
|---|---|---|---|
| STATUS.md heartbeat | parent tool call | subagent exec, long reasoning, hung API | weak |
| Parent JSONL mtime | any parent event | subagent exec, hung API | same blind spots as heartbeat |
| Parent token usage | per parent turn | subagent exec, hung API | same again |
| Worktree file mtime | worker writing files | only when no worker is active | the missing worker-liveness signal |
| Process liveness (`ps`) | always | a hung process still looks alive | detects exit, not hang |

The robust design is not a better single channel but a **composite staleness watchdog plus a per-operation wall-clock cap**: declare stalled when nothing across {parent transcript, active worktree files} advances for longer than the longest legitimate operation, and hard-cap any single subagent or API call. Run-2 also shows the watchdog must *act*, not just observe: the hung request did not self-surface an error for 65 minutes, and the monitor that did see the stale heartbeat had no mandate to intervene.

Token telemetry specifically: usage is present on every parent turn (input≈1, the rest cache-read), so a live reader *could* track per-turn deltas, but it inherits the same subagent blind spot. This confirms the decision to keep token totals as a post-hoc `run-stats.sh` artifact rather than a live signal.

## Alpha hypotheses: how they held

Alpha (run-2) was a designed experiment, not just another run. Scoring its hypotheses against the evidence:

| Hypothesis (from ALPHA-SCOPE) | Verdict | Evidence |
|---|---|---|
| Bookkeeping mechanization fixes run-1's heartbeat/stats drift | **validated** | Spawn count exact: STATUS recorded 3 with correct by-role split, vs run-1's prose approach losing ~60%. Heartbeat fired on every tool call until the hang. The hook owns it reliably. |
| PostToolUse hook receives `<usage>` token data | **failed (answer: no)** | `total_tokens` stayed 0. The hook fires and gets tool_name + tool_input (so spawn counting works) but no tool_result carrying the `<usage>` trailer. The "verify first" precursor was deferred, not run; the defensive both-paths hook meant the run still worked via post-hoc tokens. β must read tokens from the transcript. |
| Thin-script offloading reduces context/cost | **largely untested** | Only `phase-diff.sh` ran (once). `phase-verify.sh`, `integrate-phase.sh`, `run-stats.sh`, `a6-gate.sh` never executed; the run died before any verification gate. The mechanism we wanted to validate barely ran. |
| Slim runner prompt doesn't break behavior | **partial pass** | The runner authored + sealed the spec, ran the worker, and crucially did not trust the worker's self-reported PASS, catching three violations independently. That core behavior survived the slimming. Short run limits confidence. |
| Token/cost drop (47M→10-15M, $22→$5-8) | **inconclusive** | 12.96M / $6.50 lands in the predicted range, but run-2 reached only A2 where run-1 reached A2+A4. Not apples-to-apples; the saving owes more to the slim prompt and early death than to thin scripts. Cache-read share identical (97%). |
| A2 spec re-authoring is reproducible | **failed (answer: no)** | Run-2's fresh spec mandated the *existing* `types.ts` and a module-level factory; run-1's spec allowed a *new* `entityTypes.ts` and constructor injection. The worker's near-identical output passed run-1 and was flagged as three violations in run-2. Authoring variance is large enough to flip pass/fail. |

The last row is the most consequential for β: in-loop spec authoring is non-deterministic enough to change outcomes, so β needs either spec stabilization (house-style constraints, worked examples in the authoring prompt) or a human seal before workers run.

## Candidate fixes for the run system

Diagnoses, ordered by leverage. Not yet implemented beyond the caffeinate patch.

1. **Crash resilience is the priority.** A long autonomous run will hit transient API drops. Options: an external supervisor (shell loop or launchd job) that restarts `claude --resume` or re-launches from `STATUS.md` on non-zero exit; or in-runner retry around the API boundary. The caffeinate patch removes the *sleep* trigger but not the general class of transport failures.
2. **A liveness signal independent of the runner.** The PostToolUse heartbeat cannot detect a hung or crashed runner. A supervisor that checks process liveness plus session-JSONL mtime, and writes `NOTIFY` on crash, would close the silent-death gap.
3. **Make the analyzer the source of truth for tokens.** The live hook cannot see `<usage>`. Stop trying to populate `total_tokens` live; have the runner (or a wrap-up step) run `run-stats.sh` against its own session at integrate-time, or accept that token totals are a post-hoc artifact only.
4. **Correct the worktree-path assumption.** Either parse the actual path from the Agent return, or stop assuming `.worktrees/m4.5-A{N}` in cleanup logic.
