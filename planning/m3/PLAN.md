# Milestone 3: The Living World — Implementation Plan

**Target version:** v0.3
**Status:** Phase B complete, Phase B.5 next

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| A | NPC Foundation | — | **Complete** |
| B | Dialog System | A | **Complete** |
| B.5 | Editor: NPC + Dialog | A, B | Next |
| C | Quest System | B | Pending |
| C.5 | Editor: Quest Entities | C | Pending |
| D | Trading System | B | Pending |
| E | Hunger System | — | Pending |
| E.5 | Editor: Hunger/Food | E | Pending |
| F | Dungeon Objects | — | Pending |
| F.5 | Editor: Dungeon Objects | F | Pending |
| G | Content — M3 Test Dungeon | C, D, E, F | Pending |

---

## Phase A — NPC Foundation

NPC data model, database, entity type, rendering, global flags, save/load.

1. `public/data/npcs.json` + `NpcDatabase` class (mirrors EnemyDatabase pattern)
2. `NPCInstance` interface on GameState: `npcs: Map<string, NPCInstance>`
3. NPC entity parsing in `_parseEntities`: `{ type: "npc", npcId: "...", facing: "S" }`
4. NPC billboard rendering (`buildNpcMeshes`, `updateNpcBillboards` — mirrors enemy renderer)
5. Interaction: `interact()` returns `{ type: 'npc_interacted' }` for facing-cell NPC
6. NPCs block player movement (same as enemies)
7. Global flags: `flags: Set<string>` on GameState with `hasFlag`/`setFlag`/`removeFlag`
8. Level loader: `npc` entity validation (npcId exists, walkable cell, facing)
9. Save/load: NPC state in LevelSnapshot, flags in SaveData
10. `npcDatabase.load()` + `preloadNpcTextures()` at init

*No editor work — deferred to Phase B.5.*

---

## Phase B — Dialog System

Per-NPC dialog trees with branching choices, conditions, and effects.

11. Dialog JSON format: per-NPC files in `public/data/dialogs/{npcId}.json`
12. `DialogManager`: load dialog, evaluate conditions (`hasFlag`, `hasItem`, `questStage`, `statCheck`), execute effects (`setFlag`, `giveItem`, `takeItem`, `startQuest`, `advanceQuest`, `openShop`)
13. `DialogOverlay`: dark dungeon-themed panel with speaker name, text, numbered choice buttons (1-9 keys or click), linear advance for non-choice nodes
14. Dialog session state: `startDialog`, `getCurrentNode`, `getAvailableChoices`, `selectChoice`, `advanceDialog`
15. External hooks (`setDialogHooks`) for quest/shop integration
16. Wired into main.ts: NPC interaction → load dialog → open overlay → choices → effects
17. Dialog overlay blocks game input while open
18. Three dialog files: merchant_gregor, questgiver_hilda, lorekeeper_owen

---

## Phase B.5 — Editor: NPC Support

Editor integration for the NPC entity type added in Phase A.

19. **Toolbar.ts**: Add `'npc'` to `ENTITY_TYPES` array
20. **Toolbar.ts**: `drawEntityIcon` case for `npc` — distinct icon (person silhouette or "NPC" text badge)
21. **GridCanvas.ts**: `drawEntityIcon` case for `npc` — matching icon on grid with facing indicator
22. **GridCanvas.ts**: `drawEntitySprite` support — show NPC sprite from npcDatabase if sprite preview enabled
23. **EditorApp.ts**: `ENTITY_DEFAULTS` entry: `npc: { npcId: '', facing: 'S' }`
24. **Inspector.ts**: `case 'npc'` field block:
    - `npcId` dropdown (populated from `npcDatabase.getAllNpcIds()`)
    - `facing` dropdown (N/S/E/W)
    - Readonly NPC name + dialog file reference display
25. **editor/main.ts**: Load `npcDatabase` at editor init (needed for dropdown + sprite preview)

---

## Phase C — Quest System

Data-driven quest definitions with stage tracking and objective evaluation.

26. Quest JSON: per-quest files in `public/data/quests/{questId}.json` with stages, objectives, rewards
27. `QuestManager`: load quests, track state (`undiscovered` → `active` → `complete` / `failed`), evaluate objectives
28. Objective types: `hasItem`, `talkTo`, `killEnemy`, `reachArea`
29. `QuestLogOverlay`: full-screen overlay listing active/completed quests (Tab or Q key)
30. Rewards: xp, gold, items, flags
31. Wire `questStage` condition evaluator in DialogManager (replace Phase B stub)
32. Wire `startQuest` / `advanceQuest` dialog effect hooks
33. Quest state persisted in SaveData (new `quests` field)
34. Three quest data files: `fetch_amulet`, `kill_spider_queen`, `collect_lore`
35. Tests: quest state transitions, objective evaluation, reward application

---

## Phase C.5 — Editor: Quest-Related Entities

No new entity types — but quest objectives reference entities by ID, so ensure IDs and quest-related flags are visible in the editor.

36. **Inspector.ts**: Readonly "quest references" section on entities that are quest objectives (informational, not editable)
37. Consider: flag viewer/tester in editor for debugging quest conditions

*Scope is minimal — quests are data-driven JSON, not level entities.*

---

## Phase D — Trading System

Buy/sell UI triggered by dialog effect `openShop`.

38. `TradingOverlay`: side-by-side full-screen overlay (shop stock left, player inventory right)
39. Click to buy/sell with gold totals and item tooltips
40. Stock defined in npcs.json (`stock: string[]`, `markup: number`)
41. Prices: buy = `item.value × markup`, sell = `item.value × 0.5`
42. Flag-gated rare stock (e.g., `gregor_special_stock` flag unlocks items)
43. Wire `openShop` dialog effect hook to open TradingOverlay
44. Tests: price calculation, buy/sell transactions, gold changes

*No editor work — trading is a runtime-only feature driven by npcs.json.*

---

## Phase E — Hunger System

Simple survival mechanic with food items.

45. `hunger` stat on GameState (0–100, starts at 100)
46. Drain over time (configurable rate, e.g., 1 per 10 seconds of game time)
47. Food items in items.json: `rations` (consumable, `effect.restoreHunger: 30`)
48. Consumable use: `restoreHunger` effect on `ItemEffect`
49. HUD hunger bar (next to HP bar)
50. Starvation: HP drain when hunger reaches 0
51. Save/load: hunger value in SaveData player state
52. Tests: hunger drain, food consumption, starvation damage

---

## Phase E.5 — Editor: Hunger/Food Support

53. **Inspector.ts**: Consumable items with `restoreHunger` effect show the value in readonly stats
54. No new entity types — food items are placed as `consumable` entities with existing `itemId` field

*Minimal scope — existing consumable placement already works.*

---

## Phase F — Dungeon Objects

Four new interactable/decorative entity types.

55. **Fountain**: entity type `fountain`, simple 3D geometry, restore HP on interact (one-shot or cooldown)
56. **Bookshelf**: entity type `bookshelf`, 3D geometry, show lore text on interact (sign-like popup)
57. **Altar**: entity type `altar`, 3D geometry, grant temporary buff on interact (e.g., +5 ATK for 60s)
58. **Barrel**: entity type `barrel`, 3D geometry, breakable (like breakable_wall), drops loot
59. Renderers for all 4 types (simple 3D geometry, not billboards)
60. Entity parsing in GameState, save/load in LevelSnapshot
61. Interaction dispatch in `interaction.ts`
62. Level loader validation for all 4 types
63. Tests: interaction effects, breakable barrel loot

---

## Phase F.5 — Editor: Dungeon Object Support

64. **Toolbar.ts**: Add `'fountain'`, `'bookshelf'`, `'altar'`, `'barrel'` to `ENTITY_TYPES`
65. **Toolbar.ts + GridCanvas.ts**: `drawEntityIcon` cases for all 4 (distinct simple icons)
66. **EditorApp.ts**: `ENTITY_DEFAULTS` entries:
    - `fountain: { healAmount: 20 }`
    - `bookshelf: { text: '' }`
    - `altar: { buffType: 'atk', buffAmount: 5, buffDuration: 60 }`
    - `barrel: { hp: 10 }`
67. **Inspector.ts**: Field blocks for each:
    - Fountain: `healAmount` number input, optional `cooldown` number
    - Bookshelf: `text` textarea (same as sign)
    - Altar: `buffType` dropdown, `buffAmount` number, `buffDuration` number
    - Barrel: `hp` number input, `drops` editor (reuse chest/breakable_wall drops UI)

---

## Phase G — Content: M3 Test Dungeon

Minimal dungeon to prove all M3 systems work together.

68. Hub level: safe room with 3 NPCs (merchant, questgiver, lorekeeper), fountain, altar
69. Dungeon level 1: combat, exploration objectives, lore bookshelves, barrels
70. Dungeon level 2 (optional): harder combat, spider queen boss area, fetch quest item
71. 3 quests exercising all objective types:
    - Fetch quest: find amulet_gregor → return to merchant
    - Kill quest: kill spider queen → return to Hilda
    - Exploration quest: find 3 lore scrolls → return to Owen
72. NPC sprite placeholders (or final art)
73. Balance pass: food drops, hunger rate, shop prices, quest rewards

---

## Existing Patterns to Reuse

| Pattern | File | Reuse for |
|---|---|---|
| EnemyDatabase singleton | `src/enemies/enemyDatabase.ts` | NpcDatabase, QuestManager |
| ItemDatabase singleton | `src/core/itemDatabase.ts` | NpcDatabase |
| Entity type system | `src/core/types.ts` | NPC, fountain, bookshelf, altar, barrel |
| Interaction dispatch | `src/level/interaction.ts` | NPC, fountain, bookshelf, altar |
| SignOverlay (popup) | `src/hud/signOverlay.ts` | DialogOverlay, bookshelf popup |
| InventoryOverlay (state) | `src/hud/inventoryOverlay.ts` | TradingOverlay, QuestLogOverlay |
| SaveLoadOverlay (DOM) | `src/hud/saveLoadOverlay.ts` | TradingOverlay layout |
| Billboard rendering | `src/rendering/enemyRenderer.ts` | NPC rendering |
| SaveData serialization | `src/core/saveSystem.ts` | Quest state, flags, hunger |
| GameState central hub | `src/core/gameState.ts` | NPC/quest/hunger instance storage |
| Editor entity system | `src/editor/{Toolbar,Inspector,GridCanvas,EditorApp}.ts` | All new entity types |

---

## Verification

1. `npx tsc --noEmit` — clean compile
2. `npx vitest run` — all tests pass
3. Manual: Talk to NPC → dialog with choices works
4. Manual: Accept quest → quest log shows it → complete objectives → turn in → rewards
5. Manual: Open shop → buy/sell items → gold updates correctly
6. Manual: Hunger drains → eat food → hunger restores → starvation damages HP
7. Manual: Interact with fountain/bookshelf/altar/barrel — each works
8. Manual: Save → load → NPC state, quest progress, flags all restored
9. Manual: Play through all 3 quests in test dungeon start to finish
10. Manual: Editor — place/edit NPC, fountain, bookshelf, altar, barrel entities
