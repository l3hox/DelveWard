#!/bin/bash
# planning/m4.5/scripts/phase-verify.sh
#
# Run the full verification suite (vitest, tsc, build, smoke, goldens) inside
# a phase worktree. Emit one structured line on stdout summarizing the result;
# write detailed logs to disk for the runner to consume on demand.
#
# Usage:
#   phase-verify.sh <phase> <worktree-path>
#
# Exit 0 if all green, 1 otherwise.
#
# stdout (single line):
#   VERIFY phase=A2 vitest=green tsc=green build=green smoke=green goldens=green log=planning/m4.5/LOG/A2-verify.log
#   VERIFY phase=A2 vitest=red tsc=green build=green smoke=skip goldens=skip log=planning/m4.5/LOG/A2-verify.log

set +e

PHASE="${1:-}"
WORKTREE="${2:-}"
[ -n "$PHASE" ] || { echo "usage: $0 <phase> <worktree-path>" >&2; exit 2; }
[ -n "$WORKTREE" ] || { echo "usage: $0 <phase> <worktree-path>" >&2; exit 2; }
[ -d "$WORKTREE" ] || { echo "phase-verify: worktree '$WORKTREE' not a directory" >&2; exit 2; }

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
LOG_DIR="$REPO_ROOT/planning/m4.5/LOG"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/${PHASE}-verify.log"
: > "$LOG_FILE"

declare -A RESULTS

run_gate() {
    local name="$1"
    shift
    local label="$1"
    shift
    echo "" >> "$LOG_FILE"
    echo "==== $label ====" >> "$LOG_FILE"
    if "$@" >> "$LOG_FILE" 2>&1; then
        RESULTS[$name]=green
    else
        RESULTS[$name]=red
    fi
}

# Run from the worktree so vitest/tsc/build pick up its files.
pushd "$WORKTREE" >/dev/null

run_gate vitest "vitest"   bash -c "command npx vitest run"
run_gate tsc    "tsc:app"  bash -c "command npx tsc --noEmit"
if [ "${RESULTS[tsc]}" = "green" ]; then
    run_gate tsc_test "tsc:test" bash -c "command npx tsc -p tsconfig.test.json --noEmit"
    [ "${RESULTS[tsc_test]}" = "red" ] && RESULTS[tsc]=red
fi
run_gate build  "build"    bash -c "command npm run build"

# Smoke and goldens. The smoke driver lives at the repo root, not the worktree.
SMOKE="$REPO_ROOT/planning/m4.5/scripts/smoke.mjs"
if [ -f "$SMOKE" ]; then
    run_gate smoke "smoke" bash -c "command node '$SMOKE'"
    if [ "${RESULTS[smoke]}" = "green" ]; then
        RESULTS[goldens]=green   # smoke compares goldens internally
    else
        RESULTS[goldens]=red
    fi
else
    RESULTS[smoke]=skip
    RESULTS[goldens]=skip
fi

popd >/dev/null

LOG_REL="planning/m4.5/LOG/${PHASE}-verify.log"

# Determine overall pass/fail (skip is not failure)
overall=0
for k in vitest tsc build smoke goldens; do
    if [ "${RESULTS[$k]}" = "red" ]; then overall=1; fi
done

# Emit structured line (caller parses)
printf 'VERIFY phase=%s vitest=%s tsc=%s build=%s smoke=%s goldens=%s log=%s\n' \
    "$PHASE" \
    "${RESULTS[vitest]:-skip}" \
    "${RESULTS[tsc]:-skip}" \
    "${RESULTS[build]:-skip}" \
    "${RESULTS[smoke]:-skip}" \
    "${RESULTS[goldens]:-skip}" \
    "$LOG_REL"

exit $overall
