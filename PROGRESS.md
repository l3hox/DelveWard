# DelveWard — PROGRESS.md

## How to use this file

Read this at the start of every Claude Code session to restore context. Update it at the end of each session — ask Claude Code to do it for you. This is the project's memory.

---

## Current Status

**Phase: Active development** — Scaffold complete and tested. Basic dungeon navigation working in browser.

---

## Decisions Made

- **Renderer**: Three.js in browser (not Phaser, not Godot)
- **Perspective**: True 3D with grid movement — Grimrock-style, not sprite-based like Eye of the Beholder
- **Aesthetic**: Pixelart textures on 3D geometry
- **Enemies**: Billboard sprites for now (camera-facing 2D sprites, not 3D models)
- **Dungeon format**: Grid-based 2D array (hardcoded for now, JSON loading later)
- **Platform**: Browser (desktop first), shareable via link
- **Art generation**: Midjourney or Leonardo for textures, TBD for enemies
- **Language**: TypeScript
- **Build**: Vite + npm
- **Camera movement**: Short tween animation on steps and turns (not instant snap)

---

## What's Done

- [x] CLAUDE.md created — auto-loads project context each session
- [x] Project scaffolded — Vite + TypeScript + Three.js
- [x] Dungeon renderer — builds wall/floor/ceiling geometry from a 2D map array
- [x] Two-room map with connecting corridor
- [x] Grid movement — forward, back, strafe left/right, turn left/right
- [x] Smooth tween camera on every step and turn
- [x] Torch point light with flicker, follows player
- [x] Fog for atmosphere
- [x] Tested and working in Windows browser via WSL2 (`npm run dev` → localhost:5173)

---

## Immediate Next Steps

1. Load dungeon map from an external JSON file (instead of hardcoded in main.ts)
2. Apply first real pixelart textures to walls, floor, ceiling
3. Expand map — more rooms, dead ends, variety
4. Basic HUD — crosshair, health placeholder, minimap

---

## Open Questions

- Minimap — render in 3D scene or as 2D canvas overlay?
- Combat system design — keep for later, don't over-design upfront

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

---

## Known Issues

None.

---

## Ideas Parking Lot

- Torch flicker effect via animated point light intensity ✓ (done in scaffold)
- Procedural dungeon generation (post v1)
- Ambient sound — dripping water, distant echoes
- Secret walls that push open
- Day/night cycle for outdoor sections
