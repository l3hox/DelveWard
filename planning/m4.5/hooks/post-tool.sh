#!/bin/bash
# planning/m4.5/hooks/post-tool.sh
#
# Bash wrapper for the PostToolUse hook. Forwards stdin to the Python
# implementation. Always exits 0 (per Claude Code hook contract).

set +e

HERE="$(cd "$(dirname "$0")" && pwd)"
exec python3 "$HERE/post-tool.py" "$@"
