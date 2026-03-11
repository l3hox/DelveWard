# Milestone 1: The Loot Game — Design Doc

**Version target:** v0.1
**Theme:** "I killed a thing and got a cool sword."
**Goal:** The core RPG loop. Kill → loot → equip → get stronger → repeat. Addictive.

---

## What We're Actually Building

M1 is the moment this becomes a *game* rather than a demo. Right now the combat exists but there's no reason to care — one sword, one shield, fixed stats, no progression. After M1:

- Enemies drop loot when they die
- Items have real variety (weapon types, armor slots, quality tiers)
- Stats are meaningful (STR makes you hit harder, DEX makes you crit, VIT gives more HP)
- You level up and feel yourself getting stronger
- Gold exists for later (M3 shops), but is already being accumulated

---

## Scope

Features in M1 (from MILESTONES-V2.md, fleshed out):

| # | Feature | Notes |
|---|---|---|
| N1 | Entity-component model | Refactor backbone — scoped to what M1 needs |
| N4 | Central item database | JSON item registry |
| I1 | Item architecture | Full data model |
| I2 | Weapon types | Sword, axe, dagger (bow deferred to M4) |
| I3 | Armor system | 6 slots (head/chest/legs/hands/feet/shield) |
| I4 | Accessories | Ring ×2, amulet ×1 |
| I5 | Consumables | Potions, torch oil (scrolls deferred — no spells yet) |
| I7 | Equipment UI | Paper doll, backpack, tooltips, comparison |
| I8 | Item quality tiers | 4 tiers: Common → Fine → Masterwork → Enchanted |
| I9 | Enemy drops + loot tables | Per-enemy loot table, ground drop entities |
| R1 | Core attributes | STR / DEX / VIT / WIS — derived stats wired into combat |
| R2 | XP and leveling | XP from kills, level-up with attribute points |
| R6 | Gold currency | Drops from enemies, no shop yet (M3) |
| C8 | Enemy health bars | Floating bar above sprites |

**Explicitly deferred from M1:**
- Ranged combat (bow/crossbow) → M4
- Spell schools / mana → M4
- Hunger → M3
- NPCs, dialog, shops → M3
- Save/load → M2
- Armor class weight penalties → post-M1 tuning
- Durability → M1 items have no degradation
- Set bonuses → post-M1
- Cursed items → post-M1

---

## Decisions Made (Open TBDs Resolved for M1)

### Class system (TBD-2)
**Decision: Classless for M1.**
No class at character creation. Player distributes 5 attribute points at start (all stats start at base 5). Each level-up grants 3 points. Identity comes from gear and stat choices. Classes/specializations remain on the roadmap but are not M1.

Rationale: classless is simpler to implement, fully playable, and lets the loot variety carry the differentiation. The item database is the class system in disguise.

### Death model (TBD-6)
**Decision: Keep current "restart level" for M1.**
No save/load until M2. Death = restart current level, keep nothing. This is fine for M1 — the dungeon is short enough. Full save/load gets designed properly in M2 when the entity system is stable.

### Inventory size (TBD-7)
**Decision: 12-slot backpack.**
Current 8 is too tight with 9 equipment slots added. 12 gives room to accumulate loot without feeling bottomless. No expandable bags in M1.

### Weight/encumbrance (TBD-8)
**Decision: No weight system in M1.**
Items have a `weight` field in the data model (for future use), but no carry capacity enforcement. Keep friction low during the first playthrough of M1 content.

### Skill progression (TBD-5)
**Decision: Deferred.**
No skill system in M1. Skills (lockpicking, trap disarm, etc.) are M2+ content when traps and locks become relevant. The stat system is enough for M1 progression feel.

---

## Architecture: Entity-Component Model (M1 Scope)

The current codebase has ad-hoc entity handling — enemies in their own system, items scattered across `GameState`, renderers manually managed in `main.ts`. M1 needs a unified entity model because:
- Items need to exist in three states: **world** (ground), **inventory** (backpack), **equipped** (slot)
- Enemy drops need to create world-state item entities dynamically
- The paper doll needs to query what's equipped in each slot

### What "entity-component" means for M1
Not a hardcore ECS (entity IDs + separated component arrays). That's premature. Instead: **a typed entity registry with composable data shapes**.

Every game object (enemy, item on ground, NPC later) is an `Entity` with:
- A unique `id` (UUID or incrementing int)
- A `type` tag (`enemy` | `item` | `consumable` | `npc` | ...)
- A component payload typed to that entity type
- A `worldPos` if it exists in the level (or `null` if in inventory)

Items specifically have a `location` discriminant:
```
type ItemLocation =
  | { kind: 'world'; levelId: string; col: number; row: number }
  | { kind: 'backpack'; slot: number }
  | { kind: 'equipped'; slot: EquipSlot }
```

This replaces the current split between `GameState.equipment`, `GameState.backpack`, and renderer-tracked ground items. One item object, one source of truth.

### What does NOT change in M1
- Enemy AI system stays as-is (EnemyState in its own module)
- Dungeon level data (grid arrays, charDefs) stays as JSON
- Three.js scene management stays in `main.ts`
- We're not rebuilding the engine — we're adding a data layer on top

### Files affected
- `src/core/entities.ts` — new: entity registry, item location model
- `src/core/gameState.ts` — refactor: equipment/backpack/ground items migrate to entity registry
- `src/core/itemDatabase.ts` — new: load and query central item DB
- `public/data/items.json` — new: central item registry
- `src/rendering/` — item/consumable renderers updated to query entity registry

---

## Item Data Model

### Central Item Database (`public/data/items.json`)

All items defined here, referenced by `itemId` everywhere (dungeon JSON, loot tables, level code).

```jsonc
{
  "items": [
    {
      "id": "sword_rusty",
      "name": "Rusty Sword",
      "type": "weapon",
      "subtype": "sword",
      "quality": "common",
      "icon": "sword",           // maps to sprite/texture name
      "weight": 4,               // future use
      "value": 5,                // gold value (sell price)
      "description": "A battered old blade. Still sharp enough.",
      "stats": {
        "atk": 3
      },
      "modifiers": [],
      "requirements": { "str": 0 }
    },
    {
      "id": "sword_iron",
      "name": "Iron Sword",
      "type": "weapon",
      "subtype": "sword",
      "quality": "common",
      "icon": "sword",
      "weight": 5,
      "value": 20,
      "description": "Standard military issue. Reliable.",
      "stats": {
        "atk": 5
      },
      "modifiers": [],
      "requirements": { "str": 4 }
    }
  ]
}
```

### Item Shape (TypeScript)

```ts
type ItemQuality = 'poor' | 'common' | 'fine' | 'masterwork' | 'enchanted';
type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable';
type WeaponSubtype = 'sword' | 'axe' | 'dagger' | 'mace' | 'spear' | 'staff';
type ArmorSubtype = 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'shield';
type AccessorySubtype = 'ring' | 'amulet';
type ConsumableSubtype = 'health_potion' | 'mana_potion' | 'torch_oil' | 'antidote';

interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  subtype: WeaponSubtype | ArmorSubtype | AccessorySubtype | ConsumableSubtype;
  quality: ItemQuality;
  icon: string;
  weight: number;
  value: number;
  description: string;
  stats: ItemStats;         // raw stat bonuses
  modifiers: ItemModifier[]; // prefix/suffix modifiers
  requirements: { str?: number; dex?: number; vit?: number; wis?: number };
}

interface ItemStats {
  atk?: number;
  def?: number;
  hp?: number;       // max HP bonus
  mp?: number;       // max MP bonus (M4)
  str?: number;
  dex?: number;
  vit?: number;
  wis?: number;
  critChance?: number;  // %
  dodgeChance?: number; // %
}
```

### Item Quality Tiers

Quality multiplies base stats and may add special effects.

| Tier | Multiplier | Special | Color | Drop weight |
|---|---|---|---|---|
| Poor | ×0.7 | None | Grey | 10% |
| Common | ×1.0 | None | White | 50% |
| Fine | ×1.3 | None | Green | 25% |
| Masterwork | ×1.7 | +1 stat bonus | Blue | 12% |
| Enchanted | ×2.2 | Named modifier (fire damage, life steal, etc.) | Gold | 3% |

Poor items are functional but noticeably weaker than the base stat — junk finds that create a clear "upgrade me" feeling. Worth vendoring when shops arrive (M3).

Quality is set in the item DB (hand-authored). Random loot from drops uses a weighted roll against this table (see Loot Tables). Quality can also be overridden per-entity in dungeon JSON (see Drops Override below).

### Item Modifiers (Enchanted tier only)

```ts
interface ItemModifier {
  id: string;          // e.g. "fire_damage"
  name: string;        // e.g. "of Flame"
  effect: string;      // e.g. "Deals 1-3 bonus fire damage per hit"
  stats?: ItemStats;   // numeric stat effect
}
```

M1 ships with ~8 modifiers: `fire_damage`, `life_steal`, `bonus_str`, `bonus_dex`, `hp_regen`, `crit_bonus`, `def_boost`, `torch_range`.

---

## Equipment System Expansion

### Equipment Slots (M1)

Replacing the current 3-slot system (weapon/armor/ring):

```ts
type EquipSlot =
  | 'weapon'   // main hand
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'shield'   // off hand
  | 'ring1'
  | 'ring2'
  | 'amulet';
```

Total: 10 slots. Each slot accepts one item. Slot type validated against item subtype.

### Effective Stats (wired into combat)

`GameState` gains `getEffectiveStats()` → aggregates base attributes + all equipped item stat bonuses:

```
effectiveAtk  = baseAtk + STR modifier + weapon.stats.atk
effectiveDef  = baseDef + VIT modifier + sum(equipped armor.stats.def)
effectiveMaxHp = baseHp + VIT × 5 + sum(equipped items hp bonus)
critChance    = 5% + DEX modifier + sum(equipped items critChance)
```

---

## Core Attributes (RPG Stats)

### The Four Stats

| Stat | Base | Per point gained | Notes |
|---|---|---|---|
| STR | 5 | +0.5 melee ATK | Weapon requirement check |
| DEX | 5 | +0.3% crit chance, +0.2% dodge | Affects dagger speed multiplier |
| VIT | 5 | +5 max HP | Affects HP regen rate at rest |
| WIS | 5 | +5 max MP (M4) | No M1 effect beyond MP pool |

### Starting Point Pool
- All stats start at 5
- Player gets 5 points to distribute at start
- Each level-up: +3 points

### Derived Stats (M1)
```
Max HP     = 40 + VIT × 5
Melee ATK  = weapon.stats.atk + floor(STR / 2)
DEF        = sum(equipped armor def) + floor(VIT / 4)
Crit%      = 5 + floor(DEX / 3) + weapon crit bonus
Dodge%     = 0 + floor((DEX - 5) / 4)  [diminishing, capped 25%]
```

WIS is a placeholder in M1 — it has no mechanical effect until M4 (mana). Don't hide it; display it as "Wisdom — used for magic (not yet)."

### Character Creation Screen
First thing the player sees. Simple overlay before the dungeon loads:
- Name input (optional, defaults to "Adventurer")
- 4 stat bars showing current allocation, +/- buttons, 5 points pool
- Brief one-liner per stat ("Strength — melee damage and weapon requirements")
- "Begin" button

---

## XP & Leveling

### XP Sources
| Action | XP |
|---|---|
| Kill rat | 10 |
| Kill skeleton | 25 |
| Kill orc | 50 |
| First time entering a new cell | 1 |
| *(M3)* Quest complete | varies |

### XP Curve
Level N requires: `100 × N × (N + 1) / 2`
→ L1: 100, L2: 300, L3: 600, L4: 1000, L5: 1500 ...

Level cap: **15** for M1. Enough to feel progression without needing massive content volume.

On level-up:
- +3 attribute points (player allocates immediately or buffers for later)
- Max HP recalculated (feels like a reward)
- Brief HUD flash: "Level Up! [N]"

### Level-Up UI
A small popup (or HUD panel) showing the 3 points to distribute. Same style as character creation. Can open/close with Tab. Points don't expire — can bank them and allocate later.

---

## Gold

- Enemies drop gold on death (random range per type): rat 1-3g, skeleton 5-10g, orc 15-25g
- Gold displayed in HUD inventory area (bottom corner)
- No spending in M1 — shops are M3. Gold accumulates.
- Gold is not an item in the backpack. It's a separate `gold` counter on `GameState`.
- Some loot chests (M2) will also contain gold.

---

## Enemy Drops & Loot Tables

### Loot Table Format (in `public/data/loot-tables.json`)

```jsonc
{
  "rat": {
    "gold": [1, 3],
    "drops": [
      { "itemId": "health_potion_small", "chance": 0.15 },
      { "itemId": "torch_oil",           "chance": 0.10 }
    ]
  },
  "skeleton": {
    "gold": [5, 10],
    "drops": [
      { "itemId": "sword_rusty",          "chance": 0.20 },
      { "itemId": "armor_leather_chest",  "chance": 0.15 },
      { "itemId": "health_potion_small",  "chance": 0.25 },
      { "itemId": "bone",                 "chance": 0.40 }
    ]
  },
  "orc": {
    "gold": [15, 25],
    "drops": [
      { "itemId": "sword_iron",           "chance": 0.15 },
      { "itemId": "armor_iron_chest",     "chance": 0.10 },
      { "itemId": "health_potion_medium", "chance": 0.30 },
      { "itemId": "club_heavy",           "chance": 0.12 }
    ]
  }
}
```

Each drop is rolled independently (not exclusive). A skeleton could drop both a sword and a potion.

### Quality Roll on Drop
When an enemy drops a weapon or armor:
- 60% Common
- 25% Fine
- 12% Masterwork
- 3% Enchanted

Enchanted items get a random modifier from the modifiers table.

### Drops Override (per-entity in dungeon JSON)

Random loot tables are the floor. Intentional design is the ceiling. Any enemy entity in dungeon JSON can carry a `drops` override that replaces or augments the loot table for that specific instance.

```jsonc
{
  "type": "enemy",
  "enemyType": "orc",
  "col": 5, "row": 3,
  "drops": {
    "guaranteed": [
      { "itemId": "sword_iron", "quality": "fine" }
    ],
    "extra": [
      { "itemId": "health_potion_medium", "chance": 1.0 }
    ],
    "suppressTable": false
  }
}
```

Fields:
- `guaranteed` — items always dropped, quality optionally forced (bypasses quality roll)
- `extra` — additional rolls on top of the base loot table (not instead of)
- `suppressTable` — set `true` to skip the base loot table entirely (only `guaranteed` + `extra` drop)

**Design intent:** the dungeon designer controls progression pacing. Key upgrades — the first decent sword, the first piece of real armor — are placed on specific named enemies rather than left to chance. Random drops fill in variety and keep replays fresh. The override system makes it trivial to say "this orc captain always drops a fine axe" without touching the global loot table.

### Rendering Drops
When an enemy dies, its loot is resolved immediately (random rolls + overrides applied), and any items are spawned as ground entities on the enemy's cell (or adjacent if occupied). The existing item/consumable billboard renderers handle display. Inventory pickup on step stays the same.

---

## Equipment UI (Paper Doll)

The current inventory panel (bottom-right HUD) gets a full redesign. The paper doll is the centrepiece of M1's feel.

### Layout (640×360 canvas, bottom-right region)

```
┌────────────────────────────────┐
│  [HEAD]                        │
│  [CHEST]  [BODY]  [SHIELD]     │  ← Paper doll silhouette in center
│  [LEGS]   [BODY]  [RING1]      │
│  [HANDS]         [RING2]       │
│  [FEET]          [AMULET]      │
│  [WEAPON]                      │
├────────────────────────────────┤
│  Backpack (12 slots, 3×4 grid) │
├────────────────────────────────┤
│  Gold: 42g   Level: 3   XP bar │
└────────────────────────────────┘
```

The paper doll silhouette is a simple pixelart humanoid outline. Slots highlight when an equippable item is in backpack (showing it fits there).

### Tooltips
Hover (or cursor-select with keyboard) over any item slot shows:
```
Iron Sword [Fine]
ATK +7 | Crit +1%
Requires STR 4
"Standard military issue."
▼ vs equipped: ATK +2 ▲
```

Comparison line is green/red for better/worse. Only shown when a weapon is equipped in that slot.

### Interaction model
- `I` key toggles inventory open/closed
- Game pauses while inventory is open (or real-time? TBD — pause feels better for M1)
- Arrow keys navigate slots
- Enter/Space: equip from backpack → slot, or unequip to backpack
- Drop key (D while selecting): drop item to ground under player

---

## Enemy Health Bars

Simple floating bar above each enemy billboard sprite. Visible always (not just on hit — simpler to implement and arguably more readable for a grid crawler).

```
Enemy cell
   ┌──────────────┐
   │ ████████░░░░ │  ← HP bar, red fill, gray background
   └──────────────┘
       [sprite]
```

Implementation: a `THREE.Sprite` (camera-facing) per enemy, rendered above the enemy billboard. Canvas-drawn bar texture, updated on HP change. Disappears when enemy is dead (mesh removed).

---

## Weapon Types (M1 Melee Only)

Bows deferred to M4 (needs projectile system). M1 ships:

| Type | Cooldown | Damage Mult | Special | STR req |
|---|---|---|---|---|
| Sword | 0.8s (current) | ×1.0 | — | 3 |
| Axe | 1.2s | ×1.5 | Ignores 1 DEF | 6 |
| Dagger | 0.5s | ×0.7 | +10% crit | 0 |
| Mace | 1.1s | ×1.3 | Bonus vs armored (+2 dmg) | 5 |
| Spear | 0.9s | ×1.1 | Attacks 2 cells deep | 4 |

**Spear** is the interesting one: it hits the cell the player faces AND the cell beyond that. Useful for attacking through a crowd or hitting an enemy before it reaches you. Requires the projectile check to be directional-range instead of facing-only.

All melee uses the F key. Cooldown is per-weapon, displayed in the weapon slot.

---

## Armor System (M1)

6 physical slots + 3 accessory slots. All provide DEF. Some provide minor stat bonuses (Enchanted tier).

### M1 Armor Items (representative set — full DB in items.json)

**Head:** Leather Cap, Iron Helm, Mage Hood
**Chest:** Leather Vest, Chainmail, Plate Armor
**Legs:** Leather Greaves, Iron Greaves
**Hands:** Leather Gloves, Iron Gauntlets
**Feet:** Leather Boots, Iron Sabatons
**Shield:** Wooden Buckler, Iron Kite Shield

No light/medium/heavy penalty in M1 (deferred). Just DEF values.

---

## Consumables Expansion

Current system stays; expand item types and make them come from the item DB.

| Item | Effect | Stack size |
|---|---|---|
| Health Potion (Small) | +15 HP | 10 |
| Health Potion (Medium) | +35 HP | 5 |
| Torch Oil | +50 torch fuel | 5 |
| Antidote | Cure poison (M2 status effects) | 5 |

Scrolls (one-time spell use) → deferred to M4. No spells yet.
Rations → deferred to M3 (hunger system).

---

## Test Dungeon for M1

The existing `dungeon1.json` gets replaced or expanded into a proper M1 showcase dungeon. Design spec:

- **3 levels** (not 2)
- Level 1: Tutorial — a few rats and skeletons, basic loot, clear signposting
- Level 2: Mid — harder enemies, better drops, locked rooms requiring exploration
- Level 3: Hard — orcs + mixed groups, rare loot, boss orc guarding exit treasure

Enemy density: enough to reach level 4-5 by completing all 3 levels. The arc should feel like a complete run.

Specific features to showcase:
- At least one of each weapon type on the ground or in a chest area
- Enemy drops working visibly (kill skeleton, see sword drop)
- HP bar on enemies showing when to flee vs press
- Level-up happening at least twice per playthrough
- Gold accumulating, displayed in HUD

---

## Implementation Order

The natural build sequence for M1:

### Phase A: Data Foundation
1. `public/data/items.json` — author the full item database
2. `public/data/loot-tables.json` — author loot tables per enemy type
3. `src/core/itemDatabase.ts` — loader + query functions
4. `src/core/entities.ts` — entity registry, item location model
5. Migrate existing equipment/backpack/ground items to entity registry
6. Tests for entity registry and item DB

### Phase B: Stats & Leveling
7. Add STR/DEX/VIT/WIS to `GameState`
8. `getEffectiveStats()` wired into combat (replaces `getEffectiveAtk`/`getEffectiveDef`)
9. XP tracking, level-up logic, attribute points
10. Character creation screen (stat point allocation UI)
11. Tests for stat derivation and leveling

### Phase C: Equipment Expansion
12. Expand equipment slots (3 → 10)
13. Weapon subtype behavior (cooldown/damage variants, spear 2-cell)
14. Armor DEF aggregation wired into combat
15. Item requirement enforcement (STR/DEX checks on equip)
16. Tests for equipment

### Phase D: Loot & Drops
17. Enemy death → loot roll → spawn ground entities
18. Gold drop + accumulation in GameState
19. Item quality roll on drop + Enchanted modifier assignment
20. Tests for loot tables

### Phase E: UI
21. Enemy health bars (HP sprite above billboard)
22. Paper doll / equipment UI redesign
23. Backpack expansion (8 → 12 slots)
24. Item tooltips + stat comparison
25. Level-up popup + attribute point allocation UI
26. Gold display in HUD

### Phase F: Content
27. Full `items.json` — all M1 weapons, armor, accessories, consumables (~40-60 items)
28. M1 test dungeon (3 levels, proper enemy/item placement)
29. Playtesting pass

---

## Open Questions (decide before or during implementation)

| # | Question | Options | Affects |
|---|---|---|---|
| M1-1 | Inventory open: pause or real-time? | Pause (safer, more readable) vs Real-time (tense) | UI design |
| M1-2 | Attribute point allocation: immediate on level-up vs banked? | Immediate popup vs banked (Tab to open anytime) | UX |
| M1-3 | Item comparison: show absolute values vs delta? | Both shown? | Tooltip design |
| M1-4 | Spear 2-cell attack: does it hit both cells or just the second? | Both (more useful) vs only furthest (more unique) | Combat feel |
| M1-5 | Character creation: mandatory or skippable? | Skip = default classless 5/5/5/5 | UX |
| M1-6 | WIS display: show but grey-out, or hide? | Show (build anticipation for M4) vs hide (avoid confusion) | UI |

---

## Success Criteria

M1 is done when:
- Kill an enemy → item visibly drops → pick it up → equip it → stat changes are reflected
- Level-up triggers, attribute points allocated, HP increases
- Paper doll shows all 10 slots with equipped items
- Gold accumulates and is displayed
- Enemy health bars visible in combat
- 3-level dungeon is playable start to finish in ~20 minutes
- All 281 existing tests still pass, new tests cover entity registry + stats + leveling + loot
