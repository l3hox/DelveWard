# DelveWard — PROGRESS.md

## How to use this file

Read this at the start of every Claude Code session to restore context. Update it at the end of each session. This is the project's session-to-session memory. See PLAN.md for full phase details and design decisions.

---

## Current Phase

**Phase 2 — Visual Polish** (in progress)

---

## What's Done

- [x] CLAUDE.md created — auto-loads project context each session
- [x] PLAN.md created — full implementation plan with all design decisions resolved
- [x] Project scaffolded — Vite + TypeScript + Three.js
- [x] Dungeon renderer — builds wall/floor/ceiling geometry from a 2D map array
- [x] Two-room map with connecting corridor
- [x] Grid movement — forward, back, strafe left/right, turn left/right
- [x] Smooth tween camera on every step and turn
- [x] Torch point light with flicker, follows player
- [x] Fog for atmosphere
- [x] Tested and working in Windows browser via WSL2 (`npm run dev` → localhost:5173)
- [x] **Phase 1 complete** — Foundation Refactor:
  - Extracted `PlayerState` + grid logic into `src/grid.ts` (pure TS, no Three.js)
  - `DungeonLevel`, `Entity`, `CellOverride` types in `src/types.ts`
  - Grid format: `string[]` with char-based cells, `WALKABLE_CELLS` set
  - External JSON level loading with validation (`src/levelLoader.ts`)
  - 3 level files in `public/levels/`
  - `buildDungeon` returns `THREE.Group` (enables level teardown)
  - `main.ts` async init with error handling
  - Vitest: 38 tests (grid logic + loader validation)

---

## What's In Progress (Phase 2)

- [x] Procedural pixelart textures for walls, floor, ceiling (`src/textures.ts` — Canvas2D, nearest-filter)
- [x] Dungeon materials wired to new textures (replaced flat colors)
- [x] Q/E key bindings for turning (alongside arrow keys)
- [x] Texture variety — 9 texture styles across walls/floors/ceilings with cached registry
- [x] `CellOverride` wired into dungeon builder — per-cell texture selection
- [x] `cellOverrides` validation in level loader + 10 new tests (48 total)
- [x] 3 new themed dungeon levels (level4–6) using cellOverrides for zone theming

## Next Steps (Phase 2)

1. Refactor cellOverrides model — replace verbose per-cell overrides with area-based overlays, level defaults, and special char definitions (current JSON is too verbose/cluttered)
2. Visual polish pass — verify all texture transitions look good in-game

---

## Phase Overview

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation Refactor | **Complete** |
| 2 | Visual Polish (textures) | **In Progress** |
| 3 | Doors & Interaction | Pending |
| 4 | HUD | Pending |
| 5 | Multi-Level Dungeons | Pending |
| 6 | Entities & Enemy System | Pending |
| 7 | Combat | Pending |
| 8 | Later Resources & Polish | Pending |

---

## Open Questions

- Minimap — render in 3D scene or as 2D canvas overlay?
- Combat interaction model — deferred to Phase 7
- Death/respawn behavior — deferred to Phase 7

---

## Known Issues

- cellOverrides JSON model is too verbose — each cell needs its own entry. Planned refactor: area-based overlays, level-wide defaults, and special char → texture mappings.

---

## Session Log

### Session 0 — Project conceived
- Decided on genre, tech stack, and approach via conversation with Claude (claude.ai)
- Core design pillars established — see DESIGN.md
- No code written, ready to start scaffolding

### Session 1 — Scaffold
- Created CLAUDE.md for persistent session context
- Finalised remaining open decisions: TypeScript, Vite + npm, tween camera
- Scaffolded full project: `index.html`, `package.json`, `tsconfig.json`, `src/main.ts`, `src/dungeon.ts`, `src/player.ts`, `.gitignore`
- Two rooms connected by a corridor, grid movement with tween camera, torch flicker, fog
- Tested successfully in browser

### Session 4 — Phase 1 Complete
- Completed all remaining Phase 1 steps (2–5) in one session
- Defined `DungeonLevel` type, switched grid from `number[][]` to `string[]`
- Built `levelLoader.ts` with `loadLevel()` + `validateLevel()` — fetch + validate JSON levels
- Created 3 level files in `public/levels/`
- `buildDungeon` returns `THREE.Group` instead of mutating scene
- Wrapped `main.ts` in async `init()` with error handling
- Added Vitest — 38 tests across grid logic and loader validation
- Ran Developer Council code review (SoftwareDeveloper + QaTester)
- Addressed all council findings: validation hardening, test coverage gaps, minor fixes

### Session 3 — Phase 1 Step 1: Extract PlayerState
- Extracted pure grid logic (`Facing`, direction tables, `isWalkable`, `PlayerState`) into `src/grid.ts`
- Refactored `src/player.ts` to delegate to `PlayerState`, keeping only Three.js rendering
- TypeScript compiles clean, no Three.js dependency in grid.ts

### Session 6 — Phase 2: Texture variety + new dungeons
- Added 6 new procedural texture generators: brick/mossy/wood walls, dirt/cobblestone floors, wooden beams ceiling
- Built texture registry with cached getters (`getWallTexture`, `getFloorTexture`, `getCeilingTexture`)
- Created `src/textureNames.ts` — pure constants file with type-safe texture name validation
- Wired `CellOverride` into `buildDungeon` — per-cell material selection via override lookup map
- Added `ceilingTexture` field to `CellOverride` type
- Level loader validates cellOverrides (bounds, known texture names, types) — 10 new tests
- Created 3 new themed levels: level4 (Sunken Crypt), level5 (Winding Depths), level6 (Grand Hall)
- Identified need to refactor cellOverrides model — current per-cell approach is too verbose for larger maps

### Session 2 — Planning
- Ran Developer Council (4 specialists, 3 rounds) to identify all vague spots and create implementation plan
- Resolved all underspecified design decisions (stats, doors, inventory, enemies, resources, transitions)
- Created PLAN.md with 8-phase build order, architecture plan, and file structure
- Established session workflow rules in CLAUDE.md
- Updated PROGRESS.md to track phases

---

## Ideas Parking Lot

- Procedural dungeon generation (post v1)
- Ambient sound — dripping water, distant echoes
- Secret walls that push open
- Day/night cycle for outdoor sections
