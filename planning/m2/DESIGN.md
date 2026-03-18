# Milestone 2: The Dangerous Dungeon — Design Doc

**Version target:** v0.2
**Theme:** "I hear a click. Oh no."
**Goal:** The dungeon fights back. Traps, secrets, environmental hazards, puzzles. Exploration becomes tense. Save your progress.

---

## What We're Actually Building

M1 established the RPG loop (kill → loot → equip → level up). M2 makes the *dungeon itself* dangerous and interesting. After M2:

- Traps fire projectiles across corridors
- Tripwires and invisible triggers activate signals
- Secret walls hide treasure rooms
- Breakable walls reward observant fighters
- Pushable blocks solve pressure plate puzzles
- Treasure chests reward exploration (some locked, some signal-controlled)
- Status effects (poison, slow, burning) add tactical depth
- A proper signal system enables complex puzzle design
- Save/load means progress is never lost

---

## Scope

Features in M2 (from MILESTONES-V2.md, scoped):

| # | Feature | Notes |
|---|---|---|
| S1 | Signal system | Multi-target direct references, replaces single `target` field |
| S2 | Signal behaviors | Momentary, latching, timed, one-shot, toggle on sources |
| S3 | Logic gates | Standalone invisible entities: AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT |
| S4 | Trap launchers | Wall-mounted dart/arrow/fireball launchers, signal-activated |
| S7 | Tripwires | Invisible trigger lines, DEX-gated visibility |
| — | Invisible triggers | Player-presence trigger zones (like invisible pressure plates) |
| E8 | Projectile system | Moving objects on grid — designed for both traps (M2) and ranged combat (M4) |
| V3 | Breakable walls | HP-based, attack to destroy, optional loot drops |
| V4 | Secret walls | Entity on wall cell with subtle charDef, push-open on walk-into |
| V5 | Pushable blocks | Player interacts to push, works with pressure plates |
| V6 | Treasure chests | Interactable, animated lid, loot table, key-locked + signal-controlled variants |
| V7 | Message signs/tablets | Interact to read, scroll-style overlay popup |
| C2 | Status effects | Poison (tick damage), slow (longer move interval), burning (tick damage + visual) |
| E7 | Save/load system | Manual save slots + auto-save on stairs + export/import JSON |

**Explicitly deferred from M2:**
- Sub-grid entity positioning (E6) → deferred until multi-enemy rooms needed
- Pit traps (S5) → requires multi-level rendering (E1/E2), deferred to M5
- Rolling boulders (V9) → deferred
- Enemy spawners (C7) → deferred
- Lockpicking skill → M3+ (key-locked chests use existing key system)

---

## Decisions Made

### Signal system model
**Decision: Direct entity references with multi-target, built-in receiver gates, and standalone gate entities.**

No named channels. The existing `target: entityId` pattern extends to `targets: [entityId, ...]`. Sources emit to all targets. Receivers can receive from multiple sources. Two layers of logic:

1. **Built-in gate on receiver** (simple): each signal-receiving entity has a `gateMode` field (default: `"or"`). When it has multiple incoming signals, the gate determines activation: OR (any source), AND (all sources), etc.

2. **Standalone gate entities** (complex): invisible grid-positioned entities (AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT) that receive signals and emit to their own targets. Visible in editor, invisible in game. For complex multi-step puzzles.

**Breaking migration:** All existing `target: string` fields migrate to `targets: string[]`. Only `dungeon_m1.json` will be updated; other level files cleaned up manually.

### Death model
**Decision: Load last save.**
Death reloads the most recent save (auto or manual). The M1 "restart level" behavior is replaced.

### Save/load storage
**Decision: localStorage + export/import.**
Primary storage in localStorage. Export Save (download JSON) and Import Save (upload JSON) buttons for portability.

---

## Signal System Architecture

### Signal Flow

```
Source Entity ──emit──▶ Target Entity (door, chest, etc.)
     │                      │
     │                      ├─ gateMode: "or" (default)
     │                      ├─ gateMode: "and"
     │                      └─ signalBehavior: "toggle" | "momentary" | ...
     │
     └──emit──▶ Gate Entity (AND, OR, NOT, DELAY, PULSE)
                    │
                    └──emit──▶ Target Entity
```

### Signal Sources (emit signals)

| Entity type | Trigger | Notes |
|---|---|---|
| lever | Player interaction | Toggles up/down, emits on each toggle |
| pressure_plate | Player/block steps on cell | Emits while occupied |
| tripwire | Player crosses cell | One-shot or repeatable |
| trigger | Player enters cell | Invisible, signal-only (like invisible pressure plate) |
| trap_launcher | Signal received | Fires projectile when activated |

### Signal Receivers (react to signals)

| Entity type | Reaction | Notes |
|---|---|---|
| door | Open/close | Already exists, extend for multi-source |
| chest | Lock/unlock/seal | Signal-controlled chest state |
| trap_launcher | Fire projectile | Receives signal → launches |
| gate entity | Process + re-emit | AND/OR/NOT/DELAY/PULSE |

### Receiver Gate Modes

When an entity receives signals from multiple sources, `gateMode` determines behavior:
- `"or"` (default): activates if ANY source is active
- `"and"`: activates only if ALL sources are active
- `"xor"`: activates if exactly one source is active

### Source Signal Behaviors

Each source entity can have a `signalMode`:
- `"toggle"` (default for levers): alternates on/off on each activation
- `"momentary"`: signal active only while trigger condition is true (plate while stood on)
- `"one_shot"`: fires once, never resets
- `"timed"`: stays active for `signalDuration` seconds after trigger, then deactivates

### Standalone Gate Entities

Grid-positioned, invisible in game, visible in editor as logic symbols.

| Gate | Behavior | Params |
|---|---|---|
| AND | Output active when ALL inputs active | — |
| OR | Output active when ANY input active | — |
| NOT | Output active when input is INACTIVE | — |
| DELAY | Forwards input after N seconds | `delay: number` (seconds) |
| PULSE_EDGE | Emits momentary signal on input rising edge | — |
| PULSE_REPEAT | Re-emits signal every N seconds while input active | `interval: number` (seconds) |

Gate entities have `targets: []` for their outputs and receive signals from sources that list them in their `targets`.

### JSON Schema Changes

**Sources** (lever, pressure_plate, tripwire, trigger):
```jsonc
{
  "type": "lever",
  "col": 3, "row": 5,
  "targets": ["door_1", "gate_and_1"],  // was: "target": "door_1"
  "signalMode": "toggle",               // new, optional
  "signalDuration": 5,                  // for "timed" mode only
  "wall": "N"
}
```

**Receivers with built-in gate** (door, chest):
```jsonc
{
  "type": "door",
  "id": "door_1",
  "col": 5, "row": 5,
  "gateMode": "and"  // new, optional, default "or"
}
```

**Standalone gates**:
```jsonc
{
  "type": "gate",
  "id": "gate_delay_1",
  "col": 2, "row": 2,
  "gateType": "delay",
  "delay": 3.0,
  "targets": ["door_2"]
}
```

---

## Projectile System

Designed to support both M2 traps and future M4 ranged combat.

### Projectile Data

```ts
interface Projectile {
  id: string;
  col: number;
  row: number;
  direction: Facing;           // N, E, S, W
  speed: number;               // cells per second
  damage: number;
  damageType: 'physical' | 'fire';
  statusEffect?: StatusEffectType;  // e.g. 'burning' for fireballs
  source: 'trap' | 'player' | 'enemy';  // for M4 extension
  sprite: string;              // texture path
  traveled: number;            // cells traveled
  maxRange: number;            // max cells before despawn
}
```

### Trap Launcher Entity

Wall-mounted, fires in a fixed direction when signal received.

```jsonc
{
  "type": "trap_launcher",
  "col": 3, "row": 1,
  "facing": "S",
  "projectileType": "dart",     // dart, arrow, fireball
  "reloadTime": 3.0,            // seconds between shots
  "targets": []                 // can also emit signal on fire (chaining)
}
```

### M2 Projectile Types

| Type | Speed | Damage | Special | Sprite |
|---|---|---|---|---|
| Dart | 8 cells/s | 3 | — | thin needle |
| Arrow | 6 cells/s | 5 | — | arrow shaft |
| Fireball | 4 cells/s | 8 | Applies burning (3s) | glowing orb |

### Collision

- Projectiles move along the grid each frame (fractional position, render interpolated)
- Hit player → damage + optional status effect
- Hit wall → destroy
- Hit enemy → damage (for future player-fired projectiles)
- Hit closed door → destroy
- Hit pushable block → destroy

---

## Status Effects

### Effect Types

| Effect | Tick | Duration | Source | Visual |
|---|---|---|---|---|
| Poison | 2 HP/sec | 5s | Spider attack, poison trap | Green tint overlay |
| Slow | Move interval ×2 | 4s | Spider web trap, ice trap (M4) | Blue tint, slower tweens |
| Burning | 3 HP/sec | 3s | Fireball trap hit | Orange flicker overlay |

### Data Model

```ts
interface StatusEffect {
  type: 'poison' | 'slow' | 'burning';
  remaining: number;    // seconds remaining
  tickTimer: number;     // accumulator for damage ticks
  tickInterval: number;  // seconds between damage ticks
  tickDamage: number;    // damage per tick (0 for slow)
}
```

### Application

- Added to `EnemyInstance` as `statusEffects: StatusEffect[]`
- Added to `GameState` as `playerStatusEffects: StatusEffect[]`
- Ticked in enemy AI loop (enemies) and main game loop (player)
- Slow effect: multiplies `moveInterval` (enemies) or movement tween duration (player)
- Visual: HUD status icons + tint overlay on affected sprites

### Enemy Status Effect Sources

Update `enemies.json` behaviors:
```jsonc
{
  "id": "spider",
  "behaviors": [
    { "type": "onHit", "params": { "statusEffect": "poison", "chance": 0.3, "duration": 5 } }
  ]
}
```

---

## Breakable Walls

- Entity type: `breakable_wall`
- Placed on a `#` wall cell (or a charDef with cracked wall texture)
- Has HP (e.g. 20-50), player attacks reduce it
- When HP reaches 0: grid char changes to `.`, wall geometry removed, entity removed
- Optional `drops` field (same format as enemy drops override) for hidden treasure
- Visual: uses a "cracked stone" charDef texture, distinct from normal walls

```jsonc
{
  "type": "breakable_wall",
  "col": 5, "row": 3,
  "hp": 30,
  "drops": {
    "guaranteed": [{ "itemId": "health_potion_medium", "quality": "common" }]
  }
}
```

---

## Secret Walls

- Entity type: `secret_wall`
- Placed on a wall cell that uses a subtle charDef (slightly different wall texture — e.g. `'s'` with a "mossy stone" variant)
- Player walks into the wall cell → wall pushes open (tween animation sliding aside)
- Grid char changes to `.`, wall geometry removed, entity removed
- No HP, no combat — pure exploration discovery

```jsonc
{
  "type": "secret_wall",
  "col": 7, "row": 3
}
```

The charDef for the secret wall cell should be subtly different from regular walls — observant players notice the texture difference.

---

## Pushable Blocks

- Entity type: `block`
- Placed on walkable cell, blocks movement (like an enemy with `blocksMovement: true`)
- Player presses interact (Space) while facing the block → block moves one cell away from player
- Movement only if destination cell is walkable, not occupied by enemy/block/player, and door (if any) is open
- Blocks can rest on pressure plates (activating them)
- Blocks cannot be pulled, only pushed
- Enemies cannot push blocks

```jsonc
{
  "type": "block",
  "col": 4, "row": 4
}
```

### Rendering
- 3D cube mesh (stone texture), slightly smaller than cell
- Smooth tween animation when pushed (like enemy movement lerp)

---

## Treasure Chests

- Entity type: `chest`
- Three states: `closed`, `open`, `locked`
- Interact (Space) while facing → opens if unlocked, shows loot
- Key-locked: requires `keyId` (reuses existing key system)
- Signal-controlled: can be opened/sealed via signal (e.g. trap chest)
- Has loot table (same format as enemy drops)
- Animated lid opening

```jsonc
{
  "type": "chest",
  "col": 5, "row": 5,
  "keyId": "gold_key",           // optional, for locked chests
  "gateMode": "or",              // optional, for signal-controlled
  "drops": {
    "guaranteed": [{ "itemId": "sword_iron", "quality": "fine" }],
    "extra": [{ "itemId": "gold_ring", "chance": 0.5 }]
  }
}
```

---

## Tripwires & Invisible Triggers

### Tripwire
- Entity type: `tripwire`
- Player crosses the cell → emits signal to `targets`
- DEX-gated visibility: invisible by default, but players with DEX ≥ threshold see a faint line
- Can be one-shot or repeatable (`signalMode`)

```jsonc
{
  "type": "tripwire",
  "col": 3, "row": 5,
  "targets": ["trap_launcher_1"],
  "signalMode": "one_shot",
  "visibilityThreshold": 8   // DEX needed to see it
}
```

### Invisible Trigger
- Entity type: `trigger`
- Player enters cell → emits signal
- Always invisible (no DEX check)
- Like a pressure plate but with no visual and no physical presence

```jsonc
{
  "type": "trigger",
  "col": 3, "row": 5,
  "targets": ["door_1"],
  "signalMode": "momentary"
}
```

---

## Message Signs / Tablets

- Entity type: `sign`
- Player interacts (Space) while facing → scroll-style overlay popup with text
- Dismiss with any key/click
- Pixelart parchment border, styled text

```jsonc
{
  "type": "sign",
  "col": 3, "row": 5,
  "wall": "N",
  "text": "Beware: the floor ahead is trapped."
}
```

---

## Save/Load System

### Save Data Structure

```ts
interface SaveData {
  version: string;              // save format version
  timestamp: number;            // Date.now()
  dungeonName: string;
  currentLevelId: string;
  playerState: {
    hp: number; maxHp: number;
    str: number; dex: number; vit: number; wis: number;
    xp: number; level: number; attributePoints: number;
    playerName: string; gold: number;
    torchFuel: number; maxTorchFuel: number;
    atk: number; def: number;
    statusEffects: StatusEffect[];
  };
  playerPosition: { col: number; row: number; facing: Facing };
  inventory: ItemEntity[];      // entity registry snapshot
  levelSnapshots: Record<string, SerializedLevelSnapshot>;
  activeLevelSnapshot: SerializedLevelSnapshot;
}
```

### Storage

- **localStorage**: keyed by `delveward_save_1` through `delveward_save_5` (5 slots)
- **Auto-save**: `delveward_autosave` — written on every stair transition
- **Export**: download as `.json` file
- **Import**: upload `.json` file, validate version, load

### UI

- **Save menu**: opened via Escape or dedicated key, shows slots with timestamp + level name
- **Death**: "Load last save?" prompt with slot selection
- **Main menu** (stretch): title screen with New Game / Load Game / Continue

### Serialization

Maps and Sets need conversion to/from JSON:
- `Map<string, T>` → `Record<string, T>` (Object.fromEntries / Object.entries)
- `Set<string>` → `string[]` (spread / new Set)

---

## Test Dungeon for M2

**"The Architect's Tomb"** — A 3-level trap-heavy puzzle dungeon.

- Level 1: Introduction — tripwires, dart traps, a secret wall, message signs explaining mechanics
- Level 2: Puzzle rooms — pushable blocks on plates, AND-gated doors, timed sequences
- Level 3: The tomb — fireball corridor, breakable wall to treasure room, locked chest with boss key

Specific features to showcase:
- At least one of each new entity type
- Signal chains (tripwire → delay → trap launcher)
- AND gate puzzle (two levers must both be pulled)
- Pushable block on pressure plate to hold door open
- Secret wall leading to treasure chest
- Breakable wall with loot drops
- Status effects from spider poison + fireball burning
- Save/load working across all 3 levels

---

## Implementation Order

### Phase A: Signal System Foundation
1. Migrate `target: string` → `targets: string[]` across codebase + dungeon_m1.json
2. Signal state tracking: `SignalState` map in GameState (which sources are active)
3. Gate mode evaluation on receivers (OR/AND/XOR)
4. Signal behaviors on sources (toggle, momentary, one_shot, timed)
5. New entity types: `trigger`, `tripwire`
6. Standalone gate entities: AND, OR, NOT, DELAY, PULSE_EDGE, PULSE_REPEAT
7. Editor updates: new entity types in palette, targets array in inspector
8. Tests

### Phase B: Projectile System
9. Projectile data model + ProjectileManager
10. Projectile movement, collision detection, damage application
11. Trap launcher entity (signal-activated)
12. 3 projectile types: dart, arrow, fireball
13. Projectile rendering (billboard sprites, movement interpolation)
14. Tests

### Phase C: Status Effects
15. StatusEffect data model on GameState + EnemyInstance
16. Effect tick logic in enemy AI loop + main game loop
17. Poison (spider onHit behavior), slow, burning (fireball)
18. HUD status icons + visual tint overlays
19. Tests

### Phase D: Environment Entities
20. Breakable walls (HP, combat interaction, grid mutation, optional drops)
21. Secret walls (walk-into detection, grid mutation, charDef)
22. Pushable blocks (interact to push, pressure plate interaction, pathfinding)
23. Treasure chests (open/locked/signal states, loot, animation)
24. Message signs (scroll-style popup overlay)
25. Renderers for all new entity types
26. Tests

### Phase E: Save/Load
27. Save data serialization (Maps → Records, Sets → arrays)
28. localStorage read/write with slot management
29. Auto-save on stair transition
30. Save/load UI (menu overlay, slot display, death prompt)
31. Export/import JSON
32. Death → load last save behavior
33. Tests

### Phase F: Content & Polish
34. New charDef textures (cracked wall, mossy wall)
35. Projectile sprites (dart, arrow, fireball)
36. Status effect visuals (tint overlays, HUD icons)
37. Editor updates for all new entity types
38. M2 test dungeon: "The Architect's Tomb" (3 levels)
39. Playtesting & balance pass
