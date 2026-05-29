---
# M4.5 autonomous-run status
#
# Source of truth for the runner across iterations and restarts.
# Updated atomically: write to STATUS.md.tmp, then rename.
#
# The runner reads this on every iteration to:
#   - pick the next pending phase whose deps are done
#   - verify HEAD == last `m4.5-A{N}-done` tag
#   - check the budget cap (if MAX_USD > 0)
#   - resume from the last consistent state on restart

run_branch: ""
base_branch: m4.5-preflight
started_at: null
last_heartbeat_at: null

max_usd: 0                  # 0 = unlimited; spend tracked but no cap
usd_per_mtoken: 8           # rough blended Sonnet rate; treat estimated_usd as order-of-magnitude
council_depth: quick        # quick = Round 1 + synthesis; full = 3 rounds

baseline:
    # Captured by the runner at `m4.5-start` tag creation.
    test_count: null
    assertion_density: null
    test_file_shas: {}

stats:
    agents_spawned: 0
    total_tokens: 0
    estimated_usd: 0.00
    by_role:
        spec_author:       { spawned: 0, tokens: 0 }
        spec_review:       { spawned: 0, tokens: 0 }
        phase_worker:      { spawned: 0, tokens: 0 }
        phase_remediation: { spawned: 0, tokens: 0 }
        council:           { spawned: 0, tokens: 0 }

phases:
    A1:
        status: done
        title: "Refresh ARCHITECTURE.md"
        depends_on: []
        finished_at: "2026-05-25T20:00:00Z"
        attempts: 1
        spend_usd: 0.00
    A2:
        status: pending
        title: "Invert core/ -> enemies/, npcs/ deps so core/ compiles standalone"
        depends_on: []
        worker_agent: RefactoringSpecialist
    A4:
        status: skipped
        title: "Split gameState.ts behind a GameState facade (inventory/combat/status/world)"
        depends_on: [A2]
        worker_agent: RefactoringSpecialist
    A3:
        status: skipped
        title: "Extract per-frame systems from main.ts into src/game/"
        depends_on: [A4]
        worker_agent: RefactoringSpecialist
    A5:
        status: skipped
        title: "Consolidate save-state sources through a single getSaveData/applySaveData seam"
        depends_on: [A3, A4]
        worker_agent: SoftwareDeveloper
    A7:
        status: skipped
        title: "Pull controller logic (torch drain, hunger drain, transition state machine) into core/"
        depends_on: [A3]
        worker_agent: RefactoringSpecialist
    A6:
        status: skipped
        title: "EntityKind registry (queued only if a6-gate.sh emits `queue`)"
        depends_on: [A3, A4]
        gated: true
        gate_script: planning/m4.5/scripts/a6-gate.sh
        worker_agent: RefactoringSpecialist
---
