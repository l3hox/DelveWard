# DelveWard — Decision & Change Log

Each entry records what was decided or changed — design decisions, architecture changes, and significant code changes. Marked by date. Newest entries first.

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
