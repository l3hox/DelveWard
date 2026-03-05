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

## Session Workflow

Every session follows this protocol:

### On session start
1. **Read PROGRESS.md** — this tells you where the project is: current phase, what's done, what's next, known issues
2. **Read PLAN.md only if needed** — PROGRESS.md references the current phase by name. Only open PLAN.md if you need the full phase details, architecture decisions, or design context
3. **Do NOT re-read CLAUDE.md** — it's already auto-loaded

### During the session
- Work on the current phase's next steps as listed in PROGRESS.md
- If a task is ambiguous, check PLAN.md for the design decision
- **When creating or editing level/dungeon JSON**, read `DUNGEON-DESIGNER.md` first — it has the coordinate system, entity schemas, and texture names. Always verify coordinates by counting grid characters (0-based).

### On session end (when asked)
- **Update PROGRESS.md**:
  - Move completed items from "Next Steps" to "What's Done"
  - Add new next steps if the phase progressed
  - If a phase is fully complete, update "Current Phase" to the next one
  - Log the session in the session log
  - Add any new known issues or open questions
- **Do NOT update PLAN.md** — it's the stable reference. Only update if a design decision is explicitly changed
- **Update LOG.md** when design decisions are made/changed or significant code changes land — add a dated entry summarizing what and why

### File roles
| File | Role | Updates |
|---|---|---|
| `CLAUDE.md` | Project identity, tech stack, pillars, workflow rules | Rarely — only for structural project changes |
| `PLAN.md` | Full implementation plan, all design decisions, phase definitions | Only when design decisions change |
| `PROGRESS.md` | Session-to-session state: what's done, what's next, session log | Every session end |
| `LOG.md` | Decision & change log — design decisions, architecture changes, significant code changes, with dates | When decisions or significant code changes land |
| `DESIGN.md` | Original motivation and vision | Never (historical document) |
| `DUNGEON-DESIGNER.md` | Level/dungeon JSON schema, coordinate system, texture reference | When level format changes |

---

## Git Workflow

- **Branch for non-trivial work** — phase steps, refactors, new features → work on a branch (e.g. `phase1/extract-player-state`), merge to main when it works
- **Commit directly to main** for small stuff — doc fixes, config tweaks, trivial changes
- **No PRs required** — just merge when ready. Use PRs only if you want a council/review on the branch diff before merging
- **Keep main always working** — it should be shareable at any time

---

## Agent & Model Preferences

- **Planning**: Use **Opus** (high capability) for creating plans and architectural decisions
- **Implementation**: Use **Opus** (medium) for code implementation subagents
- **Subagent usage**: Spawn subagents for implementation tasks. Use the `SoftwareDeveloper` agent type for code work
- **Parallelization**: Parallelize independent tasks (spawn multiple subagents in one message). Serialize tasks that depend on each other. Use your judgement on which approach fits
- **Don't ask** — these preferences are standing instructions, not per-session choices

---

## Working Style Notes

- Keep solutions simple — avoid over-engineering
- Frontend/WebGL details are a means to an end — don't over-explain JS/WebGL internals unless asked
- The real focus is agent-assisted development workflow: developer drives, Claude Code executes
- Keep code clean and commit-ready
