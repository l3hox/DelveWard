# RUN1-FEEDBACK.md

Structured post-mortem of the first autonomous-run attempt of M4.5. Run launched at 2026-05-27 09:22 UTC, killed manually at ~11:30 UTC after the API budget exhausted. The runner is preserved on branch `m4.5-run-1` as a study artifact; phase worktree branches (`m4.5-A2`, `m4.5-A4`) preserve the workers' output.

## Summary of progress

| Phase | Status | Evidence |
|---|---|---|
| A1 | done (basis) | tag `m4.5-A1-done` not created; `STATUS.md` marks done from basis |
| A2 | **done, integrated** | tag `m4.5-A2-done`, commit `a1be55b` on `m4.5-run-1`, `LOG/A2.md` written |
| A4 | partial | worker output committed on branch `m4.5-A4` as `9a6f674`; council Round 1 mid-flight when killed |
| A3, A5, A7, A6 | pending | dependency on A4 (and A6 also gated) |

A2 went through the full loop end to end: spec authored, ArchitectReviewer review, worker execution, verification suite, DeveloperCouncil review, remediation cycle (1 attempt — council found something), re-verify, integrate via `integrate-phase.sh`. The architecture works.

A4 made it through spec authoring, ArchitectReviewer review, worker execution (huge output: gameState.ts split into worldState/combatState/inventoryState/statusState, +2801/-2668 lines across 7 files), and into the DeveloperCouncil Round 1 dispatch. The last 5 tool calls of the runner were `SendMessage` to council-dev / council-qa / council-arch followed by a `Read` of STATUS.md. The API budget hit zero shortly after; the runner went silent.

## What worked

1. **Pre-flight passed cleanly.** No surprises with worktree state, branch lineage, gh auth, or any of the 14 checklist items.
2. **Self-fix on pre-existing test typecheck errors.** The runner observed that `itemDatabase.test.ts` and `enemyTypes.test.ts` failed `tsc` because Node types are missing. It chose to fix the tsconfig directly on `m4.5-run-1` (commit `6f55e2a`) rather than fail. Independent decision; arguably correct.
3. **Spec authoring produced quality output.** A2-spec.md (325 lines) and A4-spec.md (297 lines) both have every required template section, real Before anchors, concrete After signatures, numbered Steps, explicit Budget and DO NOT lists. They are not minimal placeholder specs.
4. **Worker contract was respected.** The A2 worker produced 99 / 44 lines across exactly the spec's touch list, within the spec's `Budget: ≤ 80 net, ≤ 7 files` constraint. The A4 worker produced a +133 net (within the spec's `≤ +300 net` cap) across exactly the spec's touch list.
5. **Verification gates ran.** 16 build/tsc calls, 5 vitest calls, 5 smoke calls, 3 hook-test calls — the runner ran each gate multiple times per phase as expected.
6. **Council review fired correctly.** Spawned 3 specialists per phase with the right `team_name: "dev-council"` shape, sent shutdown requests, called `TeamDelete` after teardown. The A2 council found something that triggered remediation (one round, fixed).
7. **`integrate-phase.sh` worked end to end.** A2 went from worktree → ff-merge → tag → `LOG/A2.md`. The log entry format is exactly what we designed.
8. **Touch list rendering worked.** Sealed specs were correctly translated into `scope/A2.touch.txt` and `scope/A4.touch.txt` for the PreToolUse hook.

## What broke

1. **STATUS.md heartbeat barely updated.** Across 2 h 12 min of runtime, only 5 STATUS.md writes happened (initial + 4 atomic-tmp updates). Heartbeat advanced 09:22 → 10:30 once and then froze. Per the runner agent prompt, heartbeat should advance every iteration and every 30 s of in-iteration work.
2. **Stats undercounted spawns by 60%.** STATUS.md ended with `agents_spawned: 6` and by-role sum of 8. The transcript shows **15 actual Agent-tool spawns**. The runner stopped maintaining stats after the first few spawns.
3. **Token bookkeeping never advanced.** `total_tokens: 0` and `estimated_usd: 0.00` throughout. The runner never read `usage.total_tokens` from any spawn return value, despite the prompt explicitly telling it to.
4. **`LOG/` was sparse.** Only `LOG/A2.md` was written (by `integrate-phase.sh`). The runner itself never appended to logs for spec authoring, council review, or remediation events, despite the audit-trail format in PLAN.md.
5. **Specs and STATUS.md updates were never committed.** When the runner died, A2-spec.md, A4-spec.md, the modified STATUS.md, the populated scope/ files, and LOG/A2.md were all uncommitted on `m4.5-run-1`. They would have been lost on the next branch switch. (This post-mortem committed them.)
6. **`teammateMode: "tmux"` did not produce separate iTerm2 panes.** With `agent-name`/`agent-setting` events in the transcript but no separate `claude` processes visible in `ps`, it appears Agent-tool subagents ran in-process. This contradicted my expectation but is consistent with how the Agent tool actually behaves for isolated worker spawns. May or may not be a real defect — needs investigation.
7. **`-p` print mode in `launch-run.sh` silenced the runner's TUI.** Caught and noted live; visibility had to come from tailing the session JSONL.
8. **The cumulative spend budget check (`if MAX_USD > 0 ...`) is untested.** MAX_USD=0 for run-1 meant the check was skipped entirely. We don't know yet whether the formula would have fired correctly with a positive cap.

## Tool-call distribution

From the runner's session transcript (1005 events, 248 tool calls):

| Tool | Calls |
|---|---|
| Bash | 144 |
| Read | 39 |
| Edit | 19 |
| Agent | 15 |
| Write | 9 |
| SendMessage | 9 |
| ToolSearch | 4 |
| TeamDelete | 4 |
| TeamCreate | 3 |
| Skill | 2 |

Bash breakdown by category:

| Category | Count |
|---|---|
| other (awk/sed/jq/misc) | 58 |
| read/grep | 48 |
| build/tsc | 16 |
| smoke | 5 |
| vitest | 5 |
| status-update | 5 |
| hook-test | 3 |
| fs-setup | 3 |
| integrate-phase | 1 |

The runner spent a substantial fraction of its turns on inspection (read/grep + other = 106 calls, 74% of Bash). That's expected — orchestration is mostly inspection — but it's a useful baseline for cost projection.

## Agent spawns (15 total)

| Subagent type | Spawns | Purpose |
|---|---|---|
| SystemArchitect | 4 | 2× spec authoring (A2, A4) + 2× council member |
| ArchitectReviewer | 4 | Spec review (with remediation rounds) |
| RefactoringSpecialist | 3 | 1 A2 worker + 1 A2 remediation + 1 A4 worker |
| SoftwareDeveloper | 2 | 2× council member |
| QaTester | 2 | 2× council member |

The runner's mental categorization in STATUS.md (`spec_author`, `spec_review`, `phase_worker`, `phase_remediation`, `council`) maps to the 15 spawns as: 2 / 4 / 2 / 1 / 6. Recorded: 1 / 2 / 1 / 1 / 3. Roughly half of every category was lost.

## Bugs in the runner agent prompt

These are diagnoses, not yet fixes. Candidate remediations in §Candidate fixes.

| Symptom | Probable cause |
|---|---|
| Heartbeat freezes after first few iterations | Heartbeat instruction is buried in prompt prose; LLM stops doing it once the "real work" cognitive load is high |
| Stats undercount | Same as above — bookkeeping instructions are imperatives in prose, not enforced by the tool call shape |
| Token totals stuck at 0 | The "read `usage.total_tokens` from spawn return" instruction requires reading the structured return value, parsing it, and persisting — three steps that need to happen every single time but are easy to skip |
| Specs not committed | Runner's loop body doesn't include a "commit study artifacts" step. The integrate-phase.sh script commits worker outputs but not the surrounding artifacts (specs, status, scope) |
| Tsconfig fix outside phase scope | Not necessarily a bug — runner was within its mandate to "ensure pre-flight gates pass". But it edited a project-wide file outside any phase. Worth deciding the policy for run 2 |

## Worker output quality

**A2** (integrated, commit `a1be55b`): +55 net lines across 7 files (within budget +80). The actual refactor moves `EnemyInstance` / `EnemyAIState` types into `src/core/entityTypes.ts` and adds an optional injection point in `GameState`'s constructor. `core/` is closer to standalone but the change is conservative.

**A4** (captured as study artifact, commit `9a6f674`): +133 net lines, but **5,469 lines of churn** (2801 added, 2668 deleted). `gameState.ts` shrunk by ~2884 lines; the missing logic moved into `worldState.ts` (1849 new), `statusState.ts` (288), `inventoryState.ts` (246), `combatState.ts` (50). This is the bulk of the gameState split. The output is within the spec's net-line cap. It has not been verified (no vitest / smoke run after this commit was killed before integration).

A4's worker output is therefore a candidate to **harvest** rather than rerun. The next run could either re-execute A4 from scratch on a fresh branch (the lab-pure approach) or treat `9a6f674` as a reference patch and verify it manually.

## Cost observations

We do not have token counts (the runner never recorded them in STATUS.md). Rough back-of-envelope:

- 15 subagent spawns averaging ~20-50 K tokens per (SystemArchitect, Worker, Council members are heavier; Reviewer is lighter): ~300-750 K.
- Main session: 248 tool calls + LLM turns between them. Likely 0.5-1.5 M tokens.
- Estimated session total: 1-2 M tokens, roughly $5-15 at Sonnet rates.

The 5-hour quota was burned by both this session (monitoring + design) and the runner. Most of the burn was probably the runner; the monitor cron contributed but each fire was a small report.

## Where the runner was when killed

Last 5 tool calls:

1. `ToolSearch` — loading a tool (possibly `SendMessage` for the council protocol)
2. `SendMessage` → council-dev — Round 1 findings request for A4
3. `SendMessage` → council-qa — Round 1 findings request for A4
4. `SendMessage` → council-arch — Round 1 findings request for A4
5. `Read` STATUS.md

The runner was prompting the A4 council members to produce Round 1 findings. The council members had been spawned a minute earlier but had not yet returned. Quota ran out during their work.

## Candidate fixes for `m4.5-preflight` before cutting `m4.5-run-2`

### Critical (the run-1 bugs that would repeat as-is)

- **Move bookkeeping out of the runner's prose into mechanical guarantees.** Three options to discuss:
  1. A PostToolUse hook that fires after every Agent spawn and writes the spawn + token counts directly to STATUS.md. The runner never sees the bookkeeping.
  2. A wrapper script the runner calls instead of the Agent tool directly. The wrapper updates stats then invokes the real Agent.
  3. Periodic forced heartbeat via a scheduled task (cron / ScheduleWakeup) that pings the runner to refresh STATUS.md every 5 min.
- **Make integrate-phase.sh commit the spec + scope file + STATUS.md** along with the worker output, so study artifacts are preserved on every phase integration without runner discipline.
- **Pre-fix the `tsc` test-file errors on `m4.5-preflight`** (proper Node types in `itemDatabase.test.ts` and `enemyTypes.test.ts`) so the runner doesn't have to make an ad-hoc fix during pre-flight.

### High

- **Remove `-p` from `launch-run.sh`** so the user sees the runner's TUI live in the second pane. (My oversight in run-1.)
- **Decide A4's fate**: harvest `9a6f674` as a reference patch and skip re-execution, or treat A4 as fresh in run-2 and let the runner produce its own (possibly different) split. The lab-pure answer is fresh; the cost answer is harvest. The user decides.
- **Add `.worktrees/` and `.claude/scheduled_tasks.lock` to `.gitignore`** so they don't show up in `git status` and tempt accidental adds.

### Medium

- **Expand `LOG/A{N}.md` to be appended at every loop transition**, not just at integrate-phase.sh time. Spec-author, spec-sealed, worker-spawned, council-findings, remediation-attempt-N — all should land as one-line entries with timestamps.
- **Smoke test should also write its own log entry** to the phase log so we know it ran and what the p95 was.
- **Worker prompt should include an explicit "do not commit, do not push, return the JSON contract"** reminder (the worker template has it but the runner's worker prompt construction may have lost it).

### Low / observational

- The runner went 1 hour between heartbeat updates (09:27 → 10:30) but was actively working in the transcript. The dead time isn't real; the prompt just stopped updating. Confirms the heartbeat is purely an instruction-following problem.
- The Bash "other" category at 58 calls is opaque. Worth a second analysis pass to categorize those — they may reveal systematic patterns (e.g. lots of `jq` calls for parsing JSON) that could be tooling targets.

## Open questions for the design pass

1. Should the runner BE the orchestrator, or should an external script loop and the runner is just a phase executor? Mechanizing the bookkeeping (PostToolUse hook, wrapper) leans toward the first; reliability might lean toward the second.
2. Should phase specs be **committed to `m4.5-preflight`** before launching a run, or stay in-loop authoring? In-loop gives flexibility per run; committed gives reproducibility across runs. We tried in-loop; the cost is that the spec is lost if the run dies before integration.
3. Should the A2 council remediation cycle have a per-cycle log? Useful for understanding what kinds of findings get auto-fixed.
4. `MAX_USD` budget — what's a realistic per-run cap based on this data? Probably $10-30 for a full M4.5 (5-6 phases including remediation).
5. Are there other quality gates we should add before A4 lands? The +133 net is fine, but the +2884 churn in `gameState.ts` deserves a sanity check we don't currently have.

## Tag and branch state

- `m4.5-start` — at `720a80b` on `m4.5-run-1`
- `m4.5-A2-done` — at `a1be55b` on `m4.5-run-1`
- `m4.5-run-1` — keeps everything from this run; never deleted
- `m4.5-A2` — worker branch, retained; commit `a1be55b` is the same as the integration
- `m4.5-A4` — worker branch, retained; commit `9a6f674` is the captured uncommitted output
- `m4.5-preflight` — basis branch, unchanged since run-1 was cut

## Closing

Run-1 produced one real refactor (A2), one half-real refactor (A4), and a lot of observability data about how the runner actually behaves under load. The architecture works; the runner's self-discipline doesn't. The next run should mechanize the bookkeeping rather than rely on the LLM to follow prose instructions consistently across 2+ hours.
