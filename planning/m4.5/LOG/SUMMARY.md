# M4.5 Run-4 Summary

## Outcome

Run completed successfully. Phase A2 integrated onto `m4.5-run-4`.

## Phases

| Phase | Status | Notes |
|---|---|---|
| A1 | done (pre-run) | Refresh ARCHITECTURE.md — completed on m4.5-preflight |
| A2 | done | Invert core/ → enemies/, npcs/ deps — integrated this run |
| A3 | skipped | Extract per-frame systems from main.ts — out of scope for run-4 |
| A4 | skipped | Split gameState.ts behind facade — out of scope for run-4 |
| A5 | skipped | Consolidate save-state sources — out of scope for run-4 |
| A6 | skipped | EntityKind registry — gated, not run |
| A7 | skipped | Pull controller logic into core/ — out of scope for run-4 |

Run-4 was intentionally scoped to A2 only (attended live gate, per commit 0724c6f).

## A2 What Changed

8 files, +98 / -35 lines net:
- `src/core/typeRegistries.ts` (new): IEnemyRegistry + INpcRegistry seam with noop defaults
- `src/core/entities.ts`: EnemyInstance + EnemyAIState moved here from enemies/
- `src/core/gameState.ts`: removed 4 cross-layer imports; call sites use registry
- `src/core/assetCheck.ts`: uses getEnemyRegistry().getAllEnemySpritePaths()
- `src/enemies/enemyTypes.ts`: removed definitions, re-export from core; registration side-effect
- `src/npcs/npcDatabase.ts`: registration side-effect at bottom
- `src/core/combat.test.ts`: side-effect import to trigger registration with mocked DB
- `src/enemies/enemyAI.test.ts`: side-effect import to trigger registration with mocked DB

## Verification

All gates green: vitest (778 tests), tsc, build, smoke, goldens.

## System Learning

Two infrastructure gaps discovered and fixed during this run:

1. **phase-verify.sh tsconfig.test.json handling**: The test tsconfig was added to the
   run branch after the fork point from main. Worktrees based on merge-base(run,main)
   don't have it. Fixed: skip tsc:test gracefully when tsconfig.test.json is absent.

2. **Remediation worker needs explicit worktree isolation**: The remediation worker was
   spawned without `isolation:"worktree"` and edited the main repo instead of the
   worktree. Fixed manually (copied changes to worktree, restored main repo).
   Future: always pass worktree path explicitly in the remediation prompt, or spawn
   with isolation.

3. **Touch list expansion for remediation**: combat.test.ts and enemyAI.test.ts were
   not in the initial touch list (spec gap — the spec's mock seam analysis missed
   transitive consumers of GameState that don't import enemyTypes). The runner
   expanded the touch list as a runtime decision before spawning the remediation worker.

## Agents Spawned

SystemArchitect (spec author), ArchitectReviewer (spec review),
RefactoringSpecialist x2 (worker + remediation), SoftwareDeveloper (council),
QaTester (council). 6 total.

## Cost

~$14 (main session tokens, blended rate).

## Tags

m4.5-start → m4.5-A2-done
