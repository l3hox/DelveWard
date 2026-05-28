#!/bin/bash
# planning/m4.5/scripts/supervise-run.sh
#
# External supervisor for the autonomous-runner. Runs the runner in a detached
# tmux session and owns its lifecycle from outside (the runner cannot resurrect
# itself). Restarts on crash or hang, then stops on a terminal NOTIFY.
#
# Why a watchdog and not just process-exit detection: an API drop leaves the
# runner idle-but-not-exited (run-2's zombie). The composite staleness signal
# (transcript mtime plus newest active-worktree file mtime) is the primary crash
# detector; tmux-session-ended is the secondary.
#
# Restart cadence is configurable via RESUME_RETRIES (default 1). The first
# RESUME_RETRIES restarts resume the same runner session (cheap continuity for a
# transient blip); every restart after that scratches the session and launches a
# fresh runner that reconciles from STATUS.md. RESUME_RETRIES=0 always scratches;
# a higher value resumes more times first. (A future UI can set this knob.)
# Note: a fresh restart scratches the RUNNER, not a phase. Completed phases keep
# their done-tags; only an in-flight phase is redone from the last done-tag.
#
# Usage:
#   planning/m4.5/scripts/supervise-run.sh            # supervise current branch
#   planning/m4.5/scripts/supervise-run.sh --self-test
#
# Env:
#   RUN_BRANCH        default current branch
#   MAX_RESTARTS      default 5     — restarts after the initial launch
#   RESUME_RETRIES    default 1     — restarts that resume before scratching to fresh
#   STALE_SECONDS     default 900   — composite-staleness threshold (15 min)
#   GRACE_SECONDS     default 180   — startup window before staleness applies
#   POLL_SECONDS      default 60    — watchdog poll interval
#   TMUX_SESSION      default m45-supervised
#   LAUNCHER          default planning/m4.5/scripts/launch-run.sh
#   NOTIFY_PATH       default planning/m4.5/NOTIFY
#   LOG_PATH          default planning/m4.5/LOG/supervise.log

set -uo pipefail

RUN_BRANCH="${RUN_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)}"
MAX_RESTARTS="${MAX_RESTARTS:-5}"
RESUME_RETRIES="${RESUME_RETRIES:-1}"
STALE_SECONDS="${STALE_SECONDS:-900}"
GRACE_SECONDS="${GRACE_SECONDS:-180}"
POLL_SECONDS="${POLL_SECONDS:-60}"
TMUX_SESSION="${TMUX_SESSION:-m45-supervised}"
LAUNCHER="${LAUNCHER:-planning/m4.5/scripts/launch-run.sh}"
NOTIFY_PATH="${NOTIFY_PATH:-planning/m4.5/NOTIFY}"
LOG_PATH="${LOG_PATH:-planning/m4.5/LOG/supervise.log}"

log() {
    printf '%s supervise: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG_PATH" >&2
}

# Epoch mtime of a path, or 0 if missing. Portable across macOS (-f) and Linux (-c).
mtime() {
    [ -e "$1" ] || { echo 0; return; }
    stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || echo 0
}

# Newest file mtime under a directory tree, excluding node_modules and .git.
# 0 if the directory is absent or empty.
newest_under() {
    local dir="$1" newest=0 t f
    [ -d "$dir" ] || { echo 0; return; }
    while IFS= read -r -d '' f; do
        t=$(mtime "$f")
        [ "$t" -gt "$newest" ] && newest="$t"
    done < <(find "$dir" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -print0 2>/dev/null)
    echo "$newest"
}

# Locate a session transcript by id, regardless of project-dir encoding.
find_transcript() {
    find "$HOME/.claude/projects" -name "$1.jsonl" 2>/dev/null | head -1
}

# Newest activity across the parent transcript and any active worker worktree.
composite_last_activity() {
    local sid="$1" tx tx_m wt_m
    tx=$(find_transcript "$sid")
    tx_m=$(mtime "$tx")
    wt_m=$(newest_under ".claude/worktrees")
    if [ "$wt_m" -gt "$tx_m" ]; then echo "$wt_m"; else echo "$tx_m"; fi
}

notify_is_terminal() {
    [ -f "$NOTIFY_PATH" ] || return 1
    grep -qE '(^|[^A-Z])(DONE|BLOCKED)([^A-Z]|$)' "$NOTIFY_PATH"
}

# fresh-keep (initial launch), resume (first RESUME_RETRIES restarts),
# fresh-new (every restart after that). Driven by RESUME_RETRIES.
mode_for_attempt() {
    local n="$1"
    if [ "$n" -eq 0 ]; then
        echo fresh-keep
    elif [ "$n" -le "$RESUME_RETRIES" ]; then
        echo resume
    else
        echo fresh-new
    fi
}

new_session_id() { uuidgen | tr 'A-Z' 'a-z'; }

run_supervisor() {
    mkdir -p "$(dirname "$LOG_PATH")"

    command -v tmux >/dev/null 2>&1 || { log "tmux not found; required for unattended supervision"; exit 2; }

    if notify_is_terminal; then
        log "a terminal NOTIFY already exists at $NOTIFY_PATH; clear it before supervising"
        exit 3
    fi
    if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
        log "tmux session '$TMUX_SESSION' already exists; kill it or pick another TMUX_SESSION"
        exit 4
    fi

    local sid attempt mode launched_at now last age
    sid="$(new_session_id)"
    attempt=0

    while :; do
        mode="$(mode_for_attempt "$attempt")"
        local resume=0
        case "$mode" in
            resume)    resume=1 ;;
            fresh-new) sid="$(new_session_id)" ;;
        esac

        log "launch attempt=$attempt mode=$mode session=$sid branch=$RUN_BRANCH"
        tmux new-session -d -s "$TMUX_SESSION" \
            "RUN_BRANCH='$RUN_BRANCH' RUN_SESSION_ID='$sid' RUN_RESUME='$resume' bash '$LAUNCHER'"

        launched_at=$(date +%s)
        while tmux has-session -t "$TMUX_SESSION" 2>/dev/null; do
            if notify_is_terminal; then
                log "terminal NOTIFY observed; supervision complete"
                tmux kill-session -t "$TMUX_SESSION" 2>/dev/null
                return 0
            fi
            now=$(date +%s)
            last=$(composite_last_activity "$sid")
            if [ "$last" -eq 0 ]; then
                age=$((now - launched_at))
                if [ "$age" -gt "$GRACE_SECONDS" ]; then
                    log "no activity within grace (${age}s); killing for restart"
                    tmux kill-session -t "$TMUX_SESSION" 2>/dev/null
                    break
                fi
            else
                age=$((now - last))
                if [ "$age" -gt "$STALE_SECONDS" ]; then
                    log "stale for ${age}s (> ${STALE_SECONDS}s); killing for restart"
                    tmux kill-session -t "$TMUX_SESSION" 2>/dev/null
                    break
                fi
            fi
            sleep "$POLL_SECONDS"
        done

        if notify_is_terminal; then
            log "terminal NOTIFY observed after session end; supervision complete"
            return 0
        fi

        attempt=$((attempt + 1))
        if [ "$attempt" -gt "$MAX_RESTARTS" ]; then
            log "restart cap ($MAX_RESTARTS) exhausted; giving up"
            printf 'BLOCKED supervisor-give-up after %s restarts\n' "$MAX_RESTARTS" > "$NOTIFY_PATH"
            return 1
        fi
        log "runner ended without terminal NOTIFY; restarting (next attempt=$attempt)"
    done
}

self_test() {
    local fail=0

    # Default cadence (RESUME_RETRIES=1): fresh, resume, then fresh.
    RESUME_RETRIES=1
    [ "$(mode_for_attempt 0)" = fresh-keep ] || { echo "FAIL mode 0"; fail=1; }
    [ "$(mode_for_attempt 1)" = resume ] || { echo "FAIL mode 1 default"; fail=1; }
    [ "$(mode_for_attempt 2)" = fresh-new ] || { echo "FAIL mode 2 default"; fail=1; }
    # Configurable: never resume.
    RESUME_RETRIES=0
    [ "$(mode_for_attempt 1)" = fresh-new ] || { echo "FAIL mode 1 retries=0"; fail=1; }
    # Configurable: resume twice, then fresh.
    RESUME_RETRIES=2
    [ "$(mode_for_attempt 2)" = resume ] || { echo "FAIL mode 2 retries=2"; fail=1; }
    [ "$(mode_for_attempt 3)" = fresh-new ] || { echo "FAIL mode 3 retries=2"; fail=1; }
    RESUME_RETRIES=1

    local d f t
    d=$(mktemp -d)
    [ "$(mtime "$d/missing")" = 0 ] || { echo "FAIL mtime missing"; fail=1; }
    f="$d/a.txt"; : > "$f"
    t=$(mtime "$f"); [ "$t" -gt 0 ] || { echo "FAIL mtime present"; fail=1; }

    # newest_under sees real files and skips node_modules/.git entirely.
    mkdir -p "$d/wt/src"; : > "$d/wt/src/touched.ts"
    t=$(newest_under "$d/wt"); [ "$t" -gt 0 ] || { echo "FAIL newest_under present"; fail=1; }
    mkdir -p "$d/wtx/node_modules"; : > "$d/wtx/node_modules/ignored.js"
    [ "$(newest_under "$d/wtx")" = 0 ] || { echo "FAIL newest_under should exclude node_modules"; fail=1; }
    [ "$(newest_under "$d/none")" = 0 ] || { echo "FAIL newest_under absent"; fail=1; }

    local n="$d/NOTIFY"
    NOTIFY_PATH="$n"
    notify_is_terminal && { echo "FAIL terminal on missing"; fail=1; }
    echo "running, heartbeat fresh" > "$n"
    notify_is_terminal && { echo "FAIL terminal on non-terminal"; fail=1; }
    echo "DONE" > "$n"
    notify_is_terminal || { echo "FAIL terminal on DONE"; fail=1; }
    echo "BLOCKED budget-exceeded" > "$n"
    notify_is_terminal || { echo "FAIL terminal on BLOCKED"; fail=1; }

    rm -rf "$d"
    if [ "$fail" = 0 ]; then echo "self-test: ok"; else echo "self-test: FAILED"; return 1; fi
}

if [ "${1:-}" = "--self-test" ]; then
    self_test
else
    run_supervisor
fi
