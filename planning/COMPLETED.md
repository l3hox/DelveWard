# DelveWard — Completed Work

Detailed checklist of everything that's been built. For session-by-session notes, see `SESSION-LOG.md`.

---

- [x] CLAUDE.md created — auto-loads project context each session
- [x] PLAN.md created — full implementation plan with all design decisions resolved
- [x] Project scaffolded — Vite + TypeScript + Three.js
- [x] Dungeon renderer — builds wall/floor/ceiling geometry from a 2D map array
- [x] Two-room map with connecting corridor
- [x] Grid movement — forward, back, strafe left/right, turn left/right
- [x] Smooth tween camera on every step and turn
- [x] Torch point light with flicker, follows player
- [x] Fog for atmosphere
- [x] Tested and working in Windows browser via WSL2 (`npm run dev` → localhost:5173)
- [x] **Phase 1 complete** — Foundation Refactor:
  - Extracted `PlayerState` + grid logic into `src/grid.ts` (pure TS, no Three.js)
  - `DungeonLevel`, `Entity`, `CellOverride` types in `src/types.ts`
  - Grid format: `string[]` with char-based cells, `WALKABLE_CELLS` set
  - External JSON level loading with validation (`src/levelLoader.ts`)
  - 3 level files in `public/levels/`
  - `buildDungeon` returns `THREE.Group` (enables level teardown)
  - `main.ts` async init with error handling
  - Vitest: 38 tests (grid logic + loader validation)

---

- [x] **Phase 2 complete** — Visual Polish:
  - Procedural pixelart textures (9 styles: 4 wall, 3 floor, 2 ceiling)
  - Q/E key bindings for turning
  - 4-layer texture resolution: hard-coded → defaults → charDefs → areas
  - `CharDef` system — custom ASCII chars with solid/walkable + texture set
  - 6 dungeon levels (levels 4–6 use charDefs for visual theming)
  - `DUNGEON-DESIGNER.md` — full level JSON schema reference
  - 76 tests
  - Visual polish verified in-game

---

- [x] **Phase 3 complete** — Doors & Interaction:
  - `GameState` class — door state (open/closed/locked), key inventory, lever/plate logic
  - Door-aware walkability — `isDoorOpen` callback in `isWalkable()` and `PlayerState`
  - Interaction system — `interact()` via Space key: open/close/unlock doors, pull levers
  - Door visuals — 3D stone frames (pillars + lintel) with door panels, sliding animation on open/close
  - Mechanical doors (lever/plate-controlled) — can't be opened/closed by player interaction
  - Interactive doors have brass buttons on frame to visually distinguish them
  - `D` cells without door entity auto-create a closed, non-mechanical door
  - Key system — auto-pickup on step, `keyRenderer.ts` billboard meshes
  - Lever system — repeatable up/down state, stand on cell + face wall to pull, animated handle
  - Pressure plates — one-time use, visual pressed state (sinks + darkens), auto-trigger on step
  - Entity validation in `levelLoader.ts` — doors, keys, levers (incl. wall), pressure plates
  - Level 7 "The Locked Vault" — showcase level for all Phase 3 features
  - 167 tests (91 new)

---

- [x] **Phase 4 complete** — HUD:
  - 2D canvas overlay (640x360 internal, `image-rendering: pixelated`) on top of Three.js viewport
  - Compass rose (top-left) — N/E/S/W letters, active direction highlighted gold
  - Minimap (top-right) — explored-cell top-down grid, player dot + facing line, centered on player
  - Health bar (bottom-left) — heart icon, HP fill bar, low-HP pulse effect
  - Torch indicator (bottom-center-left) — flame icon, fuel fill bar, low-fuel flicker effect
  - Inventory panel (bottom-right) — key count with icon, 3 equipment slots (W/A/R), 8 backpack slots
  - `GameState` gains `hp`/`maxHp`, `torchFuel`/`maxTorchFuel`, `exploredCells`, `revealAround()`
  - `Player` gains `setOnTurn()` callback for exploration on facing change
  - Exploration: current cell + 4 adjacent + line-of-sight forward until wall
  - New `src/hud/` folder with 9 files
  - Removed controls hint div (HUD replaces it)
  - 187 tests (20 new)

- [x] **Phase 5 complete** — Multi-Level Dungeons:
  - `Dungeon` type with `levels[]` array, each level has unique `id`
  - `LevelSnapshot` + `saveLevelState()` / `loadLevelState()` for per-level state persistence
  - `loadNewLevel()` resets level maps but preserves hp/torchFuel/inventory
  - `drainTorchFuel()` — torch fuel drains 1 per step
  - `loadDungeon()` / `validateDungeon()` — multi-level JSON loading with cross-level stair validation
  - Stair entity validation: direction (up/down), targetLevel, targetCol/targetRow, cell type matching
  - `TransitionOverlay` — fade-to-black DOM overlay for level transitions
  - `main.ts` restructured: `LevelScene` interface, `buildLevelScene()` / `teardownLevelScene()`
  - Stair detection in onMove callback triggers `triggerLevelTransition()`
  - Torch light distance (3–8) and flicker intensity scale with fuel ratio
  - `dungeon1.json` — two-level test dungeon ("Entry Hall" + "Lower Vault")
  - Minimap renders S/U cells in distinct teal color
  - Input blocked during transitions via `transition.isActive`
  - 215 tests (28 new), TypeScript compiles clean
- [x] **3D Stair Geometry** — visual stair steps for S/U cells:
  - `stairRenderer.ts` — 4 floor steps + 4 ceiling steps + side walls + black back wall per stair cell
  - Floor/ceiling/wall textures resolved per cell (defaults → areas)
  - Side walls flush with cell edges, extend one extra floor height (no gaps or black holes)
  - Side wall UV correction: thin faces proportional, tall faces repeat with `RepeatWrapping`
  - Back wall pure black (`MeshBasicMaterial`) — darkness beyond the stairwell
  - Vertex color depth fade: all geometry fades to black toward the back wall
  - `dungeon.ts` skips floor, ceiling, and wall rendering for stair cells
  - Stair facing auto-detected from adjacent walkable neighbor
- [x] **Debug fullbright toggle** — `L` key toggles bright ambient light + disables fog
- [x] **Camera viewport tuning**:
  - Asymmetric frustum crop via `setViewOffset` — crop top 15%, expand bottom 20%
  - Side crop auto-derived from top+bottom to preserve 1:1 aspect ratio
  - Camera pitch tilt on stair cells (look down on S, look up on U) with smooth lerp
  - Camera back offset increased to 0.95 — telephoto effect flattens perspective
  - `EYE_HEIGHT` set to 65% of `WALL_HEIGHT`
  - FOV tuned to 75
  - Fixed stair target coordinates in `dungeon1.json`

- [x] **Phase 6 complete** — Entities & Enemy System:
  - 3 enemy types: rat (fast/weak), skeleton (medium), orc (slow/strong) — `src/enemies/enemyTypes.ts`
  - Enemy AI state machine: idle → chase → attack — `src/enemies/enemyAI.ts`
  - BFS grid pathfinding with collision avoidance — `src/enemies/pathfinding.ts`
  - Billboard sprites with pixelart textures (rat, skeleton, orc) — `src/rendering/enemyRenderer.ts`
  - Smooth enemy movement animation via lerp — `src/rendering/enemyAnimator.ts`
  - Real-time timers (each enemy has own `moveInterval`), not turn-based
  - Enemies respect occupied cells (no stacking), door walkability
  - Aggro/deaggro based on Manhattan distance with hysteresis buffer
  - Refactored `src/core/` into `core/`, `enemies/`, `level/` directories
  - 248 tests (33 new)

- [x] **Phase 7 complete** — Combat:
  - Combat stats: player ATK/DEF on GameState, enemy ATK/DEF — `src/core/combat.ts`
  - Damage formula: `max(1, ATK - DEF + random(-1..+1))`
  - Player attack: F key swings at facing cell, 0.8s cooldown
  - Enemy attack: AI attack actions deal damage via `enemyAttackPlayer()`
  - Combat feedback: enemy flash red on hit, player red overlay on HUD, weapon slot cooldown fill
  - Floating damage numbers — 3D billboard sprites float up and fade out from hit enemies
  - Sword swing animation — pixelart sword arc on HUD canvas when player attacks
  - Death/restart: HP <= 0 fades to black and restarts current level (full reset, enemies respawn)
  - 258 tests

- [x] **Phase 8 (partial)** — Equipment, Consumables, Enemy Animations:
  - Equipment system: weapon/armor/ring slots with ATK/DEF bonuses, ground pickup + auto-equip
  - `getEffectiveAtk()`/`getEffectiveDef()` on GameState, wired into combat
  - Consumable items: health potions (restore HP) and torch oil (restore fuel)
  - Backpack inventory (max 8 slots), use via number keys 1-8
  - Item/consumable billboard renderers (pixelart icons on ground)
  - HUD inventory panel shows equipped items and backpack contents
  - Entity validation for equipment and consumable types in levelLoader
  - Enemy hit shake animation (horizontal oscillation, 0.3s, decaying)
  - Enemy attack lunge animation (forward-and-back toward player, 0.25s)
  - Items placed in dungeon1.json (sword, shield, ring, potions, oil)
  - 281 tests (23 new)

- [x] **Particle Effects** — Atmosphere & visual polish:
  - Dust motes: warm-tinted particles floating near ceiling, spawn around player, per-level toggle (`dustMotes`, default true)
  - Sconce embers: orange sparks rising from lit sconce flame meshes, additive blending
  - Water drips: drops form slowly on ceiling, fall with gravity + stretch, splash rings on floor, per-level toggle (`waterDrips`, default false)
  - All use Three.js Points/Sprites with additive blending, frustum culling disabled
  - `src/rendering/particles.ts` — `DustMotes`, `SconceEmbers`, `WaterDrips` classes
  - `dustMotes` and `waterDrips` boolean flags on `DungeonLevel` type
