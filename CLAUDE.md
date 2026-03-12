# DelveWard — CLAUDE.md

Auto-loaded at session start. Project identity, workflow rules, standing instructions.

---

## Project Overview

**DelveWard** is a grid-based first-person dungeon crawler (Grimrock-style). Three.js, pixelart textures, browser desktop. Solo side project by Jakub.

Developer background: senior backend/cloud engineer (20 years), VR/AR background. Frontend/WebGL is a means to an end. Primary goal: building skills in **agent-assisted end-to-end project development** using Claude Code.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Renderer | Three.js (browser) |
| Language | TypeScript |
| Build | Vite + npm |
| Art | AI-generated pixelart (Midjourney / Leonardo), billboard enemy sprites |

---

## Design Pillars

- Grid movement only — step-by-step, 90-degree turns, tween camera animation
- First-person 3D — Three.js with pixelart textures, not sprite-based
- Pixelart aesthetic — textures, UI, enemies all consistent retro style
- Multi-level dungeons — stairs, varied ceiling heights, open spaces
- Mood over complexity — dark corridors, torchlight, atmosphere first
- Dungeon format: 2D grid array, JSON (human-readable, hand-editable)
- Desktop browser first

---

## Session Workflow

### On session start
1. **Read `planning/PROGRESS.md`** — current milestone, what's next, known issues
2. **Read `planning/MILESTONES-V2.md` only if needed** — for milestone scope
3. **Do NOT re-read CLAUDE.md** — it's already auto-loaded

### During the session
- Work on the current milestone's next steps as listed in `planning/PROGRESS.md`
- If a task is ambiguous, check `planning/FEATURES-V2.md` or `planning/DESIGN-V2.md` for context
- **When creating or editing level/dungeon JSON**, read `DUNGEON-DESIGNER.md` first

### On session end (when asked)
- **Update `planning/PROGRESS.md`** — move completed items, add new next steps, add known issues
- **Update `planning/LOG.md`** when design decisions are made or significant code changes land

### File roles
| File | Role | When to read |
|---|---|---|
| `CLAUDE.md` | Project identity, workflow rules | Auto-loaded |
| `planning/PROGRESS.md` | Current state: what's next, known issues | Every session start |
| `planning/LOG.md` | Decision & change log (dated entries, newest first) | When design context or implementation history needed |
| `planning/COMPLETED.md` | Detailed "what's done" checklist | When feature inventory needed |
| `planning/IDEAS.md` | Unplanned feature ideas | When brainstorming |
| `planning/MILESTONES-V2.md` | Playable milestone breakdown | When milestone scope needed |
| `planning/FEATURES-V2.md` | Categorized feature list with tiers | When feature context needed |
| `planning/DESIGN-V2.md` | V2 feature brainstorm | When new ideas needed |
| `planning/m1/` | M1-specific design, enemies, plan | When working on M1 details |
| `DUNGEON-DESIGNER.md` | Level JSON schema, coordinates, textures | When editing dungeon JSON |

---

## Git Workflow

- **Branch for non-trivial work** — phase steps, refactors, new features
- **Commit directly to main** for small stuff — doc fixes, config tweaks
- **No PRs required** — just merge when ready
- **Keep main always working** — it should be shareable at any time

---

## Agent & Model Preferences

- **Planning**: Use **Opus** (medium) for plans and architectural decisions
- **Implementation**: Use **Sonnet** (medium) for code implementation subagents
- **Subagent usage**: Spawn subagents for implementation tasks. Use `SoftwareDeveloper` agent type
- **Parallelization**: Parallelize independent tasks, serialize dependent ones
- **Don't ask** — these are standing instructions

---

## Working Style Notes

- Keep solutions simple — avoid over-engineering
- Don't over-explain JS/WebGL internals unless asked
- Keep code clean and commit-ready
