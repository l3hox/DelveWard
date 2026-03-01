# DelveWard — Decision & Change Log

Each entry records what was decided or changed — design decisions, architecture changes, and significant code changes. Marked by date. Newest entries first.

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
