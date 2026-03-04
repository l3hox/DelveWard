# DelveWard — PROGRESS.md

## How to use this file

Read this at the start of every Claude Code session to restore context. Update it at the end of each session. This is the project's session-to-session memory. See PLAN.md for full phase details and design decisions.

---

## Current Phase

**Phase 5 — Multi-Level Dungeons** (not started)

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

- [x] **Phase 2 complete** — Visual Polish:
  - Procedural pixelart textures (9 styles: 4 wall, 3 floor, 2 ceiling)
  - Q/E key bindings for turning
  - 4-layer texture resolution: hard-coded → defaults → charDefs → areas
  - `CharDef` system — custom ASCII chars with solid/walkable + texture set
  - 6 dungeon levels (levels 4–6 use charDefs for visual theming)
  - `DUNGEON-DESIGNER.md` — full level JSON schema reference
  - 76 tests
  - Visual polish verified in-game

---

- [x] **Phase 3 complete** — Doors & Interaction:
  - `GameState` class — door state (open/closed/locked), key inventory, lever/plate logic
  - Door-aware walkability — `isDoorOpen` callback in `isWalkable()` and `PlayerState`
  - Interaction system — `interact()` via Space key: open/close/unlock doors, pull levers
  - Door visuals — 3D stone frames (pillars + lintel) with door panels, sliding animation on open/close
  - Mechanical doors (lever/plate-controlled) — can't be opened/closed by player interaction
  - Interactive doors have brass buttons on frame to visually distinguish them
  - `D` cells without door entity auto-create a closed, non-mechanical door
  - Key system — auto-pickup on step, `keyRenderer.ts` billboard meshes
  - Lever system — repeatable up/down state, stand on cell + face wall to pull, animated handle
  - Pressure plates — one-time use, visual pressed state (sinks + darkens), auto-trigger on step
  - Entity validation in `levelLoader.ts` — doors, keys, levers (incl. wall), pressure plates
  - Level 7 "The Locked Vault" — showcase level for all Phase 3 features
  - 167 tests (91 new)

---

- [x] **Phase 4 complete** — HUD:
  - 2D canvas overlay (640x360 internal, `image-rendering: pixelated`) on top of Three.js viewport
  - Compass rose (top-left) — N/E/S/W letters, active direction highlighted gold
  - Minimap (top-right) — explored-cell top-down grid, player dot + facing line, centered on player
  - Health bar (bottom-left) — heart icon, HP fill bar, low-HP pulse effect
  - Torch indicator (bottom-center-left) — flame icon, fuel fill bar, low-fuel flicker effect
  - Inventory panel (bottom-right) — key count with icon, 3 equipment slots (W/A/R), 8 backpack slots
  - `GameState` gains `hp`/`maxHp`, `torchFuel`/`maxTorchFuel`, `exploredCells`, `revealAround()`
  - `Player` gains `setOnTurn()` callback for exploration on facing change
  - Exploration: current cell + 4 adjacent + line-of-sight forward until wall
  - New `src/hud/` folder with 9 files
  - Removed controls hint div (HUD replaces it)
  - 187 tests (20 new)

## Next Steps (Phase 5)

See PLAN.md Phase 5 for full details.

---

## Phase Overview

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation Refactor | **Complete** |
| 2 | Visual Polish (textures) | **Complete** |
| 3 | Doors & Interaction | **Complete** |
| 4 | HUD | **Complete** |
| 5 | Multi-Level Dungeons | Pending |
| 6 | Entities & Enemy System | Pending |
| 7 | Combat | Pending |
| 8 | Later Resources & Polish | Pending |

---

## Open Questions

- ~~Minimap — render in 3D scene or as 2D canvas overlay?~~ → Resolved: 2D canvas overlay
- Combat interaction model — deferred to Phase 7
- Death/respawn behavior — deferred to Phase 7

---

## Known Issues

(none)

---

## Session Log

### Session 11 — Phase 4 Complete: HUD overlay
- Created `src/hud/` folder with 9 files: canvas setup, layout, colors, pixel font, compass, minimap, health bar, torch indicator, inventory panel
- 2D canvas overlay (640x360) with `image-rendering: pixelated` for crisp pixel-art scaling
- `GameState` gains `hp`, `maxHp`, `torchFuel`, `maxTorchFuel`, `exploredCells`, `revealAround()`
- `revealAround()` marks current + 4 adjacent + line-of-sight forward as explored
- `Player` gains `setOnTurn()` callback (same pattern as `setOnMove()`)
- Wired exploration into initial position, onMove, and onTurn callbacks
- Removed old controls hint div
- Updated ARCHITECTURE.md with HUD module docs
- 187 tests (20 new), TypeScript compiles clean
- Phase 4 complete

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

### Session 7 — Phase 2: charDefs texture system + designer guide
- Replaced verbose cellOverrides with 4-layer texture resolution: hard-coded → defaults → charDefs → areas
- Added `CharDef` interface (extends TextureSet with char + solid) to types.ts
- `buildWalkableSet()` in grid.ts merges walkable charDef chars into WALKABLE_CELLS
- `isWalkable()` and `PlayerState` accept optional walkable set for custom chars
- `buildDungeon()` resolves charDef textures (layer 3) and solid charDef wall textures for neighbor faces
- Level loader validates charDefs before grid chars, extends known/walkable sets
- Rewrote levels 4–6 JSON: replaced areas with charDefs, grids now use b/,/m/w characters
- Created `DUNGEON-DESIGNER.md` — full level JSON schema reference
- 76 tests pass (28 new), TypeScript compiles clean

### Session 6 — Phase 2: Texture variety + new dungeons
- Added 6 new procedural texture generators: brick/mossy/wood walls, dirt/cobblestone floors, wooden beams ceiling
- Built texture registry with cached getters (`getWallTexture`, `getFloorTexture`, `getCeilingTexture`)
- Created `src/textureNames.ts` — pure constants file with type-safe texture name validation
- Wired `CellOverride` into `buildDungeon` — per-cell material selection via override lookup map
- Added `ceilingTexture` field to `CellOverride` type
- Level loader validates cellOverrides (bounds, known texture names, types) — 10 new tests
- Created 3 new themed levels: level4 (Sunken Crypt), level5 (Winding Depths), level6 (Grand Hall)
- Identified need to refactor cellOverrides model — current per-cell approach is too verbose for larger maps

### Session 10 — Door system improvements + lever/plate polish
- 3D door frames — stone pillars + lintel (always visible), door panel slides up/down via `DoorAnimator`
- `D` cells without entity auto-create closed doors (no more empty doorways)
- Doors re-closable with Space (non-mechanical only)
- Mechanical flag — doors targeted by levers/plates can't be opened/closed by player
- Interactive doors have brass buttons on frame to distinguish from mechanical
- Lever: repeatable up/down state with animated handle (`LeverAnimator`), directional wall interaction
- Pressure plate: one-time use, pressed state sinks mesh + darker cracked texture
- Door animation speed increased (3.0 → 5.0 units/sec)
- `openDoor()` rejects mechanical doors; `activatePressurePlate` bypasses check
- Entity validation for lever `wall` field
- 167 tests (20 new), TypeScript compiles clean

### Session 9 — Phase 3 Complete: Test level + entity validation (Step 7)
- Created `public/levels/level7.json` "The Locked Vault" — showcase level with all Phase 3 features
- Added entity validation to `levelLoader.ts` — validates doors, keys, levers, pressure plates
- 15 new entity validation tests in `levelLoader.test.ts`
- Updated `main.ts` to load level7 by default
- 147 tests total, TypeScript compiles clean
- Phase 3 complete

### Session 8 — Phase 3: Doors & Interaction (Steps 1–6)
- Created `gameState.ts` — doors (open/closed/locked), keys, levers, pressure plates, inventory
- Added `isDoorOpen` callback to `isWalkable()` and `PlayerState` for door-aware movement
- Created `interaction.ts` — Space key opens doors, unlocks with keys, pulls levers
- Created `doorRenderer.ts` — door meshes with auto-orientation, visibility toggle
- Added procedural door textures (wood + locked iron-banded) to `textures.ts`
- Created `keyRenderer.ts` — gold key billboard meshes, auto-pickup on step
- Levers toggle linked doors, pressure plates one-way open linked doors
- `Player` gained `getState()`, `setOnMove()` callback for step-triggered events
- 132 tests (56 new across gameState, interaction, grid)

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
