# DelveWard v2 — Playable Milestones

**Versioning:** `0.milestone` — v0.1 ships when Milestone 1 is complete, v0.2 for Milestone 2, etc. The prototype period (Milestone 0) accumulated as `0.0.x` patches, tagged at **v0.0.9**.

Each milestone is a **playable, demonstrable game** you can show someone and feel good about. Not a checklist of engine internals — a thing you can *play*.

The rule: after each milestone, you could stop and have a complete game at that level of depth. No milestone leaves the game broken or half-baked.

---

## Milestone 0: What Exists Now (v1) — DONE

Grid movement, multi-level dungeons, doors/levers/plates, combat (melee), basic items (sword, shield, ring, potions), HUD, particle effects. Playable but shallow — one combat style, limited items, no reason to explore beyond "what's in the next room."

---

## Milestone 1: The Loot Game

**Theme:** "I killed a thing and got a cool sword."

The game becomes addictive. Enemies drop loot. Items have real variety. Stats matter. You level up and get stronger. The core RPG loop.

| # | Feature | From |
|---|---|---|
| N1 | Entity-component model (refactor) | T1 |
| N4 | Central item database (JSON registry) | T1 |
| I1 | Item architecture (data model) | T2 |
| I2 | Weapon types (sword, axe, dagger, bow basics) | T2 |
| I3 | Armor system (6 slots) | T2 |
| I4 | Accessories (rings, amulet) | T2 |
| I5 | Consumables (potions, rations, scrolls) | T2 |
| I7 | Equipment UI (paper doll, tooltips, comparison) | T2 |
| I8 | Item quality tiers + modifiers | T2 |
| I9 | Enemy drops + loot tables | T2 |
| R1 | Core attributes (STR/DEX/VIT/WIS) | T2 |
| R2 | XP and leveling | T2 |
| R6 | Gold currency | T2 |
| C8 | Enemy health bars | T2 |

**Playable moment:** Kill enemies, see loot drop, compare items, equip upgrades, feel yourself getting stronger. Classic dungeon crawler loop.

**Test dungeon:** Expand dungeon1 with more enemy variety and item-rich rooms.

---

## Milestone 2: The Dangerous Dungeon

**Theme:** "I hear a click. Oh no."

The dungeon fights back. Traps, secrets, environmental hazards. Exploration becomes tense — every corridor might be dangerous. The signal system brings puzzles.

| # | Feature | From |
|---|---|---|
| S1 | Signal/channel system | T1 |
| S2 | Signal behaviors (momentary, timed, one-shot) | T1 |
| S3 | Logic gates (AND, OR, DELAY, TOGGLE) | T1 |
| E8 | Projectile system | T1 |
| S4 | Trap launchers (darts, arrows, fireballs) | T2 |
| S7 | Tripwires | T2 |
| V3 | Breakable walls | T2 |
| V4 | Secret walls | T2 |
| V5 | Pushable blocks | T2 |
| V6 | Treasure chests (with loot tables) | T2 |
| V7 | Message signs / tablets | T2 |
| C2 | Status effects (poison, slow, burning) | T2 |
| E7 | Save/load system | T1 |

**Playable moment:** Walk down a corridor, hear a click, dodge a dart. Find a cracked wall, smash it open, discover a hidden treasure room. Pull levers in the right order to open a vault. Save your progress.

**Test dungeon:** A trap-heavy puzzle dungeon. "The Architect's Tomb."

---

## Milestone 3: The Living World

**Theme:** "The merchant said to find her brother in the deep levels. I found his skeleton."

NPCs, dialog, trading, quests. Now there's a *reason* to explore. Characters give the dungeon meaning. The story ideas from STORY-IDEAS.md start becoming real.

| # | Feature | From |
|---|---|---|
| P1 | NPC entities | T3 |
| P2 | Dialog system (branching, conditions, effects) | T3 |
| P3 | Trading (buy/sell, gold) | T3 |
| Q1 | Quest structure (stages, objectives) | T3 |
| Q2 | Quest log UI | T3 |
| Q3 | Quest triggers (dialog, pickup, area, kill) | T3 |
| Q4 | Quest rewards | T3 |
| V8 | Dungeon objects (fountains, altars, bookshelves) | T2 |
| R5 | Hunger resource | T2 |
| R7 | Death & respawn model (decide and implement) | T2 |

**Playable moment:** Meet a merchant at the dungeon entrance. She asks you to find her brother's ring from the depths. You descend, find his remains, read his journal, take the ring back. She rewards you and unlocks her rare stock.

**Test dungeon:** A multi-level dungeon with NPC hub, 2-3 quests, a shop.

---

## Milestone 4: The Arcane Arts

**Theme:** "I froze the water, walked across, and fireballed the archers."

Magic transforms combat and puzzle-solving. Ranged combat. Spell-world interactions. Environmental creativity. The player has *choices* in how to approach every encounter.

| # | Feature | From |
|---|---|---|
| M1 | Mana resource | T3 |
| M2 | Spell schools (start with 3-4: Fire, Ice, Holy, Arcane) | T3 |
| M3 | Casting mechanics (directional, self, AoE) | T3 |
| M4 | Spell learning (books or hybrid) | T3 |
| M5 | Spell-world interaction | T3 |
| C1 | Ranged combat (bow, wand, projectiles) | T2 |
| C5 | Enemy AI: ranged attackers | T2 |
| I6 | Ammunition (arrows, bolts) | T2 |
| R4 | Skills (lockpicking, stealth, trap disarm) | T2 |
| V1 | Animated water tiles | T2 |
| V2 | Lava tiles | T2 |

**Playable moment:** An archer fires arrows down a long corridor. You cast Ice Wall to block them, circle around, and fireball the archer from behind. You freeze a water pool to cross it, then melt the ice behind you so enemies can't follow.

**Test dungeon:** "The Elemental Sanctum" — rooms designed around spell-environment combos.

---

## Milestone 5: The Vertical World

**Theme:** "I looked over the castle wall and saw mountains. Then I looked down and saw the dungeon I just climbed out of."

The visual leap. Multiple levels visible at once. Outdoor sections. Decorative 3D meshes for cavern ceilings and distant vistas. The game stops looking like a corridor crawler and starts feeling like a *world*.

| # | Feature | From |
|---|---|---|
| E1 | Multi-level simultaneous rendering | T1 |
| E2 | Void cells (look down/up through levels) | T1 |
| E3 | Outdoor cells (no ceiling, skybox, ambient light) | T1 |
| E4 | Decorative 3D meshes (cavern ceilings, backdrops, set pieces) | T1 |
| E5 | Thin walls (edge walls, fences, railings) | T1 |
| S5 | Pit traps (floor retracts, fall to level below) | T2 |
| C7 | Enemy spawners | T2 |
| V9 | Rolling boulders | T2 |

**Playable moment:** Climb out of a dungeon onto castle walls. See mountain ranges in the distance (decorative mesh). Look down into the courtyard below (void cells). Cross a bridge over a ravine. A pit trap opens and you fall to the level below.

**Test dungeon:** "The Cliffside Keep" — a vertical dungeon with a cavern base, castle mid-section, and outdoor battlements on top.

---

## Milestone 6: The Toolmaker

**Theme:** "I built a dungeon in 20 minutes and my friend played it."

The level editor. Now content creation scales. Build dungeons visually, wire signals, place entities, test-play instantly. This is where the project becomes a *platform* for building adventures, not just one adventure.

| # | Feature | From |
|---|---|---|
| D1 | Grid painting | T4 |
| D2 | Multi-layer view | T4 |
| D3 | Entity placement | T4 |
| D4 | Live 3D preview | T4 |
| D5 | Signal wiring UI | T4 |
| D6 | Test play | T4 |
| D7 | CharDef & texture painting | T4 |
| D10 | Undo/redo | T4 |

**Playable moment:** Open the editor, paint a dungeon, drop enemies and items, wire a trap, hit play, test it, tweak, share the JSON with a friend.

---

## Milestone 7: Scripting & Advanced Content

**Theme:** "The boss spawns minions at half health, then the floor starts collapsing."

Scripting system, advanced AI, complex quests. This is where hand-crafted memorable moments become possible. Boss encounters with phases. NPCs with schedules. Chain-reaction puzzles.

| # | Feature | From |
|---|---|---|
| X1 | Script hooks on entities | T3 |
| X2 | Sandboxed script API | T3 |
| X3 | Script execution model | T3 |
| D8 | Script editor in level editor | T4 |
| D9 | Signal debugger | T4 |
| C3 | Enemy AI: patrol paths | T2 |
| C4 | Enemy AI: line-of-sight | T2 |
| C6 | Enemy AI: fleeing | T2 |
| P4 | NPC behaviors (wandering, follower, schedule) | T3 |
| N2 | Entity lifecycle hooks | T1 |

**Playable moment:** Enter a boss room. The door seals behind you (signal). The boss fights. At half HP, a script spawns a wave of minions. At quarter HP, floor tiles start falling away (pit traps on timer). You defeat the boss, the door unseals, and a hidden treasure room opens.

---

## Milestone 8: Sound & Feel

**Theme:** "I heard the skeleton before I saw it."

Audio and visual polish. The game becomes atmospheric. Sound design, music, camera feel, particle effects. This is what makes it *memorable*.

| # | Feature | From |
|---|---|---|
| A1 | Ambient sound | T4 |
| A2 | Footstep sounds (surface-dependent) | T4 |
| A3 | Combat sounds | T4 |
| A4 | Interaction sounds | T4 |
| A5 | Music tracks (per-level) | T4 |
| W1 | Footstep screen bob | T4 |
| W2 | Screen shake | T4 |
| W3 | Damage directional indicator | T4 |
| W4 | Minimap fog-of-war fade | T4 |
| W6 | Extended particles | T4 |

**Playable moment:** Walk through a dark corridor. Hear dripping water ahead. Footsteps echo on stone. A skeleton rattles around the corner. You swing — metal clang, screen shake. The torch crackles. Music shifts to tense.

---

## Milestone 9+: The Deep End

Everything that remains — the ambitious stuff. Pick and choose based on energy and interest:

- R8: Classes / specializations
- R9: Sanity system
- R10-R12: Cursed items, set bonuses, durability
- A6-A7: Dynamic music layers, directional audio
- E9: Procedural dungeon generation
- E10-E13: Multi-story structures, bridges, waterfalls, castle walls
- W5, W7: Minimap markers, day/night cycle
- R3: Character creation screen

---

## The Anti-Burnout Rule

After each milestone, stop and **play the game**. Not test it — *play* it. Build a real dungeon that uses the new features. If it's fun, you'll want to build the next milestone. If it's not, the features need tuning before moving on.

No milestone should take more than a few weeks of sessions. If one feels endless, it's too big — split it.

---

## Summary

| Milestone | Theme | Key Deliverable |
|---|---|---|
| 0 | Proof of concept | Grid crawler with combat (DONE) |
| 1 | The Loot Game | Items, stats, leveling, enemy drops |
| 2 | The Dangerous Dungeon | Traps, signals, secrets, puzzles, save/load |
| 3 | The Living World | NPCs, dialog, trading, quests |
| 4 | The Arcane Arts | Magic, ranged combat, spell-world interaction |
| 5 | The Vertical World | Multi-level rendering, outdoor, decorative meshes |
| 6 | The Toolmaker | Level editor |
| 7 | Scripting & Advanced | Script system, boss encounters, advanced AI |
| 8 | Sound & Feel | Audio, camera polish, atmosphere |
| 9+ | The Deep End | Classes, procgen, day/night, ambition |
