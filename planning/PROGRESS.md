# DelveWard — PROGRESS.md

## How to use this file

Read this at the start of every Claude Code session to restore context. Update it at the end of each session. This is the project's session-to-session memory. See PLAN.md for full phase details and design decisions.

---

## Versioning

`0.milestone` — e.g. `0.1` when Milestone 1 ships, `0.2` for Milestone 2, etc.
Pre-milestone prototype work accumulated as `0.0.x` patches. Current tag: **v0.0.9**.

---

## Current Phase

**Phase 8 — Later Resources & Polish** (pending)

---

## What's Done

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

## Next Steps

**Milestone 1: The Loot Game** — data foundation done, next: implement entity registry + item loader, then stats/leveling.

### M1 Design & Data (done)
- [x] `planning/m1/DESIGN.md` — full M1 design doc: scope, decisions, architecture, data model, implementation order
- [x] `planning/m1/ENEMIES.md` — full 9-enemy roster with stats, behaviors, new mechanics (flee, erratic, regen)
- [x] `public/data/items.json` — central item database: 57 items (22 weapons, 20 armor, 10 accessories, 5 consumables)
- [x] `public/data/loot-tables.json` — per-enemy loot tables with XP, gold ranges, drop chances for all 9 enemies

### M1 Implementation
- [x] Phase A: Entity registry + item loader (`src/core/entities.ts`, `src/core/itemDatabase.ts`, GameState migration, renderer re-wire, 67 new tests)
- [x] Phase B: Stats & leveling (STR/DEX/VIT/WIS on GameState, XP, level-up, character creation screen, 21 new tests)
- [x] Phase C: Equipment expansion (weapon subtypes, item requirements, effective stats, XP bar, stats panel, 20 new tests)
- [ ] Phase D: Loot & drops (enemy death → loot roll → ground entities, gold)
- [ ] Phase E: UI (enemy health bars, paper doll, tooltips, level-up popup)
- [ ] Phase F: Content (M1 test dungeon — 3 levels)

---

## Phase Overview

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation Refactor | **Complete** |
| 2 | Visual Polish (textures) | **Complete** |
| 3 | Doors & Interaction | **Complete** |
| 4 | HUD | **Complete** |
| 5 | Multi-Level Dungeons | **Complete** |
| 6 | Entities & Enemy System | **Complete** |
| 7 | Combat | **Complete** |
| 8 | Later Resources & Polish | **Complete** |

---

## Open Questions

- ~~Minimap — render in 3D scene or as 2D canvas overlay?~~ → Resolved: 2D canvas overlay
- ~~Combat interaction model~~ → Resolved: F key melee attack, real-time with cooldown
- ~~Death/respawn behavior~~ → Resolved: fade-to-black, full level restart, enemies respawn

---

## Known Issues

(none)

---

## Session Log

### Session 23 — M1 Phase C: Equipment Expansion + Debug Tooling

**Phase C — complete (C1–C4):**
- `src/core/combat.ts` — `WEAPON_BEHAVIOR` table (sword/axe/dagger/mace/spear/staff) with per-type cooldown + damage multiplier. `getWeaponCooldown()` reads equipped weapon from DB. `resolveWeaponEffect()` applies specials: axe ignores 1 DEF, dagger overrides crit to 10%, mace +2 vs armored. `playerAttack()` returns `CombatResult[]` (was single result), spear hits 2 cells deep.
- `src/core/gameState.ts` — `getEffectiveStats()` now returns `effectiveStr/Dex/Vit/Wis` (base + item attribute bonuses). `getEquippedWeaponDef()` looks up weapon ItemDef from entity registry. `canEquipItem()` checks STR/DEX/VIT/WIS requirements. `pickupEquipmentAt()` returns `{ item?, denied? }` — blocks equip if requirements unmet, shows HUD denial message.
- `src/main.ts` — `playerAttack()` result loop handles multi-target (spear). Equipment pickup shows HUD message on success/denial. T key toggles stats panel. Stats panel blocks game input while open.
- `src/core/combat.test.ts` — 20 new tests: weapon behavior table values, `resolveWeaponEffect` specials (axe DEF ignore, dagger crit, mace armored bonus), spear table entries, min damage guarantee.
- `src/core/gameState.test.ts` — Tests for `canEquipItem` (STR/DEX requirements, allow/deny), `getEquippedWeaponDef` (no DB), effective attribute return values.

**HUD additions:**
- `src/hud/xpBar.ts` — XP bar HUD widget: level label + blue progress bar + fraction text. Shows "MAX" at level cap (15).
- `src/hud/hudLayout.ts` — `XP_BAR` layout constant (bottom-center, between torch and inventory).
- `src/hud/hudCanvas.ts` — XP bar wired into draw loop. `showMessage()` method for centered fade-out text (2.5s). `StatsPanel` integrated.
- `src/hud/statsPanel.ts` — Debug stats overlay (T key): base vs effective stats side-by-side, green/red coloring for diffs. Will be repurposed in Phase E.

**Content:**
- `public/levels/dungeon3.json` — Added test weapons (bent knife/dagger, battle axe, wooden spear, ring of power) for manual testing.

**Test count:** 689 (669 + 20 new Phase C tests)

### Session 22 — M1 Phase B: Stats & Leveling
- `GameState`: str/dex/vit/wis/xp/level/attributePoints/playerName fields
- maxHp formula: `40 + VIT × 5` (was hard-coded 20)
- `getEffectiveStats()` aggregates derived stats (atk/def/maxHp/crit/dodge) from attributes + equipped items
- `getEffectiveAtk()`/`getEffectiveDef()` delegate to `getEffectiveStats()`
- `xpForLevel()`, `addXp()`, `allocatePoint()`, `applyCharacterSetup()`
- `EnemyDef.xp` field: rat=10, skeleton=25, orc=50
- `CharacterCreationScreen` — 5-point stat allocation canvas overlay before dungeon loads
- `LevelUpNotification` — 3s gold flash, 2s fade-out, centered top-center
- XP awarded on kill in `main.ts`; level-up triggers notification
- 669 tests (348 + 21 new Phase B tests)

### Session 21 — M1 Phase A: Entity Registry + Item Database
- Created `planning/m1/PLAN.md` — full M1 implementation plan (Phases A–F with swarm structure)
- Created `src/core/itemDatabase.ts` — typed loader + query API for items.json
- Created `src/core/entities.ts` — `EntityRegistry`, `ItemLocation` union, `EquipSlot` (10 slots)
- Migrated `GameState` to dual-write: entity registry alongside legacy maps (backwards compat)
- Updated renderers (`itemRenderer`, `consumableRenderer`) to query registry, fall back to legacy maps on DB miss
- Updated `inventoryPanel.ts` to show 10-slot equipment + 12-slot backpack
- Fixed equipment slot validator in `levelLoader.ts` (3→10 slots)
- Fixed legacy slot names in dungeon JSON (`armor`→`chest`/`shield`, `ring`→`ring1`)
- Added `preloadEnemyTextures()` — all sprites loaded before scene build; fixes orc delayed appearance
- 348 tests (281 existing + 67 new), clean TypeScript build
- Manual testing confirmed: game loads, movement/torch good, item pickup/equip/potion use working

### Session 20 — M1 Design & Data Foundation
- Created versioning scheme: `0.milestone` (v0.1 = M1 done, etc.)
- Created `CHANGELOG.md` with v0.0.9 entry covering all 8 phases
- Tagged `v0.0.9` on current HEAD
- Added versioning note to `PROGRESS.md` and `MILESTONES-V2.md`
- Created `planning/m1/` folder with full M1 design:
  - `DESIGN.md` — scope, 6 open TBDs resolved, architecture, data model, item system, stats, XP/leveling, gold, loot tables, paper doll UI, implementation order
  - `ENEMIES.md` — 9-enemy roster (rat/skeleton/orc + goblin/giant bat/spider/kobold/zombie/troll) with stats, behaviors, new mechanics
- Enemy quality tier: added `poor` (10%), rebalanced `common` to 50%
- Added per-entity drops override schema to DESIGN.md
- Added E6 (sub-grid entity positioning) to FEATURES-V2.md, slotted into M2
- Created `public/data/items.json` — 57 items across weapons/armor/accessories/consumables
- Created `public/data/loot-tables.json` — loot tables for all 9 enemies with XP, gold, drop chances

### Session 19 — Billboard Fix + V2 Design Sprint
- Fixed billboard sprite lighting: view-space distance-only shader (no NdotL), clamped intensity
- Fixed sprite positioning: feet at ground level (size * 0.5)
- Updated orc sprite size to 2.0
- Created v2 design documents:
  - `DESIGN-V2.md` — full feature brainstorm (vertical world, signals, editor, scripting, NPCs, quests, items, magic, RPG)
  - `STORY-IDEAS.md` — narrative and atmosphere ideas
  - `ART-GUIDE.md` — art/audio production guide with prompt templates and pipeline
  - `FEATURES-V2.md` — 87 features categorized into 4 tiers, 8 open TBDs
  - `MILESTONES-V2.md` — 9 playable milestones with anti-burnout rules
  - `DESIGN-DISCUSSION.md` — session summary
- Key decisions: agile data model approach (design per milestone, refactor as needed), unified decorative 3D mesh system
- Next: Milestone 1 — The Loot Game

### Session 18 — Particle Effects
- Created `src/rendering/particles.ts` with three particle classes:
  - `DustMotes` — warm-tinted Points near ceiling, spawn around player, gentle drift, fade by distance
  - `SconceEmbers` — orange sparks rising from lit sconce flame meshes (child[3] world position)
  - `WaterDrips` — full lifecycle: form on ceiling (1.5s grow), fall with gravity + stretch, 4-ring splash on floor
- All use BufferGeometry Points or Sprites with additive blending, `frustumCulled = false`
- Per-level flags on `DungeonLevel`: `dustMotes` (default true), `waterDrips` (default false)
- Wired into `main.ts` game loop, level transitions, and death restart
- Enabled `waterDrips` on dungeon3 "Dark Cellar" level
- TypeScript compiles clean

### Session 17 — Phase 8: Equipment, consumables, enemy animations
- Equipment system: `EquipSlot`, `EquipmentItem` types on GameState, weapon/armor/ring slots
- `getEffectiveAtk()`/`getEffectiveDef()` replace raw stats in combat
- `enemyAttackPlayer()` signature simplified (reads def from gameState internally)
- Ground equipment pickup + auto-equip on step, `itemRenderer.ts` billboard sprites
- Consumable items: `ConsumableItem` type, `health_potion` and `torch_oil` subtypes
- Backpack array (max 8), use via Digit1-8 keys, persists across levels
- `consumableRenderer.ts` — red flask (potion) / yellow flask (oil) billboard sprites
- HUD inventory panel shows equipped item indicators and backpack contents
- Entity validation for `equipment` and `consumable` types in levelLoader
- Enemy hit shake: horizontal oscillation (sin-based, 0.3s, amplitude 0.25, decaying)
- Enemy attack lunge: forward-and-back toward player (triangle wave, 0.25s, 0.6 units)
- Items added to dungeon1.json: Rusty Sword, Iron Shield, Power Ring, potions, torch oil
- 281 tests (23 new), TypeScript compiles clean

### Session 16 — Phase 7 complete
- Floating damage numbers: `src/rendering/damageNumbers.ts` — 3D billboard sprites with canvas-rendered white text + black outline, float up and fade out over 0.7s
- Sword swing animation: `src/rendering/swordSwing.ts` — pixelart sword drawn on HUD canvas, sweeps from lower-right to upper-left over 0.25s with easeOutQuad
- Wired both into `main.ts` (game loop + F key handler) and `hudCanvas.ts`
- Marked Phase 7 complete, resolved all open questions
- 258 tests, TypeScript compiles clean

### Session 15 — Phase 6 complete, Phase 7 combat foundation
- Marked Phase 6 complete (enemy system was already implemented in prior sessions but PROGRESS.md wasn't updated)
- Created `src/core/combat.ts` — pure combat logic: `calculateDamage()`, `playerAttack()`, `enemyAttackPlayer()`
- Damage formula: `max(1, ATK - DEF + random(-1..+1))` — always deals at least 1
- Added `atk`, `def`, `attackCooldown` to `GameState` (player: ATK 3, DEF 1)
- Renamed enemy `damage` to `atk` + added `def`: rat (2/0), skeleton (3/1), orc (5/2)
- F key attacks facing cell with 0.8s cooldown
- Enemy AI attack actions now call `enemyAttackPlayer()` with real damage
- Combat feedback: enemy mesh flashes red on hit, HUD red overlay on player damage, weapon slot cooldown fill overlay
- Death: HP <= 0 triggers fade-to-black → full level restart (reset state, player start, full HP/torch)
- 258 tests (10 new), TypeScript compiles clean

### Session 14 — Camera Viewport Tuning
- Asymmetric frustum crop via `setViewOffset` in `main.ts`:
  - `CAMERA_CROP_TOP = 0.15` (cut 15% from top — claustrophobic ceiling)
  - `CAMERA_CROP_BOTTOM = -0.2` (expand 20% downward — more visible floor)
  - `CAMERA_CROP_SIDE` auto-derived from top+bottom to preserve 1:1 aspect ratio
  - Applied on init and on window resize
- Camera pitch tilt on stair cells in `player.ts`:
  - `STAIR_PITCH = 0.15` rad (~8.5°) — look down on S cells, look up on U cells
  - `STAIR_Y_OFFSET = 0.35` — camera dips/rises on stairs
  - Pitch lerped smoothly like position and angle
- `CAMERA_BACK_OFFSET` increased from 0.4 to 0.95 — telephoto effect flattens perspective
- `EYE_HEIGHT` changed from 1.0 to `WALL_HEIGHT * 0.65` in `dungeon.ts`
- `CAMERA_FOV` tuned from 80 to 75
- Fixed stair target coordinates in `dungeon1.json`
- Tried and discarded depth Z-scaling (projection matrix column 2 scaling) — same visual result as FOV change, not useful

### Session 13 — 3D Stair Geometry, Visual Polish
- Created `src/rendering/stairRenderer.ts` — 3D stair steps for S/U cells
  - `detectStairFacing()` finds walkable neighbor for approach direction
  - `buildStairGroup()` creates 4 floor steps, 4 ceiling steps, 2 side walls, 1 black back wall
  - Floor steps use cell's floor texture, sides use wall texture, ceiling uses ceiling texture
  - Texture resolution: defaults → areas (same layer logic as dungeon.ts)
  - Side walls flush with cell edges, extend 2×WALL_HEIGHT (no gaps or black holes)
  - Side wall UV correction: thin faces proportional, tall faces repeat with RepeatWrapping
  - Back wall: `MeshBasicMaterial({ color: 0x000000 })` — pure darkness, unaffected by lighting
  - Vertex color depth fade: all geometry fades to black toward the back wall
- Modified `src/rendering/dungeon.ts` — skip floor, ceiling, and all walls for S/U cells
- Modified `src/rendering/doorRenderer.ts` — fixed squeezed textures on door frame pillars/lintel with proportional UV scaling
- Modified `src/main.ts`:
  - Integrated `stairMeshes` into `LevelScene`, `buildLevelScene()`, `teardownLevelScene()`
  - Added `L` key debug fullbright toggle (bright ambient light + fog disable)
  - Extracted `CAMERA_FOV` as named constant
- Updated `CLAUDE.md` — added Agent & Model Preferences section (standing instructions)
- TypeScript compiles clean

### Session 12 — Phase 5 Complete: Multi-Level Dungeons
- Added `Dungeon` type, `LevelSnapshot`, `saveLevelState()`/`loadLevelState()`/`loadNewLevel()`/`drainTorchFuel()` to GameState
- Extracted `_parseEntities()` from constructor for reuse by `loadNewLevel()`
- Added `loadDungeon()`/`validateDungeon()` with stair entity validation and cross-level reference checks
- Created `TransitionOverlay` — pure DOM fade-to-black overlay
- Restructured `main.ts`: `LevelScene` interface, `buildLevelScene()`/`teardownLevelScene()`, `wireCallbacks()`, `triggerLevelTransition()`
- Stair detection on step triggers fade transition → level swap → fade in
- Torch fuel drains per step, light scales with fuel ratio
- Created `dungeon1.json` — two-level test dungeon with key puzzle
- Minimap shows stairs in teal (`#44aacc`)
- Updated ARCHITECTURE.md with dungeon format, transition overlay, snapshot methods
- 215 tests (28 new), TypeScript compiles clean
- Phase 5 complete

### Session 11 — Phase 4 Complete: HUD overlay
- Created `src/hud/` folder with 9 files: canvas setup, layout, colors, pixel font, compass, minimap, health bar, torch indicator, inventory panel
- 2D canvas overlay (640x360) with `image-rendering: pixelated` for crisp pixel-art scaling
- `GameState` gains `hp`, `maxHp`, `torchFuel`, `maxTorchFuel`, `exploredCells`, `revealAround()`
- `revealAround()` marks current + 4 adjacent + line-of-sight forward as explored
- `Player` gains `setOnTurn()` callback (same pattern as `setOnMove()`)
- Wired exploration into initial position, onMove, and onTurn callbacks
- Removed old controls hint div
- Updated ARCHITECTURE.md with HUD module docs
- 187 tests (20 new), TypeScript compiles clean
- Phase 4 complete

### Session 0 — Project conceived
- Decided on genre, tech stack, and approach via conversation with Claude (claude.ai)
- Core design pillars established — see DESIGN.md
- No code written, ready to start scaffolding

### Session 1 — Scaffold
- Created CLAUDE.md for persistent session context
- Finalised remaining open decisions: TypeScript, Vite + npm, tween camera
- Scaffolded full project: `index.html`, `package.json`, `tsconfig.json`, `src/main.ts`, `src/dungeon.ts`, `src/player.ts`, `.gitignore`
- Two rooms connected by a corridor, grid movement with tween camera, torch flicker, fog
- Tested successfully in browser

### Session 4 — Phase 1 Complete
- Completed all remaining Phase 1 steps (2–5) in one session
- Defined `DungeonLevel` type, switched grid from `number[][]` to `string[]`
- Built `levelLoader.ts` with `loadLevel()` + `validateLevel()` — fetch + validate JSON levels
- Created 3 level files in `public/levels/`
- `buildDungeon` returns `THREE.Group` instead of mutating scene
- Wrapped `main.ts` in async `init()` with error handling
- Added Vitest — 38 tests across grid logic and loader validation
- Ran Developer Council code review (SoftwareDeveloper + QaTester)
- Addressed all council findings: validation hardening, test coverage gaps, minor fixes

### Session 3 — Phase 1 Step 1: Extract PlayerState
- Extracted pure grid logic (`Facing`, direction tables, `isWalkable`, `PlayerState`) into `src/grid.ts`
- Refactored `src/player.ts` to delegate to `PlayerState`, keeping only Three.js rendering
- TypeScript compiles clean, no Three.js dependency in grid.ts

### Session 7 — Phase 2: charDefs texture system + designer guide
- Replaced verbose cellOverrides with 4-layer texture resolution: hard-coded → defaults → charDefs → areas
- Added `CharDef` interface (extends TextureSet with char + solid) to types.ts
- `buildWalkableSet()` in grid.ts merges walkable charDef chars into WALKABLE_CELLS
- `isWalkable()` and `PlayerState` accept optional walkable set for custom chars
- `buildDungeon()` resolves charDef textures (layer 3) and solid charDef wall textures for neighbor faces
- Level loader validates charDefs before grid chars, extends known/walkable sets
- Rewrote levels 4–6 JSON: replaced areas with charDefs, grids now use b/,/m/w characters
- Created `DUNGEON-DESIGNER.md` — full level JSON schema reference
- 76 tests pass (28 new), TypeScript compiles clean

### Session 6 — Phase 2: Texture variety + new dungeons
- Added 6 new procedural texture generators: brick/mossy/wood walls, dirt/cobblestone floors, wooden beams ceiling
- Built texture registry with cached getters (`getWallTexture`, `getFloorTexture`, `getCeilingTexture`)
- Created `src/textureNames.ts` — pure constants file with type-safe texture name validation
- Wired `CellOverride` into `buildDungeon` — per-cell material selection via override lookup map
- Added `ceilingTexture` field to `CellOverride` type
- Level loader validates cellOverrides (bounds, known texture names, types) — 10 new tests
- Created 3 new themed levels: level4 (Sunken Crypt), level5 (Winding Depths), level6 (Grand Hall)
- Identified need to refactor cellOverrides model — current per-cell approach is too verbose for larger maps

### Session 10 — Door system improvements + lever/plate polish
- 3D door frames — stone pillars + lintel (always visible), door panel slides up/down via `DoorAnimator`
- `D` cells without entity auto-create closed doors (no more empty doorways)
- Doors re-closable with Space (non-mechanical only)
- Mechanical flag — doors targeted by levers/plates can't be opened/closed by player
- Interactive doors have brass buttons on frame to distinguish from mechanical
- Lever: repeatable up/down state with animated handle (`LeverAnimator`), directional wall interaction
- Pressure plate: one-time use, pressed state sinks mesh + darker cracked texture
- Door animation speed increased (3.0 → 5.0 units/sec)
- `openDoor()` rejects mechanical doors; `activatePressurePlate` bypasses check
- Entity validation for lever `wall` field
- 167 tests (20 new), TypeScript compiles clean

### Session 9 — Phase 3 Complete: Test level + entity validation (Step 7)
- Created `public/levels/level7.json` "The Locked Vault" — showcase level with all Phase 3 features
- Added entity validation to `levelLoader.ts` — validates doors, keys, levers, pressure plates
- 15 new entity validation tests in `levelLoader.test.ts`
- Updated `main.ts` to load level7 by default
- 147 tests total, TypeScript compiles clean
- Phase 3 complete

### Session 8 — Phase 3: Doors & Interaction (Steps 1–6)
- Created `gameState.ts` — doors (open/closed/locked), keys, levers, pressure plates, inventory
- Added `isDoorOpen` callback to `isWalkable()` and `PlayerState` for door-aware movement
- Created `interaction.ts` — Space key opens doors, unlocks with keys, pulls levers
- Created `doorRenderer.ts` — door meshes with auto-orientation, visibility toggle
- Added procedural door textures (wood + locked iron-banded) to `textures.ts`
- Created `keyRenderer.ts` — gold key billboard meshes, auto-pickup on step
- Levers toggle linked doors, pressure plates one-way open linked doors
- `Player` gained `getState()`, `setOnMove()` callback for step-triggered events
- 132 tests (56 new across gameState, interaction, grid)

### Session 2 — Planning
- Ran Developer Council (4 specialists, 3 rounds) to identify all vague spots and create implementation plan
- Resolved all underspecified design decisions (stats, doors, inventory, enemies, resources, transitions)
- Created PLAN.md with 8-phase build order, architecture plan, and file structure
- Established session workflow rules in CLAUDE.md
- Updated PROGRESS.md to track phases

---

## Ideas Parking Lot

- Stats model (fuller character stats system)
- Animated water + lava tiles with lowered floor
- Outdoor sections — no ceiling, skybox, fullbright lighting only for outdoor tiles; indoor/outdoor boundary wall acts as strong light source; day/night cycle affects outdoor light level
- Multiple dungeon layers visible at once (vertical openness)
- Particle effects — dust motes in torchlight, embers near sconces, dripping water from ceiling
- Footstep screen bob — subtle camera vertical bounce on each step
- Damage directional indicator — brief red arrow on HUD showing attack direction
- Enemy health bars — small floating bar above enemy sprites
- Breakable / cracked walls — attack to reveal hidden rooms
- Trap tiles — spikes, darts triggered by stepping on a cell
- Message popups — stone tablets / signs showing lore/hints on interact
- Minimap fog-of-war fade — explored but not visible cells draw dimmer
- Procedural dungeon generation
- Ambient sound — dripping water, distant echoes
- Secret walls that push open
- Throwing items — toss potions/rocks at enemies from range with arc animation
- Environmental hazards — poison gas clouds draining HP while standing in them
- Treasure chests — interact to open, drop random loot, animated lid
- Enemy drops — killed enemies leave items on the ground, loot table per type
- Torch wall shadows — dynamic shadow planes behind pillars/door frames
- Status effects — poison (tick damage), slow (longer tween), blind (reduced torch range)
- Pushable blocks — grid-aligned blocks for dungeon puzzles
- Thin walls — walls between two walkable cells (edge walls, not cell walls), including thin wall doors; enables villages and walk-in houses
