# Milestone 3 — Architecture Decision Records

---

## ADR-M3-01 — NPC Data Model: Separate Database + Entity Type

**Status:** Accepted
**Date:** 2026-03-24

### Context

M3 introduces NPCs — non-hostile characters the player interacts with for dialog, quests, and trading. NPCs need sprites (billboard rendering), per-NPC data (name, dialog reference, merchant stock), and placement in dungeon JSON. The question is how to model NPCs relative to existing systems: inline in dungeon JSON only, reuse the enemy system, or create a parallel database.

### Decision

**Separate `public/data/npcs.json` database + `NpcDatabase` singleton class, mirroring the EnemyDatabase pattern exactly.**

- `NpcDef`: id, name, sprite (path/size/yOffset), dialog reference, optional stock + markup
- `NpcDatabase` class with `load()`, `getNpc()`, `getAllNpcs()`, `getAllNpcIds()`, `isLoaded()`
- Singleton `npcDatabase` export
- New `npc` entity type in dungeon JSON: `{ type: "npc", npcId: "merchant_gregor", facing: "S" }`
- `NPCInstance` in GameState: `npcs: Map<string, NPCInstance>` (same doorKey pattern as all other entities)
- Billboard rendering via `npcRenderer.ts` (mirrors `enemyRenderer.ts`)
- NPCs block movement (like enemies)

### Alternatives Rejected

**Inline NPC data in dungeon JSON only:** Rejected. Leads to duplication when the same NPC appears in multiple dungeons. Separating definition from placement follows the established pattern (enemies, items).

**Reuse EnemyDatabase with a `hostile: false` flag:** Rejected. NPCs have fundamentally different data (dialog, stock, markup) and no combat stats (hp, atk, def, behaviors). Sharing a model would force empty fields or type unions. Separate databases are cleaner.

**NPCs as a variant of the `sign` entity:** Rejected. Signs are wall-mounted, have no sprite, and trigger a simple text popup. NPCs need billboard rendering, facing, complex dialog trees, and trading. Too different to share an entity type.

### Consequences

**Positive:**
- Familiar pattern — same code structure as EnemyDatabase, low learning curve
- NPC definitions are data-driven, editable without code changes
- Editor support follows the same pattern as enemy entities (dropdown from database IDs)
- Sprite preloading parallels enemy texture preloading

**Negative / Risks:**
- **Third database singleton to load at init.** Adds to startup time, but NPC count is small (<10 for M3) and loading is parallelized with enemy/item database loads.
- **NPC sprites need to exist.** Missing sprites fall back to a default, but placeholder art is needed for testing.

---

## ADR-M3-02 — Dialog System: Per-NPC JSON Trees with Condition/Effect Engine

**Status:** Accepted
**Date:** 2026-03-24

### Context

NPCs need conversations with branching choices. The system must support: player choices that lead to different dialog nodes, conditions that gate choices (inventory, flags, quest state), and effects that change game state (give/take items, set flags, start quests, open shop). The question is the dialog format and where logic lives.

### Decision

**JSON dialog trees stored as per-NPC files in `public/data/dialogs/{npcId}.json`.** A `DialogManager` module loads trees, evaluates conditions, and executes effects. A `DialogOverlay` renders the UI.

**Format:**
- Each file has a `startNode` and a `nodes` map of named nodes
- Nodes have `speaker`, `text`, optional `choices` array, optional linear `next`
- Choices have `text`, `next` (node ID or null to end), optional `conditions`, optional `effects`
- Conditions: `hasFlag`, `hasItem`, `questStage`, `statCheck` — all must pass (AND)
- Effects: `setFlag`, `giveItem`, `takeItem`, `startQuest`, `advanceQuest`, `openShop`

**Architecture:**
- Condition evaluators and effect executors are lookup tables — extensible with one-liners
- External hooks (`setDialogHooks`) decouple dialog from quest/shop systems (wired in main.ts)
- Dialog cache prevents re-fetching the same tree
- Session state is a plain data object (tree + current node ID), not a class

### Alternatives Rejected

**Ink-like markup language:** Rejected. Would require a parser/compiler, adding a build step and a runtime dependency. JSON is directly serializable, editable in any text editor, and parseable with `JSON.parse`. For M3's scope (3 NPCs, ~5 nodes each), a markup language is over-engineered.

**Dialog embedded in NPC database:** Rejected. Would make npcs.json enormous and couple NPC definition to dialog content. Separate files allow dialog iteration without touching the NPC database.

**Scripted dialog (TypeScript per NPC):** Rejected. Prevents data-driven authoring, requires recompilation for dialog changes, and makes hot-reload impossible. JSON trees can be edited and reloaded at runtime.

**Global dialog.json (all NPCs in one file):** Rejected. Grows unwieldy as NPC count increases. Per-NPC files are independently loadable and editable.

### Consequences

**Positive:**
- Data-driven — dialog content changes without code changes
- Condition/effect system is generic and reusable across future systems
- Per-NPC files keep dialog content modular and manageable
- Dialog overlay follows the established overlay pattern (SignOverlay, SaveLoadOverlay)

**Negative / Risks:**
- **No visual dialog editor.** Authors must write JSON by hand. Acceptable for M3's scope but may need tooling for larger content volumes.
- **Condition evaluation is synchronous.** If a condition check ever needs to be async (e.g., server-side validation), the evaluator pattern would need refactoring. Not a risk for a browser-only game.
- **`questStage` evaluator is stubbed until Phase C.** Dialog choices gated on quest state won't filter correctly until the QuestManager is wired in. This is an intentional phasing decision — the stub returns `true` for `undiscovered`, which is correct for pre-quest-system testing.

---

## ADR-M3-03 — Global Flags: Persistent Set<string> for Cross-System State

**Status:** Accepted
**Date:** 2026-03-24

### Context

Multiple M3 systems need to share state: dialog conditions check flags set by quest completion, trading stock is gated by flags set during dialog, quest objectives may depend on flags set by other quests. A mechanism for cross-system boolean state is needed.

### Decision

**`flags: Set<string>` on GameState. Persisted in SaveData as `string[]`.**

- Simple boolean flags (present = true, absent = false)
- `hasFlag(flag)`, `setFlag(flag)`, `removeFlag(flag)` methods on GameState
- Flags are global (not per-level) — they persist across level transitions
- Flags are saved/loaded with the rest of the game state
- No namespacing convention enforced, but recommended: `quest_complete_fetch_amulet`, `gregor_special_stock`

### Alternatives Rejected

**Key-value store (Map<string, unknown>):** Rejected. Boolean flags cover all M3 use cases. A key-value store adds type complexity (what types are allowed? how to serialize unknown values?) without benefit. If numeric or string state is needed later, it can be added alongside flags.

**Per-system state (quest flags, dialog flags, etc.):** Rejected. Would create silos that can't interact. A dialog condition checking a quest flag would need to know which system owns the flag. A single flat set is simpler and enables any system to check any flag.

**Flag registry with metadata:** Rejected. A registry that declares all valid flags upfront would catch typos but adds authoring overhead. For M3's scale (~10 flags), the risk of typos is low and debuggable.

### Consequences

**Positive:**
- Trivially simple — Set operations are O(1)
- Serialization is trivial (Set → array → Set)
- Any system can read/write flags — no coupling between dialog, quest, and trading systems
- Easily debuggable (log the flag set to see all state)

**Negative / Risks:**
- **No type safety on flag names.** A typo (`gregor_specail_stock` vs `gregor_special_stock`) silently fails. Mitigated by keeping flag names in JSON data files where they can be grep'd.
- **No flag cleanup.** Flags accumulate forever. For M3's scope this is irrelevant, but a larger game might need flag lifecycle management.

---

## ADR-M3-04 — Quest System: Data-Driven JSON with Generic Stage Machine

**Status:** Accepted
**Date:** 2026-03-24

### Context

M3 needs 2-3 quests: a fetch quest, a kill quest, and an exploration/collection quest. The question is whether quests should be code-driven (a TypeScript class per quest with custom logic) or data-driven (JSON definitions interpreted by a generic engine).

### Decision

**Data-driven JSON quests in `public/data/quests/{questId}.json`, interpreted by a generic `QuestManager`.**

- Quest stages: `undiscovered` → `active` → `complete` / `failed`
- Each stage has objectives: `hasItem`, `talkTo`, `killEnemy`, `reachArea`
- QuestManager evaluates objectives generically — no quest-specific code
- Rewards: xp, gold, items, flags — applied on stage completion
- Quest state persisted in SaveData
- Dialog `startQuest` / `advanceQuest` effects drive transitions

### Alternatives Rejected

**Code-driven quests (TypeScript per quest):** Rejected. Creates a coupling between content and code — adding a quest requires a new source file, compilation, and potentially new imports in the quest system. Data-driven quests can be added by dropping a JSON file.

**Hybrid (JSON definition + scripted hooks):** Considered. Would allow custom logic per quest (e.g., "spawn an enemy when the player picks up the amulet"). Rejected for M3 — the three quest types planned are all expressible with generic objectives. If a future quest needs custom logic, hooks can be added then.

### Consequences

**Positive:**
- Adding a quest requires only a JSON file — no code changes
- Objective types are reusable across quests
- Quest state is a plain data structure — trivially serializable
- QuestManager is testable in isolation (pass in objectives, check state transitions)

**Negative / Risks:**
- **Limited expressiveness.** A quest that requires "kill 3 spiders in the same room" can't be expressed with the current objective types. Acceptable for M3 — extend objective types if needed later.
- **No quest branching.** Quests are linear (stages advance in order). Branching quests (choose side A or B) would need a more complex state machine. Not needed for M3.

---

## ADR-M3-05 — Trading System: Dialog-Triggered Overlay with NPC Stock

**Status:** Accepted
**Date:** 2026-03-24

### Context

M3 introduces buying and selling items. Trading must integrate with the dialog system (NPC says "Show me your wares" → shop opens) and use item data that already exists (item database, gold on GameState).

### Decision

**Side-by-side `TradingOverlay` triggered by the `openShop` dialog effect.**

- Shop stock defined in npcs.json as `stock: string[]` (item IDs) + `markup: number` (buy price multiplier)
- Buy price: `item.value × markup`; sell price: `item.value × 0.5`
- Flag-gated rare stock: items only appear if a specific flag is set (e.g., quest reward unlocks special items)
- Full-screen DOM overlay (same pattern as SaveLoadOverlay)
- Triggered by `openShop` dialog effect → dialog closes → shop opens

### Alternatives Rejected

**Dedicated shop entity type:** Rejected. Shops are a property of NPCs, not a separate world object. The NPC entity + dialog tree + stock fields in npcs.json covers the use case without a new entity type.

**Floating shop window (non-fullscreen):** Rejected. Side-by-side layout of shop stock and player inventory needs screen space. A full-screen overlay is consistent with inventory and save/load overlays.

### Consequences

**Positive:**
- No new entity types needed — shop is a behavior of existing NPC entities
- Prices auto-calculated from item.value — no manual price tables
- Per-merchant markup allows differentiated merchants (generous vs expensive)
- Flag-gated stock ties naturally into the quest reward system

**Negative / Risks:**
- **Static stock.** Shop items don't deplete or restock. Acceptable for M3 — merchants are infinite vendors. Restocking can be added later if desired.

---

## ADR-M3-06 — Dungeon Objects: 3D Geometry, Not Billboards

**Status:** Accepted
**Date:** 2026-03-24

### Context

M3 adds four interactable objects: fountain, bookshelf, altar, barrel. These need 3D rendering in the game world. The question is whether to use billboard sprites (like enemies/NPCs) or simple 3D geometry.

### Decision

**Simple 3D geometry (boxes, cylinders) for all four object types.**

- Fountain: cylinder base + smaller cylinder top, blue-tinted material
- Bookshelf: box with book-colored texture, wall-mounted
- Altar: flat box platform with a raised center
- Barrel: cylinder with wood-colored material
- All use `MeshStandardMaterial` with dungeon-consistent colors
- Geometry is static (no animation) — interaction feedback via HUD messages

### Alternatives Rejected

**Billboard sprites:** Rejected. Objects like bookshelves and altars look wrong as flat sprites facing the camera — they have inherent 3D depth. Billboard works for humanoid characters (enemies, NPCs) because the player's mental model accepts a flat image of a person. A bookshelf rotating to face the camera breaks immersion.

**Imported 3D models (GLTF):** Rejected for M3. Adds asset pipeline complexity (model authoring, loading, material setup). Simple procedural geometry matches the pixelart aesthetic and is zero-dependency.

### Consequences

**Positive:**
- Objects feel like part of the dungeon environment, not floating sprites
- No additional sprite assets needed
- Consistent with existing 3D elements (doors, chests, blocks)
- Low rendering cost — a few primitives per object

**Negative / Risks:**
- **Geometry is programmer art.** Simple boxes and cylinders won't look as polished as modeled assets. Acceptable for M3 — visual polish can iterate later.
- **No animation.** Fountains don't flow, barrels don't crumble. Interaction is communicated via HUD messages and state changes. Acceptable for M3 scope.

---

## ADR-M3-07 — Temporary Buffs: Separate System from Status Effects

**Status:** Accepted
**Date:** 2026-03-25

### Context

M3 Phase F adds altars that grant timed stat buffs (e.g., +5 ATK for 60s). The existing `StatusEffect` system (M2, ADR-M2-04) handles debuffs like poison, slow, and burning — tick-based damage-over-time effects. The question is whether stat buffs should reuse the StatusEffect system or be separate.

### Decision

**Separate `TempBuff` system on GameState, distinct from `StatusEffect`.**

- `TempBuff`: `{ stat: BuffStat; amount: number; remaining: number }` — affects computed stats via `getEffectiveStats()`
- `StatusEffect`: `{ type: StatusEffectType; duration: number; ... }` — affects HP/behavior per tick
- `tempBuffs[]` array on GameState, ticked in game loop, same-stat refresh (reapplying resets timer, no stacking)
- Persisted in save data alongside player state

### Alternatives Rejected

**Reuse StatusEffect:** The StatusEffect system is designed for damage-over-time debuffs with tick callbacks. Adding stat modification to it would require either: (a) a generic "effect function" callback (complex, harder to serialize) or (b) special-casing buff types inside the tick function (messy, two responsibilities). TempBuff is structurally simpler — a flat stat modifier with a countdown.

### Consequences

- Clear separation: StatusEffect = debuffs (poison/slow/burning), TempBuff = stat bonuses
- `getEffectiveStats()` sums base stats + equipment + TempBuff — single source of truth
- Same-stat refresh prevents buff stacking exploits
- Serialization is trivial (plain array of objects)
