# Dungeon Editor — Design

Standalone visual editor for DelveWard dungeon levels. Separate Vite entry point, shares core modules with the game.

---

## Goals

- Eliminate manual coordinate counting for entity placement
- Visual grid painting with textured 2D preview
- Interactive entity wiring (lever→door, plate→door, stairs→target)
- Export valid JSON consumable by the existing level loader

---

## Architecture

### Entry point

Separate `editor.html` + `src/editor/main.ts` — own Vite entry, no game code pollution.

### Shared modules (read-only from editor)

| Module | Usage in editor |
|---|---|
| `src/core/types.ts` | `DungeonLevel`, `Entity`, `CharDef`, etc. |
| `src/core/textureNames.ts` | Valid texture name sets |
| `src/rendering/textures.ts` | Procedural texture generators (for 2D grid preview) |
| `src/level/levelLoader.ts` | `validateLevel()` for export validation |
| `src/core/itemDatabase.ts` | Item IDs for equipment/consumable dropdowns |
| `src/enemies/enemyTypes.ts` | Enemy type names for dropdowns |

### Editor modules (`src/editor/`)

```
EditorApp.ts          — top-level orchestrator, state management
GridCanvas.ts         — 2D canvas: textured tiles, entity icons, overlays, interaction
LevelPropertiesTree.ts — DOM tree: level metadata, environment, defaults, charDefs, areas
EntityInspector.ts    — DOM tree: selected entity properties, reverse references
Toolbar.ts            — tool selection (paint, select, erase), char palette
PickMode.ts           — target picking state machine (for wiring)
io.ts                 — import/export JSON, file dialogs
```

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│ Toolbar (top)                                           │
│ [Select] [Paint] [Erase] | Char: [# . D S U O b m ...] │
├──────────┬──────────────────────────┬───────────────────┤
│ Level    │                          │ Entity            │
│ Props    │    Grid Canvas (2D)      │ Inspector         │
│ Tree     │                          │                   │
│          │    - textured tiles      │ - properties      │
│          │    - entity icons        │ - dropdowns       │
│          │    - hover coordinates   │ - pick buttons    │
│          │    - selection highlight  │ - reverse refs    │
│          │    - wiring overlays     │                   │
│          │                          │                   │
└──────────┴──────────────────────────┴───────────────────┘
```

---

## Grid Canvas

- Renders top-down 2D view of the level grid
- Each cell shows its resolved texture (all 4 layers: defaults → charDefs → areas)
- Entity icons overlaid on cells (door, key, enemy type, lever, etc.)
- Hover: shows cell coordinates, highlights cell
- Click: depends on active tool (paint char, select entity, pick target)
- Pan and zoom support

### Selection overlays

- **Selected entity**: strong colored border on its cell
- **Target overlay**: distinct icon/color on the target cell (e.g. lever's target door)
- **Source overlay**: different icon/color on cells that reference the selected entity ("referenced by")
- **Pick mode**: valid targets highlighted, invalid dimmed, cursor changes

---

## Level Properties Tree (left panel)

Collapsible tree showing all level-wide settings:

```
▼ Level
  name: [text input]
  id: [text input]
▼ Environment
  environment: [dropdown: dungeon/mist]
  ceiling: [checkbox]
  skybox: [dropdown: none/starry-night]
  dustMotes: [checkbox]
  waterDrips: [checkbox]
▼ Defaults
  wallTexture: [dropdown]
  floorTexture: [dropdown]
  ceilingTexture: [dropdown]
▼ CharDefs
  ▶ 'b' — walkable, brick/stone_tile
  ▶ 'm' — walkable, mossy/dirt
  [+ Add CharDef]
▼ Areas
  ▶ Area 0 (1,1)→(5,5)
  [+ Add Area]
```

---

## Entity Inspector (right panel)

Shows properties of the currently selected entity. Changes with selection.

### Standard fields

All entities show `type`, `col`, `row` (coordinates read-only — reposition by dragging on grid).

### Type-specific fields

- **door**: `state` dropdown, `keyId` text (if locked)
- **key**: `keyId` text
- **lever**: `wall` dropdown, `target` with pick button
- **pressure_plate**: `target` with pick button
- **stairs**: `direction` dropdown, `targetLevel` dropdown, `targetCol`/`targetRow` with pick button
- **enemy**: `enemyType` dropdown
- **equipment**: `itemId` dropdown (from item DB)
- **consumable**: `itemId` dropdown (from item DB)
- **torch_sconce**: `wall` dropdown

### Interactive target picking

Spatial reference fields (lever target, plate target, stair target) show a pick button. Clicking it enters pick mode on the grid — valid targets are highlighted, click to set, Escape to cancel.

### Reverse references

Computed "Referenced by" section at the bottom. If the selected entity is targeted by other entities (e.g. a door targeted by a lever), those are listed with click-to-select navigation.

```
─── Referenced by ───
▶ Lever @ (7, 8)     ← click to select
▶ Plate @ (4, 9)     ← click to select
```

---

## Tools

| Tool | Behavior |
|---|---|
| **Select** | Click cell to select entity. Click empty cell to deselect. |
| **Paint** | Click/drag to paint the selected char onto grid cells. |
| **Erase** | Click/drag to paint void (space) onto grid cells. |
| **Add Entity** | Click cell to place a new entity of the selected type. |

---

## Import/Export

- **Import**: File open dialog or paste JSON → parse → validate → load into editor state
- **Export**: Serialize editor state → run through `validateLevel()` → download as JSON or copy to clipboard
- Validation errors shown inline before export completes

---

## Deferred (not MVP)

- 3D preview (in-editor game renderer)
- Multi-level dungeon editing / stair target cross-level picking
- Undo/redo
- Grid resize tool
- Copy/paste regions
- Auto-save / local storage persistence
