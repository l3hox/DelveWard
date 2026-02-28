# DelveWard — DESIGN.md

## Motivation

This project was born from a conversation about the future of software engineering and AI-driven disruption. Jakub is a senior backend/cloud engineer with 20 years of experience, a background in VR/AR, and a love for music and creative arts. Facing an industry in transition, this game is a deliberate act of reinvention — reconnecting with the joy of building something personal, learning frontend/WebGL as new territory, and leveraging AI tooling (Claude Code, image generation) to finally finish what teenage-Jakub never could. It's a side project with no commercial ambition, driven purely by nostalgia and curiosity.

---

## Vision

A grid-based first-person dungeon crawler in the spirit of **Eye of the Beholder** and **Legend of Grimrock** — oldschool soul, modern implementation. Turn-based movement on a square grid, rendered in true 3D with pixelart textures for atmosphere. Multi-level dungeons, open spaces, atmospheric lighting.

Think: the feeling of Dungeon Master, built with Three.js, playable in a browser tab.

---

## Core Design Pillars

- **Grid movement only** — step-by-step, 90-degree turns. No free movement.
- **First-person 3D perspective** — Three.js rendering with pixelart textures
- **Pixelart aesthetic** — textures, UI, enemies all consistent retro style
- **Multi-level dungeons** — stairs, open vertical spaces, varied ceiling heights
- **Simple but atmospheric** — mood over complexity. Dark corridors, torchlight, tension.

---

## Tech Stack

| Concern | Choice | Rationale |
|---|---|---|
| Rendering | Three.js (browser) | WebGL 3D, great agent support, shareable via link |
| Language | JavaScript / TypeScript | Frontend learning goal, wide ecosystem |
| Movement | Grid-locked camera | Simple state machine, no physics needed |
| Art - Textures | AI generated (Midjourney / Leonardo) | Pixelart style, consistent palette |
| Art - Enemies | Billboard sprites (camera-facing) | Authentic to era, simpler than 3D models |
| Dev tooling | Claude Code CLI | Primary agentic coding assistant |
| Tracking | DESIGN.md + PROGRESS.md | Lightweight, repo-native, agent-readable |

---

## Movement & Camera

- Player exists on a 2D grid (X, Z axes)
- Facing direction: N / E / S / W
- Actions: move forward, move back, strafe left/right, turn left/right
- Camera snaps instantly (or short tween animation) — no smooth free movement
- Y axis used only for stairs / level transitions

---

## Dungeon Format

- Levels defined as 2D grid arrays
- Cell types: floor, wall, door, stairs up, stairs down, empty (void)
- Separate metadata layer: enemies, items, triggers, lighting hints
- Human-readable format (JSON or simple custom) for easy manual editing and agent generation

---

## Enemy System (initial)

- Billboard sprites facing camera at all times
- Distance-based scaling (closer = larger)
- Simple state machine: idle / aggro / attack
- Turn-based combat (player acts, then enemies act)

---

## Art Direction

- Consistent pixelart palette — muted, dark, dungeon-appropriate
- Wall textures: stone, brick, wood, moss variants
- Floor/ceiling: matching family of textures
- UI: pixelart framing, minimal HUD — health, minimap, inventory slots
- Lighting: Three.js point lights simulating torches, ambient very low

---

## Out of Scope (v1)

- Multiplayer
- Complex RPG systems (keep stats minimal)
- Procedural generation (hand-crafted levels first)
- Sound (nice to have later)
- Mobile (browser desktop first)
