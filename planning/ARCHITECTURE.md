# DelveWard — Architecture Guide

Quick reference for navigating the codebase. Read this before diving into implementation. Pair with `DUNGEON-DESIGNER.md` when working on level JSON.

---

## Folder Structure

```
src/
├── main.ts                  # Entry point — boots scene/renderer, owns game loop, wires input, orchestrates transitions
├── core/                    # Game logic — no Three.js imports
├── level/                   # Level loading, validation, and player interaction with the level
├── enemies/                 # Enemy types, database, AI, pathfinding
├── npcs/                    # NPC database
├── game/                    # Game-systems glue that needs both core state and rendering hooks
├── rendering/               # Three.js: meshes, materials, animators, particles
├── hud/                     # 2D canvas HUD + DOM overlays — no Three.js
└── editor/                  # Standalone level editor (entry: editor.html)

public/
├── levels/                  # Dungeon JSON files
├── data/                    # enemies.json, items.json, npcs.json, dialogs/, quests/
└── sprites/                 # PNG sprites (enemies, NPCs, items, props)
```

---

## Layering Intent

```
hud           main.ts
   \         /  |  \
    \       /   |   \
     rendering  |    editor
        |      / \
       game   /   \
          \  /    level
         core ───── enemies, npcs
```

The intended dependency direction is downward: `main.ts` may import from anywhere, `rendering/`/`game/`/`level/` may import from `core/`, and `core/` should depend only on itself.

This is mostly upheld. The exception worth knowing about: `core/gameState.ts` and `core/assetCheck.ts` currently import from `../enemies/` and `../npcs/` for type definitions and registries. `core/` no longer compiles in isolation as a result. See "Architectural Debt" below — this is one of the items M4.5 addresses.

---

## Module Reference

### `core/` — Game logic (no Three.js)

| File | Role |
|---|---|
| `types.ts` | Shared types: `DungeonLevel`, `LayerDef`, `Entity`, `TextureSet`, `CharDef`, `TextureArea` |
| `grid.ts` | `Facing`, `PlayerState`, direction tables, walkability, layer/cell helpers |
| `gameState.ts` | Runtime state for the active dungeon — every entity Map (doors, keys, levers, plates, triggers, tripwires, gates, stairs, launchers, sconces, breakables, secrets, blocks, chests, signs, npcs, fountains, bookshelves, altars, barrels, thin walls, ramps, pit traps, spawners, …), inventory, hp, torch, hunger, xp, status effects, save/load snapshotting. Layer-aware via `LayerState[]`. **God class — see Architectural Debt.** |
| `signalManager.ts` | Signal propagation, gate evaluation, absolute-time scheduling, cycle detection |
| `questManager.ts` | Quest state machine (undiscovered → active → complete), reward application, dialog condition evaluator hook |
| `dialogManager.ts` | Dialog tree traversal, choice resolution, condition + effect evaluators |
| `combat.ts` | Damage calculation, hit resolution, kill helper, breakable/barrel/chest hit handling |
| `projectileManager.ts` | Projectile tick, collision, layer-scoped updates |
| `statusEffects.ts` | Poison/slow/burning tick + array-based effect storage |
| `entities.ts` | Entity-id helpers, ID generation |
| `itemDatabase.ts` | Item registry loaded from `public/data/items.json` |
| `lootTable.ts` | Loot roll logic shared by enemies, chests, breakables |
| `saveSystem.ts` | `SaveData` model, slot management, JSON export/import, threading quest/signal state |
| `random.ts` | `mulberry32` PRNG |
| `textureNames.ts` | Texture name constants + type-safe sets |
| `textureResolver.ts` | 4-layer texture resolution (hard-coded → defaults → charDefs → areas) |
| `assetCheck.ts` | Startup asset existence checks |

### `level/` — Level loading and player interaction

| File | Role |
|---|---|
| `levelLoader.ts` | `loadLevel` / `loadDungeon`, full validation, cross-level stair reference checks |
| `interaction.ts` | `interact(playerState, gameState)` → `InteractionResult`. Handles door, lever, chest, sign, fountain, bookshelf, altar, NPC dialog open, trade open. |

### `enemies/` — Enemy types, database, AI

| File | Role |
|---|---|
| `enemyTypes.ts` | `EnemyInstance` and per-enemy runtime fields |
| `enemyDatabase.ts` | Data-driven enemy registry loaded from `public/data/enemies.json` |
| `enemyAI.ts` | Per-tick decisions: chase, regen, flee, erratic, attack |
| `pathfinding.ts` | BFS over walkable cells, hole-aware (flying enemies exempt) |

### `npcs/` — NPC database

| File | Role |
|---|---|
| `npcDatabase.ts` | NPC registry loaded from `public/data/npcs.json` (name, sprite, dialog file, merchant stock) |

### `game/` — Systems glue

Underused today. Holds `levelSceneBuilder.ts` (assembles every per-level Three.js group from `GameState` + level data) and `lootSpawner.ts` (loot roll wrapper called by combat/chest/breakable kill sites). The natural home for systems extracted from `main.ts` in M4.5.

### `rendering/` — Three.js meshes, animators, particles

All files import Three.js. Two organizing patterns hold across the directory:

- **Builder pattern**: `buildXxxMeshes(gameState, …)` returns `{ group: THREE.Group, meshMap: Map<key, Mesh> }`. Used by door, key, lever, plate, chest, barrel, fountain, bookshelf, altar, sign, NPC, enemy, item, prop, breakable/secret wall, thin wall, ramp, stair, spawner, pit trap, trap launcher, tripwire, sconce, block.
- **Animator pattern**: `register(key, mesh, state)` / `setState(key, state)` / `update(delta)`. Used by door, lever, enemy, boulder.

Notable files: `dungeon.ts` (wall/floor/ceiling geometry + `CELL_SIZE` / `WALL_HEIGHT` / `LAYER_HEIGHT` / `EYE_HEIGHT` constants), `textures.ts` (procedural pixelart texture generators + cache), `sceneUtils.ts` (shared layer-build helpers used by both game and editor preview), `player.ts` (camera tween + falling), `environment.ts` (fog/ambient blending), `skybox.ts` (procedural skybox textures), `forestRenderer.ts` (instanced tree billboards), `particles.ts` (dust, embers, water drips, fireflies, explosions), `billboardMaterial.ts` (shared billboard shader), `enemyHealthBar.ts` + `damageNumbers.ts` (combat overlays).

### `hud/` — 2D canvas HUD + DOM overlays (no Three.js)

Fixed 640×360 internal resolution scaled with `image-rendering: pixelated`.

Two flavors:

- **Canvas overlay**: `hudCanvas.ts` (`HudOverlay` — orchestrates draw), `hudLayout.ts`, `hudColors.ts`, `hudFont.ts` (3×5 pixel bitmap). Components: compass rose, minimap, health bar, torch indicator, hunger bar, xp bar, inventory mini-panel, status effect icons, paperdoll icons.
- **DOM overlays** (z-layered above the canvas): inventory overlay, save/load overlay, sign overlay, dialog overlay, quest log overlay, trading overlay, character creation, attribute panel, stats panel, item tooltip, level-up notification.

### `editor/` — Standalone level editor

Separate Vite entry (`editor.html`). Multi-mode (level edit ⇄ dialog graph). Uses `sceneUtils.ts` and the rendering builders for its live 3D preview. Files: `EditorApp.ts`, `EditorPreview.ts`, `FreeFlyCamera.ts`, `GridCanvas.ts`, `Inspector.ts`, `LayerList.ts`, `LevelList.ts`, `LevelProperties.ts`, `Toolbar.ts`, `UndoManager.ts`, `io.ts`, `treeOverlay.ts`, plus the dialog editor subsystem: `DialogEditorState.ts`, `DialogGraphCanvas.ts`, `DialogInspector.ts`, `DialogNodeLayout.ts`, `dialogIO.ts`. Also `QuestEditorPanel.ts`.

### `main.ts` — Entry point

Boots scene/camera/renderer/lighting, loads dungeon, builds the first level via `levelSceneBuilder`, constructs `GameState`, attaches HUD + transition overlays, wires input, owns the animation loop, drives all per-frame ticks (enemy AI, projectiles, signal propagation, status effects, hunger drain, torch drain, temp buffs, environment lerp, particle updates, animator updates, falling), handles level transitions and save/load. **Currently a god orchestrator — see Architectural Debt.**

---

## Game Loop (per frame, in `main.ts`)

```
player.update(delta)               # camera tween + falling
enemies.tick(delta) on every layer # AI, attack, regen
projectiles.tick(delta)            # layer-scoped
signalManager.tick(now)            # gates, delays, repeats
statusEffects.tick(delta)          # poison/slow/burning
torch + hunger accumulators        # drain rates per second
tempBuffs.tick(delta)              # altar buffs expire
environment.lerp(delta)            # fog/ambient between zones
animators.update(delta)            # doors, levers, enemies, boulders
particles.update(delta)            # dust, embers, drips, fireflies
transition.update(delta)
hud.draw(gameState, playerState, grid, delta)
renderer.render(scene, camera)     # multi-pass for environment zones
```

---

## Data Flow

```
Dungeon JSON → loadDungeon() → Dungeon { name, levels[] }
                                   └→ per level: buildLevelScene()
                                        ├→ buildDungeon(grid) per layer
                                        ├→ buildLayerEntityMeshes() per layer (every renderer)
                                        └→ Player(camera, grid, start)

GameState (persists across levels)
  ├→ saveLevelState() → LevelSnapshot (Map in levelSnapshots)
  ├→ loadLevelState(snapshot) ← revisit
  └→ loadNewLevel(layerDefs, levelId) ← first visit

Input → PlayerState mutation → interact() / movement
   ├→ GameState mutation (door/lever/chest/etc.)
   ├→ mesh updates via animators or visibility toggles
   └→ stair / pit-trap / fall → triggerLevelTransition()

Level Transition: save snapshot → fade to black → teardown → load → build → fade in

Save/Load: SaveData carries player state + per-level snapshots + quest state + signal state
```

---

## Key Patterns

- **Map keying**: cell-keyed Maps use `"col,row"`. Multi-layer keys prefix the layer index: `"layerIndex:col,row"`. Use `layerKey()` from `core/gameState.ts`.
- **Builder + animator** in `rendering/` (see above).
- **Absolute-time scheduling**: `SignalManager.now` is the monotonic clock for all timed gates, launchers, levers. No countdowns; only `firedAt + duration` style timestamps. See ADR-M2-05.
- **Layer-aware everything**: `LayerState[]` inside `GameState`, per-layer ticks for enemies and trap launchers, layer-aware mesh keys, layer-aware item scoping.
- **Texture resolution**: hard-coded → defaults → charDefs → areas. Last match wins for areas.
- **Co-located tests**: `*.test.ts` next to source. Run with `npm test`.

---

## Architectural Debt

These are known issues. M4.5 (Architecture Cleanup) is the planned remediation — see `MILESTONES-V2.md`.

1. **`main.ts` is a 2,300+-line god orchestrator.** Owns the loop, input, every per-frame tick, save/load wiring, transition state machine, combat resolution, quest wiring, torch/hunger drain, inventory action handling. New milestones land as another 200-line block here.

2. **`core/gameState.ts` is a 2,700+-line god class.** Holds ~20+ entity Maps and every per-entity-type method. Every new entity type touches it. Adding NPC schedules, faction state, or time-of-day will multiply the surface area.

3. **`core/` is not pure.** `gameState.ts` and `assetCheck.ts` import from `../enemies/` and `../npcs/`. `core` is a peer of these directories, not a foundation.

4. **State source-of-truth is split**. `gameState`, `signalManager` (instance inside gameState but ticked from `main.ts`), and `questManager` (module-level singleton in `core/`) each own a slice of save state. Save/load has to know about all three.

5. **Entity dispatch is fan-out**. A new entity type touches `gameState` (Map + parse + snapshot + load), a renderer in `rendering/`, an interaction branch in `level/interaction.ts`, validation in `level/levelLoader.ts`, and a per-frame block in `main.ts`. There's no compiler help if you forget one.

6. **Test coverage is uneven**. `core/`, `level/`, and `enemies/` are well-tested. `rendering/`, `hud/`, `editor/`, `main.ts`, and `game/levelSceneBuilder.ts` are largely uncovered. The fix is architectural (pull controller logic into `core/`), not "write more renderer tests."

---

## Dungeon JSON Format

Multi-level dungeon: `{ name, levels: DungeonLevel[] }`. Each level has a unique `id` and one or more layers (`layers: LayerDef[]`, layer ids are numeric coordinates: `"0"`, `"1"`, `"-1"`, …).

See `DUNGEON-DESIGNER.md` for the full schema. Key points:
- `grid: string[]` per layer — each string is a row, each char a cell. `#` solid, `.` floor, ` ` void.
- `entities: Entity[]` per layer — typed objects with `col`, `row`, `type`, `id`, plus type-specific props.
- `charDefs` — custom single-char cell types with solid flag, textures, optional `seeThrough` and `openTop`/`openBottom` for hollow areas.
- `defaults` / `areas` — texture and environment overrides at level or region scope.
