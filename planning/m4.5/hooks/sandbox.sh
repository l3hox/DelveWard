#!/bin/bash
# planning/m4.5/hooks/sandbox.sh
#
# PreToolUse hook for the M4.5 autonomous run. Installed in the RUNNER session's
# frontmatter; Claude Code propagates it to worker subagents (precursor 2). It
# enforces a per-phase write allowlist for writes INSIDE a worker worktree, and
# a Bash/Read deny-list for every session.
#
# The runner's own writes (specs, STATUS, scope files) land outside any worktree
# and are not scope-restricted. Only writes under .claude/worktrees/<agent>/ are
# checked, against the active phase's touch list in the MAIN repo (a worktree
# never sees the uncommitted rendered list, per precursor 3). The active phase is
# read from <main-repo>/planning/m4.5/scope/ACTIVE, which the runner writes
# before spawning each worker.
#
# Per Claude Code hook contract: always exit 0. Empty stdout = allow. Block by
# writing {"decision":"block","reason":"..."} to stdout.

set +e

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
tool_input=$(printf '%s' "$input" | jq -c '.tool_input // {}')

block() {
    jq -nc --arg r "$1" '{"decision":"block","reason":$r}'
    exit 0
}

# Match a path against a touch-list file. One glob pattern per line; blank lines
# and #-comments ignored. Mirrors phase-diff.sh scope matching.
path_allowed() {
    local path="$1" list="$2" pattern
    [ -f "$list" ] || return 1
    while IFS= read -r pattern || [ -n "$pattern" ]; do
        case "$pattern" in
            ''|\#*) continue ;;
        esac
        # shellcheck disable=SC2254
        case "$path" in
            $pattern) return 0 ;;
        esac
    done < "$list"
    return 1
}

case "$tool_name" in
    Write|Edit|MultiEdit|NotebookEdit)
        file_path=$(printf '%s' "$tool_input" | jq -r '.file_path // .notebook_path // empty')
        [ -n "$file_path" ] || block "sandbox: $tool_name missing file_path"

        case "$file_path" in
            */.claude/worktrees/*/*)
                # Worker write inside a worktree: enforce the active phase allowlist.
                main_repo="${file_path%%/.claude/worktrees/*}"
                rel="${file_path#*/.claude/worktrees/*/}"
                active_file="$main_repo/planning/m4.5/scope/ACTIVE"
                phase=""
                [ -f "$active_file" ] && phase=$(tr -d '[:space:]' < "$active_file")
                [ -n "$phase" ] || block "sandbox: no active phase at $active_file; refusing worker write to '$rel'"
                touch_list="$main_repo/planning/m4.5/scope/${phase}.touch.txt"
                path_allowed "$rel" "$touch_list" || block "sandbox: $tool_name to '$rel' is outside phase $phase allowlist"
                ;;
            *)
                # Runner's own write (outside any worktree): allowed.
                ;;
        esac
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
