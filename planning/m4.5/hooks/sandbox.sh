#!/bin/bash
# planning/m4.5/hooks/sandbox.sh
#
# PreToolUse hook for M4.5 autonomous-run workers.
# Enforces a write-path allowlist (per phase) and a Bash/Read deny-list.
#
# Per Claude Code hook contract: always exit 0. Empty stdout = allow.
# Block by writing {"decision":"block","reason":"..."} to stdout.

set +e

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
tool_input=$(printf '%s' "$input" | jq -c '.tool_input // {}')

block() {
    jq -nc --arg r "$1" '{"decision":"block","reason":$r}'
    exit 0
}

PHASE="${M45_ACTIVE_PHASE:-}"
[ -n "$PHASE" ] || block "sandbox: M45_ACTIVE_PHASE not set; refusing without scope context"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$REPO_ROOT" ] || block "sandbox: not inside a git repository"

TOUCH_LIST="$REPO_ROOT/planning/m4.5/scope/${PHASE}.touch.txt"

# Match a path against the per-phase touch list. One pattern per line.
# Lines starting with # are comments. Patterns use shell glob syntax.
path_allowed() {
    local path="$1"
    [ -f "$TOUCH_LIST" ] || return 1
    while IFS= read -r pattern || [ -n "$pattern" ]; do
        case "$pattern" in
            ''|\#*) continue ;;
        esac
        # shellcheck disable=SC2053
        case "$path" in
            $pattern) return 0 ;;
        esac
    done < "$TOUCH_LIST"
    return 1
}

normalize_path() {
    local path="$1"
    case "$path" in
        "$REPO_ROOT"/*) printf '%s' "${path#$REPO_ROOT/}" ;;
        *) printf '%s' "$path" ;;
    esac
}

case "$tool_name" in
    Write|Edit|MultiEdit|NotebookEdit)
        file_path=$(printf '%s' "$tool_input" | jq -r '.file_path // .notebook_path // empty')
        [ -n "$file_path" ] || block "sandbox: $tool_name missing file_path"
        rel=$(normalize_path "$file_path")
        path_allowed "$rel" || block "sandbox: $tool_name to '$rel' is outside phase $PHASE allowlist"
        ;;

    Bash)
        command=$(printf '%s' "$tool_input" | jq -r '.command // empty')

        # Git/gh deny-list — push, remote changes, config, auth token reads.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(git[[:space:]]+(push|remote|config)|gh[[:space:]]+auth)([[:space:]]|$)'; then
            block "sandbox: git/gh write/auth command denied (use scripts/push.sh)"
        fi

        # Destructive deletes.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(rm[[:space:]]+-([rf]+|.*[rf])|find[[:space:]].*-delete)'; then
            block "sandbox: destructive delete denied"
        fi

        # Process-env exposure as a bare command or piped command.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(env|printenv)([[:space:]]*$|[[:space:]]*[|&;])'; then
            block "sandbox: env/printenv exposes process environment"
        fi

        # Sensitive-path reads via common shell tools.
        if printf '%s' "$command" | grep -qE '(cat|less|more|head|tail|bat|grep|rg|awk|sed)[^|]*((\$HOME|~|/Users/[^/]+))?/?\.(ssh|netrc|aws)(/|$)'; then
            block "sandbox: sensitive-path read denied (.ssh/.netrc/.aws)"
        fi
        if printf '%s' "$command" | grep -qE '(cat|less|more|head|tail|bat|grep|rg|awk|sed)[^|]*((\$HOME|~|/Users/[^/]+))?/?\.config/gh(/|$)'; then
            block "sandbox: sensitive-path read denied (~/.config/gh)"
        fi
        ;;

    Read)
        file_path=$(printf '%s' "$tool_input" | jq -r '.file_path // empty')
        case "$file_path" in
            */.ssh/*|*/.netrc|*/.aws/*|*/.config/gh/*)
                block "sandbox: Read of sensitive path denied: $file_path" ;;
        esac
        ;;
esac

exit 0
