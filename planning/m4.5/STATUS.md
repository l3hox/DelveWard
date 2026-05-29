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

run_branch: "m4.5-run-4"
base_branch: m4.5-preflight
started_at: "2026-05-29T10:30:00Z"
last_heartbeat_at: "2026-05-29T11:05:39Z"
max_usd: 0                  # 0 = unlimited; spend tracked but no cap
usd_per_mtoken: 8           # rough blended Sonnet rate; treat estimated_usd as order-of-magnitude
council_depth: quick        # quick = Round 1 + synthesis; full = 3 rounds

baseline:
    # Captured by the runner at `m4.5-start` tag creation.
    test_count: 778
    assertion_density: 1475
    test_file_shas:
        src/core/combat.test.ts: d293629c94b56cb8ba9c4d43f105314433963b8b6919adf65d75c680207d2da9
        src/core/entities.test.ts: 97a8b75f020d9eabb7485d00955f3959777ff771eb3994c4c6d0e0929d7b302a
        src/core/gameState.test.ts: a0071121f4056404ac5e76a19aca19d862f456a93cfdd2a3bc1ceaab2bf0c789
        src/core/gameStateInventory.test.ts: 4e149a5c9606a413b5cc6938d7204fc4b0ddaa7a763d3e80ea536edb34471eac
        src/core/grid.test.ts: fec98274571f14286725072417b0fbbcf6fa52711f246e3a0f4b32d25bc37249
        src/core/itemDatabase.test.ts: 282fb759f1c44dbc154a13dd730db4f51161382b6ca7f1305a8b763765137bb6
        src/core/lootTable.test.ts: c1ed1f1c52166034edf0e6cd4b322ab6dc444bf96a4662a59d1afc5f7bb5cbbb
        src/core/projectileManager.test.ts: 0c4c73af94ad0e440835a80a6d6b078a6116782d987e4835c5f6c846ca9f8a8b
        src/core/questManager.test.ts: d2948d2072f433157211101f4f0df895c1dcbf21803e37cefa21495891b5f31e
        src/core/saveSystem.test.ts: 25b906dd641e182c3f824f7bed2f0e851191a43bd8742c4c4ef6cb5d7d9427ce
        src/core/signalManager.test.ts: 875947cf2d65f6e08f5970046cc4985924414a5b057bbfefcad9a064cd8e6fd7
        src/core/statusEffects.test.ts: f147f6a95a8955691b1e8914b85d5bad684d2ae332b422bcc853cae14996bf30
        src/enemies/enemyAI.test.ts: 845e5bbbafec8f721af5be50485cb2647fd8b879d4718e6cbbafc8d817c288cd
        src/enemies/enemyTypes.test.ts: 4beed1f989b2690d698e2d0b3d0721c8bc20227c62033a1d5e0117a5c9b671fa
        src/enemies/pathfinding.test.ts: 7af17c29a8a1dba5fd0d95d3ab0a5d29c08ad39360d4ab08dcb9550763bf0b18
        src/hud/attributePanel.test.ts: 30c559e5040487f2c9d4bc9c00bb82689e70ef788f8ff511fd04d696c3abefc9
        src/hud/inventoryOverlay.test.ts: 70180a40f191dfe3487786a93e692780dbe8d7565825d403d3cf232e94f3f1bb
        src/hud/itemTooltip.test.ts: 84e9c5c45f291db34035a489b4c2c942fa42215d39e0928dd776aa9f45fa8b47
        src/hud/tradingOverlay.test.ts: 88d5936b0d65f438b33ea054cc471b61d1a9b9d7bfab4c2f711f4d2bfd15bc6a
        src/level/interaction.test.ts: 68a57b56444fc3e56eb5244c2ea931859eacc21cae2df5d1ac4b94d8ee4a72fd
        src/level/levelLoader.test.ts: 6adc94d198cb716652a67b6f2a1f64b677fbfe5cae94b6bcb975bcc2677cd474
        src/rendering/enemyHealthBar.test.ts: 785d88958342763559cc2ec91394e705699f80f7bdca8f4a505d2ab5f78d03a7

stats:
    agents_spawned: 6
    total_tokens: 207403
    estimated_usd: 1.66
    by_role:
        spec_author:       { spawned: 1, tokens: 44802 }
        spec_review:       { spawned: 1, tokens: 46502 }
        phase_worker:      { spawned: 1, tokens: 82962 }
        phase_remediation: { spawned: 1, tokens: 33137 }
        council:           { spawned: 2, tokens: 0 }

phases:
    A1:
        status: done
        title: "Refresh ARCHITECTURE.md"
        depends_on: []
        finished_at: "2026-05-25T20:00:00Z"
        attempts: 1
        spend_usd: 0.00
    A2:
        status: done
        title: "Invert core/ -> enemies/, npcs/ deps so core/ compiles standalone"
        depends_on: []
        worker_agent: RefactoringSpecialist
        finished_at: "2026-05-29T11:04:52Z"
        attempts: 2
        spend_usd: 0.00
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
