# DelveWard — CLAUDE.md

This file is auto-loaded by Claude Code at the start of every session. It provides full project context so no manual re-explanation is needed.

---

## Project Overview

**DelveWard** is a grid-based first-person dungeon crawler in the spirit of *Eye of the Beholder* and *Legend of Grimrock*. Oldschool soul, modern browser implementation. Solo side project — no commercial ambition. Built by Jakub as a deliberate act of reinvention and fun.

Developer background: Jakub is a senior backend/cloud engineer (20 years), VR/AR background. Frontend/WebGL is a side effect, not the focus — Jakub is not trying to go deep on JS internals or WebGL primitives. The primary goal is building skills in **agent-assisted end-to-end project development** using Claude Code — this is a deliberate career pivot / upgrade, and DelveWard is the vehicle for it.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Renderer | Three.js (browser) |
| Language | **TypeScript** |
| Build tool | **Vite** |
| Package manager | **npm** |
| Art — Textures | AI generated (Midjourney / Leonardo), pixelart style |
| Art — Enemies | Billboard sprites (camera-facing 2D) |
| Dev assistant | Claude Code CLI |

---

## Core Design Pillars

- **Grid movement only** — step-by-step, 90-degree turns. No free movement.
- **First-person 3D** — Three.js, pixelart textures on 3D geometry
- **Pixelart aesthetic** — textures, UI, enemies all consistent retro style
- **Multi-level dungeons** — stairs, varied ceiling heights, open spaces
- **Mood over complexity** — dark corridors, torchlight, atmosphere first

---

## Key Decisions (Locked In)

- Renderer: Three.js (not Phaser, not Godot, not Babylon)
- True 3D perspective with grid movement (Grimrock-style, not sprite-based EotB-style)
- Camera movement: **short tween animation** on steps and turns (not instant snap)
- Enemies: billboard sprites for now, not 3D models
- Dungeon format: 2D grid array, JSON (human-readable, easy to hand-edit and agent-generate)
- Platform: browser desktop first, shareable via link
- Language: TypeScript
- Build: Vite + npm

---

## Movement & Camera

- Player exists on a 2D grid (X, Z axes)
- Facing direction: N / E / S / W
- Actions: move forward, move back, strafe left/right, turn left/right
- Camera does a short tween on each step/turn (not instant)
- Y axis used only for stairs / level transitions

---

## Dungeon Format

- Levels defined as 2D grid arrays
- Cell types: floor, wall, door, stairs up, stairs down, void
- Separate metadata layer: enemies, items, triggers, lighting hints
- Format: JSON

---

## Art Direction

- Pixelart palette — muted, dark, dungeon-appropriate
- Wall textures: stone, brick, wood, moss variants
- UI: pixelart framing, minimal HUD — health, minimap, inventory slots
- Lighting: Three.js point lights simulating torches, ambient very low

---

## Out of Scope (v1)

- Multiplayer
- Complex RPG systems (keep stats minimal)
- Procedural generation (hand-crafted levels first)
- Sound (nice to have later)
- Mobile (desktop browser first)

---

## Current Status

**Phase: Pre-production.** No code written yet. Design locked, ready to scaffold.

See PROGRESS.md for session log, immediate next steps, and open questions.
See DESIGN.md for full design rationale and motivation.

---

## Working Style Notes

- Update PROGRESS.md at the end of each session (Claude Code handles this on request)
- Keep solutions simple — avoid over-engineering
- Frontend/WebGL details are a means to an end — don't over-explain JS/WebGL internals unless asked
- The real focus is agent-assisted development workflow: Jakub drives, Claude Code executes
- This will become a GitHub repo soon — keep code clean and commit-ready
