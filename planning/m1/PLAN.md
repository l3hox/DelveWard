# Milestone 1 — Implementation Plan

**Target version:** v0.1
**Status:** Phase A — ready to implement

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| A | Data Foundation | — | Next |
| B | Stats & Leveling | A | Pending |
| C | Equipment Expansion | A | Pending |
| D | Loot & Drops | B, C | Pending |
| E | UI | B, C, D | Pending |
| F | Content | E | Pending |

---

## Phase A — Data Foundation

Backbone of M1. Everything else depends on this. Run as first swarm.

**Swarm structure — two waves:**

Wave 1 (parallel):
- Agent 1: A1 — `itemDatabase.ts`
- Agent 2: A2 — `entities.ts`

Wave 2 (after wave 1, parallel):
- Agent 3: A3 + A4 — GameState migration + renderer re-wire
- Agent 4: A5 — tests

### Tasks

| # | File(s) | Description |
|---|---|---|
| A1 | `src/core/itemDatabase.ts` | Types (`ItemDef`, `ItemStats`, `ItemModifier`, quality/subtype enums), `loadItemDatabase()`, `getItem(id)`, `getItemsByType()` |
| A2 | `src/core/entities.ts` | `ItemLocation` union, `EquipSlot` (3→10 slots), `ItemEntity`, `EntityRegistry` class with `addItem`, `moveItem`, `getGroundItems`, `getBackpackItems`, `getEquipped` |
| A3 | `src/core/gameState.ts` | Replace `equipment`/`backpack`/`groundItems`/`groundConsumables` with `EntityRegistry`; add `getEffectiveStats()` (replacing `getEffectiveAtk`/`getEffectiveDef`); update `LevelSnapshot`; `_parseEntities` creates `ItemEntity` instances from JSON |
| A4 | `src/rendering/itemRenderer.ts`, `consumableRenderer.ts`, `src/hud/inventoryPanel.ts` | Re-wire to query `EntityRegistry` instead of old split maps |
| A5 | `src/core/itemDatabase.test.ts`, `src/core/entities.test.ts` | Loader, query, location transitions, equip/unequip, pickup |

---

## Phase B — Stats & Leveling

**Depends on:** Phase A complete

| # | Description |
|---|---|
| B1 | Add `str`/`dex`/`vit`/`wis` to `GameState`; wire `getEffectiveStats()` into combat (replaces `getEffectiveAtk`/`getEffectiveDef` calls in `combat.ts`) |
| B2 | XP tracking + level-up logic (`GameState`): triangular XP curve (`100 × N × (N+1) / 2`), level cap 15, +3 attribute points per level-up |
| B3 | Character creation screen — canvas overlay before dungeon loads: name input (optional, defaults "Adventurer"), 5 points to distribute across 4 stats, Begin button |
| B4 | Level-up popup HUD — attribute point allocation panel, openable via Tab, bank points for later |
| B5 | Tests: derived stat formulas, XP curve thresholds, level-up point accumulation |

**Derived stats (M1):**
```
Max HP     = 40 + VIT × 5
Melee ATK  = weapon.stats.atk + floor(STR / 2)
DEF        = sum(equipped armor def) + floor(VIT / 4)
Crit %     = 5 + floor(DEX / 3) + weapon crit bonus
Dodge %    = floor((DEX - 5) / 4)  [capped 25%]
WIS        = no M1 effect, reserved for M4 mana — annotate clearly in code
```

---

## Phase C — Equipment Expansion

**Depends on:** Phase A complete. Can run in parallel with Phase B.

| # | Description |
|---|---|
| C1 | Weapon subtype behavior: per-type cooldown + damage multiplier (sword 0.8s ×1.0 / axe 1.2s ×1.5 ignore 1 DEF / dagger 0.5s ×0.7 +10% crit / mace 1.1s ×1.3 +2 vs armored / spear 0.9s ×1.1 hits 2 cells deep) |
| C2 | STR/DEX requirement check on equip — show HUD message if unmet, prevent equip |
| C3 | Armor DEF aggregation via `getEffectiveStats()` (plugged in alongside weapon subtype) |
| C4 | Tests: weapon subtypes, cooldown values, spear 2-cell range, requirement enforcement, armor stacking |

**Weapon type table:**
| Type | Cooldown | Dmg mult | Special | STR req |
|---|---|---|---|---|
| Sword | 0.8s | ×1.0 | — | 3 |
| Axe | 1.2s | ×1.5 | Ignores 1 DEF | 6 |
| Dagger | 0.5s | ×0.7 | +10% crit | 0 |
| Mace | 1.1s | ×1.3 | +2 dmg vs armored | 5 |
| Spear | 0.9s | ×1.1 | Hits 2 cells deep | 4 |

---

## Phase D — Loot & Drops

**Depends on:** Phases B and C complete

| # | Description |
|---|---|
| D1 | `src/core/lootTable.ts` — load `public/data/loot-tables.json`, quality roll (poor 10% / common 50% / fine 25% / masterwork 12% / enchanted 3%), random Enchanted modifier assignment, `suppressTable`/`guaranteed`/`extra` override logic |
| D2 | Enemy death → loot roll → spawn `ItemEntity` instances on ground at enemy cell (adjacent if occupied). Wire into `damageEnemy` in `GameState` or kill handler in `main.ts` |
| D3 | `gold` counter on `GameState`; drop random gold on kill (ranges per enemy type from loot tables); gold persists across levels |
| D4 | Tests: quality distribution over many rolls (statistical), override logic (`suppressTable`, `guaranteed`, `extra`), gold range rolls |

**Drop quality weights:**
| Tier | Weight |
|---|---|
| Poor | 10% |
| Common | 50% |
| Fine | 25% |
| Masterwork | 12% |
| Enchanted | 3% |

Note: dropped item quality is rolled at death time and set on the `ItemEntity` instance — never mutate the `ItemDef` from the database.

---

## Phase E — UI

**Depends on:** Phases B, C, D complete

| # | Description |
|---|---|
| E1 | Enemy health bars — `THREE.Sprite` (camera-facing) above each enemy billboard; canvas-drawn red/grey HP bar; update texture on HP change; hide on enemy death |
| E2 | Paper doll panel redesign in `src/hud/inventoryPanel.ts` — 10 equipment slots layout, 12-slot backpack grid (3×4), gold display |
| E3 | Item tooltips + stat comparison — show on hover/selection: name, quality, stats, requirements, delta vs currently equipped (green/red) |
| E4 | Gold display in HUD inventory area |

**Inventory interaction model:**
- `I` key toggles inventory open/closed
- Game pauses while inventory is open
- Arrow keys navigate slots
- Enter/Space: equip from backpack → slot, or unequip to backpack
- `D` while selecting: drop item to ground under player

---

## Phase F — Content

**Depends on:** Phase E complete

| # | Description |
|---|---|
| F1 | 6 new enemy types in `src/enemies/enemyTypes.ts`: goblin, giant_bat, spider, kobold, zombie, troll — with stats from `planning/m1/ENEMIES.md` |
| F2 | 3 new AI behaviors in `src/enemies/enemyAI.ts`: flee state (kobold — inverse BFS below 30% HP, double speed), erratic movement (bat — random cell chance per tick), HP regen (troll — +2 HP/2s, paused 3s after hit) |
| F3 | 6 new enemy billboard sprites (pixelart, same pipeline as rat/skeleton/orc) |
| F4 | `public/dungeons/dungeon_m1.json` — 3-level M1 dungeon: Level 1 tutorial (rats + skeletons, basic loot), Level 2 mid (harder enemies, locked rooms), Level 3 hard (orcs + mixed, boss orc with guaranteed fine drop, exit treasure) |
| F5 | Playtesting pass: balance XP curve, drop rates, enemy density, verify level 4-5 reachable by end of run |

**New enemy roster:**
| Enemy | ATK | DEF | HP | Move | Special |
|---|---|---|---|---|---|
| Giant Bat | 1 | 0 | 6 | 400ms | Erratic movement |
| Goblin | 2 | 0 | 10 | 500ms | — |
| Spider | 3 | 0 | 14 | 600ms | Poison tag (M2, no M1 effect) |
| Kobold | 2 | 1 | 12 | 700ms | Flee below 30% HP |
| Zombie | 3 | 1 | 50 | 1600ms | — |
| Troll | 5 | 2 | 80 | 1200ms | HP regen +2/2s |

---

## Open Questions

Decide before or during implementation:

| # | Question | Default / Lean |
|---|---|---|
| M1-1 | Inventory open: pause or real-time? | **Pause** — safer, more readable for M1 |
| M1-4 | Spear 2-cell: hits both cells or only furthest? | TBD |
| M1-5 | Character creation: mandatory or skippable? | TBD — skippable = default 5/5/5/5 |

---

## Success Criteria

M1 is done when:
- Kill an enemy → item visibly drops → pick it up → equip it → stats change
- Level-up triggers, attribute points allocated, max HP increases
- Paper doll shows all 10 slots with equipped items
- Gold accumulates and is displayed
- Enemy health bars visible in combat
- 3-level dungeon is playable start to finish (~20 minutes)
- All 281 existing tests still pass, new tests cover entity registry + stats + leveling + loot
