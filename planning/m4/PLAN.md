# Milestone 4: The Vertical World — Implementation Plan

**Target version:** v0.4
**Status:** Draft — phases and scope under review
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
- Hollows (no floor, no ceiling, or both) defined via areas — you see through to layers below/above
- Solid floors/ceilings naturally occlude — no special occlusion logic needed
- Each layer has its own grid, entities, and optionally its own environment/ceiling settings
- Existing level transitions (stairs entity) remain as teleports between levels (different worlds)

**Hollow areas (replacing void cells for vertical openness):**
- Instead of relying solely on the `' '` void char, use the existing **area system** to define hollows within walkable regions: `noFloor: true`, `noCeiling: true`, or both
- A walkable cell with `noFloor` has no floor geometry → you see the layer below
- A walkable cell with `noCeiling` has no ceiling geometry → you see the layer above
- Cliff edges: walkable cells at the edge of a layer with hollows looking down
- The `' '` void char remains for non-walkable empty space (outside the playable area)

**Dormancy system (Minecraft-style chunk simulation):**
- All geometry is always rendered (lightweight)
- Entity simulation (AI, signals, projectiles) uses a **simulation radius** around the player — both horizontal and vertical
- Entities within the radius are fully simulated (AI ticks, movement, combat)
- Entities outside the radius are **dormant** — no AI ticks, no movement, no status effect ticking. They exist in the Maps but are skipped during update loops.
- Dormancy radius configurable (e.g., 8 cells horizontal, ±2 layers vertical)
- Not strictly needed for M4 (expected world sizes are manageable), but the architecture should support it from the start to avoid a painful retrofit later
- Future: horizontal dormancy enables large open-world levels without performance scaling concerns

**Performance model:** Grid geometry is lightweight (~6 planes per cell). A 50×50 layer = ~2500 cells. Even 20 layers = 50,000 cells — well within Three.js capabilities. Dormancy keeps entity simulation costs bounded regardless of world size.

**Future evolution:**
- Ramps/stairs between layers (smooth within-grid transitions, not teleports)
- Possibly collapsing levels into one big layer stack for fully interconnected worlds — levels become just a loading/organization boundary
- True teleport entity type (distinct from stairs — portal to another level/location)
- Horizontal world streaming for very large levels (load/unload geometry chunks)

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| A | Outdoor Environment | — | Pending |
| B | Layer System + Void Cells | — | Pending |
| B Editor | Editor: Layer management + void cells | B | Pending |
| C | Thin Walls | — | Pending |
| C Editor | Editor: Thin wall painting | C | Pending |
| D | Decorative Props | — | Pending |
| D Editor | Editor: Prop palette + placement | D | Pending |
| E | Pit Traps | B | Pending |
| E Editor | Editor: Pit trap entity | E | Pending |
| F | Enemy Spawners | — | Pending |
| F Editor | Editor: Spawner entity | F | Pending |
| G | Rolling Boulders | — | Pending |
| G Editor | Editor: Boulder entity | G | Pending |
| H | Sub-Grid Entity Positioning | D | Pending |
| H Editor | Editor: Sub-grid placement | H | Pending |
| I | Content — "The Cliffside Keep" | A, B, C, D, E | Pending |

---

## Phase A — Outdoor Environment

Simplest visual upgrade. Extend the environment system with an outdoor preset and richer skybox options. No architectural changes — purely additive.

**Current state:** 3 environments (dungeon/mist/forest), 1 skybox (starry-night), ceiling toggle, fog per environment. Far plane 100, skybox radius 90.

### Game
1. New `'outdoor'` environment preset in `environment.ts`: bright ambient (0x8899aa), distant fog (near: 20, far: 80), sky-blue background
2. New skybox variants: `'daylight'` (blue gradient with clouds), `'sunset'` (warm orange-pink gradient) — procedural canvas textures like existing starry-night
3. Far plane extension: 100 → 200 (needed for layer visibility too). Skybox radius scales to match.
4. Optional directional light for outdoor environments (sun — simple warm directional, no shadow map for M4)
5. Level JSON: `environment: 'outdoor'` supported, `skybox: 'daylight' | 'sunset' | 'starry-night'`

### Editor
6. Environment dropdown: add `'outdoor'` option
7. Skybox dropdown: add `'daylight'`, `'sunset'` options

**Decision:** Per-level environment/skybox for M4. Dynamic day/night deferred to M8+.

---

## Phase B — Layer System + Void Cells

THE defining feature. Refactor the level data model from single-grid to multi-layer. Render all layers simultaneously in one Three.js scene. Hollows (missing floor/ceiling) via areas.

**Current state:** A `DungeonLevel` has one grid + one entity list. `buildLevelScene()` creates one level's geometry. Levels switch via teardown+rebuild. Void char `' '` exists but renders nothing. Areas already support per-region texture overrides.

### Data Model Change

The `DungeonLevel` type gains a `layers` array. Each layer is what a level currently is — a grid + entities + areas. For backward compatibility, a level with no `layers` field treats its existing `grid`/`entities` as layer 0.

```typescript
interface LayerDef {
  id?: string;                    // e.g., "ground", "upper"
  yOffset?: number;               // explicit Y offset (default: index * LAYER_HEIGHT)
  grid: string[];
  entities: Entity[];
  environment?: Environment;      // per-layer override (optional)
  ceiling?: boolean;              // per-layer ceiling (default: true)
  defaults?: TextureSet;
  charDefs?: CharDef[];
  areas?: TextureArea[];          // includes hollow areas (noFloor/noCeiling)
}

// Extended area definition (existing TextureArea + new hollow flags)
interface TextureArea {
  // ... existing fields (fromCol, toCol, fromRow, toRow, textures) ...
  noFloor?: boolean;              // NEW — skip floor geometry in this area
  noCeiling?: boolean;            // NEW — skip ceiling geometry in this area
}

interface DungeonLevel {
  // ... existing fields ...
  layers?: LayerDef[];            // NEW — if present, grid/entities are ignored
  // grid, entities still supported for single-layer backward compat
}
```

### Hollow Areas

Vertical openness between layers is defined via the area system (already used for per-region textures):
- `noFloor: true` on an area → walkable cells in that region have no floor geometry → you see the layer below
- `noCeiling: true` → no ceiling geometry → you see the layer above
- Both → full vertical opening (bridges, cliff edges, open atriums)
- The `' '` void char remains for non-walkable empty space outside the playable area
- Cliff edge = walkable cells with `noFloor` area, adjacent to normal cells with floor. Player walks to the edge and looks down.
- This reuses existing area infrastructure (fromCol/toCol/fromRow/toRow rectangles) — no new data structure needed

### Game
8. **LayerDef type** in `types.ts` — grid, entities, areas, environment overrides per layer
9. **TextureArea extensions**: `noFloor?: boolean`, `noCeiling?: boolean` flags
10. **DungeonLevel.layers** optional field — array of LayerDef. When present, the level is multi-layer.
11. **Backward compatibility**: Level without `layers` treats its `grid`/`entities` as a single layer at y=0. Zero migration needed for existing dungeons.
12. **LAYER_HEIGHT constant**: Default vertical spacing between layers (e.g., 4 units — ~2x wall height). Can be overridden per-layer via `yOffset`.
13. **Multi-layer scene building**: `buildLevelScene()` iterates all layers, builds dungeon geometry + entity meshes for each, positions each layer's group at its Y offset. All layers added to one scene.
14. **Hollow rendering**: `buildDungeon()` checks area flags — skip floor plane if `noFloor`, skip ceiling plane if `noCeiling`. Wall faces adjacent to hollows still render (cliff edges visible).
15. **GameState multi-layer**: Entity Maps include layer index in key (e.g., `"layer:col,row"` or separate Maps per layer). Entity lookups scoped to current layer for gameplay (movement, combat). Dormancy applied per simulation radius.
16. **Player layer tracking**: GameState tracks which layer the player is on. Movement restricted to current layer's grid. Future: ramps allow layer transitions.
17. **Camera Y position**: Camera sits at the player's layer Y offset + eye height. All layers visible in the 3D scene simultaneously.
18. **Fog adjustment**: Fog distances increased for multi-layer visibility. Possibly horizontal-only fog (no vertical fade).
19. **Dormancy architecture**: Entity update loops check simulation radius (horizontal distance + layer distance from player). Entities outside radius are skipped (no AI, no movement, no status ticks). Geometry always rendered. Radius configurable (e.g., 8 cells horizontal, ±2 layers vertical). Simple distance check — no chunk system needed for M4.
20. **Level loader**: Validate `layers` array — each layer has valid grid, entities. Validate `noFloor`/`noCeiling` area flags.

### Editor
21. **Layer list panel**: Displayed alongside the existing level list. Start with a single layer (current behavior). "Add Layer Above" / "Add Layer Below" buttons insert a new empty layer with default grid. Switch active layer for grid/entity editing.
22. **Active layer editing**: Grid painter, entity placement, area editing all operate on the active layer. Layer switching preserves undo stack (tagged by layer index, like existing level switching).
23. **Layer properties**: Y-offset (auto or explicit), environment override, ceiling toggle, texture defaults — per-layer in the properties panel. Reuse existing LevelProperties layout.
24. **Hollow area flags**: `noFloor` / `noCeiling` checkboxes in the area editor (alongside existing texture fields). Grid canvas renders hollow areas with distinct visual (e.g., dashed floor pattern for noFloor, open top indicator for noCeiling).
25. **Void cell painting**: `' '` char in palette retains clear visual distinction (checkered pattern).
26. **Layer deletion**: Remove a layer (with confirmation). Entities on deleted layer are lost.
27. **3D layer preview** (stretch): Wireframe side-view showing layer stacking. Not required for M4.

**Decision:** Entity IDs remain per-level (dungeon-wide unique), consistent with existing system. Layer index is part of the entity's position context, not its ID.

---

## Phase C — Thin Walls

Edge-based walls between two walkable cells. Enables fences, railings, room dividers, village buildings. Entity-based — fits existing patterns.

**Current state:** Walls are full cells (`#`). No concept of a wall on just one edge of a walkable cell.

### Game
24. **ThinWallInstance**: `{ id?, col, row, layer?: number, wall: Facing, solid: boolean, texture?: string, height?: 'full' | 'half' }`
25. **Thin wall rendering**: `PlaneGeometry` at cell edge. Full-height = floor to ceiling. Half-height = waist-high (fences, railings) — player can see over but not walk through.
26. **Movement blocking**: Player/enemy movement check extended — can't cross an edge with a thin wall on either side. `isWalkable` path extended with thin wall lookup.
27. **Projectile interaction**: `solid: true` blocks projectiles. `solid: false` (half-height fences) — projectiles pass over.
28. **Thin wall textures**: 3-4 built-in options (stone_half, iron_fence, wood_fence, railing). Procedural canvas textures.
29. **Level loader validation**: thin_wall entity with valid wall direction, walkable cell.
30. **Reciprocal check**: A thin wall at (5,3) wall='N' also blocks movement from (5,2) going south. The check must work from both sides.

### Editor
31. **Thin wall entity in palette**: New entity type with wall direction auto-detect (from adjacent walls)
32. **Inspector fields**: wall direction dropdown, solid checkbox, height dropdown (full/half), texture dropdown
33. **Grid icon**: Line on cell edge — position varies by wall direction, like bookshelf icon

---

## Phase D — Decorative Props

Non-interactive 3D meshes for atmosphere. Stalactites, pillars, rubble, statues, torches. Purely visual — no collision, no interaction.

**Current state:** All 3D objects are interactive entities. No purely decorative mesh system.

### Game
34. **PropInstance**: `{ id?, col, row, layer?: number, propId: string, rotation?: number }` — no interaction, no state changes
35. **Prop registry**: Built-in prop definitions with geometry generators. Hardcoded for M4 (JSON registry deferred).
36. **Prop renderer**: `buildPropMeshes(gameState)` — iterate props Map, build geometry per propId
37. **Built-in props** (initial set):
    - `pillar`: stone cylinder, floor to ceiling
    - `rubble`: scattered small boxes on floor
    - `stalactite`: inverted cone hanging from ceiling
    - `stalagmite`: cone rising from floor
    - `statue`: humanoid-ish box figure on pedestal
    - `crate_stack`: 2-3 stacked boxes
    - `torch_bracket`: wall-mounted, always lit (non-interactive, unlike sconce)
    - `banner`: wall-mounted cloth rectangle
38. **Props don't block movement** — purely decoration. Player walks through them.
39. **Save/load**: Props are static — no state changes, no save needed. Rebuilt from level JSON on load.
40. **Level loader**: prop entity validation (propId exists in registry)

### Editor
41. **Prop palette entry**: `'prop'` in entity types
42. **Inspector**: propId dropdown (from prop registry), rotation number
43. **Grid icon**: Small decorative symbol varying by propId (pillar = circle, rubble = dots, stalactite = triangle, etc.)

---

## Phase E — Pit Traps

Floor that opens, dropping the player to a lower layer. Leverages the layer system from Phase B. Signal-driven activation.

**Depends on:** Phase B (layer system — pit drops player to a lower layer, both visible).

### Game
44. **PitTrapInstance**: `{ id?, col, row, layer?: number, state: 'closed' | 'open', targetLayer: number, targetCol: number, targetRow: number }`
45. **Pit trap activation**: Signal-driven (like doors) or walk-on trigger (one-shot or timed reset).
46. **Open pit rendering**: Floor geometry removed/hidden at that cell, revealing the layer below (natural void through layer stack).
47. **Fall mechanic**: Player steps on open pit → camera drops to target layer Y offset. Fall damage (configurable, e.g., 10 HP). Brief screen effect. Player position updated to target layer/cell.
48. **Pit trap reset**: Timed (auto-close after N seconds) or permanent (one-shot). Signal modes reused from existing system.
49. **Visual cue**: Closed pit has subtle floor crack texture to hint at danger. Open pit = void cell (no floor).

### Editor
50. **Pit trap palette entry**: New entity type
51. **Inspector fields**: state dropdown, targetLayer dropdown, targetCol/targetRow (or pick mode within target layer), signal wiring

---

## Phase F — Enemy Spawners

Entity that periodically creates new enemies. Not vertical-world-specific but adds gameplay depth.

### Game
52. **SpawnerInstance**: `{ id?, col, row, layer?: number, enemyType: string, maxActive: number, interval: number, spawnRadius: number, active: boolean }`
53. **Spawner tick**: In game loop (paused during overlays), check interval timer. If fewer than `maxActive` spawned enemies exist, spawn one at random walkable cell within `spawnRadius` on the same layer.
54. **Spawner activation**: Always active, or signal-driven.
55. **Spawned enemy tracking**: Spawner tracks its spawned enemy IDs. Kill event decrements count.
56. **Spawner rendering**: Subtle floor glyph/rune (decorative marker).
57. **Save/load**: Spawner state (timer, active count) in LevelSnapshot.

### Editor
58. **Spawner palette entry**: New entity type
59. **Inspector fields**: enemyType dropdown, maxActive number, interval number, spawnRadius number

---

## Phase G — Rolling Boulders

Grid-aligned boulders that roll in a direction when triggered. Grid-snapped movement (one cell at a time with tween animation).

### Game
60. **BoulderInstance**: `{ id?, col, row, layer?: number, direction: Facing, state: 'idle' | 'rolling', speed: number }`
61. **Boulder activation**: Signal-driven (lever pulls → starts rolling).
62. **Boulder movement**: Once rolling, moves one cell per `speed` interval in `direction`. Tween animation between cells. Stops on wall, closed door, or another boulder/block.
63. **Boulder damage**: Kills enemies on contact. Damages player significantly (e.g., 50% max HP).
64. **Boulder rendering**: Sphere geometry, stone texture. Rolling rotation animation.
65. **Boulder on pressure plate**: Activates plate (like pushable block).

### Editor
66. **Boulder palette entry**: New entity type
67. **Inspector fields**: direction dropdown, speed number, signal wiring

---

## Phase H — Sub-Grid Entity Positioning

Fractional positioning for decorative props. Gameplay entities stay grid-aligned.

**Depends on:** Phase D (props — the main consumer of sub-grid positioning).

### Game
68. **Offset fields on PropInstance**: `offsetX?: number, offsetZ?: number` (range: -0.4 to 0.4)
69. **Renderer adjustment**: Prop renderer adds offset to world position.
70. **No gameplay impact**: Offsets are purely visual — no collision, no movement changes.

### Editor
71. **Offset fields on prop inspector**: Two number inputs with slider or drag-to-position within cell.

---

## Phase I — Content: "The Cliffside Keep"

Test dungeon showcasing M4 features. A vertical level with 3 layers + indoor/outdoor.

72. **Layer 0 — The Cavern**: Underground. Stalactite/stalagmite props, rubble. Void cells where the cliff face opens. Pit trap from Layer 1 drops here.
73. **Layer 1 — The Keep Interior**: Castle rooms. Thin wall dividers (stone half-walls, iron fences). Enemy spawner in barracks. Boulder trap in corridor. Bookshelves, fountain.
74. **Layer 2 — The Battlements**: Outdoor environment, daylight skybox, no ceiling. Void cells overlooking Layer 0 cavern far below. Banner props, statue props. Final encounter.
75. Three layers stacked, connected visually through void cells. Player moves between layers via pit traps (down) and stairs-within-level (up — future ramps, for now use existing stair entity repurposed for same-level layer transitions).

---

## Phasing & Priorities

### Must-have (core M4 identity)
- **Phase A**: Outdoor environment — immediate visual impact, needed for battlements
- **Phase B**: Layer system + void cells — THE defining feature, the whole point of M4
- **Phase C**: Thin walls — transforms level design, essential for castle/village aesthetics

### Should-have (strong value, reasonable scope)
- **Phase D**: Decorative props — visual richness, makes the world feel real
- **Phase E**: Pit traps — leverages layers, classic dungeon crawler mechanic

### Nice-to-have (can defer to later milestone)
- **Phase F**: Enemy spawners — gameplay, not vertical-world-specific
- **Phase G**: Rolling boulders — fun but complex for marginal vertical-world value
- **Phase H**: Sub-grid positioning — polish, not essential

### Recommended implementation order
1. A (outdoor) — quick win, standalone
2. B (layers + voids) — hard core work, do early while fresh
3. C (thin walls) — standalone, high design value
4. D (decorative props) — visual richness
5. E (pit traps) — depends on B, completes the vertical gameplay loop
6. F-H — evaluate after A-E based on energy/interest

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
| charDef system | `dungeon.ts`, `types.ts` | Void cell rendering behavior |
| Dungeon level list (editor) | `EditorApp.ts`, `editor/main.ts` | Layer list panel |

---

## Verification

1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass
3. Manual: Outdoor layer — bright ambient, blue sky, distant fog, no ceiling
4. Manual: Multi-layer level — stand on cliff edge, see all layers below through void cells
5. Manual: Lighting from torch visible on layer below through void
6. Manual: Thin wall blocks movement but allows looking through/over
7. Manual: Half-height fence — can see over, can't walk through
8. Manual: Decorative props visible (pillar, rubble, stalactite)
9. Manual: Pit trap opens — player falls to lower layer with damage
10. Manual: Enemy spawner produces enemies on timer
11. Manual: Boulder rolls through corridor, kills enemy
12. Manual: Editor — layer list, add/remove layers, switch between layers for editing
13. Manual: Editor — place all new entity types, configure in inspector
14. Manual: Play through "The Cliffside Keep" — vertical layer traversal works
