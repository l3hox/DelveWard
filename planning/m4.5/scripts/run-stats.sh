#!/bin/bash
# planning/m4.5/scripts/run-stats.sh
#
# Thin shell wrapper around run-stats.py. Resolves the session JSONL path
# (auto-detects the latest if not given) and runs the analyzer.
#
# Usage:
#   run-stats.sh                              # autodetect latest session JSONL
#   run-stats.sh <session.jsonl>              # explicit path

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ANALYZER="${HERE}/run-stats.py"

if [ $# -ge 1 ]; then
    SESSION="$1"
else
    # Autodetect: most recently modified JSONL under this project's Claude transcripts.
    PROJECT_TRANSCRIPTS="${HOME}/.claude/projects/-Users-$(whoami)-prog-DelveWard"
    if [ -d "$PROJECT_TRANSCRIPTS" ]; then
        SESSION="$(ls -1t "$PROJECT_TRANSCRIPTS"/*.jsonl 2>/dev/null | head -1 || true)"
    fi
    [ -n "${SESSION:-}" ] || {
        echo "usage: run-stats.sh [<session.jsonl>]" >&2
        echo "  no session given and could not autodetect under ${PROJECT_TRANSCRIPTS:-?}" >&2
        exit 2
    }
fi

[ -f "$SESSION" ] || { echo "run-stats: '$SESSION' not a file" >&2; exit 2; }

exec python3 "$ANALYZER" "$SESSION"
