# Safety hatches

Companion to `PLAN.md` §Safety hatches. The autonomous run never hard-halts: it resumes wherever possible and ends only when every phase is `done`, `skipped`, or `blocked-by-X`.

## Recoverable conditions

| Condition | Action |
|---|---|
| Pre-flight fails (dirty tree, wrong branch, branch drift) | Driver attempts to clean: stash to `m4.5-preflight-stash`, checkout `RUN_BRANCH`, fetch + rebase. One attempt; if still failing, mark the run `blocked` in STATUS.md and notify. |
| Worktree locked or orphaned | `git worktree prune`; if still locked, force-remove the worktree, delete the WIP branch, log and skip the affected phase to revisit. |
| Disk < 2 GB | Notify and pause (`ScheduleWakeup` with a long delay); resume when free space recovers. |
| Phase stalls (no-progress detector) | Log STALL, mark transitively dependent phases `blocked-by-A{N}`, skip to next viable phase, revisit at end with a fresh worker. |
| Verification suite fails after all remediation attempts | Same as stall. |
| Council findings persist after all remediation attempts | Same as stall. |
| Hook (`hooks/sandbox.sh`) fails self-test or fails to load | Refuse to spawn the worker. Mark the phase blocked with reason `no-sandbox`. The hook is the only worker-level enforcement layer (see `PLAN.md` §Empirical verification gate). |
| A commit lands that breaks `npm test` on a subsequent phase's pre-check | `git reset --hard m4.5-A{N-1}-done` on a side branch (not `git revert`), re-queue the affected phase as `pending`, revisit at end of run. |
| Driver crashes (API auth, disk full, etc.) | On user restart, driver reads STATUS.md and reconciles: HEAD must equal the last done-tag, no dirty worktrees outside an in-progress phase. If reconciliation fails, the run is `blocked` and notifies. |
| Post-stall integrity audit fails | Mark the run `blocked` and notify. This is the closest thing to a hard halt and only triggers on evidence of worker compromise. |
| `gh auth` fails | Notify, persist a `PENDING_PUSH` flag in STATUS.md, exit. User re-authenticates and re-launches. |

## Stricter resume gates

On any driver restart, before processing STATUS.md:

- `git rev-parse m4.5-start` succeeds.
- HEAD on the current branch equals the tag of the last phase recorded `done` in STATUS.md.
- `git worktree list` matches: an in-progress phase has its worktree; any worktree for a phase recorded `done` was removed (drift = recovery attempt).
- `last_heartbeat_at` in STATUS.md is older than 60 seconds (otherwise another driver may be live; refuse to start a second).
- `m4.5-start` tag exists and is reachable from HEAD.

## Stall teardown

When a phase stalls:

1. Send `shutdown_request` to the worker.
2. After acknowledgement: `git worktree remove --force .worktrees/m4.5-A{N}`.
3. Delete the worktree branch (`m4.5-A{N}`) and any `m4.5-A{N}-wip` tags.
4. Append the STALL entry to `LOG/A{N}.md` with the final `(diff-hash, failing-check-signature)`.
5. Mark transitively dependent phases `blocked-by-A{N}`.
6. Continue with the next viable phase.

## Post-stall integrity audit

After each STALL or SKIPPED transition, the driver runs:

- `git diff m4.5-start..HEAD --stat` and asserts every changed path is in the union of all phase touch lists.
- `git log m4.5-start..HEAD --name-only` searched for any path under `.git/`, `.github/`, `~/`, or `node_modules/`.
- Gitleaks secret scan (`gitleaks detect --source . --no-banner --redact`) on the diff.

Any of these failing escalates to the `Post-stall integrity audit fails` row above.

## Secret-scrub of LOG files

Before any LOG file is included in a commit (LOG files are tracked), the driver pipes them through a regex filter that masks anything matching common token patterns (`gh[opusr]_[A-Za-z0-9]{36,}`, `ghp_[A-Za-z0-9]{36,}`, AWS access keys, `Bearer [A-Za-z0-9._-]+`, etc.). Masked tokens are replaced with `<REDACTED>`.

## Atomic rewind points

- `m4.5-start` tag is created before the loop begins.
- `m4.5-A{N}-done` after each successful phase.
- Whole run can be rewound to `m4.5-start` atomically.
