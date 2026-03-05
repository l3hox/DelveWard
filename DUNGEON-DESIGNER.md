# DelveWard — Dungeon Designer Guide

How to build a level for DelveWard. This guide covers the full JSON schema, all features, and working examples. Intended for both human authors and AI agents.

---

## Coordinate system — IMPORTANT

All coordinates are **0-based**. The top-left corner of the grid is `(col: 0, row: 0)`.

- **col** = character position within a row string (X axis, left-to-right, starting at 0)
- **row** = index in the grid array (Z axis, top-to-bottom, starting at 0)

To find the coordinate of a cell, count characters from the left starting at 0 (col) and rows from the top starting at 0 (row).

**Example** — finding coordinates in this grid:
```
row 0:  "#########"
row 1:  "#.......#"
row 2:  "#.#.#.#.#"
row 3:  "#.......#"
row 4:  "####S####"
         0123456789
              ^col
```

The `S` cell is at **col 4, row 4** (count: `#`=0, `#`=1, `#`=2, `#`=3, `S`=4).

**Common mistake**: When a row has a pattern like `#.#.#.#.#`, the `.` cells are at cols 1, 3, 5, 7 and the `#` cells are at cols 0, 2, 4, 6, 8. Do not place entities or playerStart on a `#` col when you want a walkable cell.

**Verification checklist** for every coordinate you write:
1. Count the row index from the top (0-based) — that's `row`
2. Count the character position from the left (0-based) — that's `col`
3. Check that `grid[row][col]` is the expected character (walkable for playerStart/keys/plates, `D` for doors, `S`/`U` for stairs)

---

## File formats

### Single level
Levels are JSON files stored in `public/levels/`. Each file defines one dungeon floor.

```json
{
  "name": "My Dungeon",
  "grid": [ ... ],
  "playerStart": { "col": 1, "row": 1, "facing": "S" },
  "entities": [],
  "defaults": { ... },
  "charDefs": [ ... ],
  "areas": [ ... ]
}
```

### Multi-level dungeon

A dungeon file wraps multiple levels with stair connections between them.

```json
{
  "name": "My Dungeon",
  "levels": [
    {
      "id": "level_1",
      "name": "First Floor",
      "grid": [ ... ],
      "playerStart": { "col": 1, "row": 1, "facing": "S" },
      "entities": [ ... ]
    },
    {
      "id": "level_2",
      "name": "Second Floor",
      "grid": [ ... ],
      "playerStart": { "col": 1, "row": 1, "facing": "N" },
      "entities": [ ... ]
    }
  ]
}
```

- Each level must have a unique `id` (non-empty string)
- The first level in the array is loaded on game start
- `playerStart` is used only when loading the level directly (not when arriving via stairs)
- Stairs entities connect levels — see the Stairs entity type below

---

## Required fields (per level)

### `name` (string)

Display name for the level.

### `grid` (string[])

An array of strings defining the dungeon layout. Each string is one row, read top-to-bottom. All rows must be the same length.

The coordinate system: **col** = character position within a row (X axis, left-to-right), **row** = index in the array (Z axis, top-to-bottom).

#### Built-in characters

| Char | Meaning | Walkable |
|------|---------|----------|
| `#`  | Wall    | No       |
| `.`  | Floor   | Yes      |
| `D`  | Door    | Yes      |
| `S`  | Stairs down | Yes  |
| `U`  | Stairs up   | Yes  |
| `O`  | Object (details in entities) | Yes |
| ` `  | Void (empty space, no geometry) | No |

Walls (`#`) are never rendered as geometry themselves. Instead, walkable cells detect solid neighbors and render wall faces toward them.

#### Custom characters via charDefs

You can define additional characters using `charDefs` (see below). This lets you paint texture themes directly into the grid, making the layout a visual map of room styles.

### `playerStart` (object)

Where the player spawns.

```json
{ "col": 1, "row": 1, "facing": "S" }
```

- `col` (number) — column index (0-based, X axis)
- `row` (number) — row index (0-based, Z axis)
- `facing` (string) — one of `"N"`, `"E"`, `"S"`, `"W"`
- Must be within grid bounds
- Must be on a walkable cell (built-in walkable char or a walkable charDef)

### `entities` (array)

Array of entity objects placed on the grid. Can be empty (`[]`).

```json
{ "col": 5, "row": 3, "type": "door" }
```

Each entity has `col`, `row`, `type`, and any type-specific extra properties.

#### Entity types

**Door** (`type: "door"`) — placed on `D` cells. Note: `D` cells without a door entity automatically get a closed, non-mechanical door.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | string | No | `"closed"` (default), `"open"`, or `"locked"` |
| `keyId` | string | No | Required if `state` is `"locked"`. Must match a key entity's `keyId`. |

```json
{ "col": 5, "row": 2, "type": "door", "state": "locked", "keyId": "gold_key" }
```

**Key** (`type: "key"`) — placed on walkable cells. Auto-picked up when player steps on it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyId` | string | Yes | Identifier matching a locked door's `keyId` |

```json
{ "col": 3, "row": 4, "type": "key", "keyId": "gold_key" }
```

**Lever** (`type: "lever"`) — placed on `O` cells. Player activates by standing on the cell and facing the wall the lever is mounted on.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetDoor` | string | Yes | `"col,row"` of the door to toggle |
| `wall` | string | No | Which wall the lever is on: `"N"`, `"S"`, `"E"`, or `"W"`. Auto-detected from adjacent walls if omitted. |

The targeted door is marked **mechanical** — it cannot be opened or closed by player interaction (Space key). It can only be operated by the lever.

```json
{ "col": 7, "row": 8, "type": "lever", "targetDoor": "8,5", "wall": "E" }
```

**Pressure plate** (`type: "pressure_plate"`) — placed on walkable cells. Triggers automatically when player steps on it. One-way (stays open).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetDoor` | string | Yes | `"col,row"` of the door to open |

The targeted door is marked **mechanical** — same as lever-targeted doors.

```json
{ "col": 4, "row": 9, "type": "pressure_plate", "targetDoor": "4,7" }
```

**Stairs** (`type: "stairs"`) — placed on `S` (stairs down) or `U` (stairs up) cells. Triggers automatically when player steps on the cell (not via Space).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | string | Yes | `"down"` (must be on `S` cell) or `"up"` (must be on `U` cell) |
| `targetLevel` | string | Yes | `id` of the destination level |
| `targetCol` | number | Yes | Column on the destination level where player arrives |
| `targetRow` | number | Yes | Row on the destination level where player arrives |

The target position must be a walkable cell on the target level. Typically, stairs down target a `U` cell on the lower level and vice versa.

```json
{ "col": 4, "row": 8, "type": "stairs", "direction": "down", "targetLevel": "lower_vault", "targetCol": 4, "targetRow": 0 }
```

**Verification**: Use the coordinate counting method above to confirm that `targetCol`/`targetRow` land on the expected cell in the target level's grid.

#### Door behavior summary

| Door type | Open with Space | Close with Space | Visual cue |
|-----------|----------------|-----------------|------------|
| Normal (no entity or plain door entity) | Yes | Yes | Brass button on frame |
| Locked | Yes (with matching key) | Yes (after unlocking) | Iron-banded texture |
| Mechanical (lever/plate target) | No | No | No button on frame |

All doors have a 3D stone frame (pillars + lintel) that stays visible when open. Door panels slide up on open and down on close.

---

## Optional fields — texture theming

Levels use a 4-layer texture resolution system. Each layer overrides the previous. You can use any combination of these — none, one, or all.

### Layer 1: Hard-coded defaults (always present)

If nothing else is specified, every cell uses:

| Surface | Default texture |
|---------|----------------|
| Wall    | `stone`        |
| Floor   | `stone_tile`   |
| Ceiling | `dark_rock`    |

### Layer 2: `defaults` (object, optional)

Level-wide texture overrides. Any field you set here replaces the hard-coded default for the entire level.

```json
"defaults": {
  "wallTexture": "brick",
  "floorTexture": "dirt"
}
```

All three fields are optional — omit any to keep the hard-coded default for that surface.

### Layer 3: `charDefs` (array, optional)

Define custom ASCII characters that carry texture information. Each charDef maps a single character to a solid/walkable behavior and a set of textures. When that character appears in the grid, its textures override layers 1-2 for that cell.

```json
"charDefs": [
  { "char": "b", "solid": false, "wallTexture": "brick", "floorTexture": "stone_tile" },
  { "char": ",", "solid": false, "floorTexture": "cobblestone" },
  { "char": "m", "solid": false, "wallTexture": "mossy", "floorTexture": "dirt" },
  { "char": "@", "solid": true, "wallTexture": "wood" }
]
```

#### CharDef fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `char` | string | Yes | Single ASCII character. Must not be a built-in char (`# . D S U O` or space). No duplicates. |
| `solid` | boolean | Yes | `false` = walkable (player can walk on it, floor/ceiling are rendered). `true` = solid (blocks movement, acts like a wall). |
| `wallTexture` | string | No | Wall texture name |
| `floorTexture` | string | No | Floor texture name |
| `ceilingTexture` | string | No | Ceiling texture name |

Omitted texture fields inherit from layers 1-2 (hard-coded defaults and `defaults`).

#### Walkable charDefs

Walkable charDefs (`"solid": false`) work like themed floor tiles. The cell gets floor, ceiling, and wall textures from the charDef. Example: `b` = brick-themed walkable cell.

#### Solid charDefs

Solid charDefs (`"solid": true`) block movement like walls. Their special feature: if a solid charDef has `wallTexture`, adjacent walkable cells will use that texture for the wall face toward this cell. This lets you create walls that look different from different sides — e.g., `@` = wood wall that appears wooden from any neighboring cell.

#### Design tip

charDefs make the grid a visual map of your dungeon's texture zones:

```
####################
#bbbbbbb############
#bbbbbbb############     b = brick room
####,###############     , = cobblestone corridor
####mmmmmmm#########     m = mossy room
####mmmmmmm#########     w = wood room
#########,##########
#########wwwwww#####
####################
```

This is much more readable than specifying textures by coordinate ranges.

### Layer 4: `areas` (array, optional)

Rectangular texture overrides by coordinate range. Later entries in the array win over earlier ones when they overlap.

```json
"areas": [
  {
    "fromCol": 1, "toCol": 7,
    "fromRow": 1, "toRow": 5,
    "wallTexture": "brick",
    "floorTexture": "stone_tile"
  }
]
```

#### Area fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fromCol` | number | Yes | Left column (inclusive) |
| `toCol` | number | Yes | Right column (inclusive) |
| `fromRow` | number | Yes | Top row (inclusive) |
| `toRow` | number | Yes | Bottom row (inclusive) |
| `wallTexture` | string | No | Wall texture name |
| `floorTexture` | string | No | Floor texture name |
| `ceilingTexture` | string | No | Ceiling texture name |

- `fromCol` must be <= `toCol`, `fromRow` must be <= `toRow`
- All coordinates must be within grid bounds
- At least one texture field must be specified

Areas override everything below them (including charDefs). Use them for fine-grained patches when charDefs alone aren't enough.

---

## Available textures

### Wall textures

| Name | Look |
|------|------|
| `stone` | Gray stone blocks (default) |
| `brick` | Red/brown brick pattern |
| `mossy` | Green-tinted stone with moss |
| `wood` | Brown wooden planks |

### Floor textures

| Name | Look |
|------|------|
| `stone_tile` | Gray stone tiles (default) |
| `dirt` | Brown earth |
| `cobblestone` | Rounded cobblestone pattern |

### Ceiling textures

| Name | Look |
|------|------|
| `dark_rock` | Dark rough stone (default) |
| `wooden_beams` | Brown wooden beam pattern |

---

## Texture resolution order (summary)

For any walkable cell, textures are resolved bottom-up. Each layer only overrides the specific fields it defines:

1. **Hard-coded**: stone / stone_tile / dark_rock
2. **`defaults`**: level-wide overrides
3. **`charDefs`**: per-character overrides (based on the grid character)
4. **`areas`**: rectangular region overrides (later entries win on overlap)

For wall faces specifically: if the solid neighbor is a solid charDef with `wallTexture`, that texture is used for the wall face, regardless of the walkable cell's own wall texture.

---

## Validation rules

The level loader validates all of the above. Levels that fail validation will not load. Key rules:

- All grid rows must be the same length
- Grid may only contain built-in chars and chars defined in `charDefs`
- `playerStart` must be on a walkable cell (including walkable charDefs)
- charDef `char` must be a single character, not a built-in, no duplicates
- charDef `solid` must be a boolean
- All texture names must be from the available texture lists above
- Area coordinates must be in bounds with `from` <= `to`
- Areas must specify at least one texture

---

## Examples

### Minimal level

```json
{
  "name": "Tiny Room",
  "grid": [
    "#####",
    "#...#",
    "#...#",
    "#...#",
    "#####"
  ],
  "playerStart": { "col": 2, "row": 2, "facing": "N" },
  "entities": []
}
```

All cells use default textures (stone walls, stone tile floor, dark rock ceiling).

### Level with defaults

```json
{
  "name": "Mossy Cellar",
  "grid": [
    "#######",
    "#.....#",
    "#.....#",
    "#.....#",
    "#######"
  ],
  "playerStart": { "col": 1, "row": 1, "facing": "S" },
  "entities": [],
  "defaults": {
    "wallTexture": "mossy",
    "floorTexture": "dirt"
  }
}
```

Every cell uses mossy walls and dirt floor. Ceiling remains dark_rock (not overridden).

### Level with charDefs (recommended for themed rooms)

```json
{
  "name": "Three Rooms",
  "grid": [
    "##############",
    "#bbbb###mmmmm#",
    "#bbbb...mmmmm#",
    "#bbbb###mmmmm#",
    "#######,######",
    "######www#####",
    "######www#####",
    "##############"
  ],
  "playerStart": { "col": 2, "row": 2, "facing": "E" },
  "entities": [],
  "charDefs": [
    { "char": "b", "solid": false, "wallTexture": "brick", "floorTexture": "stone_tile" },
    { "char": "m", "solid": false, "wallTexture": "mossy", "floorTexture": "dirt" },
    { "char": ",", "solid": false, "floorTexture": "cobblestone" },
    { "char": "w", "solid": false, "wallTexture": "wood", "floorTexture": "cobblestone", "ceilingTexture": "wooden_beams" }
  ]
}
```

The grid visually shows which room has which theme. Plain `.` cells in the corridor use default textures.

### Solid charDef (custom wall appearance)

```json
"charDefs": [
  { "char": "@", "solid": true, "wallTexture": "wood" }
]
```

Place `@` in the grid where you want a wall that looks wooden from adjacent walkable cells, while `#` walls remain stone.
