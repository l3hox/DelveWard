# DelveWard — PROGRESS.md

Session-to-session state. Read this at the start of every session.

For detailed history see: `COMPLETED.md`, `SESSION-LOG.md`, `IDEAS.md` (all in `planning/`).

---

## Versioning

`0.milestone` — e.g. `0.1` when Milestone 1 ships. Current tag: **v0.0.9**.

---

## Current Milestone

**Dungeon Editor** (pulled forward from later milestones)

---

## Next Steps

### M1 Implementation
- [x] Phase A: Entity registry + item loader
- [x] Phase B: Stats & leveling
- [x] Phase C: Equipment expansion (weapon subtypes, item requirements, effective stats)
- [x] Phase D: Loot & drops (enemy death → loot roll → ground entities, gold)
- [x] Phase E: UI (enemy health bars, inventory overlay, tooltips, attribute panel, legacy cleanup)
- [x] Phase F: Content (new enemy types, AI behaviors, M1 test dungeon)

### Remaining for M1 ship
- [x] F3: Enemy sprite art (6 new enemies)
- [x] F5: Playtesting & balance pass
- [x] Tag v0.1 (**shipped**)

### Dungeon Editor
- [x] Phase 1: Scaffold + grid canvas (2D textured view, pan/zoom, import JSON)
- [x] Phase 2: Grid painting (char palette, paint/erase tools, export)
- [x] Phase 3: Entity placement + inspector (select, CRUD, property editing)
- [x] Phase 4: Level properties panel + new level + validation
- [x] Phase 5: Target picking + wiring visualization (interactive references)
- [x] Phase 6: Visual toolbars + inspector polish (texture swatches, entity icons, item database integration)
- [ ] Phase 7: Final polish + validation (error display, resize, shortcuts)

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
