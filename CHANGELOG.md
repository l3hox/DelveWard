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

_Next: v0.1 — Milestone 1: The Loot Game (entity-component model, item database, enemy drops, stats, leveling)_
