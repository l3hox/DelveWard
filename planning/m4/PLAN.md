# Milestone 4: The Vertical World — Implementation Plan

**Target version:** v0.4
**Status:** Draft — phases and scope under review
**See:** [ADR.md](ADR.md) for architecture decisions (created as decisions are made).

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| A | Outdoor Environment | — | Pending |
| B | Multi-Level Rendering + Void Cells | — | Pending |
| B Editor | Editor: Multi-level preview + void cells | B | Pending |
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
| H | Sub-Grid Entity Positioning | — | Pending |
| H Editor | Editor: Sub-grid placement | H | Pending |
| I | Content — "The Cliffside Keep" | All above | Pending |

---

## Phase A — Outdoor Environment

The simplest visual upgrade. Extend the environment system with an outdoor preset and richer skybox options. No architectural changes — purely additive.

**Current state:** 3 environments (dungeon/mist/forest), 1 skybox (starry-night), ceiling toggle, fog per environment.

### Game
1. New `'outdoor'` environment preset in `environment.ts`: bright ambient (0x8899aa), distant fog (near: 20, far: 80), sky-blue background, sunlight-style ambient
2. New skybox variants: `'daylight'` (blue gradient with clouds), `'sunset'` (warm orange-pink gradient) — procedural canvas textures like the existing starry-night
3. Far plane extension: 100 → 200 for outdoor levels (skybox radius scales to match)
4. Optional directional light for outdoor levels (sun shadow — simple, low-res shadow map for atmosphere)
5. Level JSON: `environment: 'outdoor'` supported, `skybox: 'daylight' | 'sunset' | 'starry-night'`

### Editor
6. Environment dropdown: add `'outdoor'` option
7. Skybox dropdown: add `'daylight'`, `'sunset'` options

**Decision needed:** Do we want a day/night toggle, or is it purely per-level (`skybox` field determines time of day)? Recommendation: per-level for M4, dynamic day/night deferred to M8+.

---

## Phase B — Multi-Level Rendering + Void Cells

The core architectural change. Currently only one level exists in the Three.js scene at a time. This phase renders multiple levels simultaneously, stacked vertically, visible through void cells and open edges.

**Current state:** Single-level-at-a-time. `buildLevelScene()` creates one level, `teardownLevelScene()` destroys it before loading another. Levels in `Dungeon.levels[]` array. Void char `' '` exists but renders nothing.

### Architecture decisions needed

**Q1: Level stacking model — Y-offset vs. scene-per-level?**
- Option A: All levels in one Three.js scene, each level group at a Y offset (e.g., level 0 at y=0, level 1 at y=-6). Simple but potential z-fighting and lighting bleed.
- Option B: Render each level into a separate render target, composite. Clean isolation but complex, no cross-level lighting.
- **Recommendation:** Option A (Y-offset). Simpler, allows cross-level lighting (torch light shining down through a void). Z-fighting manageable with offset tuning.

**Q2: How many levels visible at once?**
- Option A: All levels always rendered (simple, but performance concern for large dungeons).
- Option B: Only render current level + levels visible through void cells (adjacent above/below). Culling based on void connectivity.
- **Recommendation:** Option B — render current level fully, adjacent levels only where void cells exist. Max 3 levels visible (above, current, below).

**Q3: What is a "void cell" mechanically?**
- A cell with no floor and no ceiling — you can see through to the level below/above.
- Player cannot walk on void cells (already true — `' '` is non-walkable).
- Void cells have no walls rendered on their faces.
- The level below renders its ceiling (or not) normally; the void just removes the floor/ceiling barrier between levels.

### Game
8. **Level Y-offset system**: Each `DungeonLevel` gets a `yOffset` (auto-computed or explicit). Default: `LEVEL_HEIGHT` (e.g., 6 units) spacing between levels.
9. **Multi-level scene management**: Refactor `buildLevelScene` to support building multiple level scenes. Active level has full entity simulation; adjacent levels are geometry-only (no AI, no projectiles, no signal ticks).
10. **Void cell rendering**: New charDef-like behavior for `' '` cells — skip floor and ceiling geometry. Adjacent wall faces still render (you see the wall edge when looking down into a void).
11. **Adjacent level loading**: When current level has void cells, build geometry for the level(s) they connect to. Rebuild on level transition.
12. **Cross-level visibility**: Camera far plane and fog adjusted to allow seeing through voids to the level below (2+ level heights of visibility).
13. **Stair transition update**: Instead of full teardown+rebuild, reposition camera to the new level's Y offset. Geometry for both levels may already be loaded.
14. **Performance guardrails**: Only render geometry for visible adjacent levels. Enemies/NPCs on non-active levels are static (no AI tick, no animation).

### Editor
15. **Multi-level 3D preview** (stretch goal): Side-panel showing stacked level wireframes. Not required for M4 — editor already has level list with switching.
16. **Void cell painting**: Ensure `' '` char works correctly in grid painter with clear visual distinction (e.g., transparent/checkered pattern instead of solid black).

**Decision needed:** Should levels define explicit Y-offsets (allowing variable floor heights), or always use uniform stacking? Recommendation: uniform for M4, explicit offsets deferred.

---

## Phase C — Thin Walls

Edge-based walls between two walkable cells. Enables fences, railings, room dividers, village buildings. A significant grid system extension.

**Current state:** Walls are full cells (`#`). A wall occupies an entire grid cell. No concept of a wall on just one edge of a walkable cell.

### Architecture decisions needed

**Q4: Data model for thin walls — charDef property or entity?**
- Option A: Entity-based (`type: 'thin_wall'` with `wall: 'N'` like levers/signs). Placed on walkable cells, blocks movement through that edge.
- Option B: Grid-based — new `edges` field on level JSON describing which cell edges have walls.
- **Recommendation:** Option A (entity-based). Fits existing patterns. A thin_wall entity at (5,3) with `wall: 'N'` means the north edge of cell (5,3) has a thin wall. Movement blocked in that direction. Rendering: single plane geometry at the cell edge.

**Q5: Collision — does a thin wall block movement, projectiles, or both?**
- Recommendation: Blocks movement always. Optionally blocks projectiles (field: `solid: true/false` — fences block movement but arrows fly over).

### Game
17. **ThinWallInstance**: `{ id?, col, row, wall: Facing, solid: boolean, texture?: string }`
18. **Thin wall rendering**: Single `PlaneGeometry` at cell edge, textured (fence, stone half-wall, iron railing, etc.)
19. **Movement blocking**: `isWalkable` check extended — player can't cross an edge with a thin wall. Same for enemies and blocks.
20. **Projectile interaction**: Solid thin walls block projectiles; non-solid (fences) allow projectiles through.
21. **Thin wall textures**: 3-4 built-in options (stone_half, iron_fence, wood_fence, railing)
22. **Level loader validation**: thin_wall entity with valid wall direction, walkable cell

### Editor
23. **Thin wall entity in palette**: New entity type with wall direction auto-detect
24. **Inspector fields**: wall direction dropdown, solid checkbox, texture dropdown
25. **Grid icon**: Line on cell edge (like lever bar, but thinner)

---

## Phase D — Decorative Props

Non-interactive 3D meshes for atmosphere. Stalactites, pillars, rubble, statues, torches (non-functional), crates, barricades. Purely visual — no collision, no interaction.

**Current state:** All 3D objects are interactive entities (fountain, chest, barrel, etc.). No purely decorative mesh system.

### Architecture decisions needed

**Q6: Prop system — entity-based or level-property-based?**
- Option A: Entity-based (`type: 'prop'` with `propId: 'stalactite'`). Placed per-cell in entity list.
- Option B: Level-wide prop layer (like `charDefs` but for decorations — automatic placement rules).
- **Recommendation:** Option A for hand-placed props. Option B could come later for procedural decoration. Start with entity-based.

### Game
26. **PropInstance**: `{ id?, col, row, propId: string, rotation?: number }` — no interaction, no save state changes
27. **Prop registry**: Built-in prop definitions with geometry (like enemy database but for meshes). JSON or hardcoded for M4.
28. **Prop renderer**: `buildPropMeshes(gameState)` — iterate props Map, build geometry per propId
29. **Built-in props** (initial set):
    - `pillar`: stone cylinder, floor to ceiling
    - `rubble`: scattered small boxes on floor
    - `stalactite`: inverted cone hanging from ceiling
    - `statue`: humanoid-ish box figure on pedestal
    - `crate_stack`: 2-3 stacked boxes (decorative, unlike barrel which is breakable)
    - `torch_bracket`: wall-mounted (like sconce but non-interactive, always lit)
30. **Props don't block movement** — they're decoration only. Player walks through them.
31. **Level loader**: prop entity validation (propId exists)

### Editor
32. **Prop palette entry**: `'prop'` in entity types
33. **Inspector**: propId dropdown (from prop registry), optional rotation
34. **Grid icon**: Small decorative symbol varying by propId

---

## Phase E — Pit Traps

Floor that opens, dropping the player to the level below. Requires multi-level rendering (Phase B). Signal-driven activation.

**Depends on:** Phase B (multi-level rendering — pit needs a level below to fall to).

### Game
35. **PitTrapInstance**: `{ id?, col, row, state: 'closed' | 'open', targetLevel: string, targetCol: number, targetRow: number }`
36. **Pit trap activation**: Signal-driven (like doors) or walk-on trigger (like pressure plates). State toggles to `'open'`.
37. **Open pit rendering**: Floor geometry removed/hidden, revealing void to level below. Optionally a dark hole if level below is not loaded.
38. **Fall mechanic**: Player steps on open pit → transition to target level at target position. Fall damage (configurable, e.g., 10 HP). Screen effect (brief black flash + impact).
39. **Pit trap reset**: Can be timed (auto-close after N seconds) or permanent (one-shot).
40. **Level loader**: pit_trap entity validation (walkable cell, targetLevel exists)

### Editor
41. **Pit trap palette entry**: New entity type
42. **Inspector fields**: state, targetLevel dropdown, targetCol/targetRow (or pick mode), signal wiring (targets for signal-driven pits)

---

## Phase F — Enemy Spawners

Entity that periodically creates new enemies. Adds tension and replayability — cleared rooms can become dangerous again.

### Game
43. **SpawnerInstance**: `{ id?, col, row, enemyType: string, maxActive: number, interval: number, spawnRadius: number, active: boolean }`
44. **Spawner tick**: In game loop (paused during overlays), check interval timer. If fewer than `maxActive` enemies of this spawner exist, spawn one at a random walkable cell within `spawnRadius`.
45. **Spawner activation**: Always active, or signal-driven (like other entities).
46. **Spawned enemy tracking**: Each spawner tracks its spawned enemy count. When a spawned enemy is killed, the count decrements.
47. **Spawner rendering**: Subtle floor glyph or rune (decorative marker so the player can see where enemies come from).
48. **Save/load**: Spawner state (timer, active enemy count) persisted in LevelSnapshot.

### Editor
49. **Spawner palette entry**: New entity type
50. **Inspector fields**: enemyType dropdown, maxActive number, interval number, spawnRadius number

---

## Phase G — Rolling Boulders

Grid-aligned boulders that roll in a direction when triggered, crushing enemies and blocking paths. Think Indiana Jones.

### Architecture decisions needed

**Q7: Physics model — grid-snapped rolling or smooth physics?**
- Option A: Grid-snapped — boulder moves one cell per tick in its direction until hitting a wall/entity. Simple, fits existing grid system.
- Option B: Smooth physics with momentum, gravity on slopes. Complex, may feel out of place in a grid crawler.
- **Recommendation:** Option A (grid-snapped). Boulder moves one cell at a time with a tween animation (like block push but automatic and continuous). Stops on wall hit. Damages/kills enemies in its path. Damages player if hit.

### Game
51. **BoulderInstance**: `{ id?, col, row, direction: Facing, state: 'idle' | 'rolling', speed: number }`
52. **Boulder activation**: Signal-driven (lever pulls → boulder starts rolling) or walk-on trigger.
53. **Boulder movement**: Once rolling, moves one cell per `speed` interval in `direction`. Stops on wall, closed door, or another boulder.
54. **Boulder damage**: Kills enemies on contact (one-hit). Damages player significantly (e.g., 50% max HP).
55. **Boulder rendering**: Sphere geometry, stone texture. Rolling animation (rotation on movement axis).
56. **Boulder on pressure plate**: Activates plate (like pushable block).

### Editor
57. **Boulder palette entry**: New entity type
58. **Inspector fields**: direction dropdown, speed number, signal wiring

---

## Phase H — Sub-Grid Entity Positioning

Allow entities to be placed at fractional positions within a cell. Enables more natural-looking prop placement and entity arrangements.

### Architecture decisions needed

**Q8: Scope — all entities or just decorative props?**
- Option A: All entities support sub-grid positioning. Major refactor of movement, pathfinding, collision.
- Option B: Only decorative props and non-interactive entities support sub-grid. Interactive entities (enemies, NPCs, chests) stay grid-aligned for gameplay clarity.
- **Recommendation:** Option B for M4. Gameplay entities stay on-grid (movement is grid-based). Props get `offsetX`/`offsetZ` fields for visual variety.

### Game
59. **Entity offset fields**: `offsetX?: number, offsetZ?: number` on prop entities (range: -0.4 to 0.4, staying within cell bounds).
60. **Renderer adjustment**: Prop renderer adds offset to world position.
61. **No collision/gameplay impact**: Offsets are purely visual.

### Editor
62. **Offset fields on prop inspector**: Two number inputs (or drag-to-position on grid cell).

---

## Phase I — Content: "The Cliffside Keep"

Test dungeon showcasing all M4 features. A vertical dungeon with indoor and outdoor sections.

63. **Level 1 — The Cavern**: Underground start. Stalactite props, rubble, void cells showing level 2 above. Pit trap drops player back here if triggered on level 2.
64. **Level 2 — The Keep Interior**: Castle interior. Thin wall room dividers, bookshelves, fountain. Enemy spawner in the barracks. Boulder trap in a corridor.
65. **Level 3 — The Battlements**: Outdoor level (outdoor environment, daylight skybox). No ceiling. Void cells overlooking the cavern below. Mountain backdrop props. Final encounter.
66. 3 levels stacked vertically with void cell connections between them.
67. Balance pass: spawner rates, boulder damage, pit trap placement.

---

## Phasing & Priorities

The phases above are ordered by dependency, but not all are equally important for the "Vertical World" theme. Here's a priority classification:

### Must-have (core M4 identity)
- **Phase A**: Outdoor environment — immediate visual impact
- **Phase B**: Multi-level rendering + void cells — THE defining feature
- **Phase C**: Thin walls — transforms level design possibilities

### Should-have (strong value, reasonable scope)
- **Phase D**: Decorative props — visual richness
- **Phase E**: Pit traps — leverages multi-level, adds gameplay

### Nice-to-have (can defer to later milestone)
- **Phase F**: Enemy spawners — gameplay feature, not vertical-world-specific
- **Phase G**: Rolling boulders — fun but complex for marginal vertical-world value
- **Phase H**: Sub-grid positioning — polish, not essential

### Recommended implementation order
1. A (outdoor) — quick win, standalone
2. B (multi-level + voids) — hard core work, do early
3. C (thin walls) — standalone, high design value
4. D (decorative props) — depends on nothing, adds visual richness
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
| Level transitions | `main.ts` stair handling | Pit trap fall |
| charDef system | `dungeon.ts`, `types.ts` | Void cell rendering behavior |

---

## Verification

1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass
3. Manual: Outdoor level — bright ambient, blue sky, distant fog, no ceiling
4. Manual: Stand on a void cell edge — see the level below through the gap
5. Manual: Walk between levels via stairs — both levels visible during transition
6. Manual: Thin wall blocks movement but allows looking through
7. Manual: Decorative props visible in scene (pillar, rubble, stalactite)
8. Manual: Pit trap opens — player falls to level below with damage
9. Manual: Enemy spawner produces enemies on timer
10. Manual: Boulder rolls through corridor, kills enemy
11. Manual: Editor — place all new entity types, configure in inspector
12. Manual: Play through "The Cliffside Keep" — vertical traversal works end-to-end
