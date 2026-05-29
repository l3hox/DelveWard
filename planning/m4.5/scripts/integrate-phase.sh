#!/bin/bash
# planning/m4.5/scripts/integrate-phase.sh <phase> [patch-path]
#
#   e.g. integrate-phase.sh A2
#        integrate-phase.sh A2 planning/m4.5/LOG/A2-diff.patch
#
# Agent isolation:"worktree" bases the worker's worktree on merge-base(run, main)
# — the fork point, not run HEAD (ADR-M45-0024). The worktree branch is therefore
# an ancestor of the run branch, so an ff-merge is a no-op and drops the worker's
# edits. Instead we integrate by applying the scope-verified patch that
# phase-diff.sh already produced (LOG/<phase>-diff.patch) onto run HEAD with a
# 3-way merge. The patch touches only the phase's in-scope files (all under src/),
# disjoint from the runner's own planning/m4.5/ working-tree changes.
#
# Steps:
#   1. git apply --3way --index the patch onto run HEAD. 3-way handles files that
#      diverged between the fork point and run HEAD, as long as edits don't overlap.
#   2. Commit the staged src changes (the runner's planning/m4.5/ edits stay unstaged).
#   3. Tag m4.5-<phase>-done.
#   4. Append a structured done block to LOG/<phase>.md.
# On a 3-way conflict: restore the patch's files to HEAD and exit 6 so the runner
# remediates; the runner's planning/m4.5/ working changes are left untouched.
#
# Refuses on main/master and if the done-tag already exists. STATUS.md updates are
# the runner's job (it reads the "integrate: ok ..." line below).

set -euo pipefail

PHASE="${1:-}"
[ -n "$PHASE" ] || { echo "usage: $0 <phase> [patch-path]" >&2; exit 2; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
PATCH="${2:-$REPO_ROOT/planning/m4.5/LOG/${PHASE}-diff.patch}"
RUN_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
TAG="m4.5-${PHASE}-done"

if [ "$RUN_BRANCH" = "main" ] || [ "$RUN_BRANCH" = "master" ]; then
    echo "integrate-phase: refusing to integrate into '$RUN_BRANCH'" >&2
    exit 3
fi
if [ ! -s "$PATCH" ]; then
    echo "integrate-phase: patch '$PATCH' missing or empty — nothing to integrate" >&2
    exit 4
fi
if git -C "$REPO_ROOT" rev-parse --verify "$TAG" >/dev/null 2>&1; then
    echo "integrate-phase: tag '$TAG' already exists — phase already integrated?" >&2
    exit 5
fi

RUN_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
# File list for restore-on-failure, parsed from the patch's own header lines.
# `git apply --numstat` mangles renames as `{old => new}`, so derive paths from
# the +++/--- lines instead (covers modifies, adds, renames; /dev/null lines for
# pure adds/deletes don't match `+++ b/` or `--- a/` and are naturally excluded).
PATCH_FILES="$(
    { grep '^+++ b/' "$PATCH" | sed 's|^+++ b/||'
      grep '^--- a/' "$PATCH" | sed 's|^--- a/||'; } | sort -u
)"

# 1. Apply the scope-verified patch onto run HEAD (3-way). Capture output: a
# missing base blob makes git fall back to a non-3-way apply and still exit 0,
# silently losing conflict detection, so treat that case as a failure too.
set +e
APPLY_OUT="$(git -C "$REPO_ROOT" apply --3way --index "$PATCH" 2>&1)"
APPLY_RC=$?
set -e
if [ "$APPLY_RC" -ne 0 ] || printf '%s' "$APPLY_OUT" | grep -q 'lacks the necessary blob'; then
    [ -n "$APPLY_OUT" ] && printf '%s\n' "$APPLY_OUT" >&2
    echo "integrate-phase: 3-way apply failed or degraded for $PHASE; restoring, refusing" >&2
    IFS=$'\n'
    git -C "$REPO_ROOT" restore --source=HEAD --staged --worktree -- $PATCH_FILES 2>/dev/null || true
    exit 6
fi

# 2. Commit only the staged (patched) files; the runner's planning/m4.5/ working
#    changes remain unstaged and uncommitted.
git -C "$REPO_ROOT" commit -q -m "refactor: integrate phase ${PHASE} worker output"

# 3. Tag.
NEW_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
git -C "$REPO_ROOT" tag -a "$TAG" -m "Phase ${PHASE} integrated"

# 4. Stats + LOG.
DIFF_STAT="$(git -C "$REPO_ROOT" diff --shortstat "${RUN_HEAD}..${NEW_HEAD}" | sed 's/^[[:space:]]*//')"
PATCH_HASH="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_PATH="${REPO_ROOT}/planning/m4.5/LOG/${PHASE}.md"
mkdir -p "$(dirname "$LOG_PATH")"
{
    echo "${TS}  integrate     patch -> ${RUN_BRANCH} (3-way apply onto run HEAD)"
    echo "${TS}  commit        ${NEW_HEAD}  ${DIFF_STAT}"
    echo "${TS}  patch_sha256  ${PATCH_HASH}"
    echo "${TS}  tag           ${TAG}"
    echo "${TS}  done"
} >> "$LOG_PATH"

echo "integrate: ok phase=${PHASE} tag=${TAG} head=${NEW_HEAD} diff=${DIFF_STAT}"
