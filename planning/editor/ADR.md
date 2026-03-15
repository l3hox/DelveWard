# Dungeon Editor — Architecture Decision Records

ADRs covering the major decisions made during editor development and related data model refactorings. Each records what was decided, why, what was rejected, and the known consequences.

---

## ADR-ED-01 — Grid Owns Geometry, Entities Own Behavior

**Status:** Accepted
**Date:** 2026-03-14

### Context

The original data model used special grid characters for interactive features: `D` (door), `S`/`U` (stairs down/up), `O` (lever cell). Each required a matching entity in the `entities` array with the same position. This created dual-tracked state — the grid char and entity had to agree on position, and both had to be valid independently. Silent breakage occurred when they diverged (e.g., a door entity on a `.` cell, or a `D` cell with no door entity). The editor made this worse: moving an entity required updating both the entity position and the grid char.

The `WALKABLE_CELLS` set (`['.', 'D', 'S', 'U', 'O']`) grew with each feature and leaked behavior semantics into the geometry layer. CharDefs (`solid: false`) added another implicit walkable class, further muddying the boundary.

### Decision

Remove all special grid characters. Grid owns only geometry:
- `#` = wall (solid)
- `.` = floor (walkable)
- ` ` = void (no geometry)
- CharDefs = texture zones (solid or walkable, no behavior)

All interactive features are entity-only, placed on walkable cells:
- Doors, stairs, levers, pressure plates, keys, enemies, items, sconces — all just entities on `.` or walkable charDef cells
- `WALKABLE_CELLS` simplified to `new Set(['.'])`
- Added `StairInstance` + `stairs` Map to GameState (same pattern as doors/keys/levers)
- All renderers use entity lookup instead of grid char checks

### Alternatives Considered

**Keep D/S/U/O but auto-generate from entities:** Considered — derive grid chars from the entity list at save/load time. Rejected because it preserves the dual-state problem (what if someone hand-edits the JSON and gets them out of sync?) and adds a lossy round-trip step.

**Keep only D (doors are geometry) but remove S/U/O:** Considered — doors arguably affect pathfinding and thus are "geometry." Rejected for consistency. With the editor, there's no need for any entity to be encoded in the grid.

### Consequences

**Positive:**
- Eliminates the entire class of grid/entity state divergence bugs
- Editor becomes simpler: entity CRUD is the only operation, no grid char syncing needed
- Grid painting is purely visual/geometric — never accidentally deletes an interactive feature
- CharDefs remain clean: they define texture zones, not behavior

**Negative / Risks:**
- **Backward compatibility:** All existing level JSONs needed migration (D→`.`, S→`.`, U→`.`, O→`.`). One-time cost, done.
- **Visual distinction in grid:** Without special chars, doors/stairs are only visible via entity overlay icons. Acceptable — the editor always renders entity icons. For hand-editing JSON, the entity array is the source of truth (documented in DUNGEON-DESIGNER.md).

---

## ADR-ED-02 — Stable Entity IDs + ID-Based Cross-References

**Status:** Accepted
**Date:** 2026-03-14

### Context

After ADR-ED-01, levers and pressure plates still referenced doors by position: `targetDoor: "col,row"`. This was the last position-based coupling in the data model. Problems:

1. **Editor fragility:** Moving a door entity broke all lever/plate references to it. The editor would need complex "update all references on move" logic for every entity reposition.
2. **Not generalizable:** The field name `targetDoor` and `"col,row"` format assumed the target is always a door at a specific position. Future entity types (spawners, trap doors, dart throwers, logical gates) need generic entity-to-entity references.
3. **Ambiguous at runtime:** Position strings required parsing (`parseDoorKey()`) and re-resolution on every access. No way to validate that the referenced entity still existed at that position.

The `keyId` system already proved that string-based references work well — keys and doors share a `keyId` string that acts as a group identifier. But `keyId` is a many-to-many group link, not a direct reference.

### Decision

Every entity gets an optional `id` field. Cross-references use entity IDs.

**ID format:** `{type}_{N}` — human-readable, auto-generated: `door_1`, `lever_2`, `plate_1`. Editor scans existing IDs to avoid collisions.

**Field rename:** `targetDoor: "col,row"` → `target: entityId`. The generic name `target` supports future non-door targets without another rename.

**Runtime resolution:**
- `GameState.entityById: Map<string, {col, row, type}>` — derived index, not saved in snapshots
- `_rebuildEntityIndex()` rebuilds from instance Maps after `_parseEntities()` and `loadLevelState()`
- `resolveEntityPosition(id)` provides the lookup
- `activateLever()` and `activatePressurePlate()` return entity IDs, callers resolve to positions

**`id` is optional on Entity type.** Editor auto-generates for all new entities. Validator requires `id` on referenced entities (doors targeted by levers/plates) and referencing entities (levers/plates with `target`). Entities that don't participate in references can omit `id`.

**`keyId` stays as-is.** It's a group identifier (one key unlocks all doors with the same `keyId`), not a direct reference. Different concept, different field.

**Multiple targets:** Single `target: string` now. Documented path to `target: string | string[]` when logical gates or multi-target mechanisms arrive. Not implemented yet — YAGNI.

**Backward compatibility:** `migrateEntities()` preprocessor in levelLoader:
1. Auto-assigns `door_N` IDs to doors without IDs
2. Converts `targetDoor: "col,row"` → finds door at that position → `target: doorId`, deletes `targetDoor`
3. Runs before validation, transparent to callers

### Alternatives Considered

**Position-based references with auto-update on move:** Considered — the editor updates all `targetDoor` strings when an entity is repositioned. Rejected: fragile (what if the update misses one?), doesn't generalize to non-positional references, and keeps the parsing overhead.

**`targetId` instead of `target`:** Considered for clarity. Rejected — `target` is shorter, generic enough, and unambiguous in context (it's always a reference to another entity). `targetId` implies it might be something other than an entity reference.

**Required `id` on all entities:** Considered. Rejected — adds noise to simple entities like enemies, equipment, and sconces that are never referenced. Optional with editor auto-generation is the right balance.

**UUIDs for entity IDs:** Rejected. `door_1` is human-readable in JSON, debuggable, and sufficient for levels with tens of entities. UUIDs would make hand-editing JSON painful and diffs unreadable.

### Consequences

**Positive:**
- Entity repositioning (future drag-to-move) won't break references
- Generic `target` field works for any future entity-to-entity wiring
- Editor pick mode is simpler: write an ID, not compute a position string
- `entityById` index makes runtime resolution O(1) instead of string parsing + Map lookup
- Level JSON is more readable: `"target": "door_3"` vs `"targetDoor": "8,5"`

**Negative / Risks:**
- **ID collision:** If two levels in a dungeon file use the same IDs (e.g., both have `door_1`), cross-level references could collide. Mitigated: IDs are per-level scope, and cross-level references (stairs) use `targetLevel` + `targetCol/Row`, not entity IDs. Document this explicitly if cross-level entity references are ever added.
- **Migration preprocessor:** `migrateEntities()` mutates the entity array in-place before validation. Must be idempotent (re-running on already-migrated data is a no-op). Currently correct — it only acts on entities with `targetDoor` and no `target`.
- **Derived index staleness:** `entityById` is rebuilt at specific points (`_parseEntities`, `loadLevelState`). If entity positions change at runtime (not currently possible — entities don't move except enemies, which aren't indexed), the index would go stale. This is fine for M1 but must be revisited if entity repositioning becomes runtime behavior.

---

## ADR-ED-03 — Editor as Separate Entry Point, Shared Core Modules

**Status:** Accepted
**Date:** 2026-03-14

### Context

The dungeon editor needs access to the same type definitions, texture generators, validation logic, and enemy/item databases as the game. Two approaches: embed the editor in the game (toggle mode), or build it as a separate entry point sharing core modules.

### Decision

Separate Vite entry point (`editor.html` + `src/editor/main.ts`). The editor imports from `src/core/`, `src/level/`, `src/enemies/`, and `src/rendering/textures.ts` but has no dependency on game runtime code (`src/main.ts`, `src/rendering/dungeon.ts`, Three.js scene management).

Vite multi-page config in `vite.config.ts` builds both entry points.

Editor modules live in `src/editor/`:
- `EditorApp.ts` — state container and business logic
- `GridCanvas.ts` — 2D canvas rendering and mouse interaction
- `Inspector.ts` — entity property panel (DOM)
- `LevelProperties.ts` — level-wide settings panel (DOM)
- `Toolbar.ts` — tool selection and char/entity palette (DOM)
- `io.ts` — file import/export

### Alternatives Considered

**Editor embedded in game:** A toggle between play mode and edit mode within the same Three.js scene. Rejected — couples editor UI to the game loop, makes the game bundle larger, and the editor doesn't need 3D rendering (2D canvas is faster and more appropriate for grid editing).

**Editor as standalone project:** Separate repo importing types as a package. Rejected — overkill for a solo project. Shared source files with Vite multi-page are simpler and keep types in sync automatically.

### Consequences

**Positive:**
- Editor never ships in the game bundle (tree-shaken by Vite)
- Editor can use DOM-based UI (panels, forms, buttons) without conflicting with the game's HUD canvas
- Core modules stay clean — editor is a consumer, not a modifier
- 2D canvas renders faster than Three.js for grid visualization

**Negative / Risks:**
- **Module boundary discipline:** Editor must only read from shared modules, never modify game runtime state. Currently enforced by code review — no runtime enforcement. If shared modules gain side effects (e.g., texture caching that assumes single-context), the editor could trigger unexpected state.
- **No 3D preview:** The 2D grid view doesn't show how the level looks in-game. A future "3D preview" feature would need to embed a subset of the game renderer. Deferred — the 2D view is sufficient for layout and wiring.

---

## ADR-ED-04 — Full-Snapshot Undo/Redo

**Status:** Accepted
**Date:** 2026-03-15

### Context

The editor had no undo/redo. Every mutation (grid painting, entity CRUD, property edits) was permanent until export/reimport. One misclick could require manual JSON repair.

The editor state is a single `DungeonLevel` object (2–16 KB as JSON). Two approaches were considered: command-pattern (reversible command objects per mutation type) and full-snapshot (clone entire level before each mutation).

### Decision

Full-snapshot undo via `JSON.parse(JSON.stringify(level))`. A standalone `UndoManager` class manages two stacks (undo/redo, max 100 entries).

**Snapshot granularity:**
- **Discrete mutations** (dropdown change, checkbox toggle, entity add/delete, pick mode complete, array add/remove): `snapshot()` captures state before the mutation. Each is its own undo step.
- **Paint drags** (mouse down → drag → mouse up): `beginBatch()` on mousedown, `commitBatch()` on mouseup. Entire drag coalesced into one undo step.
- **Text/number field edits**: `beginBatch()` on first `input` event (idempotent — safe to call on every keystroke), `commitBatch()` on `blur`. Entire editing session is one undo step.

**Callback architecture:** Components (Inspector, LevelProperties, GridCanvas) expose typed callbacks (`onBeforeDiscreteChange`, `onBeginTextEdit`, `onCommitTextEdit`, `onBeforePaint`, `onAfterPaint`, `onBeforeEntityAdd`, `onBeforePickComplete`). `main.ts` wires these to `UndoManager` methods. The UndoManager has no knowledge of UI components.

**Level restoration:** `EditorApp.restoreLevel(level)` sets the level, rebuilds derived state (charDefMap, walkableSet, validation), preserves entity selection by ID match, and fires `onLevelRestored` for UI refresh.

### Alternatives Considered

**Command pattern (reversible command objects):** Each mutation type (paint cell, add entity, change property) would have an `execute()` and `undo()` method. Rejected — high implementation cost (one command class per mutation type, must handle every edge case), error-prone (an incomplete `undo()` silently corrupts state), and unnecessary given the small level sizes. Full-snapshot is ~5 lines per mutation site vs ~30+ lines per command class.

**Structural sharing / immutable state:** Store immutable level snapshots with shared subtrees (like Immer). Rejected — the level object is small enough that deep cloning via JSON is negligible in cost. Structural sharing adds complexity (must ensure no mutation of shared nodes) for no measurable benefit at this scale.

**Diff-based undo:** Store JSON diffs between states. Rejected — JSON diff/patch libraries add dependency weight, and the space savings are marginal (100 × 16 KB = 1.6 MB worst case vs perhaps 0.5 MB with diffs). Diffing is also slower than cloning for small objects.

### Consequences

**Positive:**
- Simple, correct implementation (~70 lines for UndoManager)
- Every mutation type gets undo for free — no per-type command logic
- JSON roundtrip acts as an implicit deep clone — no shared references between snapshots
- Coalescing (paint drags, text edits) keeps the undo stack meaningful — users don't have to press Ctrl+Z 50 times after typing a level name

**Negative / Risks:**
- **JSON roundtrip strips `undefined`:** Properties set to `undefined` become absent after `JSON.parse`. This is fine — the codebase uses `??` defaults everywhere, and `undefined` vs absent is semantically equivalent.
- **Memory:** 100 × 16 KB = 1.6 MB worst case. Negligible for a desktop browser editor. The max can be tuned if levels grow significantly.
- **No selective undo:** Can't undo "just the last entity move" while keeping a paint change. Full-snapshot means all-or-nothing. Acceptable for a level editor — users expect linear undo.
