# DelveWard — PROGRESS.md

Session-to-session state. Read this at the start of every session.

For detailed history see: `COMPLETED.md`, `SESSION-LOG.md`, `IDEAS.md` (all in `planning/`).

---

## Versioning

`0.milestone` — e.g. `0.1` when Milestone 1 ships. Current tag: **v0.1.5**.

---

## Current Milestone

**Milestone 2: The Dangerous Dungeon** (v0.2)

Design complete — see `planning/m2/DESIGN.md`, `planning/m2/ADR.md`, `planning/m2/PLAN.md`.

---

## Next Steps

### M2 Implementation
- [x] Phase A: Signal system foundation (targets[] migration, signal state, gate modes, behaviors, trigger/tripwire, standalone gates, editor support)
- [ ] Phase B: Projectile system (ProjectileManager, collision, trap launchers, 3 projectile types, rendering, editor support)
- [ ] Phase C: Status effects (data model, tick logic, poison/slow/burning, HUD icons + visual overlays)
- [ ] Phase D: Environment entities (breakable walls, secret walls, pushable blocks, chests, signs, renderers, editor support)
- [ ] Phase E: Save/load (serialization, localStorage slots, auto-save, UI, export/import, death → load)
- [ ] Phase F: Content & polish (new textures, sprites, M2 test dungeon "The Architect's Tomb", balance pass)

### Completed milestones
- [x] M0: Proof of concept (v0.0.9)
- [x] M1: The Loot Game (v0.1)
- [x] M6: Dungeon Editor (v0.1.5, pulled forward)

---

## Pre-M1 Phase Overview

| Phase | Name | Status |
|---|---|---|
| 1 | Foundation Refactor | **Complete** |
| 2 | Visual Polish (textures) | **Complete** |
| 3 | Doors & Interaction | **Complete** |
| 4 | HUD | **Complete** |
| 5 | Multi-Level Dungeons | **Complete** |
| 6 | Entities & Enemy System | **Complete** |
| 7 | Combat | **Complete** |
| 8 | Later Resources & Polish | **Complete** |

---

## Recent Changes

- **Global Clock: Absolute-Time Scheduling**: Replaced independent countdown timers with a single monotonic clock (`SignalManager.now`) and absolute timestamps across all timed signal/gate/launcher systems. Zero drift on repeating events (pulse gates, trap launchers). Renamed timer fields to semantic absolute timestamps (`deactivateAt`, `delayFireAt`, `fireAt`, `nextFireAt`). `tickTrapLaunchers()` no longer takes delta. 3 new drift regression tests. ADR-M2-05. 602 tests.
- **Phase A: Signal System Foundation + Behavior Fixes + Editor Polish**: Complete M2 signal system with full editor integration. Core: `targets: string[]` migration, `SignalManager` (propagation, cycle detection, gate evaluation), signal modes, `signalDelay`, gate modes on doors (or/and/xor). New entities: trigger, tripwire (with orientation + 3D rendering), standalone gate. Signal state persisted in LevelSnapshot. Lever modes: toggle/one_shot/timed (timed auto-resets with animation). Pressure plate modes: toggle/momentary/one_shot/timed (timed countdown on step-off, visual reset). Trigger modes: toggle/momentary/one_shot/timed (timed countdown on step-off). Tripwire: one_shot only (signalDelay for timing). Door blocking: signal-driven doors bounce open on occupied cells, retry every 1.5s. 3D tripwire rendering (thin cylinder, low opacity, disappears on trigger). Tripwire orientation auto-detect fixed (perpendicular to passage). Editor: entity mode ghost preview with auto-detected wall/orientation and item sprites. Inspector hover highlights on grid + cross-level level list. Referenced-by remove buttons. Wire drag fallback to any wirable entity at cell. Escape exits entity mode. Select tool highlighted on load. Lever arrow origin from bar center. 572 tests.
- **Editor UX Round 2**: Drag-to-wire — in select mode, drag from a wirable entity (lever, plate, key, door, stairs) to a valid target to auto-create the reference. Orange dashed arrow follows cursor during drag, green/red hover validation. Supports forward and reverse wiring (e.g. drag door→lever sets lever.target). Clickable server file picker — replaced `prompt()` with a modal overlay listing files as clickable rows.
- **Enemy Database**: Extracted all hardcoded enemy definitions from code to `public/data/enemies.json`. New `EnemyDatabase` class (mirrors `ItemDatabase` pattern) with `load()`, `getEnemy()`, `getAllEnemies()`, `hasBehavior()`, `getBehavior()`. Enemy stats, sprite data (path/size/yOffset), and AI behaviors (regen/flee/erratic) are now data-driven with typed params. Removed `ENEMY_DEFS`, `SPRITE_SIZES`, `SPRITE_PATHS`, `SPRITE_Y_OFFSETS` constants. All 12 consumer files updated. 541 tests passing.
- **Editor Direct File Save**: Vite dev server plugin (`editorApiPlugin`) with 3 API routes (`/api/editor/list`, `/load`, `/save`) for reading/writing level JSON directly to `public/levels/`. CSRF token injected into `editor.html`, validated on every API call. Filename validation blocks path traversal. File watcher suppression prevents page reload on save. Client-side: `isDevServer()`, `listServerFiles()`, `loadFromServer()`, `saveToServer()` in io.ts. Extracted `serializeLevel()`/`serializeDungeon()` helpers (deduplicated field-ordering, added `fireflies` field). Toolbar: Save, Save As, Open Server buttons (hidden in production). `sourcePath` tracking on EditorApp. Ctrl+S shortcut. `performSave()` with validation, concurrent-save guard, dirty state reset.
- **Outdoor Forest Environment**: New forest environment with green fog, brighter ambient, procedural textures (forest wall, grass floor, canopy ceiling). `seeThrough` CharDef property — solid cells that render floor/ceiling without walls, filled with tree billboard sprites. Two-layer forest: hard forest walls (`F`) + dense see-through tree cells (`T`) + walkable clearings (`.`). Billboard material extracted to shared module. Editor: seeThrough checkbox, floor+tree overlay in grid/palette. Test level: `forest_test.json`.
- **Fireflies Particle Effect**: Ground-level glowing particles for forest environments. 12 yellow-green dots with per-particle fade in/out (custom ShaderMaterial for per-vertex opacity), independent blink (1/3 chance), seeded respawn delays. Level property `fireflies: boolean` with editor checkbox. 8–20s lifetime, 0.05–0.9 height range.
- **Stair Cross-Level Visual Feedback**: Level list yellow highlight on target stair's level when a stair is selected. Same-level stair connections drawn as wiring arrows (yellow active, gray inactive). Cross-level target marked with four converging arrowheads (celtic cross). Inspector "go to" link switches to target level and selects target stair. Placing a new stairs in dungeon mode auto-enters cross-level pick mode. Clicking an empty walkable cell during stair pick auto-creates a linked stair with opposite direction. Entity IDs now dungeon-wide unique (prevents duplicate IDs across levels). Stair grid/toolbar icons replaced with perspective step bars.
- **Stair Entity Pairing**: Stairs now reference paired stair entities by ID instead of targetLevel/targetCol/targetRow. Each stair has `facing` (N/S/E/W) and `target` (paired stair ID). Player spawns one cell in front of the target stair in its facing direction. StairInstance gains `facing` field. 3D stair renderer uses explicit facing instead of auto-detection. Editor inspector shows facing dropdown and stair target dropdown (cross-level). Editor grid shows facing indicator on stair icons. Cross-level validation checks target is a stair entity and spawn cell is walkable. Level JSON and DUNGEON-DESIGNER.md updated.
- **Area Editing UX Improvements**: Status hint bar at bottom of screen (blue-tinted, shows context messages during coordinate picking and drag operations). New areas auto-populate wall/floor/ceiling textures from level defaults. "Add Area" auto-expands the new area and enters rectangle drag-pick mode immediately. Rectangle drag selection on grid canvas (blue dashed rectangle, min/max normalization, single-click = 1×1). Area from/to Pick buttons support both single-click (sets one coordinate) and drag (sets all four coordinates). Blue hover highlight during coord pick/drag modes. Crosshair cursor for all pick modes. Escape/right-click cancels. Error banner moved to bottom of screen alongside status hint to prevent layout jumping.
- **Editor Phase 8 — Multi-Level Dungeon Support**: EditorApp dungeon-aware state model (loadDungeon, switchToLevel, addLevelToDungeon, removeLevelFromDungeon, moveLevelInDungeon, isDungeonDirty). io.ts discriminated union return type + exportDungeonFile. New LevelList component: dungeon name field, scrollable level entries with active highlight, move up/down/remove buttons, Add Level button (hidden in single-level mode). Inspector targetLevel field: dropdown populated from dungeon level IDs in dungeon mode. Toolbar: "New Dungeon" button. main.ts: full wiring for open/export/switch/add/remove/move, dungeon-wide validation before export, dungeon-aware dirty display. Cross-level stair validation: checks targetLevel exists, target position in-bounds and walkable on target level. editor.html: split sidebar into level list + level properties containers with new CSS. Undo/redo persists across level switches with cross-level auto-switch (UndoManager entries tagged with levelIndex). Error banner: clickable green "select" links on entity-related errors to auto-select the offending entity. Entity selection preserved across level switches (prerequisite for cross-level editing).
- **Editor Phase 7 — Final Polish**: Inline error banner (red-tinted bar below entity palette, updates after every mutation). Expanded validation: undefined grid chars, broken entity target references, player start on non-walkable/OOB, entities on non-walkable/OOB. Keyboard shortcuts: 1–4 for Select/Paint/Erase/Entity tools. Dirty state tracking: `*` prefix on level name + document title, `beforeunload` guard, clears on export/load/new, clears when undo returns to clean state (JSON snapshot comparison). Scrollable palette rows with thin scrollbar styling.
- **Editor Undo/Redo System**: Full-snapshot undo via `UndoManager` class (100-entry stacks). Paint drags coalesced into single undo step. Text/number field edits batched per editing session (committed on blur). Discrete changes (dropdowns, checkboxes, entity add/delete, pick mode, array add/remove) snapshot before mutation. Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y keyboard shortcuts (guarded against text input focus). Entity selection preserved across undo/redo by ID match. Stacks reset on level load/new.
- **Editor Phase 6 — Visual toolbars + inspector polish**: Texture swatch dropdowns (icon+name custom dropdowns for all 9 texture fields in LevelProperties). Two-row toolbar: floor/wall texture palette with ceiling/floor swatches, entity palette with canvas-drawn icons matching grid view. View toggles: floor/ceiling switch, item preview mode (renders actual sprites on grid). Wall-mounted entity icons for levers (perpendicular bar) and sconces (yellow circle + aura glow). Door bar with hinges (auto-detects orientation from adjacent walls). Item database integration: equipment/consumable inspector shows icon dropdown with all items grouped by subtype + readonly stat details. Enemy inspector shows stat details. Area coordinate pairs with map pick buttons. Toolbar entity buttons: right-click context menu for equipment/consumable item selection, remembered itemId injected on placement.
- **Stable entity IDs + ID-based references**: Every entity gets an `id` field (`type_N` format). Levers/plates reference doors via `target: entityId` instead of `targetDoor: "col,row"`. `GameState` has `entityById` Map + `resolveEntityPosition()`. `migrateEntities()` preprocessor auto-converts legacy `targetDoor` format. Editor auto-assigns IDs on entity creation, pick mode writes target entity IDs. All level JSONs migrated. 529 tests passing.
- **Data model unification**: Removed all special grid chars (D, S, U, O). Doors, stairs, and levers are now purely entity-based on walkable cells. `WALKABLE_CELLS` simplified to `new Set(['.'])`. Grid owns only geometry (`#`, `.`, ` `, charDefs), entities own all behavior. GameState tracks stairs in a new `stairs` Map. All renderers use entity lookup instead of grid char checks.
- Dungeon Editor Phase 5: interactive target picking (Pick button on lever/plate target fields, crosshair cursor, green/red hover for valid/invalid targets, Escape/right-click cancel), wiring visualization (dashed orange arrows for active connections, faint grey for all others — always visible), "Referenced by" section on doors with clickable source list
- Dungeon Editor Phase 4: left-side level properties panel (name/id, environment, texture defaults, charDefs array editor, areas array editor), "New" button for creating levels from scratch, centralized validation with export gating
- Dungeon Editor Phase 3: entity placement + inspector panel (select/cycle entities, entity tool with type dropdown, right-side inspector with type-specific property forms, delete key support, placement constraints)
- Dungeon Editor Phase 2: char palette, paint/erase tools, click/drag grid painting, JSON export
- Dungeon Editor Phase 1: separate `editor.html` entry point, 2D textured grid canvas with pan/zoom/hover, JSON import, entity icons, player start arrow
- Extracted `resolveTextures()` to `src/core/textureResolver.ts` (shared by game + editor)
- Vite multi-page build config (`vite.config.ts`)

## Known Issues

- Existing enemy stats rebalanced for M1 (rat HP 4→8, skeleton HP 8→20, orc HP 15→40) — may need tuning during F5

---

## Open Questions

(none — all resolved)
