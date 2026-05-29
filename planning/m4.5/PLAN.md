# M4.5 — Autonomous Architecture Cleanup Run

## Framing: this is a laboratory

The primary deliverable of M4.5 is **the autonomous-run system itself**, not the architectural cleanup of DelveWard. The refactor is the test workload; the loop, hook, templates, agents, scripts, and gates are the product. Whatever lands here is intended to be **generalized and extracted** for use on other projects.

There is no expectation that the first N runs succeed. The expectation is that each failed run sharpens the system.

### Branch discipline

- The driver and all worker agents operate on a **throwaway branch only**. Never on `main`.
- `m4.5-preflight` is the **iteration basis**. It holds the plan, scripts, hooks, templates, goldens, and any framework-level changes. Plan revisions land here.
- For each autonomous-run attempt, a new branch is cut from `m4.5-preflight`:

    ```
    git checkout m4.5-preflight
    git checkout -b m4.5-run-N
    ```

- After the run, the user inspects results and decides whether to **keep** (queue for merge back) or **iterate** (leave the run as a study artifact, fix what went wrong on `m4.5-preflight`, cut a fresh `m4.5-run-N+1`).
- **No run branch is ever deleted.** Each `m4.5-run-N` is preserved indefinitely as a record of what the system did at that iteration.
- `main` is only touched once the user is satisfied with both the autonomous-run system AND the resulting refactor.

### Generalization stance

Prefer parameterized inputs over hardcoded DelveWard references wherever the cost is similar. The eventual extraction creates a standalone tool; M4.5 is its first end-to-end test, not its specification. DelveWard-specific bindings live in clearly-marked configuration blocks at the top of each artifact, not scattered through prose.

---

## Companion docs

| File | Role |
|---|---|
| `PLAN.md` (this file) | High-level loop, decisions, phase ordering, pre-flight |
| `STATUS.md` | Live run state (heartbeat, stats, phase progress) |
| `ALPHA-SCOPE.md` | What lands on `m4.5-preflight` before run-2 |
| `BETA-ARCHITECTURE.md` | Production-ready Python orchestrator design |
| `SAFETY-HATCHES.md` | Recoverable-condition table + resume gates + stall teardown |
| `AUDIT-TRAIL.md` | Format of `LOG/A{N}.md`, `LOG/SUMMARY.md`, `NOTIFY` |
| `VERIFY-MODE.md` | Citation that subagent `mode` is overridden under parent bypass |
| `RUN1-FEEDBACK.md` | Post-mortem of run-1 |
| `templates/spec-author.md` | Prompt for SystemArchitect when authoring a phase spec |
| `templates/worker.md` | Prompt for the worker executing a sealed spec |
| `templates/council.md` | Prompt for DeveloperCouncil per-phase review |
| `templates/remediation.md` | Prompt for retry workers |
| `hooks/sandbox.sh` | PreToolUse hook for workers (write-path allowlist + command deny-list) |
| `hooks/post-tool.py` | PostToolUse hook for runner (heartbeat + stats bookkeeping) |
| `scripts/phase-verify.sh` | Verification gate runner (vitest, tsc, build, smoke, goldens) |
| `scripts/phase-diff.sh` | Driver-computed diff stats + content hash |
| `scripts/integrate-phase.sh` | Atomic 3-way patch-apply onto run HEAD + tag + log |
| `scripts/a6-gate.sh` | A6 queue/skip decision based on switch-site grep |
| `scripts/launch-run.sh` | Convenience launcher for the runner |
| `scripts/run-stats.sh` | Post-hoc transcript analyzer |
| `scripts/smoke.mjs` | Playwright smoke driver |
| `runner-settings.json` | Loaded via `--settings`; PreToolUse sandbox + native deny-list, inherited by worker subagents |
| `goldens/*.json` | Save-fixture and level-init baselines |

---

## Empirical verification gate

Per-spawn `mode` is **overridden** when the parent runs under `--dangerously-skip-permissions`. See `VERIFY-MODE.md`. The PreToolUse hook at `hooks/sandbox.sh` is the **only** worker-level enforcement layer; it is inherited by worker subagents from the runner session via `--settings runner-settings.json` (verified: `--settings` hooks reach `isolation:"worktree"` subagents). The native deny-list in `runner-settings.json` is the backup.

---

## Shape

The driver is the `autonomous-runner` agent at `.claude/agents/autonomous-runner.md`. It owns the loop. The full loop spec is in the agent prompt; this section is the high-level pseudocode.

```
boot:
    read PLAN.md, STATUS.md
    verify branch state (RUN_BRANCH != main, RUN_BASE_BRANCH ancestor)
    run pre-flight checklist
    tag m4.5-start

loop (per phase, dependency-ordered):
    1. reconcile  (worktree prune, disk guard, HEAD-tag check)
    2. pick next pending phase (deps all done)
    3. budget guard (if MAX_USD > 0)
    4. author spec if missing (SystemArchitect + ArchitectReviewer + seal)
       A6 special case: run a6-gate.sh first; "skip" -> mark skipped
    5. spawn worker (Agent tool, isolation: worktree, PreToolUse sandbox active)
    6. compute diff      via scripts/phase-diff.sh   -> 1-line DIFF result
    7. verify            via scripts/phase-verify.sh -> 1-line VERIFY result
    8. council review    via Skill tool (DeveloperCouncil)
    9. if any gate failed OR council critical/high:
         spawn remediation worker (up to 10 attempts, no-progress detector)
         on stall: log STALL, mark transitively-dependent phases blocked
    10. on clean:
          run scripts/integrate-phase.sh A{N}  (3-way apply patch onto run HEAD + tag + log)
          remove worktree
          mark phase done in STATUS.md
    11. sleep briefly (ScheduleWakeup); re-enter

wrap-up:
    run post-run integrity audit (see SAFETY-HATCHES.md)
    write LOG/SUMMARY.md (use run-stats.sh for token totals)
    write DONE to NOTIFY
    exit  (do NOT push; user merges manually if keeping the run)
```

**Bookkeeping is mechanical.** The PostToolUse hook (`hooks/post-tool.sh`) writes `STATUS.md.last_heartbeat_at` on every tool call and bumps `stats.by_role.<bucket>.{spawned,tokens}` on every Agent spawn. The runner does not write these fields itself.

---

## Decisions

1. **Spec authoring**: A2…A7 specs are authored in-loop by `SystemArchitect`. A6 is conditional (gated by `a6-gate.sh`); the others are unconditional.
2. **Spec review**: each spec gets a single-pass review by `ArchitectReviewer`. Critical/high findings folded in before sealing.
3. **Post-phase review**: full `DeveloperCouncil` runs against every phase's computed diff. Critical/high auto-remediate; medium/low log only.
4. **Push policy**: the runner never pushes. The user merges keepers back to `RUN_BASE_BRANCH` manually after inspection.
5. **Halt policy**: never halt. See `SAFETY-HATCHES.md` for recovery rules.
6. **Worktree-per-phase**: Agent `isolation:"worktree"` at `.claude/worktrees/agent-<id>`, based on `merge-base(run, main)` (the fork point, not run HEAD — ADR-M45-0024). Diff against the worktree's own base; integrate by 3-way-applying the scope-verified patch onto run HEAD.
7. **Observability**: `STATUS.md` is the source of truth (live). `LOG/A{N}.md` is the audit trail. `NOTIFY` is the sentinel for terminal events. `run-stats.sh` is the post-hoc analyzer.

---

## Phase ordering

```
A1  Refresh ARCHITECTURE.md                       done (basis)
A2  Invert core/ -> enemies/, npcs/ deps          next
A4  Split gameState.ts behind facade
A3  Extract per-frame systems from main.ts
A5  Consolidate save-state sources
A7  Pull controller logic into core/
A6  EntityKind registry                           gate-decided after A3+A4
```

Rationale:

- A2 first because A4 needs `core/` to compile standalone.
- A4 before A3 because A3 extracts systems that read `gameState`; the facade must be stable.
- **A2↔A4 coupling**: `gameState.ts` is both the file A4 splits and the file A2 inverts imports in. A4's spec must require preserving A2's inverted import direction in every split fragment.
- A5 after A3/A4 because save seams cross both layers.
- A7 last among the required set; depends on extracted systems being in place.

### A6 gating

`scripts/a6-gate.sh` counts `switch (entity.type|kind)` and `case '<entity_type>':` sites across `src/core/gameState.ts`, `src/level/levelLoader.ts`, `src/level/interaction.ts`, `src/main.ts`. If total switch-sites ≥ 3, A6 is queued; otherwise marked `skipped`.

If A6 is skipped, ARCHITECTURE.md §Architectural Debt item #5 (entity dispatch fan-out) survives. The skip-reason explicitly notes this so M5 knows what was left.

---

## Spec template

Every phase spec follows the template prompt at `templates/spec-author.md`. The worker has zero design freedom; the spec is the design. Required sections: Goal, `Scope: touch`, `Scope: don't touch`, Before (with line-anchored quotes), After, Steps, Accept, Budget, DO NOT, Rollback signal.

---

## Auto-remediation loop

When verification fails or DeveloperCouncil reports critical/high findings:

1. Collect failure log + council findings into a structured `feedback` block.
2. Spawn a remediation worker via `templates/remediation.md` in the same worktree with: spec path, current diff, feedback. Prompt opens with "fix only the listed issues; do not redesign or expand scope."
3. Re-run `phase-diff.sh`, `phase-verify.sh`, and the council on the updated diff.
4. Repeat up to **10 attempts**.

### No-progress detector

After every attempt, record `(diff-hash, failing-check-signature)` pair. Stall when any of:

- 5 consecutive attempts produce the same pair.
- 5 consecutive attempts produce a diff smaller than 5 lines net.
- The same pair has appeared anywhere in the last 6 attempts.
- The attempt counter reaches 10.

On stall: log STALL in `LOG/A{N}.md`, write the phase id to `NOTIFY`, mark transitively-dependent phases `blocked-by-A{N}`, continue with the next viable phase. Stalled phases are revisited at the end of the run with a fresh worker.

---

## Verification gates

Encapsulated in `scripts/phase-verify.sh`. Runs `vitest`, `tsc` (browser + test), `vite build`, `smoke.mjs`, golden checks. Emits one structured line:

```
VERIFY phase=A2 vitest=green tsc=green build=green smoke=green goldens=green log=planning/m4.5/LOG/A2-verify.log
```

Plus driver-side guards before integration:

- **Test count monotonic** against the baseline in `STATUS.md.baseline.test_count`.
- **Test-file SHA gate**: modifications to `*.test.ts` outside the active phase's `Scope: touch` trigger remediation.
- **Assertion-density floor**: `rg -c 'expect\(' src/**/*.test.ts` total must not decrease.

---

## Anti-creativity controls

1. Worker prompt opens with "execute spec verbatim; do not redesign."
2. **Budget gates** computed from `phase-diff.sh` (driver-side). Over budget → remediation. Worker-reported numbers are audit-only.
3. **Public API guard**: `git diff <base>..HEAD -- src/core/*.ts | grep '^-export'` must equal the spec's `After` removals.
4. **DeveloperCouncil** on every diff before commit.
5. **PreToolUse hook** (`hooks/sandbox.sh`) gates write paths + dangerous commands pre-execution.
6. `max_turns: 40` ceiling per worker invocation.

---

## Notification & heartbeat

- **Heartbeat**: PostToolUse hook updates `STATUS.md.last_heartbeat_at` on every tool call. External monitors flag stale (>60s).
- **NOTIFY**: see `AUDIT-TRAIL.md`. Single-line sentinel for terminal events.
- **PushNotification**: every NOTIFY-worthy event also dispatched via the `PushNotification` tool.

---

## Safety hatches

See `SAFETY-HATCHES.md` for the recoverable-condition table, stricter resume gates, stall teardown, post-stall integrity audit, secret-scrub, and atomic rewind points.

---

## Worker selection

| Phase | Agent type | Notes |
|---|---|---|
| A2 | `RefactoringSpecialist` | Pure dependency inversion. |
| A4 | `RefactoringSpecialist` | Splits + facade. Must preserve A2's inverted imports. |
| A3 | `RefactoringSpecialist` | Multi-system extraction. |
| A5 | `SoftwareDeveloper` | Save-format consolidation; spec includes goldens update. |
| A7 | `RefactoringSpecialist` | Pulling logic across module boundaries. |
| A6 | `SystemArchitect` (authoring), then `RefactoringSpecialist` (execution) | Only if the gate trips. |

All workers spawned with `isolation: "worktree"`, `team_name: "m4.5"`, `mode: "default"` (overridden by parent bypass per `VERIFY-MODE.md`; PreToolUse hook is the real enforcement), `max_turns: 40`.

---

## Audit trail

See `AUDIT-TRAIL.md` for the format of `LOG/A{N}.md`, `LOG/SUMMARY.md`, and `NOTIFY`.

---

## Pre-flight checklist

The runner refuses to start unless all of these hold. Specs are authored in-loop, not pre-flight.

### Branch state

- [ ] Working tree clean (`git status --porcelain` empty).
- [ ] On `RUN_BRANCH`, with `RUN_BASE_BRANCH` as an ancestor.
- [ ] Not on `main`.
- [ ] `m4.5-start` tag does not already exist on this branch.

### Scaffolding artifacts

- [ ] `.claude/agents/autonomous-runner.md` exists.
- [ ] `hooks/sandbox.sh` (executable, self-test green), `hooks/post-tool.{sh,py}` (executable, `--self-test` green).
- [ ] `runner-settings.json` exists (PreToolUse sandbox + native deny-list, loaded via `--settings`).
- [ ] `scripts/*` all executable: push, phase-verify, phase-diff, integrate-phase, a6-gate, launch-run, run-stats.{sh,py}, smoke.mjs.
- [ ] `templates/*` all present: spec-author, worker, council, remediation.

### Goldens, fixtures, baselines

- [ ] `goldens/save-fixture.json` and `goldens/level-init.json` captured on `RUN_BASE_BRANCH`.
- [ ] `public/levels/fixture1.json` exists.

### Verifications green on the base branch

- [ ] `npm test` green.
- [ ] `npm run typecheck` green (browser + test tsconfigs).
- [ ] `npm run build` green.
- [ ] `node planning/m4.5/scripts/smoke.mjs` green.

### State and configuration

- [ ] `STATUS.md` exists with every phase in `pending` (except A1: `done`).
- [ ] `RUN_BASE_BRANCH`, `RUN_BRANCH` exported.
- [ ] `MAX_USD` exported (default `0`).
- [ ] `USD_PER_MTOKEN` exported if non-default (default `8`).
- [ ] `COUNCIL_DEPTH` exported (default `quick`).
- [ ] `VERIFY-MODE.md` exists.

---

## Launch command

Use `scripts/launch-run.sh`. It validates branch state and execs the runner agent.

```bash
RUN_BASE_BRANCH=m4.5-preflight \
RUN_BRANCH=m4.5-run-2 \
MAX_USD=0 \
COUNCIL_DEPTH=quick \
./planning/m4.5/scripts/launch-run.sh
```

`MAX_USD=0` runs unlimited (spend still tracked). The script refuses to launch on `main`.
