# Alpha scope: what lands on `m4.5-preflight` before cutting `m4.5-run-2`

## Goal

Validate the bookkeeping mechanization (PostToolUse hook) and the thin-script offloading (phase-verify.sh, phase-diff.sh) on the existing runner architecture. Produce one more concrete data point before redesigning to production shape (β).

This is **not** the redesign. It's a deliberate intermediate step that fixes the specific bugs we observed in run-1 while keeping the agent-based architecture intact. Cheap, learns something, validates assumptions that the β spec depends on.

## Resolved decisions

Decisions captured before implementation begins. All four resolved on 2026-05-27.

| # | Question | Decision |
|---|---|---|
| 1 | Carry A2-spec.md forward from `m4.5-run-1` to `m4.5-preflight`, or re-author from scratch? | **Re-author from scratch.** Lab-pure. Tests whether spec authoring is reproducible across model versions. |
| 2 | How to handle the unknown about PostToolUse hooks receiving `<usage>` token data? | **Verify first, then build.** A tiny test confirms the hook input shape before committing to the design. If `<usage>` is delivered, the hook handles tokens; if not, fall back to post-hoc tokens (heartbeat and spawn count still work). |
| 3 | How to fix the pre-existing tsc errors in `itemDatabase.test.ts` and `enemyTypes.test.ts`? | **Add `@types/node` properly.** Idiomatic: configure tsconfig types so browser code excludes node types but test files include them. |
| 4 | Do alpha (run-2) before beta bootstrap? | **Yes, alpha first.** Run-2 produces data that informs β (PostToolUse semantics, thin-script behavior). |

## Out of scope for alpha

- Replacing the autonomous-runner agent with an orchestrator. That's β.
- Building a GUI. That's β.
- Splitting the runner into per-step Claude invocations. That's β.
- Adding any new phases or scope. Alpha runs the same A2→A4→A3→A5→A7 ordering as run-1.
- Changing what `MAX_USD` means or adding live budget enforcement. We continue with the unlimited / post-hoc model for alpha.

## Changes to land on `m4.5-preflight`

Each item below is a discrete commit on `m4.5-preflight`.

### 1. PostToolUse hook for bookkeeping (preceded by a verification step)

**Verification step (precursor)**: before building the hook design that depends on parsing `<usage>` data, write a tiny PostToolUse hook that just echoes its stdin to a debug file and run one Agent-spawning interaction. Inspect the debug file: does the tool result for an Agent call include the `<usage>total_tokens: N tool_uses: M duration_ms: K</usage>` trailer?

- If **yes**: build the hook as designed below (heartbeat + spawn count + token total).
- If **no**: build the hook for heartbeat + spawn count only. Token totals come from `run-stats.sh` post-hoc, no hook-side parsing.

Path: `planning/m4.5/hooks/post-tool.sh`

A bash hook installed for the runner session (not the worker sessions — those keep their PreToolUse sandbox). Fires after every tool call. On stdin: tool name + tool input + tool result.

Responsibilities:

- Update `last_heartbeat_at` in STATUS.md on every fire (atomic write via `.tmp` + rename).
- If `tool_name == "Agent"`, increment `stats.by_role.<bucket>.spawned` and add tokens parsed from the `<usage>` trailer to `stats.by_role.<bucket>.tokens`. Buckets are inferred from `subagent_type`:
  - `SystemArchitect` invoked for spec authoring → `spec_author`
  - `SystemArchitect` invoked with `team_name: "dev-council"` → `council`
  - `ArchitectReviewer` → `spec_review`
  - `SoftwareDeveloper` / `QaTester` → `council`
  - `RefactoringSpecialist` and other workers → `phase_worker` (or `phase_remediation` if name contains "remediation")
- Bucket inference rules live in the hook itself, in a clear case statement.

Self-tests at the bottom: fed a sample PostToolUse stdin, verify correct STATUS.md mutations.

Removes from the runner prompt: every line about "update STATUS.md.stats after every spawn" and "write last_heartbeat_at every iteration / 30 s." The runner stops trying to do this work.

Wire into the launch path: append a `PostToolUse` entry to the launching session's settings.local.json or wherever the runner agent reads hooks from. Verify Claude Code's hook semantics actually deliver tool results to PostToolUse hooks (the runner can't update bookkeeping if the hook input lacks the data).

**Risk to verify first**: confirm via a tiny test that PostToolUse hook input on Agent calls includes the `<usage>` trailer text. If it doesn't, token counts come from the post-hoc analyzer only and the hook handles spawn counts + heartbeat.

### 2. Thin verification script: `phase-verify.sh`

Path: `planning/m4.5/scripts/phase-verify.sh`

Usage: `phase-verify.sh A2 .worktrees/m4.5-A2`

Runs the full verification suite **in the worktree** and writes detailed logs to disk. Emits **exactly one line** on stdout:

```
VERIFY phase=A2 vitest=green tsc=green build=green smoke=green goldens=green log=planning/m4.5/LOG/A2-verify.log
```

or on failure:

```
VERIFY phase=A2 vitest=red tsc=green build=green smoke=skip goldens=skip log=planning/m4.5/LOG/A2-verify.log
```

The runner reads only the one line. If anything is red or skipped, it reads the log file on demand (one Read call, scoped, instead of streaming through 5+ multi-thousand-line Bash outputs).

Exit code: 0 if all green, 1 otherwise. The runner can branch on exit code without parsing the line.

### 3. Thin diff computation: `phase-diff.sh`

Path: `planning/m4.5/scripts/phase-diff.sh`

Usage: `phase-diff.sh A2 .worktrees/m4.5-A2 m4.5-A1-done`

Computes the diff stats against the base ref and emits one line:

```
DIFF phase=A2 files=7 lines_added=99 lines_removed=44 net=55 hash=70911262...d62951309bd patch=planning/m4.5/LOG/A2-diff.patch
```

The full diff is written to `planning/m4.5/LOG/A{N}-diff.patch`. The runner sees the summary. Council and remediation workers, if they need the diff, read the patch file directly — but its content never flows through the runner's context.

### 4. Slim runner agent prompt

Path: `.claude/agents/autonomous-runner.md`

Audit the prompt and remove every instruction now handled by the PostToolUse hook (bookkeeping, heartbeat) and every operational detail that can live in a referenced doc instead of the always-loaded prompt.

Specifically:

- Remove the `## Output Format` section's STATUS.md schema (live in STATUS.md itself and in the hook).
- Replace the loop body's `7. Worker returns / 8. Driver computes diff / 9. Verification` steps with single one-liners: `7. Run phase-diff.sh A{N} → parse one line. 8. Run phase-verify.sh A{N} → parse one line.`
- Move the audit-trail format example out of the prompt — the runner doesn't need it; integrate-phase.sh writes the log.
- Move the worker-selection-by-type table out — STATUS.md already has `worker_agent` per phase.
- Keep: configuration block, first-turn boot, loop control, decision points (remediation vs integrate vs stall), constraints.

Target: runner prompt under 150 lines, of which the operational core (the loop body) is under 60 lines.

### 5. Slim PLAN.md by moving detail into companions

Path: `planning/m4.5/PLAN.md` + new files

PLAN.md is ~600 lines today. Most of it is reference detail the runner doesn't read every turn. Restructure:

- Keep in PLAN.md: framing, phase ordering, top-level shape (loop pseudocode), one-paragraph descriptions of each safety hatch.
- Move out to companion files (the runner reads them only when relevant):
  - Audit-trail format → `planning/m4.5/AUDIT-TRAIL.md`
  - Spec template body → already separate; just reference
  - Verification gate details → already in scripts now; reference the scripts
  - Worker contract (forbidden actions etc.) → already in `templates/worker.md`; reference
  - Safety hatches table → keep header in PLAN.md, move table to `planning/m4.5/SAFETY-HATCHES.md`

Target: PLAN.md under 250 lines.

### 6. A2 spec: re-author each run (decided)

Per the resolved decisions table above: **no carryforward.** Run-2's runner authors `A2-spec.md` fresh. Tests whether spec authoring is reproducible across model versions and produces a fair comparison baseline against run-1. Cost: ~$5-10 extra; value: another data point on spec authoring reliability.

No action required for this item — it's the default behavior. Just confirm that no `A2-spec.md` is staged on `m4.5-preflight` before launching run-2.

### 7. Pre-fix the `tsc` test-file errors on preflight — add `@types/node` properly

Edit `tsconfig.json` so `npx tsc --noEmit` is green on `m4.5-preflight`. Run-1's runner made an ad-hoc fix itself (commit `6f55e2a` on `m4.5-run-1`, also cherry-picked to `main` as `cd8cad5`). Doing the idiomatic fix on preflight upstream means run-2 starts with a clean tsc gate and the runner doesn't have to invent anything.

Specific fix (per resolved decision): add `@types/node` to `devDependencies`. Configure the tsconfig types array so browser source excludes node types but test files include them. Either:

- A single tsconfig with `types: ["node", "vitest"]` and an explicit narrow `lib`, OR
- Two configs: `tsconfig.json` for production browser code, `tsconfig.test.json` for tests with node types.

The two-config approach is cleaner if vite's build picks up the production config and vitest picks up the test config separately. Decide on the precise shape during implementation.

### 8. Gitignore hygiene

Add to `.gitignore`:

```
.worktrees/
.claude/scheduled_tasks.lock
```

Both showed up as untracked all session and risked accidental commits.

### 9. Remove `-p` from `launch-run.sh`

Drop the `-p` flag. The runner launches in interactive TUI mode. Visibility in the second pane is free. No need for the JSONL tail script.

### 10. Wire run-end stats with post-hoc analyzer

Add `planning/m4.5/scripts/run-stats.sh` that takes a session JSONL path and emits a structured stats summary (the v2 analyzer from `/tmp/analyze-run-v2.py`, productionalized into the repo). When a run ends or is killed, the user runs this to capture the actual tokens / costs. The output goes into `LOG/SUMMARY.md` as the final entry.

## Acceptance criteria for "preflight ready for run-2"

- [ ] `.claude/agents/autonomous-runner.md` under 150 lines, no bookkeeping prose.
- [ ] `planning/m4.5/hooks/post-tool.sh` exists, executable, self-tests green.
- [ ] PostToolUse hook wired so it actually fires for runner sessions (verified via a small test).
- [ ] `planning/m4.5/scripts/phase-verify.sh` and `phase-diff.sh` exist, executable, dry-run-green on a sample worktree.
- [ ] `planning/m4.5/scripts/run-stats.sh` exists, executable, produces clean output on the run-1 JSONL.
- [ ] PLAN.md under 250 lines; companion docs created.
- [ ] A2-spec.md decision applied (carryforward or not).
- [ ] `tsc --noEmit` green on preflight without runner intervention.
- [ ] `.gitignore` updated.
- [ ] `launch-run.sh` no longer uses `-p`.
- [ ] Smoke green on preflight (`node planning/m4.5/scripts/smoke.mjs`).
- [ ] All unit tests green on preflight.

When all of these are met, cut `m4.5-run-2` and launch.

## Expected outcomes from run-2

If alpha works:

- Runner main session drops from 47M tokens to ~10-15M (3-4× reduction). Cost from $22 to $5-8.
- Stats and heartbeat actually update mechanically. We can see whether the bookkeeping prose was the only problem, or whether the runner has other reliability issues.
- The thin scripts validate that offloading actually works in this context (PostToolUse hook gets the data, the runner can act on one-line summaries, etc.).
- A4 worker output is reproduced (or differs in interesting ways from run-1's `9a6f674`).

If alpha doesn't work:

- We learn which assumptions in β need revisiting.
- Specifically: if PostToolUse hooks don't get `<usage>` data, β's event bus design needs to extract tokens from the transcript directly.
- If the thin scripts are awkward to integrate into the runner's loop, β's per-step subprocess model needs to be the answer instead.

Either way, alpha is a learning sprint. The data informs β.

## Estimated effort

- 1 session of focused work to land all changes on `m4.5-preflight`.
- 1 session to launch `m4.5-run-2` and observe.
- Post-mortem similar to RUN1-FEEDBACK.md afterwards.

## Risks specific to alpha

- **PostToolUse hooks may not receive `<usage>` data.** If true, token bookkeeping has to wait for β anyway. Heartbeat and spawn counts still work.
- **The runner's prompt has implicit dependencies on the bookkeeping prose.** Removing those instructions may surface other behaviors that were stable because of them. Watch for "the runner forgot to do X" patterns in run-2 logs.
- **Thin scripts increase the surface area of "things that can break on preflight."** A bug in `phase-verify.sh` looks like a verification failure from the runner's perspective. Hygiene: scripts must have aggressive self-tests and clear stderr.
- **Spec carryforward (item 6 option A)** subtly changes what we're validating. Run-2 with the A2 spec carried forward doesn't tell us whether the spec-authoring step would have worked again. That's fine — we already know it did once. β can re-validate if needed.
