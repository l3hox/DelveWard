#!/bin/bash
# planning/m4.5/scripts/a6-gate.sh
#
# Evaluates the A6 gate from PLAN.md §Phase ordering: counts switch-on-type
# sites across the entity-dispatch hotspots. If the count is >= THRESHOLD,
# emits "queue" and the runner authors A6-spec.md. Otherwise emits "skip"
# and the runner records A6 as `skipped` with the measured count.
#
# stdout (structured, one line):
#   queue switch_sites=N case_sites=M threshold=T
#   skip  switch_sites=N case_sites=M threshold=T
# exit code is always 0 unless the script itself is broken.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"

# The four files PLAN.md identifies as the fan-out surface.
FILES=(
    "src/core/gameState.ts"
    "src/level/levelLoader.ts"
    "src/level/interaction.ts"
    "src/main.ts"
)

THRESHOLD="${A6_THRESHOLD:-3}"

SWITCH_COUNT=0
CASE_COUNT=0
for rel in "${FILES[@]}"; do
    abs="${REPO_ROOT}/${rel}"
    [ -f "$abs" ] || continue

    # switch on entity .type or .kind — tolerates `as string` casts and other glue inside the parens.
    # Uses grep -E (POSIX/BSD extended) for portability; rg is a shell function in some envs.
    S="$(grep -cE 'switch[[:space:]]*\([^)]*\.(type|kind)[^a-zA-Z0-9_]' "$abs" 2>/dev/null || true)"
    S="${S:-0}"
    SWITCH_COUNT=$((SWITCH_COUNT + S))

    C="$(grep -cE "case[[:space:]]+'[a-z_]+'[[:space:]]*:" "$abs" 2>/dev/null || true)"
    C="${C:-0}"
    CASE_COUNT=$((CASE_COUNT + C))
done

if [ "$SWITCH_COUNT" -ge "$THRESHOLD" ]; then
    echo "queue switch_sites=${SWITCH_COUNT} case_sites=${CASE_COUNT} threshold=${THRESHOLD}"
else
    echo "skip switch_sites=${SWITCH_COUNT} case_sites=${CASE_COUNT} threshold=${THRESHOLD}"
fi
