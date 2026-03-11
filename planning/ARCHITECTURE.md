# DelveWard — Architecture Guide

Quick reference for navigating and understanding the codebase. Read this before diving into implementation.

---

## Folder Structure

```
src/
├── main.ts                  # Entry point — scene, renderer, input, game loop
├── core/                    # Pure game logic (no Three.js dependency)
│   ├── types.ts             # Shared types: DungeonLevel, Entity, TextureSet, CharDef
│   ├── grid.ts              # Facing, PlayerState, walkability, direction tables
│   ├── gameState.ts         # Runtime state: doors, keys, levers, plates, inventory
│   ├── interaction.ts       # Player interaction logic (Space key → doors, levers)
│   ├── levelLoader.ts       # Fetch + validate level JSON files
│   ├── textureNames.ts      # Texture name constants and type-safe sets
│   └── *.test.ts            # Co-located tests (vitest)
├── hud/                     # 2D canvas HUD overlay (no Three.js)
│   ├── hudCanvas.ts         # HudOverlay class — canvas setup, resize, orchestrates draw
│   ├── hudLayout.ts         # Layout constants (positions, sizes, 640x360 internal res)
│   ├── hudColors.ts         # Shared pixel-art color palette
│   ├── hudFont.ts           # Minimal 3x5 pixel font (digits, letters, symbols)
│   ├── compassRose.ts       # Facing indicator (top-left)
│   ├── minimapRenderer.ts   # Explored-cell minimap (top-right)
│   ├── healthBar.ts         # HP bar with heart icon (bottom-left)
│   ├── torchIndicator.ts    # Torch fuel bar with flame icon (bottom-center-left)
│   └── inventoryPanel.ts    # Key count + equipment/backpack slots (bottom-right)
├── rendering/               # Three.js rendering and visual representation
│   ├── dungeon.ts           # Builds wall/floor/ceiling geometry from grid
│   ├── textures.ts          # Procedural pixelart texture generators + cache
│   ├── player.ts            # Player class — camera tween, world position
│   ├── doorRenderer.ts      # Door frames + panels, orientation detection
│   ├── doorAnimator.ts      # Sliding door panel animation
│   ├── keyRenderer.ts       # Gold key billboard sprites
│   ├── leverRenderer.ts     # Wall levers + LeverAnimator
│   ├── plateRenderer.ts     # Pressure plate meshes + press state
│   ├── particles.ts         # Particle effects: DustMotes, SconceEmbers, WaterDrips
│   └── transitionOverlay.ts # Fade-to-black overlay for level transitions
public/
└── levels/                  # Level JSON files (level1–7.json) + dungeon1.json (multi-level)
```

---

## Core Module (`src/core/`)

Zero Three.js imports. Safe for unit testing and pure logic.

### types.ts
- `DungeonLevel` — single level structure (grid, entities, playerStart, textures, optional `id`)
- `Dungeon` — multi-level container: `{ name, levels: DungeonLevel[] }`
- `Entity` — generic entity with col/row/type + arbitrary props
- `TextureSet`, `CharDef`, `TextureArea` — texture configuration types

### grid.ts
- `Facing` — `'N' | 'E' | 'S' | 'W'`
- `FACING_DELTA`, `FACING_ANGLE`, `TURN_LEFT`, `TURN_RIGHT` — direction lookup tables
- `WALKABLE_CELLS` — default walkable characters: `.`, `D`, `S`, `U`, `O`
- `buildWalkableSet(charDefs?)` — extends walkable set with custom charDef chars
- `isWalkable(grid, col, row, walkable?, isDoorOpen?)` — bounds + cell check
- `PlayerState` — grid position + facing, movement methods (forward/back/strafe/turn)
- `getFacingCell(state)` — returns col/row of the cell the player faces

### gameState.ts
- `GameState` — constructed from `Entity[]` + optional grid
  - `doors: Map<string, DoorInstance>` — keyed by `"col,row"`
  - `keys: Map<string, KeyInstance>` — keyed by `"col,row"`
  - `levers: Map<string, LeverInstance>` — keyed by `"col,row"`, has `wall: Facing`
  - `plates: Map<string, PlateInstance>` — keyed by `"col,row"`, one-time use
  - `inventory: Set<string>` — collected key IDs
  - `hp` / `maxHp` — health (default 20/20)
  - `torchFuel` / `maxTorchFuel` — torch fuel (default 100/100)
  - `exploredCells: Set<string>` — explored minimap cells, `"col,row"` keys
- Auto-creates doors for `D` cells with no entity
- Marks doors as `mechanical` when targeted by levers/plates
- `LevelSnapshot` — snapshot of level-specific state (doors, keys, levers, plates, exploredCells)
- `saveLevelState()` / `loadLevelState(snapshot)` — deep-copy save/restore for level transitions
- `loadNewLevel(entities, grid)` — resets level maps, re-parses entities, preserves hp/torchFuel/inventory
- `drainTorchFuel(amount)` — reduces torchFuel, clamps at 0
- Key methods: `isDoorOpen()`, `openDoor()`, `closeDoor()`, `toggleDoor()`, `activateLever()`, `activatePressurePlate()`, `pickupKeyAt()`, `revealAround()`

### interaction.ts
- `interact(playerState, grid, gameState)` → `InteractionResult`
- Handles: door open/close/unlock, lever pull (player on cell, facing wall)
- Returns type + message + optional targetDoor for mesh updates

### levelLoader.ts
- `loadLevel(url)` — fetch + validate → `DungeonLevel` (single-level backward compat)
- `loadDungeon(url)` — fetch + validate → `Dungeon` (multi-level)
- `validateLevel(data, source)` — comprehensive validation: grid, charDefs, entities, textures, bounds
- `validateDungeon(data, source)` — validates dungeon wrapper, unique level ids, cross-level stair references
- Entity-specific validation: doors on `D` cells, key keyIds, lever targetDoor format, plate on walkable, stairs direction/targetLevel/targetCol/targetRow

### textureNames.ts
- Constant arrays + Sets for wall/floor/ceiling texture names
- Type aliases: `WallTextureName`, `FloorTextureName`, `CeilingTextureName`

---

## Rendering Module (`src/rendering/`)

All files depend on Three.js. Import core types via `../core/`.

### dungeon.ts
- `CELL_SIZE = 2`, `WALL_HEIGHT = 2.5`, `EYE_HEIGHT = 1.0` — grid constants (used everywhere)
- `buildDungeon(grid, defaults?, areas?, charDefs?)` → `THREE.Group`
- 4-layer texture resolution: hard-coded → defaults → charDefs → areas
- Generates walls only where walkable cell borders solid cell

### textures.ts
- Procedural 64x64 canvas texture generators for all surface types
- Wall: stone, brick, mossy, wood | Floor: stone_tile, dirt, cobblestone | Ceiling: dark_rock, wooden_beams
- Door textures: normal, locked (iron-banded), door frame (stone)
- All cached — `getWallTexture(name)`, `getFloorTexture(name)`, `getCeilingTexture(name)`
- `getDoorTexture()`, `getLockedDoorTexture()`, `getDoorFrameTexture()`

### player.ts
- `Player` — wraps `PlayerState` with Three.js camera
- Tween-based smooth movement (lerp position + angle)
- `TWEEN_SPEED = 20` — controls animation speed
- Blocks input during animation (`isAnimating()`)
- `setOnMove(callback)` — fires after grid position changes (key pickup, plates, exploration)
- `setOnTurn(callback)` — fires after facing changes (exploration)
- `getState()` → `PlayerState`, `getWorldPosition()` → `THREE.Vector3`

### doorRenderer.ts
- `buildDoorMeshes(grid, gameState, walkable)` → `{ group, panelMap }`
- Auto-detects door orientation from surrounding walls (NS vs EW)
- Builds 3D stone frame (pillars + lintel) + door panel
- Interactive doors get brass buttons on frame; mechanical doors don't
- `updateDoorMesh(panelMap, col, row, isOpen, animator?)` — triggers animation or toggles visibility

### doorAnimator.ts
- `DoorAnimator` — slides door panels up (open) / down (close)
- `register(key, panel, isOpen)` / `setOpen(key, isOpen)` / `update(delta)`

### leverRenderer.ts
- `buildLeverMeshes(gameState)` → `{ group, handleMap }`
- Metal base plate + handle rod + knob, positioned against wall based on `lever.wall`
- `LeverAnimator` — rotates handle pivot up/down around X axis
- `ANGLE_UP = -1.047` (~60° up), `ANGLE_DOWN = 1.047` (~60° down)

### keyRenderer.ts
- `buildKeyMeshes(gameState)` → `{ group, meshMap }`
- Gold key billboard sprite flat on floor
- `hideKeyMesh(meshMap, col, row)` — hides on pickup

### plateRenderer.ts
- `buildPlateMeshes(gameState)` → `{ group, meshMap }`
- Box geometry with beveled texture, sinks + darkens on press
- `pressPlate(meshMap, col, row)` — visual press state

---

## HUD Module (`src/hud/`)

Separate 2D canvas overlay on top of the Three.js canvas. Fixed 640x360 internal resolution scaled with `image-rendering: pixelated`. No Three.js — pure 2D canvas rendering.

### hudCanvas.ts
- `HudOverlay` — creates a fixed-position canvas, orchestrates all HUD component drawing
- `attach(parent?)` — appends canvas to DOM
- `draw(gameState, playerState, grid, delta)` — clears and redraws all components each frame

### hudLayout.ts
- Internal resolution: `HUD_WIDTH = 640`, `HUD_HEIGHT = 360`
- Component positions: `COMPASS` (top-left 48x48), `MINIMAP` (top-right 128x128), `HEALTH_BAR` (bottom-left 160x24), `TORCH_BAR` (bottom-center-left 120x24), `INVENTORY` (bottom-right 144x120)

### hudFont.ts
- 3x5 pixel bitmap font rendered via `fillRect` calls
- `drawPixelText(ctx, text, x, y, color, scale)` / `measurePixelText(text, scale)`
- Supports: 0-9, N/E/S/W, H/P/T/K/A/R, x, /

### Component files
- `compassRose.ts` — N/E/S/W letters, active direction highlighted gold
- `minimapRenderer.ts` — top-down grid centered on player, explored cells only, player dot + facing line
- `healthBar.ts` — horizontal bar with heart icon, low-HP pulse effect
- `torchIndicator.ts` — horizontal bar with flame icon, low-fuel flicker effect
- `inventoryPanel.ts` — key count with icon, 3 equipment slots (W/A/R), 8 backpack slots (empty placeholders)

---

### transitionOverlay.ts
- `TransitionOverlay` — full-screen black `<div>` overlay (z-index 20, above HUD at 10)
- `startTransition(onMidpoint?, onComplete?)` — fade to black → call onMidpoint → fade back in → call onComplete
- `update(delta)` — drives opacity tween from game loop
- `isActive` getter — blocks input during transitions

---

## main.ts — Entry Point

Orchestrates everything with multi-level dungeon support:
1. Creates scene, camera, renderer, lighting (ambient + torch with fuel-scaled flicker)
2. Loads dungeon JSON → builds first level scene
3. Constructs `GameState` from first level entities
4. Creates `HudOverlay` + `TransitionOverlay`
5. `LevelScene` interface groups level-specific objects (dungeon geometry, entity meshes, animators, player)
6. `buildLevelScene()` / `teardownLevelScene()` — construct/destroy level-specific Three.js objects
7. Wires input (WASD/arrows/QE for movement, Space for interact), blocked during transitions
8. `wireCallbacks()` — sets up onMove (key pickup, plates, torch drain, stair detection) + onTurn (exploration)
9. `triggerLevelTransition()` — saves level snapshot, fades to black, swaps level scene, restores/parses new level
10. Torch fuel drains 1 per step; light distance (3–8) and flicker intensity scale with fuel ratio
11. Runs animation loop: player tween, door/lever animation, transition overlay, torch flicker, HUD draw, render

---

## Data Flow

```
Dungeon JSON → loadDungeon() → Dungeon { levels[] }
                                  └→ per level: buildLevelScene()
                                       ├→ buildDungeon(grid) → THREE.Group
                                       ├→ buildDoorMeshes() → door visuals
                                       ├→ buildKeyMeshes() → key sprites
                                       ├→ buildLeverMeshes() → lever visuals
                                       ├→ buildPlateMeshes() → plate visuals
                                       └→ Player(camera, grid, start)

GameState (persists across levels)
  ├→ saveLevelState() → LevelSnapshot (stored in levelSnapshots Map)
  ├→ loadLevelState(snapshot) ← on revisiting a level
  └→ loadNewLevel(entities, grid) ← on first visit to a level

Input → Player movement / interact()
         ├→ GameState mutation (door/lever/key state)
         ├→ Mesh updates (animator.setOpen, hideKey, pressPlate)
         └→ Stair detection → triggerLevelTransition()

Level Transition → save snapshot → fade to black → teardown old scene
                 → load/restore level state → build new scene → fade in

Game Loop → player.update(delta)
          → doorAnimator.update(delta)
          → leverAnimator.update(delta)
          → transition.update(delta)
          → torch flicker (fuel-scaled)
          → hud.draw(gameState, playerState, grid, delta)
          → renderer.render()
```

---

## Key Patterns

- **Map keying**: All entity maps use `"col,row"` string keys
- **Mesh builder pattern**: `buildXxxMeshes(gameState)` → `{ group, meshMap/panelMap/handleMap }`
- **Animator pattern**: `register()` → `setState/setOpen()` → `update(delta)` per frame
- **Texture caching**: Generate once, cache by name, return cached on subsequent calls
- **Grid constants**: `CELL_SIZE`, `WALL_HEIGHT`, `EYE_HEIGHT` exported from `dungeon.ts`
- **Tests**: Co-located in `src/core/`, run with `npx vitest run`

---

## Dungeon JSON Format

Multi-level dungeon: `{ name, levels: DungeonLevel[] }`. Each level has a unique `id`.

Single level: see `DUNGEON-DESIGNER.md` for full schema. Key points:
- `grid: string[]` — each string is a row, each char is a cell
- Cell chars: `#` wall, `.` floor, `D` door, `S` stairs down, `U` stairs up, `O` object, ` ` void
- `entities: Entity[]` — typed objects with col/row/type + type-specific props
- Stairs entity: `{ type: "stairs", direction: "up"|"down", targetLevel, targetCol, targetRow }`
- `charDefs` — custom single-char cell types with solid flag + textures
- `defaults` / `areas` — texture overrides at level or region scope
