#!/bin/bash
# planning/m4.5/hooks/sandbox.sh
#
# PreToolUse hook for the M4.5 autonomous run. Installed in the RUNNER session's
# --settings; Claude Code propagates it to worker subagents (verified). It
# enforces a deny-by-default write policy for workers and a Bash/Read deny-list
# for every session.
#
# Write/Edit decisions are delegated to scope-check.py, which discriminates by
# writer context (the session cwd): a worker (cwd inside .claude/worktrees/<id>/)
# may only write canonicalized paths INSIDE its worktree that match the active
# phase's touch list; everything else is denied. The runner's own writes (cwd in
# the main repo) pass. Deny-by-default — see scope-check.py for the rationale.
#
# Command/egress containment here is defense-in-depth only; a denylist cannot
# contain an adversarial shell. Real command containment is OS-level egress block
# + read-only $HOME at launch (hardening), not these regexes.
#
# Per Claude Code hook contract: always exit 0. Empty stdout = allow. Block by
# writing {"decision":"block","reason":"..."} to stdout.

set +e

HERE="$(cd "$(dirname "$0")" && pwd)"
SCOPE_CHECK="$HERE/scope-check.py"

input=$(cat)
tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
tool_input=$(printf '%s' "$input" | jq -c '.tool_input // {}')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

block() {
    jq -nc --arg r "$1" '{"decision":"block","reason":$r}'
    exit 0
}

case "$tool_name" in
    Write|Edit|MultiEdit|NotebookEdit)
        file_path=$(printf '%s' "$tool_input" | jq -r '.file_path // .notebook_path // empty')
        [ -n "$file_path" ] || block "sandbox: $tool_name missing file_path"
        reason=$(python3 "$SCOPE_CHECK" "$cwd" "$file_path")
        [ $? -eq 0 ] || block "sandbox: ${reason:-write denied}"
        ;;

    Bash)
        command=$(printf '%s' "$tool_input" | jq -r '.command // empty')

        # Git/gh deny-list — push, remote changes, config, auth token reads.
        # Defense-in-depth: tolerates `git -C`/`git -c` flags before the verb.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])git([[:space:]]+-[Cc][[:space:]]*[^ ]+)*[[:space:]]+(push|remote|config)([[:space:]]|$)'; then
            block "sandbox: git write/config command denied (use scripts/push.sh)"
        fi
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])gh[[:space:]]+auth([[:space:]]|$)'; then
            block "sandbox: gh auth command denied"
        fi

        # Destructive deletes.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(rm[[:space:]]+-([rf]+|.*[rf])|find[[:space:]].*-delete)'; then
            block "sandbox: destructive delete denied"
        fi

        # Network egress tools (defense-in-depth; real block is OS-level).
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(curl|wget|nc|ncat|telnet|scp|sftp|ftp)([[:space:]]|$)'; then
            block "sandbox: network egress command denied"
        fi

        # Process-env exposure as a bare command or piped command.
        if printf '%s' "$command" | grep -qE '(^|[ |&;(])(env|printenv|set)([[:space:]]*$|[[:space:]]*[|&;])'; then
            block "sandbox: env/printenv/set exposes process environment"
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
