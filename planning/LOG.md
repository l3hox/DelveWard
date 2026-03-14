# DelveWard — Decision & Change Log

Each entry records what was decided or changed — design decisions, architecture changes, and significant code changes. Marked by date. Newest entries first.

---

## 2026-03-14 — Level environment system

Added per-level `environment` parameter to control visual atmosphere (fog, background, ambient light).

**New type** (`src/core/types.ts`):
- `Environment` type: `'dungeon' | 'mist'`
- Optional `environment` field on `DungeonLevel` (defaults to `'dungeon'`)

**New module** (`src/rendering/environment.ts`):
- Environment presets with fog color/range and ambient light color
- `applyEnvironment()` sets scene fog, background, and ambient per level
- `getEnvironmentConfig()` for debug fullbright fog restore
- Dungeon: black fog (6–26), dark ambient — original behavior
- Mist: grey fog (2–14), bright ambient — outdoor/misty feel

**Gameplay** (`src/main.ts`):
- Environment applied at initial load, level transitions, and restarts
- Torch fuel does not drain in mist environment (ambient light, no torch needed)
- Debug fullbright toggle restores correct environment fog

**Stair rendering** (`src/rendering/stairRenderer.ts`):
- Fixed back wall facing (removed incorrect π rotation)
- Doubled back wall height to cover two floors — prevents background bleed in non-black environments

**Validation** (`src/level/levelLoader.ts`):
- Validates `environment` field against known values

**Docs** (`DUNGEON-DESIGNER.md`):
- Documented environment field with available presets

---

## 2026-03-13 — Item sprite system

Replaced procedural canvas textures with PNG sprite loading for all items.

**New module** (`src/rendering/itemSprites.ts`):
- Shared sprite loader providing both THREE.Texture (3D ground items) and HTMLImageElement (2D HUD canvas)
- `getItemTexture(icon)` / `getItemImage(icon)` with caching
- `preloadItemSprites()` called at startup after item DB loads
- Falls back gracefully if a PNG is missing

**Updated renderers:**
- `itemRenderer.ts` — replaced procedural weapon/armor/ring textures with per-item PNG sprites via `icon` field
- `consumableRenderer.ts` — replaced procedural potion textures with per-item PNG sprites
- `inventoryPanel.ts` (HUD quickbar) — draws sprite icons in equipment and backpack slots
- `inventoryOverlay.ts` (full inventory screen) — draws sprite icons in all slots
- All four fall back to colored rectangles if sprite not loaded

**Item data** (`public/data/items.json`):
- `icon` field updated to match actual sprite filenames (hyphenated, e.g. `red-potion`, `leather-cap`)
- Items sharing visual category reuse the same sprite (e.g. all swords → `sword.png`)

**Sprite assets** (`public/sprites/items/`):
- 26 pixelart item sprites (32x32 PNG): weapons, armor, shields, rings, amulets, potions, bone

**Other:**
- `ItemDatabase.getAllItems()` added for preloader icon collection

---

## 2026-03-13 — Lighting, torch, and UX improvements

**Torch & lighting overhaul** (`src/main.ts`):
- Torch light 50% brighter (intensity 4→6, fill 2→3) and 50% longer range (distance 10→21, fill 8→16.5)
- Light no longer dims above 35% fuel — full brightness until low, then linear fade
- Ambient light bumped from `0x111111` to `0x1a1a22` for slight visibility in distant darkness

**Torch capacity** (`src/core/gameState.ts`, `public/data/items.json`):
- Max torch fuel doubled: 100 → 200
- Oil flask fuel restore doubled: 50 → 100

**Escape key closes overlay panels** (`src/main.ts`):
- Inventory, stats, and attribute panels can all be closed with Escape
- Attribute panel respects tryClose guard (can't dismiss during level-up with unspent points)

---

## 2026-03-13 — Bugfixes & enemy sprites

**Equipment pickup fix** (`src/core/gameState.ts`):
- `pickupEquipmentAt()` now moves displaced equipped item to backpack instead of destroying it
- If backpack is full, pickup is denied with a message instead of silently losing the item

**Bat vertical offset** (`src/rendering/enemyRenderer.ts`):
- Added `SPRITE_Y_OFFSETS` lookup — giant_bat sprites now hover 1.0 unit above floor (upper half of cell)
- Other enemy types unaffected

**Enemy sprite art** (`public/sprites/`):
- Added pixelart sprites for all 6 new enemy types: goblin, giant_bat, spider, kobold, zombie, troll
- Enemies no longer fall back to skeleton placeholder

**Dungeon fixes** (`public/levels/dungeon_m1.json`):
- Minor layout adjustments to level 2 and level 3

---

## 2026-03-13 — M1 Phase F: Content (enemy types, AI, dungeon)

6 new enemy types, 3 new AI behaviors, and the 3-level M1 test dungeon.

**F1 — New enemy types** (`src/enemies/enemyTypes.ts`, `src/rendering/enemyRenderer.ts`):
- Added goblin, giant_bat, spider, kobold, zombie, troll to `ENEMY_DEFS`
- Stats from `planning/m1/ENEMIES.md`; existing enemy stats rebalanced for M1 (higher HP/faster moves to match player progression)
- `EnemyAIState` extended with `'flee'`; `EnemyInstance` extended with `regenTimer`/`regenPauseTimer` for troll
- Sprite paths and sizes registered in renderer (placeholder until art assets created)

**F2 — AI behaviors** (`src/enemies/enemyAI.ts`, `src/core/gameState.ts`):
- **Bat erratic movement**: 30% chance per move tick to pick a random adjacent cell instead of pathfinding toward player
- **Kobold flee**: switches to `'flee'` state below 30% HP — pathfinds away from player (max manhattan distance), moves at double speed. Falls back to attack if cornered
- **Troll HP regen**: +2 HP every 2 seconds, paused for 3 seconds after taking damage. `damageEnemy()` sets `regenPauseTimer = 3` on hit

**F4 — M1 test dungeon** (`public/levels/dungeon_m1.json`):
- Level 1 "The Upper Crypts" — tutorial: rats, bats, goblins (~112 XP)
- Level 2 "The Dark Warrens" — mid: spiders, skeletons, kobolds, locked door + lever puzzle (~304 XP)
- Level 3 "The Troll's Domain" — hard: orcs, zombies, troll boss with guaranteed sword_steel drop (~600 XP)
- Total ~1016 XP across full clear → reaches level 4. CharDef-themed areas, all weapon types placed on ground
- Wired as default dungeon in `main.ts`

**Decisions:**
- Existing enemy stats updated to ENEMIES.md M1 values (not just new enemies) — old pre-M1 stats were too weak for the progression system
- Stair targets must land on adjacent walkable cells, not on the stair cell itself (prevents immediate re-traversal)
- Enemy sprites deferred to F3 — renderer falls back to skeleton sprite for unknown types

---

## 2026-03-12 — M1 Phase D: Loot & Drops

Enemy death loot rolls, ground item spawning, and gold counter.

**New modules:**
- **`src/core/lootTable.ts`** — loot roll system: loads `public/data/loot-tables.json`, rolls XP, gold (min-max range), and item drops (per-quality-tier chance). `rollLoot(enemyType)` returns `LootResult` with XP, gold, and item IDs.

**Modified modules:**
- **`src/core/gameState.ts`** — `gold` field added to GameState.
- **`src/core/combat.ts`** — enemy death triggers loot roll.
- **`src/enemies/enemyTypes.ts`** — enemy types wired to loot table keys.
- **`src/main.ts`** — enemy death → loot roll → spawn ground items at death cell, gold counter update.
- **`src/rendering/itemRenderer.ts`** + **`consumableRenderer.ts`** — support spawning new items at runtime (not just level-load time).

**Tests:** 407 new tests in `lootTable.test.ts`.

---

## 2026-03-12 — M1 Design & Data Foundation

Data files and design documents for Milestone 1.

**New files:**
- **`planning/m1/DESIGN.md`** — full M1 design doc: scope, 6 open TBDs resolved, architecture, data model, item system, stats, XP/leveling, gold, loot tables, paper doll UI, implementation order.
- **`planning/m1/ENEMIES.md`** — 9-enemy roster (rat/skeleton/orc + goblin/giant bat/spider/kobold/zombie/troll) with stats, behaviors, new mechanics (flee, erratic, regen).
- **`public/data/items.json`** — central item database: 57 items (22 weapons, 20 armor, 10 accessories, 5 consumables).
- **`public/data/loot-tables.json`** — per-enemy loot tables with XP, gold ranges, drop chances for all 9 enemies.
- **`CHANGELOG.md`** — v0.0.9 entry covering all 8 pre-M1 phases.

**Decisions:**
- Versioning scheme: `0.milestone` (v0.1 = M1 done). Tagged `v0.0.9` on current HEAD.
- Enemy quality tier: added `poor` (10%), rebalanced `common` to 50%.
- Per-entity drops override schema added to DESIGN.md (individual entities can override their type's loot table).
- Agile data model: design per milestone, refactor as needed (not upfront schema for everything).

---

## 2026-03-12 — M1 Phase C: Equipment Expansion

**New files:**
- `src/hud/xpBar.ts` — XP progress bar HUD widget (level label, blue fill bar, XP fraction, "MAX" at cap).
- `src/hud/statsPanel.ts` — `StatsPanel` class: debug overlay toggled by T key. Base vs effective stats side-by-side with green/red diff coloring. Will be repurposed as a proper UI panel in Phase E.

**Modified files:**
- `src/core/combat.ts` — `WEAPON_BEHAVIOR` table with per-subtype cooldown + damage multiplier. `getWeaponCooldown()` reads equipped weapon via DB. `resolveWeaponEffect()` handles specials (axe: -1 DEF, dagger: 10% crit override, mace: +2 vs armored). `playerAttack()` now returns `CombatResult[]` and supports spear 2-cell range.
- `src/core/gameState.ts` — `getEffectiveStats()` expanded: returns `effectiveStr/Dex/Vit/Wis` (base + item attribute bonuses). New methods: `getEquippedWeaponDef()`, `canEquipItem()` (STR/DEX/VIT/WIS requirement check). `pickupEquipmentAt()` returns `{ item?, denied? }` instead of bare item — blocks equip if requirements unmet.
- `src/hud/hudCanvas.ts` — Wired XP bar, `showMessage()` for centered fade-out text, `StatsPanel` integration.
- `src/hud/hudLayout.ts` — Added `XP_BAR` layout constant.
- `src/main.ts` — Multi-result combat loop (spear), equipment pickup HUD message on success/denial, T key stats panel toggle with input blocking.
- `public/levels/dungeon3.json` — Added test weapons (dagger, axe, spear, ring) for manual testing.

**Decisions:**
- `playerAttack()` return type changed from single `CombatResult` to `CombatResult[]` to support spear multi-target. All callers updated to loop.
- Dagger crit is a flat 10% override (not additive with base crit chance) — keeps daggers viable at low DEX but doesn't stack with high DEX builds.
- Stats panel created as debug tool now; will be integrated into Phase E UI.

**Test count:** 689 (669 + 20 new)

---

## 2026-03-12 — M1 Phase B: Stats & Leveling

**New files:**
- `src/hud/characterCreation.ts` — `CharacterCreationScreen`: 5-point stat allocation canvas overlay, shown before game loop starts. Arrow keys to navigate/adjust, Enter to confirm.
- `src/hud/levelUpNotification.ts` — `LevelUpNotification`: 3s gold text flash centered top-center, 2s fade-out. Triggered on level-up.

**Modified files:**
- `src/core/gameState.ts` — Added str/dex/vit/wis (base 5), xp, level (base 1), attributePoints, playerName. `maxHp` now `40 + vit * 5`. New methods: `getEffectiveStats()`, `xpForLevel()`, `addXp()`, `allocatePoint()`, `applyCharacterSetup()`. `getEffectiveAtk/Def` delegate to `getEffectiveStats()`.
- `src/enemies/enemyTypes.ts` — Added `xp` to `EnemyDef`: rat=10, skeleton=25, orc=50.
- `src/hud/hudCanvas.ts` — Added `getCanvas()`, wired `levelUpNotification` into draw call.
- `src/main.ts` — Character creation await block before game loop; XP award on kill; level-up notification update/draw in game loop.

**Decisions:**
- WIS has zero mechanical effect in M1 — shown in character creation with note "magic (not yet)". Reserved for M4 mana.
- `getEffectiveStats()` fallback path (no DB loaded) includes legacy `this.atk`/`this.def` for backwards compat with combat tests.

---

## 2026-03-12 — M1 Phase A: Entity Registry + Item Database

Data foundation for Milestone 1. All Phase A tasks complete.

**New files:**
- `src/core/itemDatabase.ts` — `ItemDatabase` class + singleton. Loads `public/data/items.json`. Types: `ItemDef`, `ItemStats`, `ItemModifier`, quality/subtype enums. Query API: `getItem(id)`, `getItemsByType(type)`.
- `src/core/entities.ts` — `EntityRegistry` class + `ItemLocation` discriminant union + `EquipSlot` (3→10 slots). Single source of truth for all item instances. Items move between world/backpack/equipped via `moveItem()`.
- `src/core/itemDatabase.test.ts` — 67 new tests
- `src/core/entities.test.ts` — (included in test count above)
- `planning/m1/PLAN.md` — full M1 implementation plan (Phases A–F)

**Modified files:**
- `src/core/gameState.ts` — `EntityRegistry` added alongside legacy item maps (dual-write for backwards compat). `EquipSlot` re-exported from `entities.ts`. `currentLevelId` field added. `normalizeLegacySlot()` maps old `armor`→`chest`, `ring`→`ring1`. `getEffectiveAtk/Def` updated to query registry when DB loaded.
- `src/rendering/itemRenderer.ts` + `consumableRenderer.ts` — query entity registry; fall back to legacy maps when itemId not in DB.
- `src/hud/inventoryPanel.ts` — 10-slot equipment panel + 12-slot backpack.
- `src/level/levelLoader.ts` — equipment slot validator updated to accept all 10 M1 slot names.
- `src/rendering/enemyRenderer.ts` — added `preloadEnemyTextures()` so all sprites are loaded before scene build (fixes orc delayed appearance on level load).
- `src/main.ts` — `itemDatabase.load()` + `preloadEnemyTextures()` called in parallel before level scene build.
- `public/levels/dungeon1.json` + `dungeon3.json` — equipment slot names updated: `armor`→`chest`/`shield`, `ring`→`ring1`.

**Decisions:**
- Dual-write (legacy maps + registry) kept intentionally for Phase A to preserve backwards compat with tests and levelLoader. Legacy maps will be removed when Phase C (equipment expansion) lands.
- itemIds in existing dungeon JSON don't match items.json (legacy naming). Renderers fall back to legacy map for visual category. Will be resolved when M1 dungeon content is authored in Phase F.

**Test count:** 348 (281 existing + 67 new)

---

## 2026-03-07 — Particle Effects

Added three particle effect systems for atmosphere.

**New file:** `src/rendering/particles.ts`
- **DustMotes** — warm-tinted Points floating near ceiling around player. Additive blending, frustum culling disabled. Configurable per level.
- **SconceEmbers** — orange sparks rising from lit sconce flame meshes. Uses `getWorldPosition()` on flame mesh (child[3]) for accurate spawn position.
- **WaterDrips** — full drop lifecycle: slow formation on ceiling → gravity fall with stretch → expanding ring splash on floor. Spawns at random walkable cells near player, 10-30s interval per cell.

**Type change:** `DungeonLevel` gains `dustMotes?: boolean` (default true) and `waterDrips?: boolean` (default false) for per-level control.

Enabled `waterDrips` on dungeon3 "Dark Cellar" level.

---

## 2026-03-07 — Phase 8: Equipment, Consumables, Enemy Animations

Equipment system, consumable items, backpack inventory, and enemy combat animations.

**New modules:**
- **`src/rendering/itemRenderer.ts`** — billboard sprites for ground equipment items (weapon/armor/ring icons).
- **`src/rendering/consumableRenderer.ts`** — billboard sprites for consumables: red flask (health potion), yellow flask (torch oil).

**Modified modules:**
- **`src/core/gameState.ts`** — `EquipSlot` type, `EquipmentItem` interface, weapon/armor/ring equipment slots with ATK/DEF bonuses. `getEffectiveAtk()`/`getEffectiveDef()` replace raw stats in combat formula. `ConsumableItem` type with `health_potion` and `torch_oil` subtypes. Backpack array (max 8 slots). `enemyAttackPlayer()` reads def from gameState internally.
- **`src/rendering/enemyRenderer.ts`** — Enemy hit shake: horizontal sin-based oscillation (0.3s, amplitude 0.25, decaying). Enemy attack lunge: forward-and-back toward player (triangle wave, 0.25s, 0.6 units).
- **`src/hud/inventoryPanel.ts`** — shows equipped item indicators and backpack contents.
- **`src/level/levelLoader.ts`** — entity validation for `equipment` and `consumable` types.
- **`src/main.ts`** — ground equipment auto-pickup on step, backpack use via Digit1-8 keys, enemy animation wiring.
- **`public/levels/dungeon1.json`** — added items: Rusty Sword, Iron Shield, Power Ring, health potions, torch oil.

**Design decisions:**
- Equipment auto-equips on pickup (oldschool feel, same as keys).
- Consumables go to backpack, used via number keys 1-8.
- Backpack persists across levels.
- Enemy animations are visual-only (don't affect combat timing).

**Tests:** 281 total (23 new).

---

## 2026-03-06 — Phase 7 Complete: Combat

Floating damage numbers and sword swing animation complete Phase 7.

**New modules:**
- **`src/rendering/damageNumbers.ts`** — 3D billboard sprites with canvas-rendered white text + black outline. Float up and fade out over 0.7s from hit enemy position.
- **`src/rendering/swordSwing.ts`** — pixelart sword drawn on HUD canvas, sweeps from lower-right to upper-left over 0.25s with easeOutQuad.

**Wired into:** `main.ts` (game loop + F key handler) and `hudCanvas.ts`.

**Tests:** 258 total, TypeScript compiles clean.

---

## 2026-03-06 — Phase 6 Complete + Phase 7 Combat Foundation

Enemy system marked complete, combat system built.

**New modules:**
- **`src/core/combat.ts`** — pure combat logic: `calculateDamage()`, `playerAttack()`, `enemyAttackPlayer()`. Damage formula: `max(1, ATK - DEF + random(-1..+1))` — always deals at least 1.

**Modified modules:**
- **`src/core/gameState.ts`** — added `atk` (3), `def` (1), `attackCooldown` to GameState.
- **`src/enemies/enemyTypes.ts`** — renamed `damage` → `atk`, added `def`: rat (2/0), skeleton (3/1), orc (5/2).
- **`src/main.ts`** — F key attacks facing cell with 0.8s cooldown. Enemy AI attack actions call `enemyAttackPlayer()`.

**Combat feedback:**
- Enemy mesh flashes red on hit.
- HUD red overlay on player damage.
- Weapon slot cooldown fill overlay.

**Death:** HP <= 0 triggers fade-to-black → full level restart (reset state, player start, full HP/torch, enemies respawn).

**Design decisions:**
- F key melee attack, real-time with cooldown (not turn-based).
- `max(1, ...)` ensures every hit deals damage.
- Death fully resets current level (no save/checkpoint).

**Tests:** 258 total (10 new).

---

## 2026-03-05 — Phase 4 Complete: HUD Overlay

Full HUD system as 2D canvas overlay on top of Three.js viewport.

**New modules (`src/hud/`):**
- **`hudCanvas.ts`** — 640x360 internal resolution canvas with `image-rendering: pixelated`, overlaid on Three.js viewport.
- **`hudLayout.ts`** — layout constants for all HUD elements.
- **`hudColors.ts`** — color palette constants.
- **`pixelFont.ts`** — bitmap font renderer for HUD text.
- **`compassRenderer.ts`** — compass rose (top-left): N/E/S/W letters, active direction highlighted gold.
- **`minimapRenderer.ts`** — minimap (top-right): explored-cell top-down grid, player dot + facing line, centered on player.
- **`healthBar.ts`** — health bar (bottom-left): heart icon, HP fill bar, low-HP pulse effect.
- **`torchIndicator.ts`** — torch indicator (bottom-center-left): flame icon, fuel fill bar, low-fuel flicker effect.
- **`inventoryPanel.ts`** — inventory panel (bottom-right): key count with icon, 3 equipment slots (W/A/R), 8 backpack slots.

**Modified modules:**
- **`src/core/gameState.ts`** — gains `hp`/`maxHp`, `torchFuel`/`maxTorchFuel`, `exploredCells` Set, `revealAround()` method.
- **`src/rendering/player.ts`** — gains `setOnTurn()` callback for exploration on facing change.
- **`src/main.ts`** — wires exploration into initial position, onMove, and onTurn callbacks. Removed old controls hint div.

**Exploration logic:** `revealAround()` marks current cell + 4 adjacent + line-of-sight forward until wall.

**Tests:** 187 total (20 new).

---

## 2026-03-05 — Camera Viewport Tuning

Iterative camera feel tuning — asymmetric frustum crop, stair pitch, telephoto effect.

**Changes:**
- **Asymmetric frustum crop** via `camera.setViewOffset()` in `main.ts` — crop top 15%, expand bottom 20%. Side crop auto-derived to preserve 1:1 aspect ratio. Applied on init + resize.
- **Camera pitch on stairs** in `player.ts` — `STAIR_PITCH = 0.15` rad. Camera tilts down on S cells, up on U cells. Smoothly lerped alongside position and angle.
- **Camera back offset** increased from 0.4 to 0.95 — pulls camera toward cell edge behind player. Combined with FOV 75 this creates a telephoto effect that flattens perspective, making distant objects look closer.
- **EYE_HEIGHT** changed from fixed 1.0 to `WALL_HEIGHT * 0.65` — lower eye height for claustrophobic feel.

**Discarded approaches:**
- Projection matrix Z-column scaling (CAMERA_DEPTH_SCALE) — mathematically equivalent to FOV change, no practical benefit over camera back offset + FOV reduction.
- Camera pitch offset (constant downward tilt) — felt unnatural, reverted.

---

## 2026-03-05 — 3D Stair Geometry + Debug Fullbright

Visual stair steps for S/U cells and a debug lighting toggle.

**New modules:**
- **`src/rendering/stairRenderer.ts`** — builds 3D stair geometry per stair cell. 4 floor steps + 4 ceiling steps (thin slabs at correct Y), 2 side walls (2×WALL_HEIGHT tall), 1 black back wall. Auto-detects approach direction from adjacent walkable neighbor. Textured: floor texture on steps, wall texture on sides, ceiling texture on ceiling steps. Back wall uses `MeshBasicMaterial({ color: 0x000000 })` — pure black regardless of lighting. Materials cached per texture name.

**Modified modules:**
- **`src/rendering/dungeon.ts`** — floor, ceiling, and all 4 wall faces skipped for S/U cells (stairRenderer owns the entire cell geometry).
- **`src/main.ts`** — `stairMeshes` added to `LevelScene`, built in `buildLevelScene()`, cleaned up in `teardownLevelScene()`. Debug fullbright toggle on `L` key: adds bright ambient light + disables fog, toggles off to restore.

**Design decisions:**
- Stair cells fully owned by stairRenderer — dungeon.ts renders nothing for S/U cells
- Back wall pure black (MeshBasicMaterial) to simulate darkness beyond the stairwell
- Side walls extend 2×WALL_HEIGHT to cover one extra floor in the stair direction
- Side wall thickness computed as `(CELL_SIZE - STEP_WIDTH) / 2` — flush with cell edge, no gaps
- Side wall UVs corrected: thin faces scaled proportionally, tall faces repeat texture vertically (RepeatWrapping)
- Vertex color depth fade: all stair geometry fades to black toward the back wall (`applyDepthFade` via vertex colors multiplied with texture)
- Debug fullbright is a runtime toggle (L key), not persisted

---

## 2026-03-05 — Phase 5: Multi-Level Dungeons

Multi-level dungeon support with stair transitions, per-level state persistence, and torch fuel drain.

**Design decisions:**
- **Dungeon format**: Single JSON file with `levels[]` array, each level has unique `id`. Stair entities reference `targetLevel` (id), `targetCol`, `targetRow`.
- **Level state persistence**: `saveLevelState()`/`loadLevelState()` deep-copy snapshots of doors/keys/levers/plates/exploredCells. Revisiting a floor restores its state.
- **GameState split**: `loadNewLevel()` resets level-specific maps but preserves player-global state (hp, torchFuel, inventory).
- **Transition**: Fade-to-black DOM overlay (not Three.js). Blocks input during transition. No camera animation.
- **Stair trigger**: On step (in onMove callback), not on Space interaction.
- **Torch fuel**: Drains 1 per step. Light distance (3–8) and flicker intensity scale with fuel ratio. Ambient prevents total blackout.

**New modules:**
- **`src/core/types.ts`** — `Dungeon` interface, `id` on `DungeonLevel`
- **`src/core/gameState.ts`** — `LevelSnapshot`, `saveLevelState()`, `loadLevelState()`, `loadNewLevel()`, `drainTorchFuel()`, extracted `_parseEntities()`
- **`src/core/levelLoader.ts`** — `validateDungeon()`, `loadDungeon()`, stair entity validation with cross-level reference checks
- **`src/rendering/transitionOverlay.ts`** — `TransitionOverlay` class: pure DOM, fade-to-black, midpoint callback pattern
- **`public/levels/dungeon1.json`** — two-level test dungeon ("Entry Hall" with key puzzle, "Lower Vault")

**Modified modules:**
- **`src/main.ts`** — major restructure: `LevelScene` interface, `buildLevelScene()`/`teardownLevelScene()`, `wireCallbacks()`, `triggerLevelTransition()`. Loads dungeon instead of single level. Torch fuel scales light.
- **`src/hud/hudColors.ts`** — `minimapStairs: '#44aacc'` (teal)
- **`src/hud/minimapRenderer.ts`** — S/U cells rendered with stair color

---

## 2026-03-04 — Door system improvements + lever/plate polish (post Phase 3)

Door improvements, repeatable lever with animation, pressure plate pressed state.

**New modules:**
- **`src/doorAnimator.ts`** — `DoorAnimator` class: registers door panels, animates constant-speed vertical slide (5.0 units/sec). Panels slide above ceiling on open, back down on close. Position-based hiding (always visible in scene).
- **`src/plateRenderer.ts`** — pressure plate mesh on floor. Normal: raised stone slab with beveled edges. Pressed: sunk below floor, darker cracked texture. `pressPlate()` function for runtime state change.
- **`src/leverRenderer.ts`** — wall-mounted lever: metal base plate + pivot group (handle + knob). Pivot rotates between up/down angles. `LeverAnimator` class animates rotation at 4.0 rad/sec. Returns `handleMap` for animator registration.

**Modified modules:**
- **`src/gameState.ts`**:
  - `DoorInstance.mechanical: boolean` — `true` for lever/plate-targeted doors, auto-set in constructor
  - `GameState` constructor accepts optional `grid` — auto-creates closed doors for bare `D` cells
  - `openDoor()` rejects mechanical doors; `closeDoor()` rejects mechanical/locked/missing
  - `activatePressurePlate()` bypasses `openDoor` — directly sets door state
  - `LeverInstance.state: 'up' | 'down'` — replaces `toggled: boolean`, repeatable
  - `activateLever()` toggles state each call (no longer one-shot)
  - `LeverInstance.wall: Facing` — which wall the lever is mounted on
  - `getLever()` method, `autoDetectLeverWall()` helper for backward compat
- **`src/interaction.ts`**:
  - `door_closed` result type — Space on open non-mechanical door closes it
  - Mechanical doors show "This door is operated by a mechanism."
  - Lever interaction: repeatable, no `toggled` guard; player stands ON `O` cell, faces wall
- **`src/doorRenderer.ts`** — rewritten: each door is `THREE.Group` with stone frame (2 pillars + lintel) + door panel. Non-mechanical doors get brass button on left pillar. `meshMap` → `panelMap`. `updateDoorMesh` accepts optional `DoorAnimator`.
- **`src/textures.ts`** — `getDoorFrameTexture()`: grey stone with chisel marks.
- **`src/levelLoader.ts`** — validates lever `wall` field (N/S/E/W if present).
- **`src/main.ts`** — wires `DoorAnimator`, `LeverAnimator`, plate/lever renderers, `door_closed` handler, `pressPlate` on activation.

**Design decisions:**
- Lever is repeatable with up/down state (each pull toggles linked door)
- Lever animation: pivot rotates handle between -0.4 (up) and 0.6 (down) radians
- Pressure plate: one-time use, visual feedback (sinks + darkens)
- Mechanical doors can't be interacted with at all (not just closing — opening too)
- Lever interaction: stand on cell + face wall (directional, must see the lever)
- Door animation: constant speed slide at 5.0 units/sec
- Interactive doors distinguished by brass button on frame (subtle visual cue)

**Tests:** 167 total (20 new).

---

## 2026-03-04 — Phase 3 Complete: Doors & Interaction

First interactive gameplay — doors, keys, levers, pressure plates. All entities are data-driven via level JSON.

**New modules:**
- **`src/gameState.ts`** — `GameState` class: runtime door state (open/closed/locked), key inventory (`Set<string>`), lever/plate tracking. Methods: `isDoorOpen`, `openDoor`, `unlockDoor`, `toggleDoor`, `pickupKeyAt`, `activateLever`, `activatePressurePlate`. Pure logic, no Three.js.
- **`src/interaction.ts`** — `interact(playerState, grid, gameState)` dispatches Space key: opens closed doors, unlocks locked doors (consumes key from inventory), pulls levers (toggles linked door). Returns typed `InteractionResult`.
- **`src/doorRenderer.ts`** — builds door meshes per `GameState.doors`. Auto-detects orientation from adjacent walls. `DoubleSide` material, visibility toggle on open/close.
- **`src/keyRenderer.ts`** — gold key billboard meshes on floor. Hidden on pickup.

**Modified modules:**
- **`src/grid.ts`** — `isWalkable()` gained optional `isDoorOpen` callback: `'D'` cells delegate to callback when provided. `PlayerState` passes it through. New `getFacingCell()` helper.
- **`src/player.ts`** — `getState()` exposes `PlayerState`, `setOnMove()` callback fires after each successful movement (for key pickup + pressure plates).
- **`src/textures.ts`** — 2 new procedural textures: `getDoorTexture()` (dark wood planks with frame), `getLockedDoorTexture()` (darker with iron bands, studs, keyhole). Standalone cached getters, not in wall/floor/ceiling registries.
- **`src/levelLoader.ts`** — entity validation: doors (state, keyId, D-cell), keys (keyId, walkable cell), levers (targetDoor format, D-cell target), pressure plates (targetDoor, walkable cell).
- **`src/main.ts`** — wires GameState, door meshes, key meshes, interaction, onMove callback for pickup/plates.

**New level:**
- `public/levels/level7.json` "The Locked Vault" — puzzle level: closed doors, locked door + key, lever, pressure plate.

**Design decisions:**
- Interaction key: `Space`
- Key pickup: auto on step (oldschool feel)
- Inventory: `Set<string>` of key IDs only (full inventory deferred)
- Door orientation: auto-detect from adjacent walls, default N-S if ambiguous
- Pressure plates: one-way open (stays open)
- Backward compat: `'D'` cell with no door entity = always open

**Tests:** 147 total (71 new across 4 test files).

---

## 2026-03-04 — Phase 2: charDefs texture system replaces verbose cellOverrides

Replaced the per-cell `cellOverrides` model with a 4-layer texture resolution system. The key addition is `charDefs` — custom ASCII characters that carry texture information and can be painted directly into the grid.

- **`src/types.ts`** — added `CharDef` interface (extends `TextureSet` with `char: string`, `solid: boolean`), added `charDefs?: CharDef[]` to `DungeonLevel`
- **`src/grid.ts`** — added `buildWalkableSet(charDefs?)` that merges walkable charDef chars into `WALKABLE_CELLS`; `isWalkable()` and `PlayerState` now accept optional walkable set
- **`src/dungeon.ts`** — texture resolution now 4 layers: hard-coded → defaults → charDefs → areas; added `resolveWallMat()` for solid charDef neighbor wall textures; `buildDungeon()` accepts `charDefs` param
- **`src/player.ts`** / **`src/main.ts`** — wired walkable set through Player to PlayerState
- **`src/levelLoader.ts`** — charDefs validated before grid chars (so custom chars are known); validates char (single, not built-in, no duplicates), solid (boolean), texture names; grid and playerStart validation use extended known/walkable sets
- **Levels 4–6** — rewritten with `charDefs`, areas removed; grids now use `b`/`,`/`m`/`w` to visually show texture themes
- **`DUNGEON-DESIGNER.md`** (new) — full level JSON schema reference for human and agent authors
- **Tests** — 76 total (28 new): charDefs validation (15), buildWalkableSet (3), isWalkable with custom set (1), PlayerState with custom walkable (2), plus grid.test.ts additions

**Design decision**: charDefs are layer 3 (between defaults and areas). Solid charDefs provide `wallTexture` to adjacent walkable cells' wall faces. The `areas` system remains available as layer 4 for rectangular overrides.

---

## 2026-03-03 — Phase 2: Texture variety, per-cell overrides, 3 new levels

Added multiple texture styles and wired the `CellOverride` mechanism so levels can assign different textures per cell:

- **`src/textureNames.ts`** (new) — pure constants file, no Three.js dependency
  - `WALL_TEXTURES`: stone, brick, mossy, wood
  - `FLOOR_TEXTURES`: stone_tile, dirt, cobblestone
  - `CEILING_TEXTURES`: dark_rock, wooden_beams
  - Type aliases + `Set<string>` versions for validation
- **`src/textures.ts`** — expanded from 3 to 9 texture generators + cached registry
  - New walls: `brick` (warm red-brown, wider bricks), `mossy` (stone + green patches), `wood` (vertical grain + knots)
  - New floors: `dirt` (earthy brown, pebble spots), `cobblestone` (irregular rounded stones)
  - New ceiling: `wooden_beams` (dark wood base + thick horizontal beams)
  - Cached getters: `getWallTexture(name)`, `getFloorTexture(name)`, `getCeilingTexture(name)`
  - Old direct-export functions removed
- **`src/types.ts`** — added `ceilingTexture?: string` to `CellOverride`
- **`src/dungeon.ts`** — `buildDungeon(grid, cellOverrides?)` now builds override lookup map and selects per-cell materials (cached `MeshLambertMaterial` per texture name)
- **`src/levelLoader.ts`** — validates cellOverrides: array structure, numeric col/row, grid bounds, known texture names, ceilingHeight type
- **`src/levelLoader.test.ts`** — 10 new tests for cellOverrides validation (48 total)
- **3 new levels** using cellOverrides for themed zones:
  - `level4.json` "The Sunken Crypt" (20×20) — brick hall → mossy crypt → wood library
  - `level5.json` "Winding Depths" (18×18) — mossy cavern → brick guardroom → wood study
  - `level6.json` "The Grand Hall" (20×20) — central brick hall with 4 themed corners

**Known issue**: the per-cell cellOverrides model is verbose — next session will refactor to area-based overlays, level defaults, and special char definitions.

---

## 2026-03-03 — Phase 2 started: Procedural textures + input QoL

First Phase 2 work — replaced flat-colored materials with procedural pixelart textures:

- **`src/textures.ts`** (new) — Canvas2D texture generation with nearest-filter for pixel-perfect rendering
  - `createWallTexture()` — grey-brown stone with per-pixel noise + brick mortar pattern
  - `createFloorTexture()` — dark stone tile base with grid lines
  - `createCeilingTexture()` — very dark rock with subtle crack lines
  - All textures use `THREE.NearestFilter` and `SRGBColorSpace`
- **`src/dungeon.ts`** — wall/floor/ceiling materials now use canvas textures instead of flat `MeshLambertMaterial` colors
- **`src/main.ts`** — added `Q`/`E` key bindings for turning (alongside existing arrow keys)

---

## 2026-03-01 — Phase 1 Complete: Foundation Refactor

Completed all remaining Phase 1 steps in a single session:

- **`DungeonLevel` type + supporting types** (`src/types.ts`)
  - `DungeonLevel`, `Entity`, `CellOverride` interfaces
  - Grid format changed from `number[][]` to `string[]` with char-based cells (`.#DSUO `)
  - `WALKABLE_CELLS` set in `grid.ts` as single source of truth
- **External JSON level loading** (`src/levelLoader.ts`)
  - `loadLevel(url)` fetches + validates + returns typed `DungeonLevel`
  - `validateLevel(data, source)` extracted as pure function for testability
  - Validates: name, grid structure, uniform row lengths, known cell chars, playerStart bounds + walkability, facing, entities
- **Level files** in `public/levels/` — level1.json (Two Rooms), level2.json (L-Corridor), level3.json (First Room)
- **`buildDungeon` returns `THREE.Group`** — no longer mutates scene directly, enables level teardown/swap
- **`main.ts` async init** — wraps everything in `async init()`, loads level via fetch, `.catch()` error handler
- **Vitest test suite** — 38 tests across 2 files:
  - `grid.test.ts` (26 tests): isWalkable, WALKABLE_CELLS, turn tables, FACING_DELTA, PlayerState movement/turning/paths, void cells, OOB movement
  - `levelLoader.test.ts` (12 tests): all validation branches + happy path
- **Developer Council review** — SoftwareDeveloper + QaTester specialists identified validation gaps and test coverage issues, all addressed
- `tsconfig.json`: added `skipLibCheck: true` for vitest 4.x type compat

---

## 2026-03-01 — Phase 1 Step 1: Extract PlayerState + grid logic

Decoupled pure game logic from Three.js rendering in the player module:

- **Created `src/grid.ts`** — pure TypeScript, zero Three.js dependency
  - `Facing` type, direction tables (`FACING_ANGLE`, `FACING_DELTA`, `TURN_LEFT`, `TURN_RIGHT`)
  - `isWalkable()` as a pure function (takes map as parameter)
  - `PlayerState` class — holds grid position + facing, movement methods return success boolean
- **Slimmed `src/player.ts`** — now rendering-only
  - Imports `PlayerState` from `grid.ts`, delegates all grid logic
  - Retains Three.js camera tween, `gridToWorld`, `isAnimating`, `update`, `getWorldPosition`
- `dungeon.ts` and `main.ts` unchanged

This enables unit testing grid logic without Three.js and sets up clean type separation for later steps.

---

## 2026-02-28 — Planning session: all design decisions resolved

Developer Council (4 specialists, 3 rounds) identified all vague spots in the project. Decisions made:

- **Player stats**: HP + ATK + DEF + draining resource
- **Resources**: Torch Fuel (phase 5), Hunger (phase 8), Sanity (phase 8) — torch fuel first
- **Doors**: both key-locked (key consumed) and switch/plate-operated
- **Inventory**: equipment slots (weapon, armor, ring) + general backpack grid
- **Enemy movement**: move toward player (pathfinding on grid); later: varied AI strategies
- **Level transitions**: short descent animation → fade to black → new level → fade in
- **HUD timing**: after data model (GameState/DungeonLevel), not as early stub
- **Metadata format**: decided at implementation time (extensible entity schema)
- **Combat model**: deferred to Phase 7
- **Death/respawn**: deferred to Phase 7

Architecture plan established:
- Decouple Player from camera (pure grid state vs render layer)
- Introduce GameState as single source of truth
- DungeonLevel type replaces raw `number[][]`
- `buildDungeon` returns `THREE.Group` for clean level teardown

8-phase build order created — see PLAN.md.

---

## 2026-02-28 — Session workflow established

- CLAUDE.md: added session workflow rules (read PROGRESS.md on start, update on end)
- PROGRESS.md: restructured to track phases from PLAN.md
- LOG.md: created for decision and change history

---

## 2026-02-28 — Scaffold complete (Session 1)

Decisions made during scaffolding:
- **Renderer**: Three.js in browser (not Phaser, not Godot)
- **Perspective**: true 3D with grid movement (Grimrock-style, not sprite-based EotB)
- **Aesthetic**: pixelart textures on 3D geometry
- **Enemies**: billboard sprites (camera-facing 2D)
- **Dungeon format**: grid-based 2D array (hardcoded initially, JSON later)
- **Platform**: browser desktop first, shareable via link
- **Art generation**: Midjourney or Leonardo for textures
- **Language**: TypeScript
- **Build**: Vite + npm
- **Camera movement**: short tween animation on steps and turns

Code created:
- `src/main.ts` — scene, camera, renderer, lighting, hardcoded 2-room map, input handling, render loop
- `src/dungeon.ts` — `buildDungeon()` creates wall/floor/ceiling meshes from 2D grid array
- `src/player.ts` — `Player` class with grid movement, facing direction, tween camera animation
- `index.html`, `package.json`, `tsconfig.json`, `.gitignore`
