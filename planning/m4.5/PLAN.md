# M4.5 — Autonomous Architecture Cleanup Run

## Framing: this is a laboratory

The primary deliverable of M4.5 is **the autonomous-run system itself**, not the architectural cleanup of DelveWard. The refactor is the test workload; the loop, hook, templates, agents, scripts, and gates are the product. Whatever lands here is intended to be **generalized and extracted** for use on other projects.

There is no expectation that the first N runs succeed. The expectation is that each failed run sharpens the system.

### Branch discipline

- The driver and all worker agents operate on a **throwaway branch only**. Never on `main`.
- `m4.5-preflight` is the **iteration basis**. It holds the plan, scripts, hooks, templates, goldens, and any framework-level changes (like the DEV smoke API). Plan revisions land here.
- For each autonomous-run attempt, a new branch is cut from `m4.5-preflight`:

    ```
    git checkout m4.5-preflight
    git checkout -b m4.5-run-N
    # launch driver on m4.5-run-N
    ```

  The driver operates fully on `m4.5-run-N`. All worktrees, commits, tags, and logs land there.

- After the run, the user inspects results and decides:
    - **Keep**: queue for eventual merge back into `m4.5-preflight`, and from there ultimately to `main`.
    - **Scrap**: delete `m4.5-run-N`, iterate on `m4.5-preflight` to fix what went wrong, cut a fresh `m4.5-run-N+1`, try again.
- `main` is only touched once the user is satisfied with both the autonomous-run system AND the resulting refactor.

### Generalization stance

When authoring the driver agent, hook, templates, and scripts: prefer **parameterized inputs over hardcoded DelveWard references** wherever the cost is similar. The eventual extraction creates a standalone tool; M4.5 is its first end-to-end test, not its specification. Where DelveWard-specific assumptions are unavoidable (file paths, fixture names, milestone labels), keep them in clearly-marked configuration blocks at the top of each artifact, not scattered through prose.

---

## Operational plan

This document is the operational plan for running Milestone 4.5 (Architecture Cleanup) as one continuous autonomous session. The session is launched with `claude --dangerously-skip-permissions` and never asks the user for input. Decisions are made by the driver from the existing architecture, the phase specs, and the council verdicts already on file.

Companion files in this directory:

| File | Role |
|---|---|
| `PLAN.md` (this file) | The autonomous-run design |
| `STATUS.md` | Live phase-by-phase progress, written by the driver |
| `A{N}-spec.md` | One spec per phase. `A2`, `A3`, `A4`, `A5`, `A7` authored pre-flight. `A6` authored mid-run by SystemArchitect after A3 and A4 land. |
| `LOG/A{N}.md` | Per-phase audit log (diff stats, test deltas, remediation attempts, spend) |
| `LOG/SUMMARY.md` | End-of-run summary, written on exit |
| `goldens/save-fixture.json` | Byte-equal save-file golden, anchored at `m4.5-start` |
| `goldens/level-init.json` | Snapshot of entity list + grid state after fixture-level load |
| `hooks/sandbox.sh` | PreToolUse hook enforcing per-phase write allowlist + command deny-list |
| `scripts/push.sh` | Wrapper that hard-codes the only permitted push (`origin main`) |
| `scripts/smoke.mjs` | Playwright smoke driver that loads a fixture level and asserts no console errors |
| `NOTIFY` | Sentinel file the driver writes to signal a STALL or BLOCKED state |

---

## Empirical verification gate

The per-spawn `mode` parameter on the Agent tool is **overridden** when the parent runs under `--dangerously-skip-permissions`. See `planning/m4.5/VERIFY-MODE.md` for the citation. Consequence: the PreToolUse hook at `hooks/sandbox.sh` is the **only** worker-level enforcement layer. Treat it accordingly throughout this plan.

---

## Shape

A single **driver session** runs a self-pacing loop. Each iteration:

```
1. Reconcile
     git worktree prune
     fail loud on any locked ref under .git/worktrees/*/locked
     fail loud on < 2 GB free disk
     verify HEAD == last m4.5-A{N}-done tag (or m4.5-start if nothing done yet)

2. Pick next phase from STATUS.md
     skip phases marked done, skipped, or blocked-by-X
     stalled phases revisited at end of run with a fresh worker

3. Pre-spawn checks
     spec exists and is sealed
     "Before" anchors in the spec match the current HEAD (anchor verification)
     goldens are present
     cumulative spend < MAX_USD

4. Spawn worker
     Agent tool, subagent_type per §Worker selection
     isolation: "worktree" → .worktrees/m4.5-A{N}
     team_name: "m4.5"
     name: "m4.5-A{N}"
     mode: "default"  (see Empirical verification gate)
     PreToolUse hook from hooks/sandbox.sh active
     prompt: §Worker prompt template + spec contents

5. Worker returns; ignore worker-reported numbers

6. Driver computes its own diff
     git -C .worktrees/m4.5-A{N} diff --stat <base>..HEAD
     git -C .worktrees/m4.5-A{N} diff <base>..HEAD | sha256sum → diff-hash
     check budget gates against the computed diff

7. Verification suite (in the worktree)
     npx vitest run
     npx tsc --noEmit
     npm run build
     node planning/m4.5/scripts/smoke.mjs
     golden checks (save-fixture, level-init)

8. DeveloperCouncil review of the diff

9. If any check failed OR council found critical/high
     run auto-remediation loop (§Auto-remediation)

10. On clean
      integrate to main:
        git -C <repo> fetch origin
        git -C <repo> merge --ff-only refs/heads/m4.5-A{N}   (worktree branch)
        if FF fails: rebase the worktree branch on origin/main then retry
      commit lands on main; tag m4.5-A{N}-done
      update STATUS.md, append LOG/A{N}.md, advance

11. Sleep briefly via ScheduleWakeup (dynamic /loop) and re-enter
```

The push to `origin main` happens once at the very end of the run, via `scripts/push.sh`.

---

## Decisions

1. **Spec authoring**: A2, A3, A4, A5, A7 authored in a pre-flight pass before the autonomous run begins. A6 is authored mid-run by SystemArchitect after A3 and A4 land, based on observed fan-out (see §Phase ordering).
2. **Spec review**: Each spec gets a single-pass review by the `ArchitectReviewer` agent. Critical/high findings are folded in before the spec is sealed.
3. **Post-phase review**: Full DeveloperCouncil runs against every phase's computed diff. Critical and high findings auto-remediate; medium and low are logged.
4. **Push policy**: Commit after every phase. Push only once at the end of the run, via `scripts/push.sh`.
5. **Halt policy**: Never halt. On any setback, attempt recovery; if recovery fails, log and skip to the next viable phase. The run ends only when every phase is `done`, `skipped`, or `blocked-by-X`.
6. **Worktree-per-phase**: `.worktrees/m4.5-A{N}`. Integration to main is fast-forward only.
7. **Worker observability**: `teammateMode: "tmux"` so iTerm2 native panes appear for each worker.

---

## Phase ordering

```
A1  Refresh ARCHITECTURE.md                       done
A2  Invert core/ → enemies/, npcs/ deps           next
A4  Split gameState.ts behind facade
A3  Extract per-frame systems from main.ts
A5  Consolidate save-state sources
A7  Pull controller logic into core/
A6  EntityKind registry                           gate-decided after A3+A4
```

Rationale:

- A2 first because A4 needs `core/` to compile standalone.
- A4 before A3 because A3 extracts systems that read `gameState`; the facade must be stable.
- **A2↔A4 coupling note**: `gameState.ts` is both the file A4 splits and the file A2 inverts imports in. A4's spec explicitly requires preserving A2's inverted import direction in every split fragment; the spec review verifies this clause is present.
- A5 after A3/A4 because save seams cross both the new system modules and the gameState facade.
- A7 last among the required set because it depends on the extracted systems being in place.

### A6 gating

A6 was originally planned as stretch. The Architect council recommended elevating it to **required-if-needed**, because the cost of doing it during M5 (when new entity kinds for spells/ranged combat land) is strictly higher than now.

A6 gate is **measurable**: at the end of A4 (and again at the end of A3), the driver counts `switch (entity.type)` and `case '<entity_type>':` sites across `src/core/gameState.ts`, `src/level/levelLoader.ts`, `src/level/interaction.ts`, `src/main.ts`:

```bash
rg -c "switch \(.*\.(type|kind)\)" src/core/gameState.ts src/level/levelLoader.ts src/level/interaction.ts src/main.ts
rg -c "case '[a-z_]+':" src/core/gameState.ts src/level/levelLoader.ts src/level/interaction.ts src/main.ts
```

If the total switch-sites count is **≥ 3** across these four files, A6 is queued (SystemArchitect authors A6-spec mid-run; SoftwareDeveloper/RefactoringSpecialist executes it). Below 3, A6 is recorded as `skipped` with the measured count.

If A6 is skipped, ARCHITECTURE.md §Architectural Debt item #5 (entity dispatch fan-out) survives. The skip-reason explicitly notes this so M5 knows what was left.

---

## Spec template

Every phase spec follows this template. The worker has zero design freedom; the spec is the design.

```markdown
# A{N} — <title>

## Goal
One sentence.

## Scope: touch
Explicit list of files the worker may create or modify.

## Scope: don't touch
Explicit exclusion list.

## Before
Current shape with line anchors. Each anchor is a verbatim quote (≥ 3 lines)
of code currently in the file at a specified path. The driver greps each
anchor against HEAD before spawning the worker; a missing anchor blocks the
phase as pending-respec.

## After
Target shape with exact API signatures. The worker writes to match these.

## Steps
Numbered micro-moves. Each step is independently verifiable.

## Accept
- npx vitest run green
- npx tsc --noEmit green
- npm run build green
- Playwright smoke (scripts/smoke.mjs) green
- Save-file golden byte-equal
- Level-init golden equal
- Phase-specific assertions (e.g. "core/ has zero imports outside core/")

## Budget
- New files: ≤ N
- Net lines added: ≤ N
- Files touched: ≤ N
- Spend: ≤ $X (per-phase soft cap, hard cap is MAX_USD)

## DO NOT
Anti-patterns specific to this phase.

## Rollback signal
What aborts the phase and triggers a worktree discard.
```

---

## Worker contract

The worker is told to execute the spec verbatim and to return a **structured JSON summary** as its final output:

```json
{
  "files_changed": ["path/to/file1.ts", "path/to/file2.ts"],
  "files_added": ["path/to/new.ts"],
  "files_deleted": [],
  "lines_added": 184,
  "lines_removed": 267,
  "head_sha": "<commit sha or null if not committed by worker>",
  "notes": "free-form short summary"
}
```

The driver **ignores worker-reported numbers**. They are echoed into the audit log only. All budget gates and integrity checks run against `git diff --stat` and `sha256sum` computed by the driver against the worktree's base commit.

Forbidden actions listed explicitly in the worker prompt:

- No spawning sub-agents (no recursive teaming).
- No modifications to CI configuration, `.github/`, `package.json` scripts, or `vite.config.ts` unless the spec's `Scope: touch` lists them.
- No removal of existing tests; new tests may be added if and only if the spec's `Scope: touch` covers the test file.
- No `git push`, no `git remote`, no `git config`, no `gh auth *`.
- No commits authored by the worker. The driver commits.
- No `rm -rf`, no `find ... -delete`.
- No reading of `~/.ssh/**`, `~/.config/gh/**`, `~/.netrc`, `env`, `printenv`.

---

## Worker sandboxing

Two enforcement layers. Both are active for every worker spawn.

### Layer 1 — PreToolUse hook (`hooks/sandbox.sh`)

A bash hook installed for the worker session via `settings.local.json` in the worktree. The hook receives the tool call and the active phase id, and emits `{"decision":"block","reason":"..."}` for any of the following:

- `Edit` or `Write` against a path not in the active phase's `Scope: touch` allowlist.
- `Bash` matching any of: `git push`, `git remote *`, `git config *`, `gh auth *`, `rm -rf *`, `find * -delete`, `env`, `printenv`, `cat *~/.ssh/*`, `cat *~/.config/gh/*`, `cat *~/.netrc`.
- Any tool call when the cumulative phase spend exceeds the spec's per-phase soft cap (the driver pre-writes this cap to a per-phase guard file).

The hook lives at `planning/m4.5/hooks/sandbox.sh` and is referenced by absolute path from each worktree's `settings.local.json`.

### Layer 2 — `settings.local.json` deny-list

Per `planning/m4.5/VERIFY-MODE.md`, per-spawn `mode: "default"` is overridden by the parent's bypass and is therefore not a real safety net. The second layer is a static `permissions.deny` block in each worktree's `settings.local.json` that mirrors the hook's command deny-list:

```json
{
  "permissions": {
    "deny": [
      "Bash(git push:*)",
      "Bash(git remote:*)",
      "Bash(git config:*)",
      "Bash(gh auth:*)",
      "Bash(rm -rf:*)",
      "Bash(find:* -delete)",
      "Bash(env)",
      "Bash(printenv)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gh/**)",
      "Read(~/.netrc)"
    ]
  }
}
```

This is belt-and-braces. The hook does the dynamic checks (write-path allowlist derived from the active spec); the deny-list is static and survives if the hook process crashes or returns malformed JSON.

### Push wrapper (`scripts/push.sh`)

Only the driver pushes, and only via `scripts/push.sh`. The script hard-codes the only permitted push:

```bash
#!/bin/bash
set -euo pipefail
exec git push origin refs/heads/main:refs/heads/main "$@"
```

Raw `git push` is in the deny-list above; the driver invokes `scripts/push.sh` explicitly.

---

## Auto-remediation loop

When verification fails or the post-phase DeveloperCouncil reports critical/high findings:

1. Driver collects the failure log and council findings into a structured `feedback` block.
2. Driver spawns a **remediation worker** in the same worktree with three inputs: the original spec, the current diff, and the feedback block. Prompt opens with "fix only the listed issues; do not redesign or expand scope."
3. Re-run the full verification suite and re-run the council on the updated diff.
4. Repeat up to **10 remediation attempts** per phase.

### No-progress detector

After every remediation attempt, the driver records:

- The **failing-check signature** (sorted, deduped list of failing checks + first-line of each council critical/high finding).
- The **diff hash** (sha256 of `git diff <base>..HEAD`).

The phase is considered to have stalled when any of:

- 5 consecutive attempts produce the **same** `(diff-hash, failing-check-signature)` pair.
- 5 consecutive attempts produce a diff smaller than 5 lines net.
- The `(diff-hash, failing-check-signature)` pair has appeared **anywhere** in the last 6 attempts (catches 2-cycles and 3-cycles where remediation oscillates between two states).
- The attempt counter reaches 10.

On stall: log `STALL` in `LOG/A{N}.md`, write the phase id to `NOTIFY`, mark dependent phases `blocked-by-A{N}` (see §Transitive blocking), and continue with the next viable phase. Stalled phases are revisited at the end of the run with a fresh worker and the accumulated findings as input.

### Transitive blocking

When phase A{N} stalls, every downstream phase whose dependency chain includes A{N} is marked `blocked-by-A{N}` in STATUS.md, not just direct children. The dependency chain is the ordering in §Phase ordering. Concretely: if A2 stalls, then A4, A3, A5, A7 are all blocked; A6's gate cannot evaluate without A3/A4, so A6 is blocked too.

Blocked phases are not attempted. They are not the same as stalled phases.

---

## Verification gates

Every phase's `Accept` block invokes these gates. They are also run as the post-merge guard before advancing to the next phase.

### Unit + compile

- `npx vitest run` — exit 0, and:
  - **Test count monotonic**: `(count of ✓ in vitest output) ≥ baseline` where baseline is captured at `m4.5-start`.
  - **Test-file SHA gate**: `sha256sum src/**/*.test.ts` set must equal the baseline set, except for additions explicitly listed in the active phase's `Scope: touch`. Any modification to a test file outside the touch list triggers remediation.
  - **Assertion-density floor**: `rg -c 'expect\(' src/**/*.test.ts` total must not decrease from baseline.
- `npx tsc --noEmit` — exit 0.
- `npm run build` — exit 0.

### Playwright smoke (`scripts/smoke.mjs`)

Headless Playwright run:

1. `npm run dev` in the worktree on a free port.
2. Navigate to `http://localhost:<port>/?level=<fixture>` (fixture is a known-stable level, checked in).
3. Wait for `window.__delveward_ready === true` (a flag set by main.ts after first frame renders).
4. Drive scripted input: 6 forward steps, turn left, 3 strafe-right, open inventory, close, save to slot 1, load from slot 1.
5. Assert: zero `console.error`, zero `console.warn` (specific exemptions in an allowlist), frame budget under 25ms p95 over the run.
6. Exit 0 / non-zero.

The `window.__delveward_ready` hook is the only application-side change the smoke test depends on. It is added once during pre-flight and protected by a spec exception in every subsequent phase's `Scope: don't touch`.

### Golden anchors

Captured at `m4.5-start` and re-checked on every phase's accept gate.

- **Save-fixture golden** (`goldens/save-fixture.json`): load the fixture level, run a scripted sequence of moves and interactions identical to the smoke driver, then serialize via `saveSystem.buildSaveData()` and compare byte-equal to the checked-in baseline.
- **Level-init golden** (`goldens/level-init.json`): after loading the fixture level, snapshot the entity list (by `id`, sorted) and the grid contents per layer. Compare equal to baseline.

A phase that intentionally changes save format (A5) updates the goldens as part of its spec; the spec change is reviewed by the council and the new goldens are committed in the same phase as the schema change.

---

## Anti-creativity controls

Enforced in the driver, not just in the prompt.

1. Worker prompt opens with "execute spec verbatim; do not redesign."
2. **Budget gates** computed from `git diff --stat` (driver-side). New-files / net-lines / touched-files exceeding the spec budget trigger remediation with "exceeded budget" feedback. Worker-reported numbers are echoed for the audit log only.
3. **Public API guard**: `git diff <base>..HEAD -- src/core/*.ts | grep '^-export'` must equal the set of removals listed in the spec's `After` section. Surprise removals trigger remediation.
4. **Test count monotonic**, **test-file SHA**, **assertion-density floor** (see §Verification gates).
5. `DeveloperCouncil` runs on every diff before commit. Critical and high findings auto-remediate; medium and low are logged to `LOG/A{N}.md`.
6. The PreToolUse hook (§Worker sandboxing) gates write paths and dangerous commands pre-execution.
7. `max_turns` ceiling per worker invocation: 40.

---

## Notification & heartbeat

### Heartbeat

The driver writes the current UTC timestamp to `STATUS.md`'s top-level `last_heartbeat_at` field every 30 seconds. A user-side check (`stat -f %m planning/m4.5/STATUS.md`) distinguishes a long-running phase from a crashed driver.

### Notification

When the driver writes a `STALL`, `BLOCKED`, `SKIPPED`, or `DONE` event, it does two things:

1. Writes a one-line payload to `planning/m4.5/NOTIFY` (truncating prior content): `STALL A4 attempt=10 reason="oscillation detected"`.
2. Calls the `PushNotification` tool with the same payload (graceful no-op if the tool is not bound for the session).

The user's status line tails `NOTIFY` (one-line read). A non-empty file means attention is wanted.

---

## Safety hatches

The autonomous run does not hard-halt. It resumes wherever possible and ends only when every phase is `done`, `skipped`, or `blocked-by-X`.

| Condition | Action |
|---|---|
| Pre-flight fails (dirty tree, wrong branch, remote drift) | Driver attempts to clean: stash to `m4.5-preflight-stash`, checkout `main`, fetch + rebase. One attempt; if still failing, mark the run `blocked` in STATUS.md and notify. |
| Worktree locked or orphaned | `git worktree prune`; if still locked, force-remove the worktree, delete the WIP branch, log and skip the affected phase to revisit. |
| Disk < 2GB | Notify and pause (`ScheduleWakeup` with a long delay); resume when free space recovers. |
| Phase stalls (no-progress detector) | Log STALL, mark transitively dependent phases `blocked-by-A{N}`, skip to next viable phase, revisit at end with a fresh worker. |
| Verification suite fails after all remediation attempts | Same as stall. |
| Council findings persist after all remediation attempts | Same as stall. |
| Hook (`hooks/sandbox.sh`) fails self-test or fails to load | Refuse to spawn the worker. Mark the phase blocked with reason `no-sandbox`. The hook is the only worker-level enforcement layer (see §Empirical verification gate). |
| A commit lands that breaks `npm test` on a subsequent phase's pre-check | `git reset --hard m4.5-A{N-1}-done` on a side branch (not `git revert`), re-queue the affected phase as `pending`, revisit at end of run. |
| Driver crashes (API auth, disk full, etc.) | On user restart, driver reads STATUS.md and reconciles: HEAD must equal the last done-tag, no dirty worktrees outside an in-progress phase. If reconciliation fails, the run is `blocked` and notifies. |
| Post-stall integrity audit fails | If `git diff m4.5-start..HEAD` shows changes outside the union of all phase touch lists, or any modification under `.git/` / `.github/`, or any secret-scan hit: mark the run `blocked` and notify. This is the closest thing to a hard halt and only triggers on evidence of worker compromise. |
| `gh auth status` fails at end-of-run push | Notify, persist a `PENDING_PUSH` flag in STATUS.md, exit. User runs `gh auth login` and re-launches; driver re-detects the flag and pushes. |

### Stricter resume gates

On any driver restart, before processing STATUS.md:

- `git rev-parse m4.5-start` succeeds.
- HEAD on `main` equals the tag of the last phase recorded `done` in STATUS.md.
- `git worktree list` matches: an in-progress phase has its worktree; any worktree for a phase recorded `done` was removed (drift = recovery attempt).
- `last_heartbeat_at` in STATUS.md is older than 60 seconds (otherwise another driver may be live; refuse to start a second).
- `m4.5-start` tag exists and is reachable from HEAD.

### Stall teardown

When a phase stalls:

1. Send `shutdown_request` to the worker.
2. After acknowledgement: `git worktree remove --force .worktrees/m4.5-A{N}`.
3. Delete the worktree branch (`m4.5-A{N}`) and any `m4.5-A{N}-wip` tags.
4. Append the STALL entry to `LOG/A{N}.md` with the final `(diff-hash, failing-check-signature)`.
5. Mark transitively dependent phases `blocked-by-A{N}`.
6. Continue with the next viable phase.

### Post-stall integrity audit

After each STALL or SKIPPED transition, the driver runs:

- `git diff m4.5-start..HEAD --stat` and asserts every changed path is in the union of all phase touch lists.
- `git log m4.5-start..HEAD --name-only` searched for any path under `.git/`, `.github/`, `~/`, or `node_modules/`.
- Gitleaks secret scan (`gitleaks detect --source . --no-banner --redact`) on the diff.

Any of these failing escalates to the `Post-stall integrity audit fails` row above.

### Secret-scrub of LOG files

Before any LOG file is included in a commit (LOG files are tracked), the driver pipes them through a regex filter that masks anything matching common token patterns (`gh[opusr]_[A-Za-z0-9]{36,}`, `ghp_[A-Za-z0-9]{36,}`, AWS access keys, `Bearer [A-Za-z0-9._-]+`, etc.). Masked tokens are replaced with `<REDACTED>`.

### Atomic rewind points

- `m4.5-start` tag is created before the loop begins.
- `m4.5-A{N}-done` after each successful phase.
- Whole run can be rewound to `m4.5-start` atomically.

---

## Worker selection

| Phase | Agent type | Notes |
|---|---|---|
| A2 | `RefactoringSpecialist` | Pure dependency inversion. |
| A4 | `RefactoringSpecialist` | Splits and facade construction. Must preserve A2's inverted imports in every split fragment. |
| A3 | `RefactoringSpecialist` | Multi-system extraction. |
| A5 | `SoftwareDeveloper` | Save-format consolidation. Spec includes a goldens update step. |
| A7 | `RefactoringSpecialist` | Pulling logic across module boundaries. |
| A6 | `SystemArchitect` (spec authoring), then `RefactoringSpecialist` (execution) | Only if the gate trips. |

All workers spawned with `isolation: "worktree"`, `team_name: "m4.5"`, `mode: "default"`, the PreToolUse hook active, and `max_turns: 40`.

---

## Audit trail

`planning/m4.5/LOG/A{N}.md` is appended at every transition. Example:

```
2026-05-26 14:02  start         spec=A2-spec.md base=a76b8c5 budget=$2.50
2026-05-26 14:02  anchors       3/3 matched
2026-05-26 14:11  worker-done   driver-diff=+184 -267 files=9 worker-reported=ignored
2026-05-26 14:11  budget        files=9/12 lines_net=-83/-50  WITHIN
2026-05-26 14:13  verify        vitest=green tsc=green build=green smoke=green goldens=green
2026-05-26 14:14  council       critical=0 high=2 medium=4 low=7
2026-05-26 14:14  remediate     attempt=1 feedback=high-x2
2026-05-26 14:21  verify        vitest=green tsc=green build=green smoke=green goldens=green
2026-05-26 14:22  council       critical=0 high=0 medium=2 low=5
2026-05-26 14:22  integrate     ff-merge m4.5-A2 → main
2026-05-26 14:22  commit        a4b5c6d  "refactor: invert core/ deps to enemies, npcs"
2026-05-26 14:22  spend         phase=$1.83 cumulative=$1.83 of $200.00
2026-05-26 14:22  done
```

`planning/m4.5/LOG/SUMMARY.md` is written at the end of the run:

```
Run: m4.5-start (a76b8c5) → HEAD (z9y8x7w)
Phases:
  A2  done      attempts=2  spend=$1.83
  A4  done      attempts=1  spend=$3.42
  A3  done      attempts=3  spend=$5.71
  A5  done      attempts=2  spend=$2.95
  A7  done      attempts=1  spend=$2.10
  A6  skipped   reason="switch-site count=1 (threshold 3)"
Total spend: $16.01 of $200.00
Integrity: clean
Push: pushed origin main at <timestamp>
```

---

## Driver prompt template

Variables in `{braces}` are substituted at launch.

```text
You are the autonomous driver for DelveWard's Milestone 4.5 architecture cleanup.

Working directory: {repo_root}
Plan: planning/m4.5/PLAN.md
Status: planning/m4.5/STATUS.md
Specs: planning/m4.5/A{N}-spec.md
Hook: planning/m4.5/hooks/sandbox.sh
Push wrapper: planning/m4.5/scripts/push.sh
Smoke driver: planning/m4.5/scripts/smoke.mjs

Loop forever, one iteration per phase. Each iteration:

1. Reconcile (worktree prune, locked-ref check, disk guard, HEAD == last
   done-tag).
2. Read STATUS.md. Pick the next phase whose status is pending and whose
   dependencies are all done. Update heartbeat.
3. Pre-spawn checks: spec sealed, "Before" anchors match HEAD, goldens
   present, cumulative spend < MAX_USD.
4. Spawn a worker via Agent tool with:
     subagent_type: per §Worker selection
     isolation: "worktree"
     team_name: "m4.5"
     name: "m4.5-A{N}"
     mode: "default"
     max_turns: 40
     prompt: §Worker prompt template + spec contents + "Execute the spec
       verbatim. Do not redesign, expand scope, or modify files outside the
       touch list. Return the structured JSON contract."
   PreToolUse hook from hooks/sandbox.sh must be loaded for the worker.
5. Worker returns. Ignore its self-reported numbers.
6. Driver computes diff stats and diff hash against the worktree's base.
7. Run verification suite (vitest, tsc, build, smoke, goldens).
8. Invoke DeveloperCouncil on the diff.
9. If any check failed OR council found critical/high:
     spawn a remediation worker in the same worktree with the failure log
     and findings as feedback. Repeat up to 10 attempts. Apply the
     no-progress detector. If the phase stalls, run stall teardown, mark
     transitively dependent phases blocked, continue.
10. On clean: ff-merge the worktree branch into main, commit message per
    conventional commits, tag m4.5-A{N}-done, update STATUS.md, append
    LOG/A{N}.md, advance.
11. Sleep briefly via ScheduleWakeup (dynamic /loop) and re-enter.
12. After A3 and again after A4, evaluate the A6 gate (rg switch-sites).

When every phase is done, skipped, or blocked:
  - Run final post-run integrity audit.
  - Call scripts/push.sh once.
  - Write LOG/SUMMARY.md.
  - Exit.

The driver does not hard-halt. On any setback it logs, attempts recovery,
and continues from the last consistent state. On driver restart, it resumes
from STATUS.md after passing the stricter resume gates.

Never ask the user for input. When a decision arises mid-phase, decide based
on (a) the existing codebase, (b) the phase spec, (c) the council verdict
in planning/m4.5/PLAN.md. If the answer is genuinely ambiguous, default to
the option that minimizes the diff.
```

---

## Pre-flight checklist

The driver refuses to start unless all of these hold:

- [ ] Working tree clean (`git status --porcelain` empty).
- [ ] On `main`, up to date with `origin/main`.
- [ ] Phase specs `A2-spec.md`, `A3-spec.md`, `A4-spec.md`, `A5-spec.md`, `A7-spec.md` exist and are sealed. (`A6-spec.md` is authored mid-run if its gate trips.)
- [ ] Each sealed spec passes ArchitectReviewer review with zero critical/high open findings.
- [ ] `planning/m4.5/hooks/sandbox.sh` exists, is executable, and passes its own self-test.
- [ ] `planning/m4.5/scripts/push.sh` exists and is executable.
- [ ] `planning/m4.5/scripts/smoke.mjs` exists; `window.__delveward_ready` hook is wired in `src/main.ts`.
- [ ] `planning/m4.5/goldens/save-fixture.json` and `goldens/level-init.json` exist and were generated from the current `main`.
- [ ] `node_modules` installed, `npm test` green on `main`, `npm run build` green on `main`, `node scripts/smoke.mjs` green on `main`.
- [ ] `gh auth status` shows logged-in.
- [ ] `m4.5-start` tag does not already exist (or has been intentionally moved with confirmation).
- [ ] STATUS.md exists with every required phase in `pending` state and `last_heartbeat_at` set.
- [ ] `MAX_USD` exported in the driver's environment (default: $200).
- [ ] `planning/m4.5/VERIFY-MODE.md` exists and records the result of the empirical verification gate.

---

## Launch command

```bash
MAX_USD=200 \
claude --dangerously-skip-permissions \
       --name "m4.5-driver" \
       -p "$(cat planning/m4.5/PLAN.md and follow the driver prompt template)"
```

(Exact invocation finalized once the driver agent definition lands in `.claude/agents/`.)
