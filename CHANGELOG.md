# DelveWard — Changelog

Versioning scheme: `0.milestone` — each minor version corresponds to a completed playable milestone.
Pre-milestone work accumulates as patch versions under `0.0.x`.

---

## [0.0.9] — 2026-03-11 — Milestone 0 Complete (Prototype)

All 8 build phases complete. Full playable dungeon crawler prototype in the browser.

### What's in this build

**Core engine**
- Grid-based first-person movement — step/turn with smooth tween camera
- Three.js renderer with pixelart procedural textures (wall, floor, ceiling variants)
- Multi-level dungeons with JSON format, stair transitions, fade overlay
- Fog, torch point light with flicker, debug fullbright toggle (L key)
- 3D stair geometry with depth-fade vertex colors
- Camera viewport tuning: asymmetric frustum crop, pitch tilt on stairs, telephoto back offset

**Dungeon features**
- Doors (open/close/lock), keys (auto-pickup), levers (repeatable), pressure plates (one-shot)
- Door visuals: 3D stone frames, sliding panel animation, brass buttons on interactive doors
- CharDef texture system — custom ASCII chars with per-char texture sets
- 4-layer texture resolution: hard-coded → defaults → charDefs → areas

**Entities & combat**
- 3 enemy types: rat, skeleton, orc — billboard sprites, pixelart textures
- Enemy AI: idle → chase → attack state machine, BFS pathfinding, collision avoidance
- Real-time timers per enemy, aggro/deaggro with hysteresis
- Melee combat: F key attack, 0.8s cooldown, damage formula with ATK/DEF stats
- Floating damage numbers, sword swing HUD animation, enemy hit shake + attack lunge
- Death → fade-to-black → full level restart

**Items & inventory**
- Equipment slots: weapon, armor, ring — stat bonuses wired into combat
- Consumables: health potions, torch oil — use via number keys 1–8
- Backpack (8 slots), ground pickup, auto-equip
- Item billboard renderers (equipment + consumables)

**HUD**
- 2D canvas overlay (640×360, pixelated) — compass rose, minimap (explored cells, teal stairs), health bar, torch fuel bar, inventory panel
- Fog-of-war exploration: current cell + adjacents + line-of-sight forward
- Low-HP pulse, low-torch flicker, weapon slot cooldown fill

**Atmosphere**
- Particle effects: dust motes (near ceiling), sconce embers (additive sparks), water drips (form → fall → splash)
- Per-level particle flags: `dustMotes`, `waterDrips`

**Content**
- 7 dungeon levels across multiple themed dungeons
- several testing levels
- `dungeon3.json` — three-level dungeon with full item/enemy/doors showcase

**Engineering**
- TypeScript + Vite + Three.js
- 281 tests (Vitest), co-located with core logic
- `DUNGEON-DESIGNER.md` — full level JSON schema reference

---

## [0.1] — 2026-03-14 — Milestone 1: The Loot Game

First playable milestone. Full RPG loop: fight enemies, collect loot, level up, allocate stats, equip gear, descend through a 3-level dungeon. Built on top of the v0.0.9 prototype.

### RPG systems

- **Entity registry** — single source of truth for all item instances (world, backpack, equipped), with instance IDs and location tracking
- **Item database** — 50+ items loaded from `public/data/items.json` (weapons, armor, accessories, consumables) with stats, requirements, and quality tiers
- **Stats & leveling** — 4 core attributes (STR, DEX, VIT, WIS), derived stats (ATK, DEF, maxHP, crit chance, dodge chance), XP-based leveling (cap 15), 3 attribute points per level
- **Character creation** — name entry + 5-point attribute allocation before game starts
- **Equipment expansion** — 6 weapon subtypes (sword, axe, dagger, mace, spear, staff), 10 armor slots (head, chest, legs, hands, feet, shield, 2 rings, amulet), stat requirements gating equip
- **Loot & drops** — enemy death triggers loot table rolls (`public/data/loot-tables.json`), spawns gold + items on ground, per-enemy and override-based drop tables

### UI

- **Enemy health bars** — floating bars above damaged enemies, billboard toward camera, auto-remove on death
- **Inventory overlay** — full-screen overlay (I key) with equipment slots, backpack grid, equip/unequip/drop/use actions, keyboard navigation
- **Item tooltips** — hover/select shows item name, stats, requirements, quality color
- **Attribute panel** — L key opens allocation screen, spend points on STR/DEX/VIT/WIS, VIT auto-heals to new max
- **Gold counter** — HUD display, accumulated from enemy drops
- **Item sprites** — 23 pixelart item icons rendered as billboard meshes on ground

### New enemies (6 types added, 9 total)

| Type | HP | ATK | Special |
|------|---:|----:|---------|
| spider | 14 | 3 | Poison tag (M2) |
| kobold | 12 | 2 | Flees below 30% HP |
| zombie | 50 | 3 | Slow, tanky |
| goblin | 10 | 2 | Medium speed |
| giant_bat | 6 | 1 | Fast, erratic |
| troll | 80 | 5 | HP regen (+7/s, pauses on hit) |

### Content

- **M1 dungeon** (`dungeon_m1.json`) — 3-level dungeon: "The Upper Crypts" (open sky, rats/bats/goblins), "The Dark Warrens" (mossy caves, spiders/skeletons/kobolds), "The Troll's Domain" (brick dungeon, orcs/zombies/troll boss)
- Equipment progression across levels: rusty sword → iron weapons → steel weapons
- Consumable drops: health potions (small/medium/large), torch oil

### Visual polish

- **Per-level environments** — `dungeon` (dark fog) and `mist` (grey fog, brighter ambient) presets per level
- **Ceiling toggle** — `ceiling: false` removes ceiling geometry for open-air levels
- **Procedural skybox** — `starry-night` sky visible through ceiling openings (dark blue gradient + scattered stars)
- **Horizontal door sliding** — doors without ceilings slide sideways instead of up (axis matches door orientation)
- **Door bounce** — blocked mechanical doors bounce visually when enemy is in the way
- **Troll regen** — live health bar updates during regeneration, pauses on hit

### Engineering

- 515 tests (Vitest)
- Item database + loot tables loaded at startup
- Asset check at startup logs missing PNGs
- Startup preloads: enemy textures, item sprites, loot tables

---

_Next: Dungeon Editor + data model improvements_
