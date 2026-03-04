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
├── rendering/               # Three.js rendering and visual representation
│   ├── dungeon.ts           # Builds wall/floor/ceiling geometry from grid
│   ├── textures.ts          # Procedural pixelart texture generators + cache
│   ├── player.ts            # Player class — camera tween, world position
│   ├── doorRenderer.ts      # Door frames + panels, orientation detection
│   ├── doorAnimator.ts      # Sliding door panel animation
│   ├── keyRenderer.ts       # Gold key billboard sprites
│   ├── leverRenderer.ts     # Wall levers + LeverAnimator
│   └── plateRenderer.ts     # Pressure plate meshes + press state
public/
└── levels/                  # Level JSON files (level1.json – level7.json)
```

---

## Core Module (`src/core/`)

Zero Three.js imports. Safe for unit testing and pure logic.

### types.ts
- `DungeonLevel` — top-level level structure (grid, entities, playerStart, textures)
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
- Auto-creates doors for `D` cells with no entity
- Marks doors as `mechanical` when targeted by levers/plates
- Key methods: `isDoorOpen()`, `openDoor()`, `closeDoor()`, `toggleDoor()`, `activateLever()`, `activatePressurePlate()`, `pickupKeyAt()`

### interaction.ts
- `interact(playerState, grid, gameState)` → `InteractionResult`
- Handles: door open/close/unlock, lever pull (player on cell, facing wall)
- Returns type + message + optional targetDoor for mesh updates

### levelLoader.ts
- `loadLevel(url)` — fetch + validate → `DungeonLevel`
- `validateLevel(data, source)` — comprehensive validation: grid, charDefs, entities, textures, bounds
- Entity-specific validation: doors on `D` cells, key keyIds, lever targetDoor format, plate on walkable

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
- `setOnMove(callback)` — fires after grid position changes (used for key pickup, plates)
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

## main.ts — Entry Point

Orchestrates everything:
1. Creates scene, camera, renderer, lighting (ambient + torch with variable flicker)
2. Loads level JSON → builds dungeon geometry + all entity meshes
3. Constructs `GameState` from entities
4. Creates `Player` with door-aware walkability
5. Wires input (WASD/arrows/QE for movement, Space for interact)
6. Wires `onMove` callback for key pickup + pressure plate activation
7. Runs animation loop: player tween, door/lever animation, torch flicker, render

---

## Data Flow

```
Level JSON → loadLevel() → DungeonLevel
                              ├→ buildDungeon(grid) → THREE.Group (walls/floors/ceilings)
                              ├→ GameState(entities, grid)
                              │    ├→ buildDoorMeshes() → door visuals
                              │    ├→ buildKeyMeshes() → key sprites
                              │    ├→ buildLeverMeshes() → lever visuals
                              │    └→ buildPlateMeshes() → plate visuals
                              └→ Player(camera, grid, start)

Input → Player movement / interact()
         ├→ GameState mutation (door/lever/key state)
         └→ Mesh updates (animator.setOpen, hideKey, pressPlate)

Game Loop → player.update(delta)
          → doorAnimator.update(delta)
          → leverAnimator.update(delta)
          → torch flicker
          → renderer.render()
```

---

## Key Patterns

- **Map keying**: All entity maps use `"col,row"` string keys
- **Mesh builder pattern**: `buildXxxMeshes(gameState)` → `{ group, meshMap/panelMap/handleMap }`
- **Animator pattern**: `register()` → `setState/setOpen()` → `update(delta)` per frame
- **Texture caching**: Generate once, cache by name, return cached on subsequent calls
- **Grid constants**: `CELL_SIZE`, `WALL_HEIGHT`, `EYE_HEIGHT` exported from `dungeon.ts`
- **Tests**: Co-located in `src/core/`, run with `npx vitest run`, 167 tests

---

## Level JSON Format

See `DUNGEON-DESIGNER.md` for full schema. Key points:
- `grid: string[]` — each string is a row, each char is a cell
- Cell chars: `#` wall, `.` floor, `D` door, `S` stairs down, `U` stairs up, `O` object, ` ` void
- `entities: Entity[]` — typed objects with col/row/type + type-specific props
- `charDefs` — custom single-char cell types with solid flag + textures
- `defaults` / `areas` — texture overrides at level or region scope
