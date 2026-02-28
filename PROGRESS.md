# DelveWard — PROGRESS.md

## How to use this file

Read this at the start of every Claude Code session to restore context. Update it at the end of each session. This is the project's session-to-session memory. See PLAN.md for full phase details and design decisions.

---

## Current Phase

**Phase 1 — Foundation Refactor** (not started)

Scaffold exists and works. Next: refactor architecture before adding features.

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

---

## Next Steps (Phase 1)

1. Extract `PlayerState` + grid logic (isWalkable, facing tables) into pure TS module — no Three.js dependency
2. Define `DungeonLevel` type and `GameState` type
3. Load dungeon from external JSON file (replace hardcoded `MAP` in main.ts)
4. `buildDungeon` returns `THREE.Group` instead of adding to scene directly
5. Add Vitest, write ~15 tests for grid logic

---

## Phase Overview

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation Refactor | **Next** |
| 2 | Visual Polish (textures) | Pending |
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

None.

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
