#!/bin/bash
# planning/m4.5/scripts/integrate-phase.sh A{N}
#
# Atomic phase integration:
#   1. Commit worker-left changes in the phase worktree (worker contract says it doesn't commit).
#   2. Fast-forward-merge the worktree branch into the current run branch.
#   3. Tag m4.5-A{N}-done at the merged HEAD.
#   4. Append a structured `done` block to planning/m4.5/LOG/A{N}.md.
#
# Refuses to run on main/master. Refuses if the worktree branch diverges from
# the run branch (the runner is supposed to keep them aligned).
#
# STATUS.md updates are the runner's job, not this script's — the runner reads
# the structured stdout below ("integrate: ok ...") and updates STATUS.md atomically.

set -euo pipefail

PHASE="${1:-}"
[ -n "$PHASE" ] || { echo "usage: $0 A{N}" >&2; exit 2; }

REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
WORKTREE_BRANCH="m4.5-${PHASE}"
WORKTREE_PATH="${REPO_ROOT}/.worktrees/${WORKTREE_BRANCH}"
TAG="m4.5-${PHASE}-done"

if [ "$RUN_BRANCH" = "main" ] || [ "$RUN_BRANCH" = "master" ]; then
    echo "integrate-phase: refusing to integrate into '$RUN_BRANCH'" >&2
    exit 3
fi

if ! git -C "$REPO_ROOT" rev-parse --verify "$WORKTREE_BRANCH" >/dev/null 2>&1; then
    echo "integrate-phase: worktree branch '$WORKTREE_BRANCH' not found" >&2
    exit 4
fi

if git -C "$REPO_ROOT" rev-parse --verify "$TAG" >/dev/null 2>&1; then
    echo "integrate-phase: tag '$TAG' already exists — phase already integrated?" >&2
    exit 5
fi

# 1. Commit any uncommitted worker changes in the worktree.
if [ -d "$WORKTREE_PATH" ]; then
    if [ -n "$(git -C "$WORKTREE_PATH" status --porcelain)" ]; then
        git -C "$WORKTREE_PATH" add -A
        git -C "$WORKTREE_PATH" commit -m "refactor(${PHASE}): worker output"
    fi
fi

# 2. Pre-merge divergence check.
RUN_HEAD="$(git -C "$REPO_ROOT" rev-parse "$RUN_BRANCH")"
MERGE_BASE="$(git -C "$REPO_ROOT" merge-base "$RUN_BRANCH" "$WORKTREE_BRANCH")"
if [ "$MERGE_BASE" != "$RUN_HEAD" ]; then
    echo "integrate-phase: worktree branch '$WORKTREE_BRANCH' diverges from '$RUN_BRANCH' — refusing FF" >&2
    echo "  run head:   $RUN_HEAD" >&2
    echo "  merge base: $MERGE_BASE" >&2
    exit 6
fi

# Capture diff stats / hash BEFORE merge for the LOG.
DIFF_RANGE="${RUN_HEAD}..${WORKTREE_BRANCH}"
DIFF_STAT="$(git -C "$REPO_ROOT" diff --shortstat "$DIFF_RANGE" | sed 's/^[[:space:]]*//')"
DIFF_HASH="$(git -C "$REPO_ROOT" diff "$DIFF_RANGE" | shasum -a 256 | awk '{print $1}')"

# 3. Fast-forward merge.
git -C "$REPO_ROOT" merge --ff-only "$WORKTREE_BRANCH" >/dev/null

# 4. Tag the merged HEAD.
NEW_HEAD="$(git -C "$REPO_ROOT" rev-parse HEAD)"
git -C "$REPO_ROOT" tag -a "$TAG" -m "Phase ${PHASE} integrated"

# 5. Append to LOG/A{N}.md.
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LOG_PATH="${REPO_ROOT}/planning/m4.5/LOG/${PHASE}.md"
mkdir -p "$(dirname "$LOG_PATH")"
{
    echo "${TS}  integrate     ${WORKTREE_BRANCH} -> ${RUN_BRANCH}"
    echo "${TS}  commit        ${NEW_HEAD}  ${DIFF_STAT}"
    echo "${TS}  diff_hash     ${DIFF_HASH}"
    echo "${TS}  tag           ${TAG}"
    echo "${TS}  done"
} >> "$LOG_PATH"

echo "integrate: ok phase=${PHASE} tag=${TAG} head=${NEW_HEAD} diff=${DIFF_STAT}"
