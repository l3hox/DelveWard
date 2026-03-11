# DelveWard — Design Discussion Session (2026-03-10)

Summary of a brainstorming and planning session that produced the v2 design documents.

---

## What Happened This Session

### 1. Billboard Sprite Lighting Fix
Started with a bug: enemy billboard sprites had uneven brightness and went black from some camera angles. Root cause: the custom shader computed light distance in **world space** but Three.js passes light positions in **view space**. Fixed by transforming the sprite center to view space before distance calculation. Also tuned brightness multiplier down and added a clamp at 1.2. Fixed sprite positioning so feet sit at ground level.

**Commits:** `416d469`, `331235f`

### 2. V2 Design Brainstorm
Expanded from the v1 Ideas Parking Lot into a comprehensive vision document (`DESIGN-V2.md`). Major themes:

- **Multi-level vertical world** — simultaneous rendering of stacked levels, void cells, ravines, caverns, cliffs, multi-story buildings, castles with walkable walls
- **Decorative 3D meshes** — external .glb geometry (Blender etc.) loaded as inaccessible visual backdrop anywhere in the scene. Cavern ceilings, mountain ranges, distant cities, set pieces. Grid stays flat, visual complexity comes from custom meshes. This unified the "backdrop scenes" and "variable ceiling heights" concepts into one system.
- **Moving objects & projectiles** — trap launchers, enemy projectiles, rolling boulders, thrown items
- **Signal & wiring system** — named channels or visual wiring to connect triggers (plates, levers, tripwires) to actuators (doors, traps, spawners) with logic gates. Three options explored: visual wiring, named channels, hybrid.
- **Level editor** — browser-based, grid painting, entity placement, live 3D preview, signal wiring UI, test play
- **Scripting system** — TypeScript snippets on entities with sandboxed API for complex behaviors (boss encounters, quest logic, dynamic events)
- **NPCs & dialog** — branching dialog trees with conditions/effects, trading, NPC behaviors (stationary, wandering, follower, scheduled)
- **Quests & quest log** — staged objectives, multiple trigger types, rewards that modify world state
- **Full item system** — weapons (9 types), armor (6 slots), accessories, consumables, ammo, quality tiers, prefix/suffix modifiers, loot tables
- **Magic system** — 7 spell schools, mana resource, casting mechanics, spell-world interactions (fire ignites oil, ice freezes water, telekinesis solves puzzles)
- **RPG system** — 4 core attributes (STR/DEX/VIT/WIS), derived stats, XP/leveling, skills, hunger/sanity resources, death models
- **Enemy spawners** — signal-activated or always-on, destroyable, scriptable for boss waves

### 3. Story & Atmosphere Ideas
Brainstormed narrative features from a "fantasy writer" perspective (`STORY-IDEAS.md`):
- Environmental storytelling, layered civilizations, previous adventurer corpses
- Light as a storytelling mechanic (darkness that moves, lit torches in abandoned places)
- The dungeon changes behind you (one-way transformations, returning to changed spaces)
- Named enemies with backstories and recurring nemeses
- Moral choices with real consequences (faction reputation, mercy vs efficiency)
- Memorable locations (The Drowned Cathedral, The Whispering Gallery, The Garden, The Bridge of Chains)
- Time and memory mechanics (flashbacks, ghost echoes, dream sequences)
- Companions and loss (the dog, the merchant who goes deeper)
- Meta layer (auto-journal, found maps, cartographer's guild)

### 4. Art & Audio Production Guide
Created `ART-GUIDE.md` — practical strategy for consistent art across many AI generation sessions:
- Style anchors as visual ground truth
- Prompt templates per asset category
- Post-processing pipeline (downscale → palette lock → export) as the real consistency tool
- Sound FX tools surveyed (ElevenLabs, SFX Engine, OptimizerAI)
- Music tools surveyed (Beatoven.ai, Soundverse, Wondera)
- Audio post-processing strategy (volume normalization, shared reverb, format)

### 5. Feature List & Prioritization
Extracted 87 features from DESIGN-V2.md into `FEATURES-V2.md`:
- **T1 (14 features)** — Engine foundations
- **T2 (26 features)** — Core gameplay
- **T3 (16 features)** — Rich content
- **T4 (24 features)** — Polish & ambitious
- 8 open TBD decisions identified
- Dependency graph with entity-component model (N1) as the keystone

### 6. Playable Milestones
Broke the feature list into 9 deliverable milestones (`MILESTONES-V2.md`), each a complete playable game:
1. The Loot Game (items, stats, leveling, drops)
2. The Dangerous Dungeon (traps, signals, secrets, save/load)
3. The Living World (NPCs, dialog, trading, quests)
4. The Arcane Arts (magic, ranged combat, spell-world interaction)
5. The Vertical World (multi-level rendering, outdoor, decorative meshes)
6. The Toolmaker (level editor)
7. Scripting & Advanced (boss encounters, advanced AI)
8. Sound & Feel (audio, camera polish)
9. The Deep End (classes, procgen, ambition)

### 7. Development Approach Decision
**Decided: Agile loop, not big upfront design.**

Design the data model only for the current milestone. Refactor when the next milestone needs it. Rationale:
- Solo developer, zero coordination cost for refactoring
- Agent-assisted refactoring is cheap and fast
- Building from real gameplay teaches what the model actually needs
- Avoids burnout from over-planning
- Matches the milestone anti-burnout philosophy

---

## Key Decisions Made

| Decision | Choice |
|---|---|
| Billboard lighting | View-space distance-only shader, no NdotL |
| Backdrop + ceiling concept | Unified as "decorative 3D meshes" — one system for all inaccessible visual geometry |
| RPG system timing | Defer detailed design until it's needed — it's isolated enough |
| Data model approach | Agile: design per milestone, refactor as needed |
| Development philosophy | Milestone-driven, play after each, no big upfront design |

---

## Documents Created

| File | Purpose |
|---|---|
| `DESIGN-V2.md` | Full v2 feature brainstorm — the idea pool |
| `STORY-IDEAS.md` | Narrative and atmosphere ideas — golden pieces for adventure building |
| `ART-GUIDE.md` | Art and audio production guide (initial template) |
| `FEATURES-V2.md` | Categorized, tiered feature list with dependencies |
| `MILESTONES-V2.md` | Playable milestone breakdown with anti-burnout rules |
| `DESIGN-DISCUSSION.md` | This file — session summary |

---

## Next Session

Start Milestone 1: The Loot Game. Design the entity and item data model for M1 scope only, then implement.
