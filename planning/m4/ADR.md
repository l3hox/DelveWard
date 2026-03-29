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

A `DungeonLevel` gains an optional `layers: LayerDef[]` field. Each `LayerDef` has grid, entities, areas, ceiling toggle. Backward compatible — levels without `layers` are single-layer.

### Alternatives Rejected

**Multi-level simultaneous rendering (stacking existing levels):** Rejected. Levels are conceptually separate worlds (different dungeons, realms). Forcing them to render together conflates world segmentation with vertical space. The layer model keeps them orthogonal.

**Single giant grid with Y-coordinates per cell:** Rejected. Breaks the 2D grid movement model. Layers preserve 2D movement within each layer while stacking vertically for visuals.

### Consequences

- All layers of a level are always in the Three.js scene — simple, no culling logic
- Entity simulation runs on all layers (no dormancy for M4)
- Geometry is lightweight enough for 20+ layers
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

**Phase A2 upgrade path:** Stencil-masked multi-pass rendering — each zone renders in a separate pass with its own fog. Produces visually correct transitions at zone boundaries. Falls back to dynamic blending if too complex.

### Alternatives Rejected

**Per-material fog via custom shaders:** Rejected for M4. Would give true per-zone fog but requires rewriting all materials to use custom fog calculations. Significant shader work. Noted as future evolution.

**No mixing — one environment per level:** Rejected. The "outdoor courtyard with dungeon entrance" scenario is the core visual moment of M4. A workaround using separate levels connected by stairs would lose cross-visibility.

### Consequences

- Dynamic blending is simple to implement (lerp fog params per frame)
- The visual compromise (scene-wide fog) is acceptable for first-person grid view
- Environment area data model supports future shader upgrades without changes
- Phase A2 multi-pass rendering can eliminate the compromise if warranted

---

## ADR-M4-05 — Cross-Layer Scope Boundaries

**Status:** Accepted
**Date:** 2026-03-27

### Context

With multiple layers simulated simultaneously, the question is which game systems operate within a single layer vs. across layers.

### Decision

**Layer-locked for M4** (but all layers tick — see ADR-M4-08):
- **Enemy AI**: Enemies pathfind within their own layer, attacks only connect on the player's layer. AI ticks on ALL layers (enemies move, regen, take status damage even when player is on another layer).
- **Projectiles**: Travel within originating layer only. No cross-layer flight through hollows.
- **Player movement**: Restricted to current layer grid. Layer transitions via pit traps or stairs (future: ramps).
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

## ADR-M4-06 — Thin Walls: Entity-Based Edge Walls

**Status:** Accepted
**Date:** 2026-03-27

### Context

M4 adds thin walls — walls on the edge between two walkable cells (fences, railings, room dividers). Currently walls are full cells (`#`). The question is how to model edge walls.

### Decision

**Entity-based.** A `thin_wall` entity placed on a walkable cell with a `wall: Facing` field indicating which edge has the wall. Same pattern as levers, signs, and sconces.

- `ThinWallInstance`: `{ id?, col, row, wall: Facing, solid: boolean, texture: string, height: 'full' | 'half' }`
- Blocks movement through that edge (reciprocal — blocks from both sides)
- Pathfinding must respect thin wall edges (BFS neighbor expansion checks edge)
- `solid: true` also blocks projectiles; `solid: false` (half-height) allows projectiles over

### Alternatives Rejected

**Grid edge data structure:** Rejected. A new `edges` field on the level JSON (per-cell-edge wall definitions) would be more compact for city-scale content but introduces a parallel data model that doesn't fit the existing entity system. Entity-based is consistent with how all other interactive/structural elements work, and editor support follows established patterns. For large cities, drag-to-paint thin walls mitigates the entity count concern.

### Consequences

- Follows existing entity patterns — editor palette, inspector, grid icon all standard
- Pathfinding needs extension (check edges, not just cell walkability)
- A 10×10 building perimeter = ~40 thin wall entities — manageable with editor drag-to-paint
- No new data structure or parallel storage system

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
