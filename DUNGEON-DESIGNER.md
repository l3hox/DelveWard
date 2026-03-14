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
row 4:  "#########"
         012345678
```

A floor cell `.` at row 1, col 1 would be at **col 1, row 1**.

**Common mistake**: When a row has a pattern like `#.#.#.#.#`, the `.` cells are at cols 1, 3, 5, 7 and the `#` cells are at cols 0, 2, 4, 6, 8. Do not place entities or playerStart on a `#` col when you want a walkable cell.

**Verification checklist** for every coordinate you write:
1. Count the row index from the top (0-based) — that's `row`
2. Count the character position from the left (0-based) — that's `col`
3. Check that `grid[row][col]` is the expected character (walkable for playerStart/keys/plates/doors/stairs/levers)

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
  "areas": [ ... ],
  "dustMotes": true,
  "waterDrips": false
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
| ` `  | Void (empty space, no geometry) | No |

All interactive features (doors, stairs, levers, etc.) are entity-only — placed on walkable cells.

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

**Door** (`type: "door"`) — placed on any walkable cell. Every door must have an explicit entity.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `state` | string | No | `"closed"` (default) or `"open"` |
| `keyId` | string | No | If set, the door requires the matching key to open. Must match a key entity's `keyId`. |

```json
{ "col": 5, "row": 2, "type": "door", "state": "closed", "keyId": "gold_key" }
```

**Key** (`type: "key"`) — placed on walkable cells. Auto-picked up when player steps on it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `keyId` | string | Yes | Identifier matching a locked door's `keyId` |

```json
{ "col": 3, "row": 4, "type": "key", "keyId": "gold_key" }
```

**Lever** (`type: "lever"`) — placed on walkable cells. Player activates by standing on the cell and facing the wall the lever is mounted on.

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

**Stairs** (`type: "stairs"`) — placed on walkable cells. Triggers automatically when player steps on the cell (not via Space).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `direction` | string | Yes | `"down"` or `"up"` |
| `targetLevel` | string | Yes | `id` of the destination level |
| `targetCol` | number | Yes | Column on the destination level where player arrives |
| `targetRow` | number | Yes | Row on the destination level where player arrives |

The target position must be a walkable cell on the target level. Typically, stairs down target stairs up on the lower level and vice versa.

```json
{ "col": 4, "row": 8, "type": "stairs", "direction": "down", "targetLevel": "lower_vault", "targetCol": 4, "targetRow": 0 }
```

**Verification**: Use the coordinate counting method above to confirm that `targetCol`/`targetRow` land on the expected cell in the target level's grid.

**Enemy** (`type: "enemy"`) — placed on walkable cells. Enemies are hostile — they pursue the player and attack in melee range.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enemyType` | string | Yes | One of the defined enemy types (see table below) |

```json
{ "col": 7, "row": 3, "type": "enemy", "enemyType": "rat" }
```

Available enemy types:

| Type | HP | ATK | DEF | Aggro range | Move interval | XP | Special |
|------|---:|----:|----:|------------:|--------------:|---:|---------|
| `rat` | 8 | 2 | 0 | 3 | 0.6s | 10 | — |
| `giant_bat` | 6 | 1 | 0 | 5 | 0.4s | 8 | Erratic movement |
| `goblin` | 10 | 2 | 0 | 4 | 0.5s | 12 | — |
| `spider` | 14 | 3 | 0 | 4 | 0.6s | 18 | Poison tag (M2) |
| `kobold` | 12 | 2 | 1 | 4 | 0.7s | 20 | Flees below 30% HP |
| `skeleton` | 20 | 3 | 1 | 4 | 1.0s | 25 | — |
| `zombie` | 50 | 3 | 1 | 3 | 1.6s | 30 | — |
| `orc` | 40 | 5 | 2 | 5 | 1.4s | 50 | — |
| `troll` | 80 | 5 | 2 | 5 | 1.2s | 120 | HP regen (+7/1s) |

Enemies drop loot on death (XP, gold, and items from loot tables in `public/data/loot-tables.json`).

**Torch sconce** (`type: "torch_sconce"`) — placed on walkable cells. Wall-mounted light source with flame and ember particles.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wall` | string | No | Which wall to mount on: `"N"`, `"S"`, `"E"`, or `"W"`. Auto-detected from adjacent walls if omitted. |

```json
{ "col": 2, "row": 1, "type": "torch_sconce", "wall": "N" }
```

**Equipment** (`type: "equipment"`) — placed on walkable cells. Auto-picked up when player steps on it.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `itemId` | string | Yes | Must match an item `id` in `public/data/items.json` |

```json
{ "col": 3, "row": 3, "type": "equipment", "itemId": "sword_iron" }
```

Item properties (name, stats, slot, requirements) are defined in the item database, not in the level JSON. See "Item database" section below for available IDs.

**Consumable** (`type: "consumable"`) — placed on walkable cells. Auto-picked up when player steps on it, goes to backpack.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `itemId` | string | Yes | Must match a consumable item `id` in `public/data/items.json` |

```json
{ "col": 7, "row": 7, "type": "consumable", "itemId": "health_potion_small" }
```

#### Door behavior summary

| Door type | Open with Space | Close with Space | Visual cue |
|-----------|----------------|-----------------|------------|
| Normal (no keyId) | Yes | Yes | Brass button on frame |
| Keyed (has keyId) | Yes (with matching key) | Yes (after opening) | Iron-banded texture |
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
| `char` | string | Yes | Single ASCII character. Must not be a built-in char (`# .` or space). No duplicates. |
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

## Environment (optional)

Controls the visual atmosphere of the level — fog color, background, and ambient light.

```json
{
  "name": "Misty Ruins",
  "environment": "mist",
  "grid": [ ... ]
}
```

| Value | Fog | Background | Ambient | Default |
|-------|-----|------------|---------|---------|
| `dungeon` | Black, fades to darkness | Black | Very dark blue-grey | Yes |
| `mist` | Grey, fades to grey mist | Grey | Brighter cool grey | No |

If omitted, defaults to `"dungeon"`. The environment is applied per-level, so different floors of a dungeon can have different atmospheres.

---

## Ceiling (optional boolean)

Controls whether ceiling geometry is rendered for the level. Defaults to `true`.

```json
{
  "name": "Open Ruins",
  "ceiling": false,
  "grid": [ ... ]
}
```

When `false`, no ceiling tiles are generated — the level is open to the sky (or fog). Stair ceilings are unaffected.

---

## Skybox (optional string)

When a level has `ceiling: false`, an optional `skybox` field adds a procedural sky visible through the ceiling openings.

```json
{
  "name": "Open Ruins",
  "ceiling": false,
  "skybox": "starry-night",
  "grid": [ ... ]
}
```

| Value | Look |
|-------|------|
| `starry-night` | Dark blue gradient with scattered white stars |

The skybox is immune to scene fog and lighting — stars always look the same regardless of the level's `environment` setting. If `skybox` is set but `ceiling` is not `false`, a console warning is emitted (the skybox won't be visible through a solid ceiling).

---

## Particle effects (optional booleans)

| Field | Default | Effect |
|---|---|---|
| `dustMotes` | `true` | Warm-tinted particles floating near the ceiling around the player |
| `waterDrips` | `false` | Water drops form on ceiling, fall, and splash on the floor |

Set these at the level object root:

```json
{
  "name": "Damp Cavern",
  "dustMotes": true,
  "waterDrips": true,
  "grid": [ ... ]
}
```

---

## Item database

Equipment and consumable entities reference items by `itemId`. All item definitions live in `public/data/items.json`. The database defines item name, type, subtype, stats, quality, equip slot, and stat requirements.

### Weapons (type: `weapon`)

| itemId | Name | Subtype |
|--------|------|---------|
| `sword_rusty` | Rusty Sword | sword |
| `sword_iron` | Iron Sword | sword |
| `sword_steel` | Steel Sword | sword |
| `sword_knights_blade` | Knight's Blade | sword |
| `sword_flamebrand` | Flamebrand | sword |
| `axe_hand` | Hand Axe | axe |
| `axe_battle` | Battle Axe | axe |
| `axe_war` | War Axe | axe |
| `axe_bloodcleaver` | Bloodcleaver | axe |
| `dagger_bent_knife` | Bent Knife | dagger |
| `dagger_iron` | Iron Dagger | dagger |
| `dagger_steel` | Steel Dagger | dagger |
| `dagger_shadow_blade` | Shadow Blade | dagger |
| `dagger_vipers_fang` | Viper's Fang | dagger |
| `mace_iron` | Iron Mace | mace |
| `mace_spiked` | Spiked Mace | mace |
| `mace_warhammer` | Warhammer | mace |
| `mace_bonecrusher` | Bonecrusher | mace |
| `spear_wooden` | Wooden Spear | spear |
| `spear_iron` | Iron Spear | spear |
| `spear_steel_pike` | Steel Pike | spear |
| `spear_soldiers_pike` | Soldier's Pike | spear |
| `spear_serpent` | Serpent Spear | spear |

### Armor (type: `armor`)

| itemId | Name | Slot |
|--------|------|------|
| `armor_leather_cap` | Leather Cap | head |
| `armor_iron_helm` | Iron Helm | head |
| `armor_steel_helm` | Steel Helm | head |
| `armor_leather_vest` | Leather Vest | chest |
| `armor_chainmail` | Chainmail | chest |
| `armor_plate` | Plate Armor | chest |
| `armor_dragonscale_vest` | Dragonscale Vest | chest |
| `armor_leather_greaves` | Leather Greaves | legs |
| `armor_iron_greaves` | Iron Greaves | legs |
| `armor_steel_greaves` | Steel Greaves | legs |
| `armor_leather_gloves` | Leather Gloves | hands |
| `armor_iron_gauntlets` | Iron Gauntlets | hands |
| `armor_steel_gauntlets` | Steel Gauntlets | hands |
| `armor_leather_boots` | Leather Boots | feet |
| `armor_iron_sabatons` | Iron Sabatons | feet |
| `armor_steel_sabatons` | Steel Sabatons | feet |
| `armor_cracked_shield` | Cracked Shield | shield |
| `armor_wooden_buckler` | Wooden Buckler | shield |
| `armor_iron_kite_shield` | Iron Kite Shield | shield |
| `armor_tower_shield` | Tower Shield | shield |

### Accessories (type: `accessory`)

| itemId | Name | Slot |
|--------|------|------|
| `ring_of_power` | Ring of Power | ring |
| `ring_of_the_fox` | Ring of the Fox | ring |
| `ring_of_iron_skin` | Ring of Iron Skin | ring |
| `ring_of_vitality` | Ring of Vitality | ring |
| `ring_of_the_bear` | Ring of the Bear | ring |
| `ring_of_shadows` | Ring of Shadows | ring |
| `amulet_of_warding` | Amulet of Warding | amulet |
| `amulet_of_fortitude` | Amulet of Fortitude | amulet |
| `amulet_of_the_warrior` | Amulet of the Warrior | amulet |

### Consumables (type: `consumable`)

| itemId | Name | Effect |
|--------|------|--------|
| `health_potion_small` | Small Health Potion | Restores 15 HP |
| `health_potion_medium` | Medium Health Potion | Restores 30 HP |
| `health_potion_large` | Large Health Potion | Restores 50 HP |
| `torch_oil` | Torch Oil | Restores 50 torch fuel |

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
- Enemy `enemyType` must be a known type (rat, skeleton, orc)
- Equipment and consumable `itemId` must be a string (validated at load; the item database is checked at runtime)
- Enemies, equipment, consumables, and torch sconces must be on walkable cells

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

### Level with enemies, items, and torches

```json
{
  "name": "Guard Room",
  "grid": [
    "#########",
    "#.......#",
    "#.......#",
    "#.......#",
    "#.......#",
    "#.......#",
    "#########"
  ],
  "playerStart": { "col": 1, "row": 5, "facing": "N" },
  "entities": [
    { "col": 4, "row": 3, "type": "door" },
    { "col": 3, "row": 2, "type": "enemy", "enemyType": "skeleton" },
    { "col": 6, "row": 4, "type": "enemy", "enemyType": "rat" },
    { "col": 2, "row": 1, "type": "torch_sconce", "wall": "N" },
    { "col": 6, "row": 1, "type": "torch_sconce", "wall": "N" },
    { "col": 1, "row": 1, "type": "equipment", "itemId": "sword_iron" },
    { "col": 7, "row": 5, "type": "consumable", "itemId": "health_potion_small" }
  ]
}
```

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
