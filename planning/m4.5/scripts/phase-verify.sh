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

# bash 3.2 (macOS) has no associative arrays; use plain per-check variables.
# run_gate echoes its result so the caller captures it via $(...), deriving
# every result from the command's real exit code — no silent default-green.
run_gate() {
    local label="$1"
    shift
    {
        echo ""
        echo "==== $label ===="
    } >> "$LOG_FILE"
    if "$@" >> "$LOG_FILE" 2>&1; then
        echo green
    else
        echo red
    fi
}

# Run from the worktree so vitest/tsc/build pick up its files. Each $(...) runs
# run_gate in a subshell that inherits this cwd. Guard the cd: under `set +e` a
# failed pushd would otherwise run every gate at the repo root and score phantom
# green.
pushd "$WORKTREE" >/dev/null || { echo "phase-verify: cannot enter worktree '$WORKTREE'" >&2; exit 2; }

result_vitest=$(run_gate "vitest"  bash -c "command npx vitest run")
result_tsc=$(run_gate "tsc:app"    bash -c "command npx tsc --noEmit")
result_tsc_test=skip
if [ "$result_tsc" = "green" ]; then
    result_tsc_test=$(run_gate "tsc:test" bash -c "command npx tsc -p tsconfig.test.json --noEmit")
    [ "$result_tsc_test" = "red" ] && result_tsc=red
fi
result_build=$(run_gate "build"    bash -c "command npm run build")

# Smoke and goldens. The smoke driver lives at the repo root, not the worktree.
SMOKE="$REPO_ROOT/planning/m4.5/scripts/smoke.mjs"
if [ -f "$SMOKE" ]; then
    result_smoke=$(run_gate "smoke" bash -c "command node '$SMOKE'")
    if [ "$result_smoke" = "green" ]; then
        result_goldens=green   # smoke compares goldens internally
    else
        result_goldens=red
    fi
else
    result_smoke=skip
    result_goldens=skip
fi

popd >/dev/null

LOG_REL="planning/m4.5/LOG/${PHASE}-verify.log"

# Determine overall pass/fail (skip is not failure; only an explicit red fails).
overall=0
for r in "$result_vitest" "$result_tsc" "$result_build" "$result_smoke" "$result_goldens"; do
    [ "$r" = "red" ] && overall=1
done

# Emit structured line (caller parses)
printf 'VERIFY phase=%s vitest=%s tsc=%s build=%s smoke=%s goldens=%s log=%s\n' \
    "$PHASE" \
    "${result_vitest:-skip}" \
    "${result_tsc:-skip}" \
    "${result_build:-skip}" \
    "${result_smoke:-skip}" \
    "${result_goldens:-skip}" \
    "$LOG_REL"

exit $overall
