#!/bin/bash
# planning/m4.5/scripts/launch-run.sh
#
# Convenience launcher for the autonomous-runner agent. Sets defaults,
# validates branch state, exports run config, and execs `claude`.
#
# Usage:
#   RUN_BRANCH=m4.5-run-1 planning/m4.5/scripts/launch-run.sh
#
# Required env (or hardcoded defaults):
#   RUN_BASE_BRANCH      default m4.5-preflight — the basis branch
#   RUN_BRANCH           default m4.5-run-1     — the throwaway run branch (must already exist + be checked out)
#   PLAN_PATH            default planning/m4.5/PLAN.md
#   STATUS_PATH          default planning/m4.5/STATUS.md
#   MAX_USD              default 0              — 0 = unlimited; spend still tracked
#   USD_PER_MTOKEN       default 8              — for the estimated_usd stat
#   COUNCIL_DEPTH        default quick          — alternative: full

set -euo pipefail

RUN_BASE_BRANCH="${RUN_BASE_BRANCH:-m4.5-preflight}"
RUN_BRANCH="${RUN_BRANCH:-m4.5-run-1}"
PLAN_PATH="${PLAN_PATH:-planning/m4.5/PLAN.md}"
STATUS_PATH="${STATUS_PATH:-planning/m4.5/STATUS.md}"
MAX_USD="${MAX_USD:-0}"
USD_PER_MTOKEN="${USD_PER_MTOKEN:-8}"
COUNCIL_DEPTH="${COUNCIL_DEPTH:-quick}"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# Safety: never on main/master.
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "launch-run: refusing to launch on '$CURRENT_BRANCH'" >&2
    echo "  cut a run branch first:" >&2
    echo "  git checkout ${RUN_BASE_BRANCH} && git checkout -b ${RUN_BRANCH}" >&2
    exit 2
fi

# Currently-checked-out branch must match RUN_BRANCH.
if [ "$CURRENT_BRANCH" != "$RUN_BRANCH" ]; then
    echo "launch-run: current branch '$CURRENT_BRANCH' does not match RUN_BRANCH='$RUN_BRANCH'" >&2
    echo "  switch first:  git checkout ${RUN_BRANCH}" >&2
    exit 3
fi

# RUN_BASE_BRANCH must be an ancestor of HEAD.
if ! git merge-base --is-ancestor "$RUN_BASE_BRANCH" HEAD 2>/dev/null; then
    echo "launch-run: '$RUN_BASE_BRANCH' is not an ancestor of HEAD on '$RUN_BRANCH'" >&2
    echo "  cut a fresh run branch from the basis:" >&2
    echo "  git checkout ${RUN_BASE_BRANCH} && git checkout -b ${RUN_BRANCH}-N" >&2
    exit 4
fi

# Working tree must be clean.
if [ -n "$(git status --porcelain)" ]; then
    echo "launch-run: working tree is dirty; commit or stash first" >&2
    git status --short >&2
    exit 5
fi

echo "launch-run: launching autonomous-runner"
echo "  RUN_BASE_BRANCH = $RUN_BASE_BRANCH"
echo "  RUN_BRANCH      = $RUN_BRANCH"
echo "  PLAN_PATH       = $PLAN_PATH"
echo "  STATUS_PATH     = $STATUS_PATH"
echo "  MAX_USD         = $MAX_USD  (0 = unlimited)"
echo "  USD_PER_MTOKEN  = $USD_PER_MTOKEN"
echo "  COUNCIL_DEPTH   = $COUNCIL_DEPTH"

exec env \
    RUN_BASE_BRANCH="$RUN_BASE_BRANCH" \
    RUN_BRANCH="$RUN_BRANCH" \
    PLAN_PATH="$PLAN_PATH" \
    STATUS_PATH="$STATUS_PATH" \
    MAX_USD="$MAX_USD" \
    USD_PER_MTOKEN="$USD_PER_MTOKEN" \
    COUNCIL_DEPTH="$COUNCIL_DEPTH" \
    claude --dangerously-skip-permissions \
           --agent autonomous-runner \
           --name "$RUN_BRANCH" \
           -p "Start the autonomous run per ${PLAN_PATH}."
