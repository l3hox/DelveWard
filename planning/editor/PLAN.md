# Dungeon Editor — Implementation Plan

Phased build order. Each phase produces a usable (if limited) editor.

---

## Phase 1: Scaffold + Grid Canvas

**Goal**: See a level rendered as a 2D textured grid, pan/zoom, hover coordinates.

- `editor.html` + Vite multi-page config
- `EditorApp.ts` — state container (loaded level data, selection, active tool)
- `GridCanvas.ts` — canvas rendering:
  - Draw each cell with resolved texture (reuse `textures.ts` generators, scaled to tile size)
  - Wall cells darker/distinct from floor
  - Void cells transparent/checkered
  - Cell coordinate tooltip on hover
  - Pan (middle-click drag or scroll) + zoom (wheel)
- `io.ts` — import: file open dialog → JSON parse → load into editor state
- Basic HTML layout: canvas fills center, placeholder sidebars

**Deliverable**: Open a level JSON, see the textured 2D grid, pan around.

---

## Phase 2: Grid Painting

**Goal**: Edit the grid by painting characters.

- `Toolbar.ts` — tool buttons (Select, Paint, Erase) + char palette (built-in chars + charDefs from loaded level)
- Paint tool: click/drag applies selected char to grid cells
- Erase tool: paints void (space)
- Grid canvas re-renders on edit
- Export button: serialize grid + existing entities to JSON, download

**Deliverable**: Load level, paint walls/floors, export modified JSON.

---

## Phase 3: Entity Placement + Inspector ✓

**Goal**: Click to select entities, view/edit properties, place new ones.

- Select tool: click cell → if entity present, select it; show in inspector
- `Inspector.ts` — right sidebar panel:
  - Shows type + coordinates header for selected entity
  - Type-specific form controls (dropdowns, text inputs, number inputs)
  - Door state→locked dynamically shows keyId field
  - Enemy type dropdown populated from ENEMY_DEFS
- Entity tool: toolbar dropdown for entity type → click grid to place
- Placement constraints (door→D cell, stairs→S/U cell, others→walkable)
- Delete selected entity (button or Delete key, with input focus guard)
- Cycling selection for multi-entity cells
- Cyan selection highlight, green entity-tool hover

**Deliverable**: Full entity CRUD with visual feedback on grid.

---

## Phase 4: Level Properties Tree

**Goal**: Edit level-wide settings without touching JSON.

- `LevelPropertiesTree.ts` — DOM tree panel:
  - Level name, id, environment, ceiling, skybox, dust, drips
  - Defaults (texture dropdowns)
  - CharDefs list (add/edit/remove)
  - Areas list (add/edit/remove, coordinate inputs)
- Grid canvas updates when defaults/charDefs change (re-resolves textures)
- New level: blank grid with configurable dimensions

**Deliverable**: Create a level from scratch entirely in the editor.

---

## Phase 5: Target Picking + Wiring Visualization

**Goal**: Interactive wiring for levers, plates, stairs.

- `PickMode.ts` — state machine:
  - Activated from inspector pick button
  - Grid highlights valid targets (D cells for lever/plate, any cell for stairs)
  - Click sets the reference, exits pick mode
  - Escape cancels
- Wiring overlays on grid:
  - Selected lever/plate → target overlay on door cell
  - Selected door → source overlays on referencing levers/plates
- "Referenced by" section in inspector with click-to-navigate
- Cursor changes during pick mode

**Deliverable**: Full wiring workflow without manual coordinate entry.

---

## Phase 6: Polish + Validation

**Goal**: Production-quality editing experience.

- Run `validateLevel()` on export, show errors inline
- Entity list panel (all entities, filterable by type)
- Grid resize (expand/shrink edges)
- Keyboard shortcuts (Delete, Escape, tool hotkeys)
- Unsaved changes warning on close/navigate
- Local storage auto-save (recover from accidental close)

---

## Future (post-MVP)

- Multi-level dungeon editing (level tabs, stair wiring across levels)
- 3D preview panel (embed game renderer)
- Undo/redo (command pattern)
- Copy/paste rectangular regions
- Drag-to-reposition entities on grid
