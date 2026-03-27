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

**Flat `"layer:col,row"` key encoding:** Rejected. `doorKey()` is called ~90 times across 30+ files. Changing the key format is a project-wide refactor with silent runtime failures on missed sites. No compile-time protection — a missed call produces a key that never matches. The LayerState pattern confines the layer dimension to one access point.

### Consequences

- Zero changes to `doorKey()` and its ~90 call sites
- Phase 0 refactor is contained: move Maps into LayerState, add accessor
- Cross-layer signal resolution navigates between LayerState instances by entity ID
- Save system: `layers: SerializedLevelSnapshot[]` — explicit structure
- `_rebuildEntityIndex()` must include `layerIndex` in the entity-by-ID index

---

## ADR-M4-03 — Hollow Areas via openBottom/openTop Flags

**Status:** Accepted
**Date:** 2026-03-27

### Context

Vertical openness between layers (cliff edges, atriums, bridges) needs a way to remove floor/ceiling geometry at specific cells. The question is what mechanism to use.

### Decision

**Extend the existing area system with `openBottom`/`openTop` boolean flags on `TextureArea`.**

- `openBottom: true` → skip floor geometry in that area region → see layer below
- `openTop: true` → skip ceiling geometry → see layer above
- Both → full vertical opening
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

**Layer-locked for M4:**
- **Enemy AI**: Enemies exist on one layer, pathfind only within that layer, aggro only toward player on the same layer.
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
