# Milestone 4 — Architecture Decision Records

---

## ADR-M4-01 — Layers Within Levels: Vertical World Model

**Status:** Accepted
**Date:** 2026-03-27

### Context

M4 adds vertical space to the game. The dungeon needs multiple Y-stacked floors visible simultaneously — standing on a cliff edge, you see every layer below. The question is how to model this relative to the existing level/dungeon system.

### Decision

**Layers within levels.** Two distinct concepts:

- **Layers**: Y-stacked slices of the same world. All rendered simultaneously. Unlimited visibility. Connected by ramps/stairs (future). Each layer has its own grid, entities, and areas.
- **Levels**: Separate worlds. Teleport transitions (existing stair system). No cross-visibility.

A `DungeonLevel` gains a required `layers: LayerDef[]` field. Each `LayerDef` has grid, entities, areas, ceiling toggle.

### Alternatives Rejected

**Multi-level simultaneous rendering (stacking existing levels):** Rejected. Levels are conceptually separate worlds (different dungeons, realms). Forcing them to render together conflates world segmentation with vertical space. The layer model keeps them orthogonal.

**Single giant grid with Y-coordinates per cell:** Rejected. Breaks the 2D grid movement model. Layers preserve 2D movement within each layer while stacking vertically for visuals.

### Consequences

- All layers of a level are always in the Three.js scene — simple, no culling logic
- Entity simulation runs on all layers (no dormancy for M4)
- Geometry is lightweight enough for 20+ layers
- `layers` is required — backward-compat code (`hasLayers()`, `convertToLayers()`, single-layer fallback wrapping) has been fully removed. All level JSON files must use the layered format.
- Future: ramps between layers, possible level collapse into one big layer stack

---

## ADR-M4-02 — LayerState Pattern for Entity Storage

**Status:** Accepted
**Date:** 2026-03-27

### Context

GameState stores entities in typed Maps keyed by `"col,row"` strings (`doorKey()` function). With multiple layers, entities need layer awareness. The question is how to extend the key scheme.

### Decision

**LayerState wrapper type, not flat `"layer:col,row"` keys.**

Introduce `LayerState` — a type wrapping all entity Maps (doors, enemies, chests, etc.). `GameState` holds `layers: LayerState[]` with `activeLayerIndex`. Existing `doorKey(col, row)` remains unchanged. All entity lookup code within a layer is untouched.

```typescript
interface LayerState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  // ... all 17+ entity Maps ...
}
class GameState {
  layers: LayerState[];
  activeLayerIndex: number;
  get activeLayer(): LayerState { return this.layers[this.activeLayerIndex]; }
}
```

### Alternatives Rejected

**Flat `"layer:col,row"` key encoding at the GameState level:** Rejected. `doorKey()` is called ~90 times across 30+ files. Changing the key format is a project-wide refactor with silent runtime failures on missed sites. The LayerState pattern confines the layer dimension to one access point.

**Note (Phase B update):** The rendering layer DOES use prefixed keys (`"layerIndex:col,row"` via `meshKey()`/`layerDoorKey()`) for shared meshMaps that track all layers' meshes. This is separate from GameState — the entity Maps within each `LayerState` still use unprefixed `doorKey()`. The `lk()` helper in the game loop bridges the two: it reads `gameState.activeLayerIndex` to prefix a `doorKey` for mesh lookup.

### Consequences

- Zero changes to `doorKey()` and its ~90 call sites in GameState/entity code
- Phase 0 refactor is contained: move Maps into LayerState, add accessor
- Cross-layer signal resolution navigates between LayerState instances by entity ID
- Save system: `layers: SerializedLevelSnapshot[]` — explicit structure
- `_rebuildEntityIndex()` must include `layerIndex` in the entity-by-ID index
- Renderer meshMaps use `"li:col,row"` prefixed keys (ADR-M4-08)

---

## ADR-M4-03 — Hollow Areas via openBottom/openTop Flags

**Status:** Accepted
**Date:** 2026-03-27

### Context

Vertical openness between layers (cliff edges, atriums, bridges) needs a way to remove floor/ceiling geometry at specific cells. The question is what mechanism to use.

### Decision

**Auto-detect from adjacent layers, with area overrides.**

Default behavior: `buildDungeon()` checks the adjacent layer's grid at the same cell position. If the neighbor cell is not a solid wall (floor, void, seeThrough), the floor/ceiling is automatically skipped. No manual flagging needed for typical multi-layer layouts.

Area `openBottom`/`openTop` boolean flags on `TextureArea` serve as **explicit overrides** — they force the surface open or closed regardless of what's on the adjacent layer. Useful for forcing a ceiling closed under a walkable cell above, or forcing a floor open over a wall below.

- Auto-detect: `buildDungeon()` accepts `layerAboveGrid`/`layerBelowGrid` parameters
- Override: `openBottom: true/false` and `openTop: true/false` on areas (explicit value wins)
- The `' '` void char remains for non-walkable empty space

Named `openBottom`/`openTop` (not `noFloor`/`noCeiling`) to avoid confusion with the existing level-wide `ceiling: boolean` field.

### Alternatives Rejected

**New charDef for hollow cells:** Rejected. CharDefs define cell types (solid/walkable). Hollows are a property of walkable cells in specific regions — the area system already handles per-region overrides. Adding charDefs would require painting hollow chars into the grid, which is less flexible than area rectangles.

**Void char `' '` for all hollows:** Rejected. Void cells are non-walkable. Hollows need to be on walkable cells (the player walks to the cliff edge and looks down). Different concepts — void is "nothing here," hollow is "floor/ceiling removed."

### Consequences

- Reuses existing area infrastructure (rectangles with fromCol/toCol/fromRow/toRow)
- `buildDungeon()` checks area flags per-tile when deciding whether to render floor/ceiling planes
- Editor: checkboxes in the existing area editor panel
- Zero new data structures

---

## ADR-M4-04 — Environment Areas with Dynamic Fog Blending

**Status:** Accepted
**Date:** 2026-03-27

### Context

M4 needs mixed environments within a single level — e.g., bright outdoor courtyard with a dark dungeon entrance. Currently one environment per level (global `scene.fog`).

### Decision

**Environment field on TextureArea + dynamic fog/ambient blending based on player position.**

- Areas can specify `environment?: Environment` to override the level default
- Each frame, the game resolves which environment zone the player is in
- `scene.fog`, ambient light, and background lerp smoothly toward the target zone's config
- Limitation: `THREE.Fog` is scene-wide, so the entire view uses the player's current zone. Looking back out from a dungeon entrance, the outdoor area appears dark-fogged.

**Phase A2 implementation:** Replaced dynamic blending with multi-pass rendering using Three.js `Object3D.layers` bitmask. Each environment zone is assigned a layer index (1-based). Meshes are tagged at build time via `child.layers.set(zoneIndex)`. The render loop does one pass per zone: sets camera layer mask + zone fog/ambient, renders, preserves depth buffer between passes. Result: looking out a dungeon door shows bright sky; looking in shows dark corridors.

**Key implementation details:**
- Boundary door cells: floor, ceiling, walls, and door frames physically split into half-meshes — outdoor half tagged to outdoor zone, indoor half to dungeon zone
- Door panels split into half-depth groups for correct per-zone fog
- Billboard `depthWrite` enabled (alpha discard in shader) prevents cross-zone overdraw
- Single-zone levels skip multi-pass (zero overhead)

### Alternatives Rejected

**Stencil-masked multi-pass:** Originally proposed in the plan. Rejected during implementation — Three.js `Object3D.layers` bitmask achieves the same per-zone rendering without stencil buffer management. Layers are simpler, avoid material stencil properties, and work with the existing render pipeline.

**Per-material fog via custom shaders:** Rejected for M4. Would give true per-zone fog but requires rewriting all materials. Noted as future evolution.

**No mixing — one environment per level:** Rejected. The "outdoor courtyard with dungeon entrance" scenario is the core visual moment of M4.

### Consequences

- Multi-pass rendering produces visually correct zone transitions
- Two render passes instead of one — acceptable, each renders ~half geometry
- Mesh zone tagging at build time is straightforward (cell → area → zone lookup)
- Entity meshes, lights, and dynamically added objects must be tagged or `enableAll()`

---

## ADR-M4-05 — Cross-Layer Scope Boundaries

**Status:** Accepted
**Date:** 2026-03-27

### Context

With multiple layers simulated simultaneously, the question is which game systems operate within a single layer vs. across layers.

### Decision

**Layer-locked for M4** (but all layers tick — see ADR-M4-08):
- **Enemy AI**: Enemies pathfind within their own layer, attacks only connect on the player's layer. AI ticks on ALL layers (enemies move, regen, take status damage even when player is on another layer).
- **Projectiles**: Travel within originating layer only. No cross-layer flight through hollows. Each `ProjectileInstance` stores `layerIndex` at spawn; the update loop groups projectiles by layer, switches `activeLayerIndex` per group, and restricts player hit detection to the player's own layer.
- **Player movement**: Restricted to current layer grid. Layer transitions via ramps (stair-style or smooth) or falling through open floors (ADR-M4-13).
- **Falling**: Stepping onto an `openBottom` cell triggers a gravity-based fall to the layer below. See ADR-M4-13 for full implementation details.
- **Combat**: Player attacks and enemy attacks only affect entities on the same layer.

**Cross-layer for M4:**
- **Signals**: A lever on layer 0 can target a door on layer 2. Entity IDs are level-wide unique; signal resolution uses the entity-by-ID index which includes layerIndex.
- **Rendering**: All layers always visible. Torch light is spherical (bleeds across layers through hollows — accepted as M4 limitation).

### Alternatives Rejected

**Cross-layer enemy AI and projectiles:** Rejected for M4. Pathfinding across layers requires 3D graph (layers connected by stairs/holes). Projectiles crossing layers need trajectory computation through hollow volumes. Both are significant complexity for limited gameplay value in M4. Deferred.

### Consequences

- AI, pathfinding, combat code changes are contained to layer-scoping (check `activeLayerIndex`)
- No 3D pathfinding needed
- The "enemies on another layer can't see you" limitation is actually a feature (tactical layer choice)
- Future: cross-layer AI and projectiles when ramps/stairs between layers are added

---

## ADR-M4-06 — Thin Walls: Canonical Edge Entities

**Status:** Accepted (revised 2026-04-02)
**Date:** 2026-03-27

### Context

M4 adds thin walls — walls on the edge between two walkable cells (fences, railings, room dividers). Currently walls are full cells (`#`). The question is how to model edge walls.

### Decision

**Entity-based with canonical edge ownership.** Each grid edge has exactly one possible owner cell and direction — no duplicates, no ambiguity.

**Convention:** Only `wall: 'S'` and `wall: 'E'` are valid directions. The entity always lives on the cell that is **north** (for S edges) or **west** (for E edges) of the physical wall line.

```typescript
ThinWallInstance: {
  id?: string;
  col: number;
  row: number;
  wall: 'S' | 'E';            // canonical — only two directions allowed
  solid: boolean;              // true = blocks projectiles; false = half-height, pass over
  height: 'full' | 'half';    // full = floor-to-ceiling; half = waist-high
  texture: string;             // north/west-facing side
  textureBack?: string;        // south/east-facing side (defaults to texture if omitted)
}
```

**Why canonical edges:**
- **One entity per edge** — no dedup logic, no "which side owns it?" questions
- **Deterministic lookup**: wall between (5,2) and (5,3)? Check `thinWalls` at (5,2) for `wall:'S'`. One place to look, always.
- **Two-sided textures**: exterior/interior building walls (e.g., stone outside, wood inside) with a single entity
- **Editor simplicity**: clicking any edge resolves to exactly one canonical cell+direction. No risk of placing conflicting walls from both sides.
- **Reciprocal blocking is a read, not a search**: checking movement from (5,3) northward looks up (5,2).S — always one entity to check.

**Rendering:** `PlaneGeometry` at cell edge, double-sided. Front face uses `texture`, back face uses `textureBack` (or `texture` if not set). Full-height = floor to ceiling. Half-height = waist-high (fences, railings) — player can see over but not walk through.

**Movement blocking:** Blocks from both sides. The check from either adjacent cell resolves to the same canonical entity.

**Pathfinding:** Enemy AI BFS neighbor expansion checks thin wall edges. A cell is reachable but not from all directions.

**Projectiles:** `solid: true` blocks projectiles. `solid: false` (half-height) allows projectiles to pass over.

**Edge blocking architecture (added 2026-04-03):** Movement checks happen **outside `isWalkable()`** via a separate `isEdgeBlocked` callback. This keeps the core `isWalkable(grid, col, row, ...)` function completely unchanged (cell-based, no direction parameter). The edge check is injected at 5 specific sites:

1. `PlayerState` — optional `isEdgeBlocked?(fromCol, fromRow, toCol, toRow)` callback, checked after `isWalkable()` in each of moveForward/moveBack/strafeLeft/strafeRight
2. `pathfinding.ts findPath()` — optional `isEdgeBlocked` parameter, checked in BFS neighbor expansion
3. `enemyAI.ts` — flee/chase/erratic loops add `!isEdgeBlocked?.(...)` alongside existing passability checks
4. `ProjectileManager.update()` — tracks `prevCell`, checks `isSolidEdgeBlocked` at cell boundary crossings
5. `main.ts` / `interaction.ts` — block push conditions add `!gameState.isEdgeBlocked(...)`

**Why outside `isWalkable()`:** The function is a pure cell-based predicate used in dozens of places. Changing its signature to accept direction info would touch `PlayerState`, `Player`, every `isPassable` lambda in enemyAI, `findPath()`, and `ProjectileManager` — massive blast radius. The per-site approach adds 1-3 lines at each of 5 well-defined locations.

### Alternatives Rejected

1. **Four-direction `wall: Facing`:** Allows N/S/E/W. Risk of duplicate/conflicting entities on the same edge from both sides. Requires dedup in engine and editor. Rejected for unnecessary complexity.

2. **Grid edge data structure:** A new `edges` field on the level JSON would be more compact for city-scale content but introduces a parallel data model outside the entity system. Rejected — entity-based is consistent with all other structural elements.

### Consequences

- Follows existing entity patterns — editor palette, inspector, grid icon all standard
- Pathfinding needs extension (check edges, not just cell walkability)
- A 10×10 building perimeter = ~40 thin wall entities — manageable with editor drag-to-paint
- No duplicate edge risk — the data model prevents it structurally
- Two-sided textures enable building exteriors without extra entities

---

## ADR-M4-07 — Item Billboard Sprites with Quadrant Spread

**Status:** Accepted
**Date:** 2026-03-27

### Context

Ground items are currently rendered as flat `PlaneGeometry` lying on the floor (rotation.x = -Math.PI/2). They're nearly invisible from a distance and overlap when multiple items are at the same cell.

### Decision

**Upright billboard sprites + quadrant spread positioning.**

- Items rendered as billboard sprites that face the camera (like enemy/NPC sprites), not flat on the floor
- Multiple items on the same cell are spread to quadrant positions:
  - 1 item: center
  - 2 items: NW, SE
  - 3 items: NW, NE, S
  - 4+: NW, NE, SW, SE (cap visible at 4)
- Offset ~0.3 from cell center
- After pickup, remaining items recalculate quadrant positions

### Consequences

- Items visible from across the room (major visual improvement)
- Billboard update loop needed (or use `THREE.Sprite`)
- Pickup mesh rebuild already exists (Phase F barrel loot fix) — extends naturally
- Both `itemRenderer.ts` and `consumableRenderer.ts` affected

---

## ADR-M4-08 — All Layers Active (No Dormancy)

**Status:** Accepted
**Date:** 2026-03-28

### Context

Phase B initially had an active/non-active layer distinction: the player's layer got full mesh tracking, animators, and AI ticking; other layers were visual-only (static meshes, no interaction, no AI). This was simpler but meant enemies on other layers were frozen, doors didn't animate, and traps didn't fire.

### Decision

**All layers are fully active.** No dormancy — every layer has full mesh tracking, animators, and AI ticking every frame.

- Shared meshMaps use `"layerIndex:col,row"` prefixed keys (`meshKey()`, `layerDoorKey()`)
- One set of animators (DoorAnimator, LeverAnimator, EnemyAnimator, HealthBarManager) handles all layers
- `lk()` helper in the game loop prefixes keys with `gameState.activeLayerIndex` for correct layer targeting
- Enemy AI ticks all layers per frame; attacks restricted to player's layer
- Trap launchers tick all layers
- Signals already cross-layer (ADR-M4-05)

### Alternatives Rejected

**Keep non-active layers visual-only:** Rejected. Cross-layer signals need doors on other layers to animate. Enemies should be alive even when the player isn't on their layer. The "everything active" model is simpler to reason about and prevents bugs from dormancy edge cases.

**Per-layer LevelScene arrays:** Rejected. Would require `doorAnimators[]`, `enemyAnimators[]`, etc. with ~50 access sites each converting to `[layerIndex]`. The merged-key approach (`"0:3,4"` format) avoids parallel arrays and keeps a single animator per type.

### Consequences

- Draw calls scale linearly with layer count (acceptable for ~5 layers)
- Future dormancy optimization: spatial data structures with local-neighborhood activation. The prefixed-key scheme is compatible — dormant layers would simply skip their tick, not their mesh tracking
- The `lk()` helper pattern makes layer-aware lookups mechanical — wrap any `doorKey` in `lk()` for the mesh-level key

---

## ADR-M4-09 — Layer IDs as Stable Numeric Coordinates

**Status:** Accepted
**Date:** 2026-03-28

### Context

Layers are stored in an array ordered by Y position (lowest first). When inserting layers above or below, array indices shift. References to layers (e.g., `playerStart.layerIndex`) need to survive insertions.

### Decision

**Layer IDs are stable numeric coordinates.** Ground = `"0"`, above = `"1"`, `"2"`, ..., below = `"-1"`, `"-2"`, ...

- IDs never change after creation — inserting a new layer at the bottom shifts array indices but not IDs
- All references (playerStart, stair targets) store the coordinate, not the array index
- `resolveLayerCoord(level, coord)` converts coordinate → array index at runtime
- No shifting logic needed on insert/remove

### Consequences

- `playerStart.layerIndex: 0` always means "ground floor" regardless of how many layers are added below
- Editor and game both use the same resolution function
- Stair cross-level references resolved via entity ID + `findEntityLayerIndex()`, not layer coordinate (entities are unique)
- The coordinate maps intuitively to floor numbers in the level design

---

## ADR-M4-10 — Light Performance: Distance Culling + Future Optimization Path

**Status:** Accepted
**Date:** 2026-03-29

### Context

Multi-layer levels multiply the light count (sconces, door lights per layer). Three.js `MeshLambertMaterial` uses forward rendering — the vertex shader loops over ALL `PointLight`s in the scene for every vertex. With `decay=2` and tight `distance`, distant lights early-out cheaply, but the loop overhead grows linearly with total light count.

Current budget: ~24 lights (2 layers). Projected: ~50-60 lights (4-5 dense layers), ~100+ lights (10+ layers).

### Decision

**Phase 1 (now): Distance culling via `light.visible = false`.**

Before each render frame, lights beyond a threshold distance from the camera are disabled. Three.js excludes `visible=false` lights from the shader uniform array.

**Caveat**: changing the visible light count triggers a shader recompile (Three.js bakes `NUM_POINT_LIGHTS` as a `#define`). Acceptable for now — light count changes only when the player moves between areas with different sconce density, which is infrequent. If stutter is observed, mitigate by moving culled lights to `position(0, -10000, 0)` with `intensity=0` instead (same loop cost, no recompile).

### Future optimization paths analyzed (not built yet)

| # | Approach | Effort | Performance | Notes |
|---|---|---|---|---|
| 1 | **Vertex color baking** — precompute static light at build time, store in vertex colors | Medium | Great | Sconce changes require local rebuild (~20 meshes) |
| 2 | **Lightmap textures** — top-down per-layer lightmap, sample in shader | Medium-high | Great | Cell-granularity resolution fine for pixelart |
| 3 | **Deferred lighting** — screen-space light pass | Very high | Best | Major architectural change, loses Lambert simplicity |
| 4 | **Light atlas/UBO** — spatial grid texture, shader indexes nearby lights | Medium | Excellent | Data-driven, custom shader required |
| 5 | **Hybrid vertex colors + dynamic shader lights** — static baked, 2-3 dynamic (torch/fireballs) in shader | Medium-low | Excellent | **Recommended next step** — no custom shader, keeps MeshLambertMaterial with `vertexColors: true`, constant shader light count (no recompile risk) |

**Recommended upgrade path**: Phase 1 (distance culling) → Phase 2 (#5 hybrid vertex colors) when levels exceed ~50 lights. #5 reduces shader lights to a constant 2-3 regardless of sconce count.

### Consequences

- Phase 1: ~10 lines of code, no shader changes, immediate benefit
- Sufficient for M4 scope (2-5 layers, ~30-60 lights)
- The `decay=2` + tight `distance` on all lights (already implemented) ensures early-out for the remaining visible lights
- Revisit when level complexity demands it

---

## ADR-M4-11 — Billboard Sprite Rendering and Alpha Handling

**Status:** Accepted
**Date:** 2026-03-31

### Context

Multiple entity types need visible 3D representation in the world: items on the ground, consumables, keys, enemies, NPCs, and forest trees. The question is how to render these (flat floor planes, billboard sprites, or 3D geometry) and how to handle alpha transparency in the multi-pass zone rendering system.

### Decision

**Upright billboard sprites with alpha-test discard.**

- Items, consumables, and keys rendered as upright `PlaneGeometry` sprites facing the camera (billboard). Uses `createNeutralLitMaterial()` — a `MeshLambertMaterial` with the sprite texture, positioned at cell center with seeded random offsets for multi-item spread.
- Enemies and NPCs use the same billboard approach with larger sprites and per-type textures.
- Forest trees use `InstancedMesh` (one per variant, 4 draw calls total regardless of tree count). Billboard shader updated with `#ifdef USE_INSTANCING` to support instance transforms.

**Alpha handling:** `transparent: false` with `alphaTest: 0.5`. Transparent pixels are discarded at the fragment level (not blended). This prevents cross-zone alpha artifacts in multi-pass rendering — without it, semi-transparent sprite edges blend against the wrong zone's background color.

**Thin wall textures** (iron_fence, wood_fence, railing) use real alpha channel with `alphaTest: 0.5` for see-through gaps between bars/planks.

### Alternatives Rejected

1. **`transparent: true` (alpha blending):** Produces visual artifacts in multi-pass rendering. A sprite rendered in the dungeon zone pass that overlaps an outdoor zone pixel blends against the dungeon background color, creating dark halos. `alphaTest` discards instead of blending.

2. **Flat ground-plane sprites:** Items lying flat on the floor (rotation.x = -Math.PI/2) are invisible from a distance. Upright billboards are visible across the room.

3. **3D geometry for items:** Adds complexity, draw calls, and doesn't match the pixelart aesthetic. Billboard sprites are consistent with the enemy/NPC rendering approach.

### Consequences

- All sprite entities share the same rendering pattern (billboard + alphaTest)
- `alphaTest: 0.5` means no smooth alpha gradients — pixels are either fully opaque or fully discarded. Acceptable for pixelart.
- InstancedMesh optimization reduces forest from 100s of draw calls to 4
- New dynamically spawned sprites (dropped items, damage numbers) must call `layers.enableAll()` for multi-zone visibility

---

## ADR-M4-12 — Inventory Direct Slot Model

**Status:** Accepted
**Date:** 2026-03-31

### Context

The inventory/backpack system needs a model for how items are positioned in the grid UI. Two approaches: auto-packed (items always fill from slot 0 upward, no gaps) or direct-slot (items stay at their assigned slot, gaps allowed).

### Decision

**Direct slot model — visual grid position equals slot number.**

- Each backpack item has an assigned `slot` number (0-7). The visual position in the inventory grid matches this slot number.
- Dragging an item to slot 7 keeps it at slot 7, even if slots 0-6 are empty.
- `swapBackpackSlots()` swaps by slot number, not by sorted index.
- `getBackpackItemAt(slot)` retrieves by direct slot lookup.
- Keyboard quick-use (keys 1-8) targets the item at that slot number.
- Slot indicators (1-8) displayed on all backpack slots — gold for consumables, grey for others.

**Mouse interaction model:**
- Double-click to equip/use (not single-click — avoids accidental actions)
- Right-click to drop
- Drag-and-drop between backpack slots (rearrange), between backpack↔equipment (equip/unequip)
- Eligible equipment slots highlight green during drag (subtype-aware: helm→head, sword→weapon)

### Alternatives Rejected

**Auto-packed:** Items always fill from slot 0 upward. Simpler data model but breaks player's spatial memory — "my health potion is in slot 3" stops being true when another item is consumed. Also makes keyboard quick-use unreliable.

### Consequences

- Players can organize their backpack intentionally
- Keyboard quick-use (1-8) is reliable and memorable
- Drag-and-drop rearranging feels natural (items stay where placed)
- Slightly more complex than auto-pack (need explicit slot tracking)

---

## ADR-M4-13 — Falling Through Open Floors

**Status:** Accepted
**Date:** 2026-04-05

### Context

Cells with `openBottom` previously blocked player movement — stepping onto a hole was treated the same as stepping into a wall. This eliminated an obvious gameplay mechanic (pit traps, intentional drops between layers) and felt unnatural in a multi-layer world.

### Decision

**Allow stepping onto `openBottom` cells; trigger a gravity-based fall at 2/3 of walk progress.**

The 2/3 trigger point means the player has visually committed to the step before the fall begins — it reads as intentional rather than a teleport. From there:

- Gravity accelerates the camera Y downward over a distance of 2 × `LAYER_HEIGHT` (two full cell heights).
- After that distance, velocity clamps to terminal velocity (20 u/s).
- The camera tilts downward during the fall via a `yRotation` lerp for visual feedback.
- Player input is blocked for the fall duration.
- On landing, `activeLayerIndex` and the grid position are switched to the destination layer, and the camera resets to upright.

**Implementation:** `pendingFall: boolean` flag on `Player`, set during the walk tween in `main.ts`. Physics replaces the normal `yOffset` lerp in `Player.update()` while falling. The hole-blocking guard in `levelSceneBuilder` was removed — `openBottom` cells are now passable. A landing callback in `main.ts` handles the layer/grid switch and re-enables input.

Debug noclip mode skips fall detection so designers can freely traverse floors.

### Alternatives Rejected

**Immediate teleport to lower layer on step:** Rejected. No visual feedback, disorienting. The gravity arc communicates what happened spatially.

**Block movement onto open-floor cells (status quo):** Rejected. Prevents pit traps and deliberate multi-layer drop shortcuts, both of which are core M4 design affordances.

### Consequences

- Pit traps are now possible as a level design element — an openBottom cell with enemies or loot below
- Multi-step falls (more than one layer) are supported — the fall keeps going until it hits a floor or an `openBottom` cell on the next layer
- Debug noclip must bypass the fall check to remain useful
- Landing on a layer with no valid floor cell is not guarded — level designers are responsible for ensuring a floor exists at the landing position

---

## ADR-M4-14 — Ramp Geometry: Wall Suppression and Merging

**Status:** Accepted
**Date:** 2026-04-08

### Context

Ramps connect two adjacent layers using a cell on the lower layer (bottom cell, walkable `.`) and a corresponding cell on the upper layer (top cell, wall `#`). The ramp renderer handles geometry for these two cells, but several edge cases required additional design:

1. **Stacked ramps** — a cell that is simultaneously the top of one ramp and the bottom of the next. Without special handling, it generates conflicting wall-suppression from two `RampCellInfo` entries.
2. **Adjacent ramp top cells** — two ramps side by side whose top cells share a boundary. The ramp renderer was generating side walls between them, producing double geometry.
3. **Side fill texture** — the triangular/stepped side fill used the wrong layer's texture.
4. **Upper layer wall height** — perpendicular walls at the ramp top cell were halved (`keepHalf`) when they should be full height.

### Decision

**`RampCellInfo.wallDirs: Facing[]` + `mergeRampCell()` + top-cell exclusion from `isWallAt`.**

- **`wallDirs: Facing[]`**: Widened from a single `Facing` to an array. A stacked-ramp shared cell collects suppressions from both the ramp above and the ramp below. `mergeRampCell()` combines two `RampCellInfo` entries for the same cell, unioning their `wallDirs` arrays. The resulting entry suppresses walls in all relevant facing directions.

- **Adjacent top-cell exclusion**: The ramp renderer collects all ramp top-cell positions before generating side walls. `isWallAt` is extended to treat top cells from other ramps as non-wall (open), preventing side walls from being generated between adjacent top cells.

- **Side fill texture**: Changed to always sample from the top cell's wall texture. This matches the texture the dungeon builder uses for the half-walls adjacent to the ramp top cell, producing a visually continuous surface.

- **Upper layer full walls**: `keepHalf` removed from perpendicular walls on the upper-layer ramp top cell. These walls were being halved under the assumption they needed to align with the ramp slope, but visually they should be full height — the ramp slope is handled by the ramp geometry itself, not by wall height.

### Alternatives Rejected

**Two separate `RampCellInfo` entries for the shared cell:** Rejected. The dungeon builder processes them independently, causing each entry to re-add walls that the other entry suppressed. A merge step is required.

**Per-neighbor side wall check without top-cell exclusion:** Rejected. Side walls between two adjacent ramp top cells were generated because each top cell was classified as a solid wall (`#`) by the other ramp's renderer. The exclusion list is necessary.

### Consequences

- Stacked ramps (e.g., a three-layer cliff face) render correctly with no spurious walls on shared cells
- Adjacent ramp top cells (parallel ramps side by side) produce clean geometry with no overlapping faces
- Side fill texture is consistent with the rest of the ramp visual — the triangle fills look like part of the same wall surface
- `mergeRampCell()` must be called whenever a `RampCellInfo` entry is added for a cell that already exists in the map — this is enforced in `buildDungeon()`

---

## ADR-M4-15 — Pit Traps: Signal Receiver Pattern + forceRenderable Mechanism

**Status:** Accepted
**Date:** 2026-04-10

### Context

Pit traps are floor cells that can open, dropping the player to the layer below. They need to:

1. Integrate with the signal system (lever-triggered, pressure-plate-triggered, etc.)
2. Reveal a hole in the floor when open — meaning the cell on the layer below must render as walkable space rather than a solid wall, even though the grid char there is `#`
3. Handle the ceiling two layers below (the "underside" of the hole)
4. Avoid full scene rebuilds on every state change — these are runtime toggles that happen during play

### Decision

**Signal receiver pattern + `forceRenderable` Map + mesh visibility toggles, with targeted layer rebuild for geometry changes.**

**Signal integration:** Pit traps register as signal receivers identically to mechanical doors. The `onPitTrapSignalChanged` callback is the state-change entry point. `syncSignalReceiverStates()` is called at the end of `_initSignalManager` to apply signal state to all receivers before the first frame — this ensures signal-connected pits start in the correct state regardless of what `state` is written in the JSON. Save/load uses signal state restoration plus a `syncSignalReceiverStates()` call on load.

**`forceRenderable` Map:** `buildDungeon()` accepts a `forceRenderable: Map<"col,row", { skipCeiling: boolean }>` input. Cells in this map are treated as walkable during geometry generation regardless of their grid char. This allows a `#` wall cell on the layer below an open pit to render with proper floor, ceiling, and neighbor-facing walls — making the space look like an open room rather than a solid block. The `skipCeiling` flag suppresses the ceiling on that cell (the pit floor above is the visual ceiling from below).

**When a pit opens or closes at runtime:** The `forceRenderable` set for the affected layer changes (a cell is added or removed). This triggers a targeted rebuild of just that layer's dungeon geometry — not the whole scene. Only the one layer needs to change. The pit's floor mesh visibility is toggled directly (no rebuild needed for the pit cell itself). The ceiling two layers below is toggled via `pitCeilingMap` mesh visibility — again, no geometry rebuild.

**Mesh visibility toggles for floor and ceiling:** Both the pit floor mesh and the ceiling mesh two layers below are always built and tracked in maps (`pitFloorMap`, `pitCeilingMap`). Open = floor invisible, ceiling invisible. Closed = both visible. This avoids mesh creation/destruction at runtime.

**Why targeted layer rebuild rather than toggle-only for the layer below:** The layer-below cells change between a solid wall appearance and an open-room appearance. This involves different wall faces, floor quads, and ceiling quads — not a single mesh to toggle. A targeted rebuild of that layer's geometry is the correct approach. It is bounded to one layer and does not affect other layers or entities.

### Alternatives Rejected

**Mesh visibility toggle for the layer-below cell (like pit floor):** The layer-below cell is a `#` that needs to look like a `.` when the pit is open — different faces entirely, not just hiding one mesh. Visibility toggle cannot change what faces exist.

**Full scene rebuild on pit open/close:** Correct but excessive. Rebuilding all layers and entities for a single pit toggle would cause visible stutter and is inconsistent with how other runtime geometry changes (doors, secret walls) are handled.

**Treating pit traps as a special kind of `openBottom` cell:** `openBottom` is auto-detected from adjacent layer geometry and is static. Pit traps are dynamic — the hole opens and closes. Conflating dynamic traps with the static hollow-area system would require making the auto-detect logic aware of runtime state, breaking the clean separation between level build time and runtime.

### Consequences

- Runtime pit open/close: 3 operations — toggle pit floor mesh visibility, toggle ceiling mesh visibility 2 layers below, rebuild 1 layer's dungeon geometry
- New entity renderers need no special handling for pits — `buildLayerEntityMeshes` already accounts for the layer offset
- The `forceRenderable` mechanism is general: any future "dynamic wall cell that needs to appear walkable at runtime" can use the same pattern
- Fall damage when a pit opens under the player is not part of this ADR — deferred to a future damage system
- Level designers must ensure the layer below a pit trap cell has a valid floor to land on
