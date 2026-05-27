# Audit trail format

Companion to `PLAN.md`. Documents the on-disk format of per-phase and per-run logs.

## `planning/m4.5/LOG/A{N}.md`

Append-only. One line per transition. `integrate-phase.sh` writes a fixed sequence; the runner may append additional entries for spec authoring, council findings, remediation attempts.

```
2026-05-26 14:02  start         spec=A2-spec.md base=m4.5-start budget=$2.50
2026-05-26 14:02  anchors       3/3 matched
2026-05-26 14:11  worker-done   driver-diff=+184 -267 files=9 worker-reported=ignored
2026-05-26 14:11  budget        files=9/12 lines_net=-83/-50  WITHIN
2026-05-26 14:13  verify        vitest=green tsc=green build=green smoke=green goldens=green
2026-05-26 14:14  council       critical=0 high=2 medium=4 low=7
2026-05-26 14:14  remediate     attempt=1 feedback=high-x2
2026-05-26 14:21  verify        vitest=green tsc=green build=green smoke=green goldens=green
2026-05-26 14:22  council       critical=0 high=0 medium=2 low=5
2026-05-26 14:22  integrate     ff-merge m4.5-A2 -> RUN_BRANCH
2026-05-26 14:22  commit        a4b5c6d  "refactor: invert core/ deps to enemies, npcs"
2026-05-26 14:22  spend         phase=$1.83 cumulative=$1.83
2026-05-26 14:22  done
```

Columns: `<UTC timestamp>  <event>  <fields>`. Two-space separator between columns. Field syntax is `key=value`, space-separated.

## `planning/m4.5/LOG/SUMMARY.md`

Written at the end of the run by the runner.

```
Run: m4.5-start (a76b8c5) -> HEAD (z9y8x7w)
Phases:
  A2  done      attempts=2  spend=$1.83
  A4  done      attempts=1  spend=$3.42
  A3  done      attempts=3  spend=$5.71
  A5  done      attempts=2  spend=$2.95
  A7  done      attempts=1  spend=$2.10
  A6  skipped   reason="switch-site count=1 (threshold 3)"
Total spend: $16.01
Integrity: clean
Run branch: m4.5-run-2 (preserved as study artifact; merge to RUN_BASE_BRANCH manually if desired)
```

Use `planning/m4.5/scripts/run-stats.sh <session.jsonl>` for the post-hoc token/cost breakdown that informs the spend column.

## `planning/m4.5/NOTIFY`

Single-line sentinel, truncated on each write. Watched by external observers (user's tmux pane, status line, etc.).

Format: `<STATE> <phase?> <reason?>`

```
DONE
STALL A4 oscillation
BLOCKED budget-exceeded
BLOCKED missing-config RUN_BRANCH
BLOCKED on-main
BLOCKED no-sandbox A3
BLOCKED bad-spec A5
```

The runner also dispatches each payload via the `PushNotification` tool (graceful no-op if the tool isn't bound for the session).
