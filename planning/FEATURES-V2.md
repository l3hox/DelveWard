# DelveWard v2 — Feature List

Extracted from DESIGN-V2.md. Categorized, deduplicated, and tiered.

**Tiers:**
- **T1 — Engine Foundation**: Must exist before anything else can be built. Core architecture.
- **T2 — Core Gameplay**: The features that make it a real game. Build on T1.
- **T3 — Rich Content**: Depth, variety, replayability. Build on T2.
- **T4 — Polish & Ambitious**: Nice-to-have, impressive, but not blocking.

**Categories:**
- ENGINE — Renderer, scene management, grid system
- ENTITY — Entity/component model, the backbone for all game objects
- SIGNAL — Wiring, triggers, logic gates
- COMBAT — Fighting, AI, status effects
- ITEM — Items, inventory, equipment, loot
- RPG — Stats, leveling, skills, resources, character creation
- MAGIC — Spells, mana, spell schools
- NPC — Non-hostile characters, dialog, trading
- QUEST — Objectives, quest log, rewards
- SCRIPT — Scripting system, hooks, API
- EDITOR — Level editor, tools, test play
- AUDIO — Sound effects, music, ambient
- VISUAL — Particles, camera, UI polish

---

## T1 — Engine Foundation

These are architectural. Everything else is built on top of them.

### ENGINE

| # | Feature | Description |
|---|---|---|
| E1 | Multi-level simultaneous rendering | Multiple grid layers stacked vertically in one scene, rendered together |
| E2 | Void cells (vertical openness) | Floor-less cells that reveal levels below, ceiling-less cells that reveal above |
| E3 | Outdoor cells | No ceiling, skybox, different ambient lighting model |
| E4 | Decorative 3D meshes | Load external .glb/.gltf static meshes anywhere in the scene — cavern ceilings, backdrops, set pieces, architectural details. No collision, purely visual. Replaces flat ceilings, skybox, and distant scenery with custom geometry. |
| E5 | Thin walls (edge walls) | Walls on cell edges (between two walkable cells), not full-cell walls |
| E7 | Save/load system | Serialize full game state (all levels, inventory, stats, flags, quest state) to JSON |
| E8 | Projectile system | Moving objects on the grid — arrows, fireballs, boulders, thrown items with travel time |

### ENTITY

| # | Feature | Description |
|---|---|---|
| N1 | Entity-component model | Unified entity system — every game object (enemy, NPC, item, trap, door, spawner, chest, sign) is an entity with composable components |
| N2 | Entity lifecycle hooks | `onSpawn`, `onDeath`, `onInteract`, `onStep` (player steps on cell), `onSignal`, `onTimer` |
| N3 | Entity persistence | Entities survive save/load, level transitions, and state changes |
| N4 | Central item database | Items defined in a master JSON registry, referenced by ID everywhere |

### SIGNAL

| # | Feature | Description |
|---|---|---|
| S1 | Signal/channel system | Named channels — sources emit, receivers listen, replaces v1 direct target IDs |
| S2 | Signal behaviors | Momentary, latching, timed, one-shot, repeatable, inverted |
| S3 | Logic gates | AND, OR, NOT, DELAY, TOGGLE, SEQUENCE — entities that process signals |

---

## T2 — Core Gameplay

The game loop: explore, fight, loot, grow, solve puzzles.

### ITEM

| # | Feature | Description |
|---|---|---|
| I1 | Item architecture | Item data model: id, name, type, subtype, icon, weight, value, properties, modifiers |
| I2 | Weapon types | Sword, axe, mace, dagger, spear, staff, bow, crossbow, wand — each with distinct behavior |
| I3 | Armor system | 6 slots (head, chest, legs, hands, feet, shield), light/medium/heavy classes |
| I4 | Accessories | Rings (x2), amulet (x1), passive effects |
| I5 | Consumables | Health/mana potions, antidotes, rations, torch oil, scrolls, repair kits, lockpicks |
| I6 | Ammunition | Arrows, bolts — stackable, consumed on use, special variants |
| I7 | Equipment UI | Paper doll, backpack grid, tooltips, item comparison, quick-use bar |
| I8 | Item modifiers & quality tiers | Rusty → Legendary, prefix/suffix system for random loot |
| I9 | Enemy drops & loot tables | Enemies leave items on death, configurable per type, rare drops |

### RPG

| # | Feature | Description |
|---|---|---|
| R1 | Core attributes | STR, DEX, VIT, WIS — with derived stats (max HP, max MP, ATK, DEF, crit, dodge) |
| R2 | XP and leveling | XP from kills/quests/exploration, level-up grants attribute points |
| R3 | Character creation | Name, stat allocation, portrait — entry point to the game |
| R4 | Skills (non-spell) | Lockpicking, trap disarm, stealth, shield block, power strike, first aid, etc. |
| R5 | Hunger resource | Drains over time, food restores, starving = HP drain + stat penalties |
| R6 | Gold currency | Loot gold, buy/sell items, NPC economy |
| R7 | Death & respawn model | Save points, corpse run, or permadeath — pick one (TBD) |

### COMBAT

| # | Feature | Description |
|---|---|---|
| C1 | Ranged combat | Bow/crossbow/wand attacks fire projectiles (uses E8) |
| C2 | Status effects | Poison, slow, blind, burning — tick-based with visual indicators |
| C3 | Enemy AI: patrol paths | Enemies walk set routes, aggro on detection |
| C4 | Enemy AI: line-of-sight | Enemies only aggro when they can see the player |
| C5 | Enemy AI: ranged attackers | Archers, mages that keep distance and fire projectiles |
| C6 | Enemy AI: fleeing | Low-HP enemies disengage and run |
| C7 | Enemy spawners | Entities that periodically create enemies, destroyable, signal-activatable |
| C8 | Enemy health bars | Floating bar above sprites, visible when damaged |

### SIGNAL (T2 applications)

| # | Feature | Description |
|---|---|---|
| S4 | Trap projectile launchers | Dart/arrow/fireball traps wired to signals — wall-mounted, fire across corridors |
| S5 | Pit traps | Floor retracts on signal → fall to level below (requires E1, E2) |
| S6 | Timed doors | Signal opens door for N seconds, then closes |
| S7 | Tripwires | Invisible trigger line across a corridor, emits signal on player crossing |

### ENVIRONMENT

| # | Feature | Description |
|---|---|---|
| V1 | Animated water tiles | Lowered floor, animated surface, slow movement when wading |
| V2 | Lava tiles | Glow, damage on contact, fire interaction |
| V3 | Breakable walls | Cracked texture, attack to destroy, reveals hidden rooms |
| V4 | Secret walls | Push-open on walk-into, subtle visual tells |
| V5 | Pushable blocks | Grid-aligned, push into pits for bridges, block pressure plates |
| V6 | Treasure chests | Interactable, animated lid, loot table, locked variants |
| V7 | Message signs / tablets | Interact to read, pixelart text popup |
| V8 | Dungeon objects | Fountains, altars, bookshelves, barrels, crates — interactable or decorative |
| V9 | Rolling boulders | Travel in a line, crush entities, block corridors after rest |

---

## T3 — Rich Content

Depth systems that make the world feel alive.

### MAGIC

| # | Feature | Description |
|---|---|---|
| M1 | Mana resource | MP pool, WIS-scaled, regen over time, mana potions |
| M2 | Spell schools (7) | Fire, Ice, Lightning, Holy, Shadow, Earth, Arcane — each with 3-4 spells |
| M3 | Casting mechanics | Directional, self-target, AoE patterns (line, cone, radius), cast time |
| M4 | Spell learning | Books, skill investment, or hybrid (TBD) |
| M5 | Spell-world interaction | Fire ignites oil, ice freezes water, telekinesis moves blocks/levers remotely |

### NPC

| # | Feature | Description |
|---|---|---|
| P1 | NPC entities | Billboard sprites, non-hostile, name labels, face player |
| P2 | Dialog system | Branching dialog trees, conditions (inventory/flags/stats), effects (give/take items, set flags) |
| P3 | Trading | Buy/sell UI, gold currency, NPC stock |
| P4 | NPC behaviors | Stationary, wandering, follower, scheduled movement |

### QUEST

| # | Feature | Description |
|---|---|---|
| Q1 | Quest structure | Named objectives with stages: discovered → active → complete/failed |
| Q2 | Quest log UI | Overlay with active/completed quests, objective descriptions |
| Q3 | Quest triggers | Start from: NPC dialog, item pickup, area enter, enemy kill |
| Q4 | Quest rewards | Items, gold, XP, stat boosts, world state changes |

### SCRIPT

| # | Feature | Description |
|---|---|---|
| X1 | Script hooks on entities | TypeScript snippets triggered by entity lifecycle events |
| X2 | Sandboxed script API | Curated access to GameState, inventory, entities, signals, scene, quests, dialog, timers |
| X3 | Script execution model | Time-limited, async-friendly, error-safe, hot-reloadable |

### RPG (T3)

| # | Feature | Description |
|---|---|---|
| R8 | Classes or specializations | Class system, classless, or hybrid with specializations (TBD) |
| R9 | Sanity resource | Drains in darkness/near eldritch enemies, visual distortion at low values |
| R10 | Cursed items | Can't unequip without Remove Curse, tradeoff power vs penalty |
| R11 | Set bonuses | Matching armor pieces grant extra effects |
| R12 | Weapon durability | Degrades with use, repair at NPCs or with kits |

---

## T4 — Polish & Ambitious

### EDITOR

| # | Feature | Description |
|---|---|---|
| D1 | Grid painting | Click/drag cell placement, flood fill, copy/paste regions |
| D2 | Multi-layer view | Stack levels vertically, toggle layer visibility |
| D3 | Entity placement | Drag-drop entities onto cells |
| D4 | Live 3D preview | See the dungeon as the player would while editing |
| D5 | Signal wiring UI | Visual wire connections between sources/receivers, logic gate palette |
| D6 | Test play | One-click play from cursor, instant reload, edit/play toggle |
| D7 | CharDef & texture painting | Visual charDef editor, area painting, texture picker |
| D8 | Script editor | Monaco/CodeMirror panel with API autocomplete |
| D9 | Signal debugger | Real-time signal state visualization during play-test |
| D10 | Undo/redo | Full action history |

### VISUAL

| # | Feature | Description |
|---|---|---|
| W1 | Footstep screen bob | Camera vertical bounce on each step |
| W2 | Screen shake | On big hits / explosions |
| W3 | Damage directional indicator | Red arrow on HUD showing attack direction |
| W4 | Minimap fog-of-war fade | Explored-but-not-visible cells draw dimmer |
| W5 | Minimap entity markers | Enemy dots, item markers within line of sight |
| W6 | Extended particles | Poison gas clouds, blood splatter, magic sparkles, wall shadows |
| W7 | Day/night cycle | Outdoor light level and skybox change over time |

### AUDIO

| # | Feature | Description |
|---|---|---|
| A1 | Ambient sound | Dripping water, distant echoes, wind — per-level |
| A2 | Footstep sounds | Surface-dependent (stone, wood, water) |
| A3 | Combat sounds | Sword clang, monster growl, hit impact, death |
| A4 | Interaction sounds | Door creak, lever click, chest open, item pickup |
| A5 | Music tracks | Per-level ambient loops, combat layer, boss themes |
| A6 | Dynamic music layers | Combat adds percussion, low HP adds heartbeat, sanity distorts melody |
| A7 | Directional audio | Spatial sound — hear enemies approaching from a direction |

### ENGINE (T4)

| # | Feature | Description |
|---|---|---|
| E9 | Procedural dungeon generation | Random layouts from templates, seeded, mixed with hand-crafted set pieces |
| E10 | Multi-story structures | Houses with visible interior stairs, windows, enter/exit |
| E11 | Bridges and railings | Walkable cells with void below and visible depth |
| E12 | Waterfalls between levels | Particle + animated texture for vertical water |
| E13 | Castle walls walkable | Walk on walls, see surroundings, towers, battlements |

---

## Open Decisions (Must Resolve Before Data Model)

These TBDs from DESIGN-V2.md must be decided before the data model can be finalized:

| # | Decision | Options | Affects |
|---|---|---|---|
| TBD-1 | Signal model | A: Visual wiring, B: Named channels, C: Hybrid | S1-S7, editor, entity schema |
| TBD-2 | Class system | A: Classless, B: Classes, C: Hybrid specializations | R1, R3, R8, character creation |
| TBD-3 | Spell learning | A: Books, B: Skill tree, C: Hybrid | M4, item database, skill model |
| TBD-4 | Quest scripting | A: Data-driven, B: Full script, C: Hybrid | Q1-Q4, X1-X3, editor |
| TBD-5 | Skill progression | A: Use-based (Elder Scrolls), B: Skill points (level-up) | R4, leveling model |
| TBD-6 | Death model | A: Restart level, B: Corpse run, C: Permadeath, D: Mixed | R7, save system |
| TBD-7 | Inventory size | Fixed slots vs expandable bags | I7, item model, UI |
| TBD-8 | Weight/encumbrance | Yes (affects movement) vs no (just slot-limited) | I1, R1, carry capacity |

---

## Dependency Graph (Rough)

```
T1 Engine Foundation
├── E1 Multi-level rendering
│   ├── E2 Void cells
│   ├── E6 Variable ceiling heights
│   └── E3 Outdoor cells
│       └── E4 Backdrop scenes
├── E5 Thin walls
├── E7 Save/load
├── E8 Projectile system
│   ├── C1 Ranged combat
│   ├── S4 Trap launchers
│   └── V9 Rolling boulders
├── N1 Entity-component model ← EVERYTHING DEPENDS ON THIS
│   ├── N2 Lifecycle hooks
│   ├── N3 Entity persistence
│   └── N4 Item database
│       ├── I1-I8 Full item system
│       └── I9 Enemy drops
├── S1-S3 Signal system
│   ├── S4-S7 Traps
│   └── C7 Enemy spawners
│
T2 Core Gameplay (builds on T1)
├── R1-R7 RPG stats, leveling, resources
├── C1-C8 Combat depth
├── V1-V9 Environment variety
│
T3 Rich Content (builds on T2)
├── M1-M5 Magic
├── P1-P4 NPCs
├── Q1-Q4 Quests
├── X1-X3 Scripting
│
T4 Polish (builds on T3)
├── D1-D10 Editor
├── A1-A7 Audio
├── W1-W7 Visual polish
```

---

## Notes

- N1 (entity-component model) is the single most important architectural decision — it's the foundation for items, enemies, NPCs, traps, doors, chests, spawners, and everything scriptable
- The editor (T4) is listed last because the engine must exist first, but it will likely be built incrementally alongside T2/T3 features
- Audio (T4) can be integrated at any point — it's independent of gameplay architecture
- Story/narrative content (STORY-IDEAS.md) layers on top of all tiers — it's content, not engine
