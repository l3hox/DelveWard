# Milestone 1 — Architecture Decision Records

Three ADRs covering the major decisions made during M1 design. Each records what was decided, why, what was rejected, and what the known consequences and risks are.

---

## ADR-M1-01 — Entity & Item Architecture

**Status:** Accepted
**Date:** 2026-03-11

### Context

The v1 codebase has no unified entity model. Items exist across three separate collections in `GameState`: `equipment` (3 slots), `backpack` (8 slots), and two ground maps (`groundItems`, `groundConsumables`) keyed by `"col,row"` string. Renderers track ground items independently. M1 introduces 10 equipment slots, enemy loot drops, and the requirement that a single item move fluidly between world, inventory, and equipped states without losing identity. The split state model cannot support this without introducing multi-system synchronisation bugs.

### Decision

Introduce a **typed entity registry** with composable data shapes. This is deliberately not a hardcore ECS (no separated component arrays, no entity-as-integer-ID). Instead, every game object is a typed record with a discriminant `type` tag and a component payload typed to that tag.

Items specifically gain an `ItemLocation` discriminant union:

```ts
type ItemLocation =
  | { kind: 'world';    levelId: string; col: number; row: number }
  | { kind: 'backpack'; slot: number }
  | { kind: 'equipped'; slot: EquipSlot }
```

One item object, one location field. Moving an item between states is a single field update, not a delete-from-one-collection-add-to-another operation.

New files: `src/core/entities.ts` (registry), `src/core/itemDatabase.ts` (loader/query).

The enemy AI system and dungeon level data (JSON grid) are explicitly left unchanged. This is a data layer addition, not an engine rebuild.

### Alternatives Considered

**Full ECS (entity IDs + separated component arrays):** Rejected. Premature for a solo project of this scale. The indirection overhead and TypeScript typing complexity outweigh the benefits. ECS shines at 10,000+ entities; M1 has at most a few hundred.

**Keep split collections, extend them:** Rejected. Adding a 4th collection for the new equipment slots and a 5th for enemy drops creates more of the same problem. The ground map keyed by string position also cannot represent multiple items on one cell, which multi-drop requires.

**Items as plain objects passed by value:** Considered and rejected — items need identity across save/load (M2) and must be referenced stably by the renderer, inventory UI, and entity registry simultaneously.

### Consequences

**Positive:**
- Single source of truth eliminates the class of bugs where ground state and backpack state diverge on level transitions
- Moving an item is one mutation instead of a cross-collection operation
- Foundation for M2 entity persistence (save/load) — entities already have stable identity and location

**Negative / Risks:**
- **Dual-write migration risk:** During the Phase A migration, `GameState` will briefly have both the old collections and the new entity registry. This window must be kept as short as possible. The migration must be treated as atomic — old collections deprecated and removed in the same PR that introduces the entity registry, not left in place as dead code.
- **Ground items map-to-array:** The existing `groundItems` / `groundConsumables` maps keyed by `"col,row"` represent at most one item per cell. M1 multi-drop (an enemy dying and dropping 2-3 items) requires the ground representation to be a map to array (or a filtered view over the entity registry by `worldPos`). This must be resolved before the loot system lands.
- **Renderer coupling:** The existing `itemRenderer.ts` and `consumableRenderer.ts` query `GameState` directly. They must be updated to query the entity registry instead. This is a breaking change to the renderer contract.

---

## ADR-M1-02 — RPG Systems Scope

**Status:** Accepted (WIS coefficient: Provisional — review at M4)
**Date:** 2026-03-11

### Context

M1 introduces RPG depth: four attributes, derived stats, XP and leveling, item quality tiers, loot tables, and enemy drops. These systems must be scoped tightly enough to ship M1 without becoming a forever project, while establishing a data model that doesn't need to be thrown away when later milestones add magic, classes, and status effects.

### Decision

**Four attributes:** STR, DEX, VIT, WIS. All start at 5. +5 points at character creation. +3 points per level-up. Level cap 15 for M1.

**Derived stats (M1 only):**
```
Max HP       = 40 + VIT × 5
Melee ATK    = weapon.stats.atk + floor(STR / 2)
DEF          = sum(equipped armor def) + floor(VIT / 4)
Crit %       = 5 + floor(DEX / 3) + weapon crit bonus
Dodge %      = floor((DEX - 5) / 4)  [capped 25%]
```

WIS is present in the data model and character creation UI but has **no mechanical effect in M1**. It is a placeholder for M4 mana. It is displayed in the UI with a note: "used for magic (not yet)."

**XP curve:** `100 × N × (N+1) / 2` (triangular numbers). L1: 100 XP, L2: 300, L3: 600, L4: 1000. Human-readable and easy to balance against content density.

**Item quality tiers:**

| Tier | Stat multiplier | Drop weight |
|---|---|---|
| Poor | ×0.7 | 10% |
| Common | ×1.0 | 50% |
| Fine | ×1.3 | 25% |
| Masterwork | ×1.7 | 12% |
| Enchanted | ×2.2 | 3% |

Quality is an explicit field on each item definition. It is not calculated at runtime from the base item.

**Loot tables** live in `public/data/loot-tables.json`. Drops are rolled independently (not exclusive — a skeleton can drop both a sword and a potion in one kill). A per-entity drops override in dungeon JSON allows designers to guarantee specific items on specific enemies (`guaranteed`, `extra`, `suppressTable` fields).

`getEffectiveStats()` replaces the existing `getEffectiveAtk()` / `getEffectiveDef()` pair, aggregating all equipped item stat bonuses plus derived attribute contributions.

### Alternatives Considered

**Exponential XP curve:** Rejected. Harder to mentally model against content volume. Triangular numbers are predictable and human-auditable.

**Runtime quality multiplier (no explicit quality per item):** Rejected. Would require every item render, tooltip, and stat query to carry a multiplier, and would prevent loot table entries from specifying exact quality. Explicit field is cleaner to author and query.

**WIS hidden until M4:** Considered. Rejected in favour of showing it greyed-out with a tooltip. Hiding it would confuse players who find WIS-scaling accessories in M1 (amulets, rings with wis bonuses are already in items.json). Showing it sets expectation without confusion.

**Single loot table roll (exclusive):** Considered. Rejected — exclusive rolls reduce average drop quantity too aggressively and make high-value enemies feel unrewarding on unlucky rolls.

### Consequences

**Positive:**
- Triangular XP curve is easy to tune: adjusting one constant (100) scales the whole curve
- Explicit quality field makes loot table authoring trivial — designers specify the tier they want
- Independent drop rolls mean enemy type identity comes through in loot (skeletons feel different from orcs)
- Designer overrides allow intentional progression pacing without touching the global loot table

**Negative / Risks:**
- **Quality-source ambiguity:** The item DB defines a canonical quality per item. The drop system rolls a quality at death time. These must not collide — dropped items must be **new instances with rolled quality**, never mutations of the DB entry. If items are passed by reference from the DB to the entity registry, a quality roll will silently corrupt the DB entry for every future query.
- **`getEffectiveStats()` is a breaking change:** The existing `getEffectiveAtk()` and `getEffectiveDef()` methods must be explicitly retired (deleted or marked `@deprecated`) when `getEffectiveStats()` lands. Leaving both alive will cause combat tests to pass against the old methods while the new aggregation is untested.
- **WIS zero-coefficient risk:** WIS is wired into `getEffectiveStats()` with a zero coefficient in M1. Future contributors must not "fix" this — annotate the derived stats function clearly: `// WIS: no M1 mechanical effect, reserved for M4 mana`. This is a provisional decision subject to review when M4 begins.
- **`suppressTable` default:** `suppressTable: false` is the default and does not need to be specified in dungeon JSON. Document this explicitly in `DUNGEON-DESIGNER.md` to avoid level designers specifying it redundantly or, worse, omitting `guaranteed` entries thinking suppressTable defaults to true.

---

## ADR-M1-03 — M1 Scope Boundaries

**Status:** Accepted
**Date:** 2026-03-11

### Context

M1 is the first playable milestone with a full RPG loop. The risk for this milestone is scope creep — every system is connected to every other system, and it is easy to justify "just one more feature" indefinitely. Explicit scope boundaries, with documented rationale for deferrals, prevent this. They also establish a precedent: each milestone commits only to what is needed for that milestone's playable moment, nothing more.

### Decision

The following are **explicitly out of scope for M1** and deferred to the milestone noted:

| Feature | Deferred to | Reason |
|---|---|---|
| Class system | Post-M1 | Classless is fully playable; classes add design surface without changing the loot loop |
| Save / load | M2 | Save state depends on stable entity registry — design M2 after M1 entity model is proven |
| Ranged combat (bow/crossbow) | M4 | Requires projectile system (E8), which is a separate engine feature |
| Spell schools / mana | M4 | Depends on WIS mechanical implementation and mana resource |
| Hunger resource | M3 | Hunger pairs with NPC shops (food vendors) and rations — meaningless without M3 economy |
| NPCs / dialog / shops | M3 | Separate milestone scope |
| Armor weight penalties | Post-M1 | No weight system in M1 — items have a `weight` field for future use only |
| Weapon durability | Post-M1 | Adds friction without adding fun at M1 depth |
| Skill system (lockpicking, stealth) | M2+ | Skills are only meaningful when traps and locks are features (M2) |
| Status effects (poison, slow) | M2 | Spider gets a poison data tag in M1; no mechanical effect until M2 |
| Sub-grid entity positioning | M2 | Needed before spawner-based swarm rooms become viable |

**Death model:** Restart current level (existing v1 behaviour). No corpse run, no permadeath. Rationale: save/load is M2; a restart is the only safe option without persistent state.

**Backpack size:** 12 slots (up from 8). Rationale: 10 equipment slots plus weapon variety requires more breathing room. 12 is still constrained enough to create meaningful drop decisions.

**Versioning scheme:** `0.milestone`. v0.1 ships when M1 is complete. v0.0.x accumulates prototype work. Current tag: v0.0.9.

### Alternatives Considered

**Starter class selection at character creation:** Considered for M1. Rejected — classless with stat allocation gives equivalent build differentiation. Classes add content design surface (class-specific quests, equipment restrictions) that multiplies M1 scope.

**Corpse run death model:** Considered. Rejected for M1 — requires persistent world state between deaths, which is a save/load problem. Revisit in M2.

**16-slot backpack:** Considered. Rejected — creates "just pick up everything" behaviour, reducing loot decision friction. 12 is the minimum that comfortably fits the M1 item variety.

**Permadeath toggle:** Considered. Rejected for M1 — adds UI complexity and balancing overhead. Post-M1 option.

### Consequences

**Positive:**
- Tight scope means M1 ships as a complete, playable loop without sprawl
- Each deferral maps to a specific milestone — nothing is "deferred indefinitely"
- Restart-on-death keeps the codebase simple until entity persistence is proven in M2

**Negative / Risks:**
- **WIS is visible but inert:** Players may invest points in WIS at character creation with no M1 payoff. Mitigated by UI tooltip, but still a potential confusion point.
- **Poison data tag with no effect:** Spider's poison tag is in `items.json` and enemy data but does nothing. A player reading tooltip "May poison" with no observable effect will feel cheated. Consider suppressing the tooltip in M1 or replacing with a neutral flavour line.
- **No save/load means full restart on browser refresh:** M1 sessions are transient. Acceptable for a short 3-level dungeon but sets a hard ceiling on content depth until M2.
- **12-slot backpack may still feel large:** With no weight system and no shops to sell at, the player will fill the backpack quickly and start dropping items. Monitor during playtesting — may need to drop to 10.
