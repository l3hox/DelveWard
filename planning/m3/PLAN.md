# Milestone 3: The Living World — Implementation Plan

**Target version:** v0.3
**Status:** Phase A/B Editor complete, Phase C next
**See:** [ADR.md](ADR.md) for architecture decisions.

---

## Phase Overview

| Phase | Name | Depends On | Status |
|---|---|---|---|
| A | NPC Foundation | — | **Complete** (game) |
| B | Dialog System | A | **Complete** (game) |
| A/B Editor | Editor: NPC support | A, B | **Complete** |
| C | Quest System + Editor | B | Next |
| C/D Editor | Editor: Dialog Editor | B, C | Pending |
| D | Trading System | B | Pending |
| E | Hunger System + Editor | — | Pending |
| F | Dungeon Objects + Editor | — | Pending |
| G | Content — M3 Test Dungeon | C, D, E, F | Pending |

---

## Phase A — NPC Foundation (Complete)

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

---

## Phase B — Dialog System (Complete)

Per-NPC dialog trees with branching choices, conditions, and effects.

11. Dialog JSON format: per-NPC files in `public/data/dialogs/{npcId}.json`
12. `DialogManager`: load dialog, evaluate conditions (`hasFlag`, `hasItem`, `questStage`, `statCheck`), execute effects (`setFlag`, `giveItem`, `takeItem`, `startQuest`, `advanceQuest`, `openShop`)
13. `DialogOverlay`: dark dungeon-themed panel with speaker name, text, numbered choice buttons (1-9 keys or click), linear advance for non-choice nodes
14. Dialog session state: `startDialog`, `getCurrentNode`, `getAvailableChoices`, `selectChoice`, `advanceDialog`
15. External hooks (`setDialogHooks`) for quest/shop integration
16. Wired into main.ts: NPC interaction → load dialog → open overlay → choices → effects
17. Dialog overlay blocks game input while open
18. Three dialog files: merchant_gregor, questgiver_hilda, lorekeeper_owen

No editor work needed — dialog trees are standalone JSON files, not part of dungeon level data.

---

## Phase A/B Editor — NPC Editor Support

Editor catch-up for the NPC entity type added in Phases A+B.

19. **Toolbar.ts**: Add `'npc'` to `ENTITY_TYPES` array
20. **Toolbar.ts**: `drawEntityIcon` case for `npc` — distinct teal circle with "NPC" text badge
21. **GridCanvas.ts**: `drawEntityIcon` case for `npc` — teal circle on grid
22. **GridCanvas.ts**: `drawEntitySprite` support — show NPC sprite from npcDatabase if sprite preview enabled
23. **EditorApp.ts**: `ENTITY_DEFAULTS` entry: `npc: { npcId: '' }`
24. **Inspector.ts**: `case 'npc'` field block:
    - `npcId` dropdown (populated from `npcDatabase.getAllNpcIds()`)
    - Readonly NPC name + dialog file reference display
25. **editor/main.ts**: Load `npcDatabase` at editor init (needed for dropdown + sprite preview)

---

## Phase C — Quest System

Data-driven quest definitions with stage tracking and objective evaluation.

26. Quest JSON: per-quest files in `public/data/quests/{questId}.json` with stages, objectives, rewards
27. `QuestManager`: load quests, track state (`undiscovered` → `active` → `complete` / `failed`), evaluate objectives
28. Objective types: `hasItem`, `talkTo`, `killEnemy`, `reachArea`
29. `QuestLogOverlay`: full-screen overlay listing active/completed quests (J key)
30. Rewards: xp, gold, items, flags
31. Wire `questStage` condition evaluator in DialogManager (replace Phase B stub)
32. Wire `startQuest` / `advanceQuest` dialog effect hooks
33. Quest state persisted in SaveData (new `quests` field)
34. Three quest data files: `fetch_amulet`, `kill_spider_queen`, `collect_lore`
35. Tests: quest state transitions, objective evaluation, reward application

No editor work — quests are data-driven JSON, not level entities.

---

## Phase C/D Editor — Dialog Editor

Integrated dialog tree editor inside the dungeon editor. Currently dialog JSON files are hand-edited, which is error-prone and disconnects dialog authoring from level design. This phase adds a visual editor for creating and editing dialog trees with full support for conditions gated on quest status and world flags.

**Depends on:** Phase B (dialog system), Phase C (quest system — needed for quest ID validation and `questStage` condition authoring).

### Dialog Editor Core
71. **Dialog file management**: List/create/delete dialog JSON files from `public/data/dialogs/`. Load via dev server API (extend `editorApiPlugin` or use a dedicated dialogs endpoint).
72. **Node graph view**: Visual node-and-edge graph for dialog trees. Each node shows speaker + text preview. Edges show choice transitions (labeled with choice text). Drag to reposition nodes. Pan/zoom (reuse GridCanvas patterns).
73. **Node editor panel**: Select a node to edit in a side panel — speaker name, text (textarea), linear `next` pointer (dropdown of node IDs or "end dialog").
74. **Choice editor**: Add/remove/reorder choices within a node. Each choice: text, `next` target (dropdown or "end"), expandable conditions/effects sections.

### Condition Authoring (quest status + world flags)
75. **Condition builder UI**: Add/remove conditions on choices and nodes. Dropdown for condition type (`hasFlag`, `hasItem`, `questStage`, `statCheck`). Type-specific fields:
    - `hasFlag`: text input for flag name (autocomplete from known flags in all dialog files)
    - `hasItem`: item ID dropdown (from `itemDatabase`)
    - `questStage`: quest ID dropdown (from quest JSON files) + stage dropdown (`undiscovered`, `active`, `complete`, `failed`)
    - `statCheck`: stat name dropdown + min value number input
76. **Flag discovery**: Scan all dialog files for `setFlag` effects and `hasFlag` conditions to build a known-flags list for autocomplete. Warn on orphaned flags (set but never checked, or checked but never set).

### Effect Authoring
77. **Effect builder UI**: Add/remove effects on choices and nodes. Dropdown for effect type (`setFlag`, `giveItem`, `takeItem`, `startQuest`, `advanceQuest`, `openShop`). Type-specific fields:
    - `setFlag`: text input for flag name (with autocomplete)
    - `giveItem` / `takeItem`: item ID dropdown (from `itemDatabase`)
    - `startQuest` / `advanceQuest`: quest ID dropdown (from quest JSON files)
    - `openShop`: no additional fields

### Validation & Preview
78. **Validation**: Warn on unreachable nodes, dead-end nodes (no `next` and no choices), broken `next` references, unknown quest/item IDs in conditions/effects.
79. **Dialog preview mode**: Step through dialog in the editor with simulated flag/quest state. Toggle flags and quest stages to test different conversation branches without running the game.

### Integration
80. **NPC inspector link**: When selecting an NPC entity in the dungeon editor, show a "Edit Dialog" button that opens the dialog editor for that NPC's dialog file (from `npcDatabase` → `def.dialog`).
81. **Save**: Write modified dialog JSON back to server via dev server API.

---

## Phase D — Trading System

Buy/sell UI triggered by dialog effect `openShop`.

36. `TradingOverlay`: side-by-side full-screen overlay (shop stock left, player inventory right)
37. Click to buy/sell with gold totals and item tooltips
38. Stock defined in npcs.json (`stock: string[]`, `markup: number`)
39. Prices: buy = `item.value × markup`, sell = `item.value × 0.5`
40. Flag-gated rare stock (e.g., `gregor_special_stock` flag unlocks items)
41. Wire `openShop` dialog effect hook to open TradingOverlay
42. Tests: price calculation, buy/sell transactions, gold changes

No editor work — trading is a runtime-only feature driven by npcs.json.

---

## Phase E — Hunger System

Simple survival mechanic with food items.

43. `hunger` stat on GameState (0–100, starts at 100)
44. Drain over time (configurable rate, e.g., 1 per 10 seconds of game time)
45. Food items in items.json: `rations` (consumable, `effect.restoreHunger: 30`)
46. Consumable use: `restoreHunger` effect on `ItemEffect`
47. HUD hunger bar (next to HP bar)
48. Starvation: HP drain when hunger reaches 0
49. Save/load: hunger value in SaveData player state
50. Tests: hunger drain, food consumption, starvation damage
51. **Editor Inspector.ts**: Consumable items with `restoreHunger` effect show the value in readonly stats

Minimal editor scope — food items are placed as `consumable` entities with the existing `itemId` field.

---

## Phase F — Dungeon Objects + Editor

Four new interactable/decorative entity types with full editor support.

### Game
52. **Fountain**: entity type `fountain`, simple 3D geometry, restore HP on interact (one-shot or cooldown)
53. **Bookshelf**: entity type `bookshelf`, 3D geometry, show lore text on interact (sign-like popup)
54. **Altar**: entity type `altar`, 3D geometry, grant temporary buff on interact (e.g., +5 ATK for 60s)
55. **Barrel**: entity type `barrel`, 3D geometry, breakable (like breakable_wall), drops loot
56. Renderers for all 4 types (simple 3D geometry, not billboards)
57. Entity parsing in GameState, save/load in LevelSnapshot
58. Interaction dispatch in `interaction.ts`
59. Level loader validation for all 4 types
60. Tests: interaction effects, breakable barrel loot

### Editor
61. **Toolbar.ts**: Add `'fountain'`, `'bookshelf'`, `'altar'`, `'barrel'` to `ENTITY_TYPES`
62. **Toolbar.ts + GridCanvas.ts**: `drawEntityIcon` cases for all 4 (distinct simple icons)
63. **EditorApp.ts**: `ENTITY_DEFAULTS` entries:
    - `fountain: { healAmount: 20 }`
    - `bookshelf: { text: '' }`
    - `altar: { buffType: 'atk', buffAmount: 5, buffDuration: 60 }`
    - `barrel: { hp: 10 }`
64. **Inspector.ts**: Field blocks for each:
    - Fountain: `healAmount` number input, optional `cooldown` number
    - Bookshelf: `text` textarea (same as sign)
    - Altar: `buffType` dropdown, `buffAmount` number, `buffDuration` number
    - Barrel: `hp` number input, `drops` editor (reuse chest/breakable_wall drops UI)

---

## Phase G — Content: M3 Test Dungeon

Minimal dungeon to prove all M3 systems work together.

65. Hub level: safe room with 3 NPCs (merchant, questgiver, lorekeeper), fountain, altar
66. Dungeon level 1: combat, exploration objectives, lore bookshelves, barrels
67. Dungeon level 2 (optional): harder combat, spider queen boss area, fetch quest item
68. 3 quests exercising all objective types:
    - Fetch quest: find amulet_gregor → return to merchant
    - Kill quest: kill spider queen → return to Hilda
    - Exploration quest: find 3 lore scrolls → return to Owen
69. NPC sprite placeholders (or final art)
70. Balance pass: food drops, hunger rate, shop prices, quest rewards

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
3. Manual: Editor — place NPC via palette, set npcId + facing in inspector
4. Manual: Talk to NPC → dialog with choices works
5. Manual: Accept quest → quest log shows it → complete objectives → turn in → rewards
6. Manual: Open shop → buy/sell items → gold updates correctly
7. Manual: Hunger drains → eat food → hunger restores → starvation damages HP
8. Manual: Interact with fountain/bookshelf/altar/barrel — each works
9. Manual: Editor — place/edit fountain, bookshelf, altar, barrel entities
10. Manual: Save → load → NPC state, quest progress, flags all restored
11. Manual: Play through all 3 quests in test dungeon start to finish
