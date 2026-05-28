#!/bin/bash
# planning/m4.5/scripts/phase-diff.sh
#
# Compute diff stats + content hash for a phase worktree against its base ref.
# Emit one structured line on stdout; write the full patch to disk.
#
# Usage:
#   phase-diff.sh <phase> <worktree-path> <base-ref>
#
# stdout (single line):
#   DIFF phase=A2 files=7 lines_added=99 lines_removed=44 net=55 hash=70911262...d62 patch=planning/m4.5/LOG/A2-diff.patch out_of_scope=none
#
# out_of_scope is a comma-list of changed files not matched by the phase touch
# list, `none` when every changed file is in scope, or `no-touch-list` when the
# list is absent (scope cannot be checked). The runner auto-remediates on a
# non-empty file list and treats no-touch-list as a setup error.

set -euo pipefail

PHASE="${1:-}"
WORKTREE="${2:-}"
BASE_REF="${3:-}"
[ -n "$PHASE" ] && [ -n "$WORKTREE" ] && [ -n "$BASE_REF" ] || {
    echo "usage: $0 <phase> <worktree-path> <base-ref>" >&2
    exit 2
}
[ -d "$WORKTREE" ] || { echo "phase-diff: worktree '$WORKTREE' not a directory" >&2; exit 2; }

REPO_ROOT="${REPO_ROOT:-$(pwd)}"
SCOPE_CHECK="$REPO_ROOT/planning/m4.5/hooks/scope-check.py"
LOG_DIR="$REPO_ROOT/planning/m4.5/LOG"
mkdir -p "$LOG_DIR"
PATCH="$LOG_DIR/${PHASE}-diff.patch"

# Workers leave changes UNCOMMITTED (worker contract), so diff the staged
# working tree against base, not BASE..HEAD (which would be empty and make the
# whole gate a false green). Staging also captures new files; integrate-phase
# re-stages and commits later. files=0 here means a no-op worker — the runner
# must remediate, never integrate a zero-diff phase.
git -C "$WORKTREE" add -A >/dev/null 2>&1 || true
git -C "$WORKTREE" diff --cached "$BASE_REF" > "$PATCH"

# Parse shortstat. Format examples:
#   ` 7 files changed, 99 insertions(+), 44 deletions(-)`
#   ` 1 file changed, 5 insertions(+)`
#   `` (empty)
SHORTSTAT="$(git -C "$WORKTREE" diff --cached --shortstat "$BASE_REF" || true)"
FILES=0
ADDED=0
REMOVED=0
if [ -n "$SHORTSTAT" ]; then
    FILES=$(echo "$SHORTSTAT"   | grep -oE '[0-9]+ files? changed'     | grep -oE '[0-9]+' || echo 0)
    ADDED=$(echo "$SHORTSTAT"   | grep -oE '[0-9]+ insertions?\(\+\)'  | grep -oE '[0-9]+' || echo 0)
    REMOVED=$(echo "$SHORTSTAT" | grep -oE '[0-9]+ deletions?\(\-\)'   | grep -oE '[0-9]+' || echo 0)
fi
NET=$((ADDED - REMOVED))

# Scope check: staged changed files not matched by the phase touch list, using
# the same slash-respecting matcher as the live sandbox (scope-check.py --match).
# The list is read from the main repo (REPO_ROOT), not the worktree.
TOUCH_LIST="$REPO_ROOT/planning/m4.5/scope/${PHASE}.touch.txt"
if [ -f "$TOUCH_LIST" ]; then
    OUT_OF_SCOPE=""
    while IFS= read -r changed; do
        [ -n "$changed" ] || continue
        if ! python3 "$SCOPE_CHECK" --match "$TOUCH_LIST" "$changed"; then
            OUT_OF_SCOPE="${OUT_OF_SCOPE:+$OUT_OF_SCOPE,}$changed"
        fi
    done < <(git -C "$WORKTREE" diff --cached --name-only "$BASE_REF" || true)
    [ -n "$OUT_OF_SCOPE" ] || OUT_OF_SCOPE="none"
else
    OUT_OF_SCOPE="no-touch-list"
fi

HASH="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
PATCH_REL="planning/m4.5/LOG/${PHASE}-diff.patch"

printf 'DIFF phase=%s files=%d lines_added=%d lines_removed=%d net=%d hash=%s patch=%s out_of_scope=%s\n' \
    "$PHASE" "$FILES" "$ADDED" "$REMOVED" "$NET" "$HASH" "$PATCH_REL" "$OUT_OF_SCOPE"
