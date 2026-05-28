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
LOG_DIR="$REPO_ROOT/planning/m4.5/LOG"
mkdir -p "$LOG_DIR"
PATCH="$LOG_DIR/${PHASE}-diff.patch"

git -C "$WORKTREE" diff "$BASE_REF"..HEAD > "$PATCH"

# Parse shortstat. Format examples:
#   ` 7 files changed, 99 insertions(+), 44 deletions(-)`
#   ` 1 file changed, 5 insertions(+)`
#   `` (empty)
SHORTSTAT="$(git -C "$WORKTREE" diff --shortstat "$BASE_REF"..HEAD || true)"
FILES=0
ADDED=0
REMOVED=0
if [ -n "$SHORTSTAT" ]; then
    FILES=$(echo "$SHORTSTAT"   | grep -oE '[0-9]+ files? changed'     | grep -oE '[0-9]+' || echo 0)
    ADDED=$(echo "$SHORTSTAT"   | grep -oE '[0-9]+ insertions?\(\+\)'  | grep -oE '[0-9]+' || echo 0)
    REMOVED=$(echo "$SHORTSTAT" | grep -oE '[0-9]+ deletions?\(\-\)'   | grep -oE '[0-9]+' || echo 0)
fi
NET=$((ADDED - REMOVED))

# Scope check: changed files not matched by the phase touch list. The list is
# rendered in the main repo (REPO_ROOT), not the worktree, which only ever sees
# committed state. Glob matching mirrors hooks/sandbox.sh path_allowed().
TOUCH_LIST="$REPO_ROOT/planning/m4.5/scope/${PHASE}.touch.txt"
if [ -f "$TOUCH_LIST" ]; then
    OUT_OF_SCOPE=""
    while IFS= read -r changed; do
        [ -n "$changed" ] || continue
        in_scope=1
        while IFS= read -r pattern || [ -n "$pattern" ]; do
            case "$pattern" in ''|\#*) continue ;; esac
            # shellcheck disable=SC2254
            case "$changed" in $pattern) in_scope=0; break ;; esac
        done < "$TOUCH_LIST"
        [ "$in_scope" -eq 0 ] || OUT_OF_SCOPE="${OUT_OF_SCOPE:+$OUT_OF_SCOPE,}$changed"
    done < <(git -C "$WORKTREE" diff --name-only "$BASE_REF"..HEAD || true)
    [ -n "$OUT_OF_SCOPE" ] || OUT_OF_SCOPE="none"
else
    OUT_OF_SCOPE="no-touch-list"
fi

HASH="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
PATCH_REL="planning/m4.5/LOG/${PHASE}-diff.patch"

printf 'DIFF phase=%s files=%d lines_added=%d lines_removed=%d net=%d hash=%s patch=%s out_of_scope=%s\n' \
    "$PHASE" "$FILES" "$ADDED" "$REMOVED" "$NET" "$HASH" "$PATCH_REL" "$OUT_OF_SCOPE"
