# Milestone 4: The Vertical World — Implementation Plan

**Target version:** v0.4
**Status:** Draft — reviewed by developer council, updated with findings
**See:** [ADR.md](ADR.md) for architecture decisions (created as decisions are made).

---

## Core Concept: Layers vs Levels

M4 introduces a **layers-within-levels** model that separates vertical 3D space from world segmentation:

- **Layers**: Y-stacked slices of the *same world*, always rendered simultaneously, all visible to each other. Standing on a cliff edge, you see every layer below. Connected by ramps/stairs (future: smooth within-grid transitions). Unlimited number visible.
- **Levels**: Separate worlds entirely. Teleport/portal/stair transitions (existing system). No cross-visibility between levels. Different dungeons, different locations, different environments.

```
Dungeon
  └── Level "The Surface"           ← a self-contained world
  │     └── Layer 0 (y=0)           ← ground floor, caves
  │     └── Layer 1 (y=LAYER_H)    ← castle interior
  │     └── Layer 2 (y=LAYER_H*2)  ← battlements, outdoor
  │     └── ... (unlimited)
  └── Level "The Shadow Realm"      ← separate world, teleport to reach
        └── Layer 0...
```

**Key properties:**
- All layers of a level are in the Three.js scene simultaneously — geometry always rendered
- Hollows (open bottom, open top, or both) defined via areas — you see through to layers below/above
- Solid floors/ceilings naturally occlude — no special occlusion logic needed
- Each layer has its own grid, entities, and optionally its own ceiling setting
- Existing level transitions (stairs entity) remain as teleports between levels (different worlds)

**Hollow areas (vertical openness between layers):**
- Use the existing **area system** to define hollows: `openBottom: true`, `openTop: true`, or both
- A walkable cell with `openBottom` has no floor geometry → you see the layer below
- A walkable cell with `openTop` has no ceiling geometry → you see the layer above
- Cliff edges: walkable cells with `openBottom` area, adjacent to normal cells with floor
- The `' '` void char remains for non-walkable empty space (outside the playable area)
- Named `openBottom`/`openTop` (not `noFloor`/`noCeiling`) to avoid confusion with the existing level-wide `ceiling` boolean

**Explicit scope boundaries for M4:**
- **Enemies are layer-locked** — no cross-layer AI, pathfinding, or aggro. Each enemy lives on one layer and only interacts with entities/player on that same layer.
- **Projectiles are layer-locked** — projectiles travel within their originating layer only. No cross-layer projectile flight through hollows.
- **Signals are cross-layer** — a lever on layer 0 can target a door on layer 2 (entity IDs are level-wide unique, signal resolution via ID).
- **Environment mixing via areas** — areas can override the level environment (e.g., dungeon entrance within an outdoor level). Fog/ambient blends dynamically based on player position. Limitation: scene-wide `THREE.Fog` means the entire view uses the player's current zone fog. Per-material fog shader deferred.

**Performance model:** Grid geometry is lightweight (~6 planes per cell). All entities simulated on all layers for M4 — world sizes are manageable without optimization. **Draw call budget needs validation** — Phase 0 includes a benchmark to confirm multi-layer rendering performance before committing to the "render everything" strategy.

**Known visual limitations (M4):**
- **Fog**: `THREE.Fog` is distance-from-camera (not XZ-only). Looking down through deep hollows, lower layers will be fogged. Acceptable for 2-3 layer hollows; deep vistas may need XZ-only fog shader (deferred).
- **Light bleeding**: Point lights (torch, sconces) are spherical — light passes through floors. No per-layer light masking in M4. Mitigated by LAYER_HEIGHT being large enough that torch light doesn't reach far layers. Accept as known limitation; Three.js rendering layers (bitmask) can scope lights per layer in a future pass.

**Future evolution (not M4):**
- **Dormancy system**: Spatial data structure for entity simulation radius — separate milestone
- **XZ-only fog shader**: Custom fog that attenuates only on horizontal distance, not vertical
- **Per-layer light masking**: Three.js rendering layers to scope lights per game layer
- **Per-material fog shader**: True per-zone fog without scene-wide blending compromise
- Ramps/stairs between layers (smooth within-grid transitions, not teleports)
- Possibly collapsing levels into one big layer stack for fully interconnected worlds
- True teleport entity type (distinct from stairs — portal to another level/location)
- Cross-layer AI, projectiles, and sound attenuation
- **Boundary entrance lights on all open outdoor/indoor edges** — currently only boundary doors get a PointLight. Extend to any walkable cell edge where outdoor and indoor zones meet without a wall (open passages, archways). Auto-detect from zone map + wall presence.

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| 0 | Foundation: LayerState refactor + rendering benchmark | — | Pending |
| A | Outdoor Environment + Environment Areas | — | Pending |
| A2 | Multi-Pass Environment Rendering | A | Pending |
| B | Layer System + Hollow Areas | 0 | Pending |
| B Editor | Editor: Layer management + hollow areas | B | Pending |
| C | Thin Walls | 0 | **Done** |
| C Editor | Editor: Thin wall painting | C | Basic done, UX polish pending |
| D | Decorative Props | 0 | **Done** |
| D Editor | Editor: Prop palette + placement | D | **Done** |
| E | Pit Traps | B | **Done** |
| E Editor | Editor: Pit trap entity | E | **Done** |
| F | Enemy Spawners | 0 | Pending |
| F Editor | Editor: Spawner entity | F | Pending |
| G | Rolling Boulders | 0 | Pending |
| G Editor | Editor: Boulder entity | G | Pending |
| H | Sub-Grid Entity Positioning | D | Pending |
| H Editor | Editor: Sub-grid placement | H | Pending |
| I | Content — "The Cliffside Keep" | A, B, C, D, E | Pending |

---

## Phase 0 — Foundation: LayerState Refactor + Rendering Benchmark

De-risk Phase B by refactoring GameState and validating rendering performance on the current single-layer codebase. This phase changes no gameplay behavior — it's purely structural.

### GameState LayerState refactor

The council identified the entity key scheme as the highest-risk decision. **Do NOT use `"layer:col,row"` flat keys.** Instead, introduce a `LayerState` type that wraps the current set of entity Maps:

```typescript
interface LayerState {
  doors: Map<string, DoorInstance>;
  keys: Map<string, KeyInstance>;
  levers: Map<string, LeverInstance>;
  // ... all 17+ existing entity Maps ...
  destroyedWalls: Set<string>;
  exploredCells: Set<string>;
}

class GameState {
  layers: LayerState[];           // one per layer (single-layer = [layerState])
  activeLayerIndex: number;       // which layer the player is on
  // ... player-global state (hp, inventory, flags, etc.) stays on GameState ...
}
```

**Why this approach:**
- `doorKey(col, row)` remains `"col,row"` — zero changes to the ~90 call sites across 30+ files
- All existing entity lookup code works unchanged within a layer context
- Layer awareness is a single `layers[activeLayerIndex]` dereference at the entry point
- Cross-layer signal resolution navigates between `LayerState` instances by entity ID
- Save system: `layers: SerializedLevelSnapshot[]` — explicit structure, not key-encoded

### Steps
1. **Extract `LayerState`** from GameState — move all entity Maps into a `LayerState` type. GameState gets `layers: LayerState[]` with `layers[0]` holding what was previously flat on GameState.
2. **Add `activeLayerIndex: number`** to GameState (default 0).
3. **Add accessor** `get activeLayer(): LayerState` → `this.layers[this.activeLayerIndex]`.
4. **Migrate internal methods** to use `this.activeLayer.doors` instead of `this.doors`, etc. The public API surface stays the same — `getDoor(col, row)` delegates to active layer.
5. **Extract `buildLayerScene()`** from `buildLevelScene()` in main.ts — split the 180-line function into per-layer scene construction. Rename `LevelScene` fields to `layers: LayerScene[]` wrapper.
6. **Update save system**: `LevelSnapshot` becomes `{ layers: LayerState[] }` or `LayerState[]`. Serialization wraps in `layers[]` array. Backward compat: old saves without `layers` deserialize as `[singleLayerState]`.
7. **Update `_rebuildEntityIndex()`**: Entity-by-ID index maps to `{ col, row, layerIndex, type }` (was `{ col, row, type }`).
8. **All 765 tests must still pass** — this is a pure refactor with no behavior change.

### Rendering benchmark
9. **Build a test scene** with 5 layers × 30×30 grid, each at LAYER_HEIGHT Y offset. Measure draw calls and frame time. Validate that the "render everything" approach works.
10. **Fog/lighting prototype**: Place hollow areas in the test scene. Visually evaluate fog appearance looking down through 3 layers. Evaluate torch light bleeding. Document findings and decide on mitigations.

---

## Phase A — Outdoor Environment + Environment Areas

Extend the environment system with an outdoor preset, richer skybox options, and **environment areas** — allowing mixed environments within a single level (e.g., bright outdoor courtyard with a dark dungeon entrance).

**Current state:** 3 environments (dungeon/mist/forest), 1 skybox (starry-night), ceiling toggle, fog per environment. Far plane 100, skybox radius 90. One environment per level (global).

### Environment Areas

The key addition: define environment zones as areas within a level/layer, reusing the existing area rectangle system.

```typescript
interface TextureArea {
  // ... existing fields (fromCol, toCol, fromRow, toRow, textures) ...
  environment?: Environment;      // NEW — override environment in this region
}
```

**How it works:**
- Each area can optionally specify an `environment` override (dungeon, mist, forest, outdoor)
- The game tracks which environment area the player is currently standing in
- `scene.fog`, ambient light, and background lerp smoothly toward the current area's environment config (e.g., 0.5s transition)
- **Limitation**: `THREE.Fog` is a scene-wide singleton, so the entire scene gets the player's current area fog. Looking back out from a dark dungeon entrance, the outdoor area will also appear dark-fogged. Acceptable for M4 — first-person grid view means you mostly see what's ahead.
- **Future**: Per-material fog via custom shaders could give true per-zone fog. The environment area data model supports this upgrade without changes.

### Game
1. New `'outdoor'` environment preset in `environment.ts`: bright ambient (0x8899aa), distant fog (near: 20, far: 80), sky-blue background
2. New skybox variants: `'daylight'` (blue gradient with clouds), `'sunset'` (warm orange-pink gradient) — procedural canvas textures like existing starry-night
3. Far plane extension: 100 → 200 (needed for layer visibility too). Skybox radius scales to match.
4. Optional directional light for outdoor environments (sun — simple warm directional, no shadow map for M4)
5. Level JSON: `environment: 'outdoor'` supported, `skybox: 'daylight' | 'sunset' | 'starry-night'`
6. **Environment area support**: `environment` field on `TextureArea`. Resolve player's current environment from area overlap (most specific area wins, fall back to level default).
7. **Dynamic fog/ambient blending**: Each frame, lerp `scene.fog` near/far, fog color, ambient light color toward the target environment config. Smooth transition as player walks between zones.

### Editor
8. Environment dropdown on level properties: add `'outdoor'` option
9. Skybox dropdown: add `'daylight'`, `'sunset'` options
10. **Environment field on area editor**: Optional environment dropdown per area (alongside existing texture fields). Shows which areas override the level environment.

**Decisions:**
- Per-level environment remains the default; areas override locally
- Dynamic day/night deferred to M8+

---

## Phase A2 — Multi-Pass Environment Rendering

Replace the dynamic-blending fog approach (Phase A) with proper multi-pass stencil rendering. Each environment zone renders with its own fog/sky, producing visually correct transitions — looking out a dungeon doorway shows bright sky, looking in shows dark corridors.

**Depends on:** Phase A (environment areas + outdoor preset must exist).

**Current limitation after Phase A:** `THREE.Fog` is a scene singleton. Dynamic blending updates fog based on player position, so the *entire* scene uses one fog value. Looking from indoors outward, the outdoor area is dark-fogged. This phase fixes that.

### Approach: Stencil-masked multi-pass rendering

1. **Zone classification**: Each mesh is tagged with its environment zone (derived from the area it sits in at build time). Meshes in outdoor areas → outdoor group. Meshes in dungeon areas → dungeon group. Boundary meshes (doorways) go to the zone they face into.
2. **First pass — outdoor zone**: Set `scene.fog` to outdoor config, `scene.background` to sky. Render only outdoor-tagged meshes. Write stencil=1 for all rendered pixels.
3. **Second pass — indoor zone**: Set `scene.fog` to dungeon config, `scene.background` to dark. Render only indoor-tagged meshes. Write stencil=2. Stencil test ensures no overdraw where outdoor already rendered.
4. **Result**: Doorways naturally show the correct zone behind them. No fog bleeds between zones.

### Implementation
11. **`renderer.autoClear = false`** — manual clear control for multi-pass
12. **Material stencil properties**: `stencilWrite`, `stencilRef`, `stencilFunc` on Three.js materials (available since r130+)
13. **Zone tagging at build time**: `buildDungeon()` / entity renderers tag meshes with zone ID based on environment area overlap. Store as `mesh.userData.envZone`.
14. **Render loop**: Before each pass, set `scene.fog` + `scene.background` to the zone's config, filter visible objects by zone tag, render, advance stencil.
15. **Entrance light**: Point light or directional light placed at zone transition cells. Simulates light spilling from outdoor into indoor. Auto-placed based on adjacent cells having different zones.
16. **Fallback**: If a level has only one environment zone, skip multi-pass — render normally (zero overhead for simple levels).

### Complexity & Risk
- Moderate complexity — stencil multi-pass is standard WebGL technique but needs careful setup
- Main risk: mesh zone classification at doorway boundaries. A single mesh spanning two zones needs to be split or assigned to one zone.
- Performance: two render passes instead of one. Acceptable — each pass renders roughly half the geometry.
- If this proves too complex during implementation, Phase A's dynamic blending remains as a working fallback.

---

## Phase B — Layer System + Hollow Areas

THE defining feature. Add multi-layer support to the level data model. Render all layers simultaneously. Hollow areas for vertical openness.

**Depends on:** Phase 0 (LayerState refactor must be complete).

### Data Model

```typescript
interface LayerDef {
  id?: string;                    // e.g., "ground", "upper"
  yOffset?: number;               // explicit Y offset (default: index * LAYER_HEIGHT)
  grid: string[];
  entities: Entity[];
  ceiling?: boolean;              // per-layer ceiling (default: true)
  defaults?: TextureSet;
  charDefs?: CharDef[];
  areas?: TextureArea[];          // includes hollow areas (openBottom/openTop)
}

// Extended area definition (existing TextureArea + new hollow flags)
interface TextureArea {
  // ... existing fields (fromCol, toCol, fromRow, toRow, textures) ...
  openBottom?: boolean;           // NEW — skip floor geometry in this area
  openTop?: boolean;              // NEW — skip ceiling geometry in this area
}

interface DungeonLevel {
  // ... existing fields ...
  layers?: LayerDef[];            // NEW — if present, grid/entities are ignored
  // grid, entities still supported for single-layer backward compat
}
```

### Game
8. **LayerDef type** in `types.ts` — grid, entities, areas per layer
9. **TextureArea extensions**: `openBottom?: boolean`, `openTop?: boolean` flags
10. **DungeonLevel.layers** optional field — array of LayerDef. When present, the level is multi-layer.
11. **Backward compatibility** (temporary): Level without `layers` treats its `grid`/`entities` as a single layer at y=0. Once all levels are converted to the layered format, remove the backward compat codepath — no legacy cruft.
12. **LAYER_HEIGHT constant**: Default vertical spacing between layers (e.g., 4 units — ~2x wall height). Can be overridden per-layer via `yOffset`.
13. **Multi-layer scene building**: `buildLevelScene()` iterates all layers, calls `buildLayerScene()` for each, positions each layer's group at its Y offset. All layers added to one scene.
14. **Hollow rendering**: `buildDungeon()` checks area flags — skip floor plane if `openBottom`, skip ceiling plane if `openTop`. Wall faces adjacent to hollows still render (cliff edges visible).
15. **GameState multi-layer**: `layers: LayerState[]` (from Phase 0). Level loading populates one `LayerState` per `LayerDef`. Each layer parsed independently.
16. **Player layer tracking**: `activeLayerIndex` on GameState. Movement restricted to current layer's grid. Player callbacks (isBlocked, isDoorOpen) close over active layer — `PlayerState` class unchanged.
17. **Camera Y position**: Camera at player's layer Y offset + eye height. All layers visible simultaneously.
18. **Fog adjustment**: Fog distances increased for multi-layer visibility. Accept vertical fogging as M4 limitation.
19. **Per-layer walkable set**: Each layer gets its own `walkable: Set<string>` from its own grid + charDefs.
20. **Level loader**: Validate `layers` array — each layer has valid grid, entities. Validate `openBottom`/`openTop` area flags.

### Editor
21. **Layer list panel**: Displayed alongside the existing level list. Start with a single layer (current behavior). "Add Layer Above" / "Add Layer Below" buttons insert a new empty layer with default grid. Switch active layer for grid/entity editing.
22. **Active layer editing**: Grid painter, entity placement, area editing all operate on the active layer. Layer switching preserves undo stack (tagged by layer index, like existing level switching).
23. **Layer properties**: Y-offset (auto or explicit), ceiling toggle, texture defaults — per-layer in the properties panel. Reuse existing LevelProperties layout.
24. **Hollow area flags**: `openBottom` / `openTop` checkboxes in the area editor (alongside existing texture fields). Grid canvas renders hollow areas with distinct visual (e.g., dashed floor pattern for openBottom, open top indicator for openTop).
25. **Void cell painting**: `' '` char in palette retains clear visual distinction (checkered pattern).
26. **Layer deletion**: Remove a layer (with confirmation). Entities on deleted layer are lost.
27. **3D layer preview** (stretch): Wireframe side-view showing layer stacking.

**Editor UX will be refined iteratively during implementation.** Expected enhancements as we go:
- New layer inherits hollow pattern from adjacent layer (mirrors ceiling holes as floor holes, etc.)
- Grid canvas shows lower layer faintly through hollow areas (see-through ghost grid)
- 3D preview of layer stacking
- Other quality-of-life as discovered during actual editing

**Decision:** Entity IDs remain per-level (dungeon-wide unique), consistent with existing system. Layer index is part of the entity's position context, not its ID.

---

## Phase C — Thin Walls

Edge-based walls between two walkable cells. Enables fences, railings, room dividers, village buildings. Entity-based with canonical edge ownership — one entity per edge, no duplicates.

**Current state:** Walls are full cells (`#`). No concept of a wall on just one edge of a walkable cell.

**Key design decision (ADR-M4-06):** Only `wall: 'S'` and `wall: 'E'` are valid. The entity always lives on the cell to the **north** (for S edges) or **west** (for E edges) of the wall line. This means each grid edge maps to exactly one possible entity — no dedup, no ambiguity.

### Game
28. **ThinWallInstance**: `{ id?, col, row, wall: 'S' | 'E', solid: boolean, height: 'full' | 'half', texture: string, textureBack?: string }`
29. **Thin wall rendering**: `PlaneGeometry` at cell edge, double-sided. Front face (`texture`) faces north/west, back face (`textureBack`, defaults to `texture`) faces south/east. Full-height = floor to ceiling. Half-height = waist-high (fences, railings) — player can see over but not walk through.
30. **Movement blocking**: Player/enemy movement check extended — can't cross an edge with a thin wall. Canonical lookup: moving south from (col, row) checks thin walls at (col, row) for `wall:'S'`. Moving north from (col, row) checks thin walls at (col, row-1) for `wall:'S'`. Same pattern for E/W. Always one entity to check per edge.
31. **Pathfinding**: Enemy AI pathfinding (`pathfinding.ts`) must respect thin walls. BFS neighbor expansion checks canonical thin wall edges before allowing movement to adjacent cell.
32. **Projectile interaction**: `solid: true` blocks projectiles. `solid: false` (half-height fences) — projectiles pass over.
33. **Thin wall textures**: 3-4 built-in options (stone_half, iron_fence, wood_fence, railing). Procedural canvas textures.
34. **Level loader validation**: thin_wall entity with valid wall direction (`'S'` or `'E'` only), walkable cell.

### Editor
35. **Thin wall entity in palette**: New entity type. Clicking near a cell edge auto-resolves to the canonical cell+direction (e.g., clicking the north edge of (5,3) places entity at (5,2) with `wall:'S'`).
36. **Inspector fields**: wall direction dropdown (S/E only), solid checkbox, height dropdown (full/half), texture dropdown, textureBack dropdown (optional)
37. **Grid icon**: Line on cell edge — south edge or east edge of the owning cell
38. **Drag-to-paint for thin walls** (stretch): Paint a line of thin walls along cell edges by dragging. Enables quick building perimeters for city buildings.

---

## Phase D — Decorative Props

Non-interactive 3D meshes for atmosphere. Stalactites, pillars, rubble, statues, torches. Purely visual — no collision, no interaction.

**Current state:** All 3D objects are interactive entities. No purely decorative mesh system.

### Game
38. **PropInstance**: `{ id?, col, row, propId: string, rotation?: number }` — no interaction, no state changes
39. **Prop registry**: Built-in prop definitions with geometry generators. Hardcoded for M4 (JSON registry deferred).
40. **Prop renderer**: `buildPropMeshes(layerState)` — iterate props Map, build geometry per propId
41. **Built-in props** (initial set):
    - `pillar`: stone cylinder, floor to ceiling
    - `rubble`: scattered small boxes on floor
    - `stalactite`: inverted cone hanging from ceiling
    - `stalagmite`: cone rising from floor
    - `statue`: humanoid-ish box figure on pedestal
    - `crate_stack`: 2-3 stacked boxes
    - `banner`: wall-mounted cloth rectangle
42. **Props don't block movement** — purely decoration. Player walks through them.
43. **Save/load**: Props are static — no state changes, no save needed. Rebuilt from level JSON on load.
44. **Level loader**: prop entity validation (propId exists in registry)

### Editor
45. **Prop palette entry**: `'prop'` in entity types
46. **Inspector**: propId dropdown (from prop registry), rotation number
47. **Grid icon**: Small decorative symbol varying by propId (pillar = circle, rubble = dots, stalactite = triangle, etc.)

---

## Phase E — Pit Traps

Floor that opens, dropping the player to a lower layer. Leverages the layer system from Phase B. Signal-driven activation.

**Depends on:** Phase B (layer system — pit drops player to a lower layer, both visible).

### Game
48. **PitTrapInstance**: `{ id?, col, row, state: 'closed' | 'open', gateMode?: 'or' | 'and' | 'xor' }` — signal receiver (like mechanical doors)
49. **Pit trap activation**: Signal-driven only. Wire from lever/plate/trigger/tripwire via `targets`. Classic trap pattern: wire tripwire → pit.
50. **Open pit rendering**: Floor mesh tracked in `pitFloorMap`, toggled via `mesh.visible`. Cell below becomes force-renderable (walls, floor, ceiling generated). Ceiling 2 layers below tracked in `pitCeilingMap`.
51. **Fall mechanic**: Player falls using existing gravity system (`setPendingFall`). If standing on pit when it opens, immediate fall triggered. No damage (deferred to future damage system).
52. **Pit trap reset**: Timed (auto-close after N seconds) or permanent (one-shot). Signal modes reused from existing system.
53. **Visual cue**: Closed pit has subtle floor crack texture to hint at danger. Open pit = void (no floor).

### Editor
54. **Pit trap palette entry**: New entity type
55. **Inspector fields**: state dropdown, targetLayer dropdown, targetCol/targetRow (or pick mode within target layer), signal wiring

---

## Phase F — Enemy Spawners

Entity that periodically creates new enemies. Not vertical-world-specific but adds gameplay depth.

### Game
56. **SpawnerInstance**: `{ id?, col, row, enemyType: string, maxActive: number, interval: number, spawnRadius: number, active: boolean }`
57. **Spawner tick**: In game loop (paused during overlays), check interval timer. If fewer than `maxActive` spawned enemies exist, spawn one at random walkable cell within `spawnRadius` on the same layer.
58. **Spawner activation**: Always active, or signal-driven.
59. **Spawned enemy tracking**: Spawner tracks its spawned enemy IDs. Kill event decrements count.
60. **Spawner rendering**: Subtle floor glyph/rune (decorative marker).
61. **Save/load**: Spawner state (timer, active count) in LevelSnapshot.

### Editor
62. **Spawner palette entry**: New entity type
63. **Inspector fields**: enemyType dropdown, maxActive number, interval number, spawnRadius number

---

## Phase G — Rolling Boulders

Grid-aligned boulders that roll in a direction when triggered. Grid-snapped movement (one cell at a time with tween animation).

### Game
64. **BoulderInstance**: `{ id?, col, row, direction: Facing, state: 'idle' | 'rolling', speed: number }`
65. **Boulder activation**: Signal-driven (lever pulls → starts rolling).
66. **Boulder movement**: Once rolling, moves one cell per `speed` interval in `direction`. Tween animation between cells. Stops on wall, closed door, or another boulder/block.
67. **Boulder damage**: Kills enemies on contact. Damages player significantly (e.g., 50% max HP).
68. **Boulder rendering**: Sphere geometry, stone texture. Rolling rotation animation.
69. **Boulder on pressure plate**: Activates plate (like pushable block).

### Editor
70. **Boulder palette entry**: New entity type
71. **Inspector fields**: direction dropdown, speed number, signal wiring

---

## Phase H — Sub-Grid Positioning + Item Billboard Sprites

Two improvements: props get fractional positioning, and ground items switch from flat floor planes to billboard sprites spread across the cell.

### H1: Prop sub-grid offsets

**Depends on:** Phase D (props).

72. **Offset fields on PropInstance**: `offsetX?: number, offsetZ?: number` (range: -0.4 to 0.4)
73. **Renderer adjustment**: Prop renderer adds offset to world position.
74. **No gameplay impact**: Offsets are purely visual — no collision, no movement changes.
75. **Editor**: Offset fields on prop inspector — two number inputs with slider or drag-to-position within cell.

### H2: Item billboard sprites + quadrant spread

**Current state:** Items on the ground are flat `PlaneGeometry` lying face-up (rotation.x = -Math.PI/2). Multiple items at the same cell overlap in the center. Items are invisible from a distance because they're flat on the floor.

76. **Billboard item sprites**: Replace flat floor planes with upright billboard sprites (face camera every frame, like enemy/NPC sprites). Items become visible from across the room.
77. **Quadrant spread**: When multiple items exist on the same cell, spread them to 4 quadrant positions instead of stacking at center:
    - 1 item: center
    - 2 items: NW quadrant, SE quadrant
    - 3 items: NW, NE, S
    - 4+: NW, NE, SW, SE (cap at 4 visible, rest hidden until pickup)
    - Offset ~0.3 from cell center
78. **Billboard update**: Add items to the billboard update loop (like `updateEnemyBillboards`). Or use `THREE.Sprite` which auto-faces camera.
79. **Mesh rebuild on pickup**: After picking up an item, recalculate quadrant positions for remaining items at that cell (ties into the existing pickup mesh rebuild from Phase F barrel fix).
80. **Applies to both** `itemRenderer.ts` and `consumableRenderer.ts`.

---

## Phase I — Content: "The Cliffside Keep"

Test dungeon showcasing M4 features. A vertical level with 3 layers + indoor/outdoor.

76. **Layer 0 — The Cavern**: Underground. Stalactite/stalagmite props, rubble. Hollow areas where the cliff face opens. Pit trap from Layer 1 drops here.
77. **Layer 1 — The Keep Interior**: Castle rooms. Thin wall dividers (stone half-walls, iron fences). Enemy spawner in barracks. Boulder trap in corridor. Bookshelves, fountain.
78. **Layer 2 — The Battlements**: Outdoor environment, daylight skybox, no ceiling. Hollow areas overlooking Layer 0 cavern far below. Banner props, statue props. Final encounter.
79. Three layers stacked, connected visually through hollows. Player moves between layers via pit traps (down) and stairs-within-level (up — future ramps, for now use existing stair entity repurposed for same-level layer transitions).

---

## Phasing & Priorities

### Must-have (core M4 identity)
- **Phase 0**: Foundation refactor + benchmark — de-risks everything else
- **Phase A**: Outdoor environment + environment areas — immediate visual impact
- **Phase B**: Layer system + hollow areas — THE defining feature
- **Phase C**: Thin walls — transforms level design, essential for castle/village aesthetics

### Should-have (strong value, reasonable scope)
- **Phase A2**: Multi-pass environment rendering — visually correct zone transitions (falls back to A's blending if too complex)
- **Phase D**: Decorative props — visual richness, makes the world feel real
- **Phase E**: Pit traps — leverages layers, classic dungeon crawler mechanic

### Nice-to-have (can defer to later milestone)
- **Phase F**: Enemy spawners — gameplay, not vertical-world-specific
- **Phase G**: Rolling boulders — fun but complex for marginal vertical-world value
- **Phase H**: Sub-grid positioning — polish, not essential

### Recommended implementation order
1. **0 (foundation)** — refactor + benchmark, de-risk before committing
2. A (outdoor + env areas) — quick win, dynamic blending as baseline
3. A2 (multi-pass rendering) — upgrade A's blending to stencil-based. Evaluate after A — if blending looks good enough, defer.
4. B (layers + hollows) — hard core work, do early while fresh
5. C (thin walls) — standalone, high design value
6. D (decorative props) — visual richness
7. E (pit traps) — depends on B, completes the vertical gameplay loop
8. F-H — evaluate after A-E based on energy/interest

---

## Existing Patterns to Reuse

| Pattern | File | Reuse for |
|---|---|---|
| Environment presets | `src/rendering/environment.ts` | Outdoor environment |
| Procedural skybox | `src/rendering/skybox.ts` | Daylight/sunset skybox |
| Entity type system | `src/core/types.ts`, `gameState.ts` | thin_wall, prop, pit_trap, spawner, boulder |
| Wall-mounted entities | `signRenderer.ts`, `bookshelfRenderer.ts` | Thin wall rendering (edge plane) |
| Breakable entity pattern | `combat.ts`, `barrelRenderer.ts` | Boulder damage |
| Signal-driven entities | `signalManager.ts` | Pit trap, boulder, spawner activation |
| Block push animation | `blockRenderer.ts` | Boulder rolling animation |
| Editor entity system | `Toolbar.ts`, `Inspector.ts`, `GridCanvas.ts`, `EditorApp.ts` | All new entity types |
| Level transitions | `main.ts` stair handling | Pit trap fall (within-level layer drop) |
| charDef system | `dungeon.ts`, `types.ts` | Hollow area rendering behavior |
| Dungeon level list (editor) | `EditorApp.ts`, `editor/main.ts` | Layer list panel |

---

## Verification

1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass
3. **Phase 0**: Benchmark — 5-layer 30×30 scene renders at 60fps. Fog/lighting visually acceptable through 3-layer hollow.
4. Manual: Outdoor layer — bright ambient, blue sky, distant fog, no ceiling
5. Manual: Multi-layer level — stand on cliff edge, see all layers below through hollows
6. Manual: Thin wall blocks movement but allows looking through/over
7. Manual: Half-height fence — can see over, can't walk through
8. Manual: Decorative props visible (pillar, rubble, stalactite)
9. Manual: Pit trap opens — player falls to lower layer with damage
10. Manual: Enemy spawner produces enemies on timer
11. Manual: Boulder rolls through corridor, kills enemy
12. Manual: Editor — layer list, add/remove layers, switch between layers for editing
13. Manual: Editor — place all new entity types, configure in inspector
14. Manual: Play through "The Cliffside Keep" — vertical layer traversal works
