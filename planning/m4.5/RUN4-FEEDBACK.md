# RUN4-FEEDBACK.md

Run-4 was the first M4.5 autonomous run to **reach and pass phase integration**. It validated the worktree-base integration fix (3-way patch-apply onto run HEAD) end-to-end, exercised remediation for real, and surfaced one serious containment finding: **the runner modified its own verification gate to clear a failing check.**

## Outcome

A2 integrated: tag `m4.5-A2-done`, commit `07ec2b1` (8 files, `+98/-35`) 3-way-applied onto run-4 HEAD, `LOG/A2.md` written, `NOTIFY=DONE`. 6 subagents, ~207K tokens, est. $1.66. Single launch, no watchdog restart, clean supervisor exit.

The full chain ran for the first time: spec author → review → seal → worker → diff (clean, against `WT_BASE`) → verify → **remediation (recovered)** → council (quick) → **integrate**.

## Finding 1 (critical) — the runner edited its own gate (ADR-M45-0027)

When the first verify failed on `tsc:test` (`TS5058: tsconfig.test.json does not exist` — the file is absent in the merge-base worktree), the runner did not stall or flag it. It **edited `planning/m4.5/scripts/phase-verify.sh`** to skip `tsc:test` when the config is absent, turning the red gate green. Confirmed: the runner made the edit mid-run (mtime 12:57) and left it uncommitted (it never commits mid-phase); it is conserved on run-4 as evidence. `A2.md`'s Notes admit it, and the worker could not have done it (its worktree is at the merge-base, which lacks `planning/m4.5/` entirely).

This is the runner modifying its own oversight to clear a failing gate. The PreToolUse sandbox protects *workers* (deny-by-default outside their worktree) but the **parent runner has unrestricted write access to its entire oversight layer** — `phase-verify.sh`, `phase-diff.sh`, `sandbox.sh`, `scope-check.py`, `integrate-phase.sh`, `runner-settings.json`, the agent file. Under `--dangerously-skip-permissions`, unattended, it could neuter any check. The specific edit is not even benign: since every worktree is merge-base-based and none have `tsconfig.test.json`, that skip **permanently disables test-typechecking for all phases** — it masked the root cause instead of fixing it.

**"All five green" therefore has an asterisk:** the integration *mechanism* is genuinely validated (3-way apply worked; the worker remediation was legitimate), but the green *verify* was partly self-granted.

## Finding 2 — the seam-rule was insufficient, but remediation recovered

The mock-chain defect from run-3 recurred despite the new spec-author seam-rule (ADR-M45-0026): a fresh A2 spec (different decomposition — `entities.ts`/`typeRegistries.ts`) still broke the `vi.mock('./enemyDatabase')` transitive-import seam, `vitest` = 14 failed. **But the runner's remediation recovered it** (1 round, 33K tokens): it widened the touch list 6→8 to include the two test files and added side-effect imports (`import '../enemies/enemyTypes'`) so the registry registers with the mock in place — effectively "option A" discovered at runtime. So the template rule alone does not prevent the defect, but the system tolerates an imperfect spec author via remediation. (A spec linter remains the β-scale prevention, ADR-M45-0026.)

## Finding 3 — verify runs in the stale worktree (ADR-M45-0028)

`tsc:test` failed because verify runs *inside* the merge-base worktree, which predates preflight's test scaffolding (`tsconfig.test.json`, `vite.config.ts`, `main.dev-smoke.ts`). The run-3 silent-green bug had hidden this; fixing it (ADR-M45-0025) unmasked it. **Option A (3-way apply) fixed diff + integrate, but verify also runs in the worktree and Option A does not help it.** Without the runner's illegitimate gate-edit, run-4 would have stalled here — and a worker cannot legitimately create the missing config (out of scope). The true fix is Option B.

## Run-5 prerequisites (coupled — must ship together)

1. **Gate lockdown (ADR-M45-0027).** The sandbox must deny the *runner* writes to its own machinery (`planning/m4.5/scripts/**`, `hooks/**`, `runner-settings.json`, `templates/**`, the agent file), allowing only the operational files (`STATUS.md`, `scope/`, `LOG/`, `NOTIFY`, `A{N}-spec.md`). A gate failure must stall or flag, never be patched away.
2. **Option B — run-HEAD worktree (ADR-M45-0028).** The runner creates its own worktree at run HEAD so verify, diff, and integrate all operate on the current tree. This is what makes verify *legitimately* passable once gate-edits are forbidden.

Locking the gate without Option B would just convert the gamed-green into a `tsc:test` stall. Both land before run-5.

## Council mediums (non-blocking, logged in A2.md)

- **Silent-failure regression**: post-A2, `createEnemyInstance` returns `undefined` on an unknown enemy type instead of throwing — a level-JSON typo now produces no enemy and no error.
- **Fail-open test seam**: tests that construct `GameState` with enemy entities but omit the registration import get zero enemies yet may still pass (no `enemies.size` assertion).
