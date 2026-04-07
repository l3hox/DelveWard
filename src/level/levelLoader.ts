import type { DungeonLevel, Dungeon, Entity, LayerDef } from '../core/types';
import type { Facing } from '../core/grid';
import { WALKABLE_CELLS } from '../core/grid';
import { WALL_TEXTURE_SET, FLOOR_TEXTURE_SET, CEILING_TEXTURE_SET } from '../core/textureNames';
import { enemyDatabase } from '../enemies/enemyDatabase';
import { npcDatabase } from '../npcs/npcDatabase';

const VALID_FACINGS: Facing[] = ['N', 'E', 'S', 'W'];

/** Get all entities from a level across all layers. */
export function getAllLevelEntities(level: DungeonLevel): Entity[] {
  const all: Entity[] = [];
  for (const layer of level.layers) {
    all.push(...layer.entities);
  }
  return all;
}

/** Resolve a layer coordinate (numeric ID like 0, 1, -1) to an array index. Returns 0 if not found. */
export function resolveLayerCoord(level: DungeonLevel, coord: number): number {
  const id = String(coord);
  const idx = level.layers.findIndex(l => l.id === id);
  return idx >= 0 ? idx : 0;
}

/** Find which layer index an entity is on (by id). Returns 0 if not found. */
export function findEntityLayerIndex(level: DungeonLevel, entityId: string): number {
  for (let li = 0; li < level.layers.length; li++) {
    if (level.layers[li].entities.some(e => e.id === entityId)) return li;
  }
  return 0;
}
const BUILTIN_CHARS = new Set(['.', '#', ' ']);

function validateTextures(
  entry: Record<string, unknown>,
  label: string,
  source: string,
): void {
  if (entry.wallTexture !== undefined && !WALL_TEXTURE_SET.has(entry.wallTexture as string)) {
    throw new Error(`Level ${source}: ${label} has unknown wallTexture "${entry.wallTexture}"`);
  }
  if (entry.floorTexture !== undefined && !FLOOR_TEXTURE_SET.has(entry.floorTexture as string)) {
    throw new Error(`Level ${source}: ${label} has unknown floorTexture "${entry.floorTexture}"`);
  }
  if (entry.ceilingTexture !== undefined && !CEILING_TEXTURE_SET.has(entry.ceilingTexture as string)) {
    throw new Error(`Level ${source}: ${label} has unknown ceilingTexture "${entry.ceilingTexture}"`);
  }
}

/**
 * Backward-compat preprocessor: converts legacy `targetDoor: "col,row"` to
 * `target: entityId` and auto-assigns IDs to doors that lack them.
 * Mutates the entities array in-place.
 */
export function migrateEntities(entities: Entity[]): void {
  // Collect existing IDs
  const usedIds = new Set<string>();
  for (const e of entities) {
    if (e.id) usedIds.add(e.id as string);
  }

  // Auto-assign IDs to doors without one
  const counters: Record<string, number> = {};
  function nextId(type: string): string {
    if (!counters[type]) counters[type] = 1;
    while (usedIds.has(`${type}_${counters[type]}`)) counters[type]++;
    const id = `${type}_${counters[type]}`;
    usedIds.add(id);
    counters[type]++;
    return id;
  }

  for (const e of entities) {
    if (e.type === 'door' && !e.id) {
      e.id = nextId('door');
    }
  }

  // Build door position → ID map for legacy targetDoor conversion
  const doorPosToId = new Map<string, string>();
  for (const e of entities) {
    if (e.type === 'door' && e.id) {
      doorPosToId.set(`${e.col},${e.row}`, e.id as string);
    }
  }

  // Convert targetDoor → target → targets on levers and plates
  for (const e of entities) {
    if (e.type === 'lever' || e.type === 'pressure_plate') {
      // Legacy: targetDoor → target
      if (e.targetDoor && !e.target) {
        const doorId = doorPosToId.get(e.targetDoor as string);
        if (doorId) {
          e.target = doorId;
          delete e.targetDoor;
        }
      }
      // Migrate single target → targets[]
      if (e.target && !e.targets) {
        e.targets = [e.target as string];
        delete e.target;
        delete e.targetDoor; // clean up any remaining legacy field
      }
    }
  }
}

/**
 * Validate a single entity. Returns an error message string if invalid, or null if OK.
 * Invalid entities are skipped in the game but preserved in the JSON for editor use.
 */
function validateEntity(
  e: Record<string, unknown>,
  i: number,
  grid: string[],
  rowLen: number,
  walkableChars: Set<string>,
  entityIds: Set<string>,
  source: string,
  validSignalModes: Set<string>,
  validGateTypes: Set<string>,
): string | null {
  const pfx = `Level ${source}: entities[${i}]`;

  if ((e.row as number) < 0 || (e.row as number) >= grid.length ||
      (e.col as number) < 0 || (e.col as number) >= rowLen) {
    return `${pfx} (${e.col},${e.row}) is out of grid bounds`;
  }

  const cell = grid[e.row as number][e.col as number];

  // Helper: validate targets array field
  const checkTargets = (typeName: string): string | null => {
    if (!Array.isArray(e.targets)) return `${pfx} ${typeName} must have a targets array`;
    for (const t of e.targets as string[]) {
      if (typeof t !== 'string' || t === '') return `${pfx} ${typeName} targets must contain non-empty strings`;
      if (!entityIds.has(t)) return `${pfx} ${typeName} target "${t}" must reference an existing entity id`;
    }
    return null;
  };

  // Helper: validate optional signal mode and delay
  const checkSignalMode = (typeName: string): string | null => {
    if (e.signalMode !== undefined && !validSignalModes.has(e.signalMode as string)) {
      return `${pfx} ${typeName} signalMode must be one of ${[...validSignalModes].join(', ')}`;
    }
    if (e.signalDuration !== undefined && typeof e.signalDuration !== 'number') {
      return `${pfx} ${typeName} signalDuration must be a number`;
    }
    if (e.signalDelay !== undefined && typeof e.signalDelay !== 'number') {
      return `${pfx} ${typeName} signalDelay must be a number`;
    }
    return null;
  };

  // Helper: check walkable cell
  const checkWalkable = (typeName: string): string | null => {
    if (!walkableChars.has(cell)) return `${pfx} ${typeName} must be on a walkable cell, found '${cell}'`;
    return null;
  };

  switch (e.type as string) {
    case 'door': {
      const w = checkWalkable('door'); if (w) return w;
      const VALID_DOOR_STATES = new Set(['open', 'closed']);
      if (e.state !== undefined && !VALID_DOOR_STATES.has(e.state as string)) return `${pfx} door state must be open or closed`;
      if (e.keyId !== undefined && typeof e.keyId !== 'string') return `${pfx} door keyId must be a string`;
      const validGateModes = ['or', 'and', 'xor'];
      if (e.gateMode !== undefined && !validGateModes.includes(e.gateMode as string)) return `${pfx} door gateMode must be one of ${validGateModes.join(', ')}`;
      break;
    }
    case 'key': {
      if (typeof e.keyId !== 'string') return `${pfx} key must have a string keyId`;
      const w = checkWalkable('key'); if (w) return w;
      break;
    }
    case 'lever': {
      const t = checkTargets('lever'); if (t) return t;
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) return `${pfx} lever wall must be N, S, E, or W`;
      const s = checkSignalMode('lever'); if (s) return s;
      break;
    }
    case 'pressure_plate': {
      const t = checkTargets('pressure_plate'); if (t) return t;
      const w = checkWalkable('pressure_plate'); if (w) return w;
      const s = checkSignalMode('pressure_plate'); if (s) return s;
      break;
    }
    case 'trigger': {
      const t = checkTargets('trigger'); if (t) return t;
      const w = checkWalkable('trigger'); if (w) return w;
      const s = checkSignalMode('trigger'); if (s) return s;
      break;
    }
    case 'tripwire': {
      const t = checkTargets('tripwire'); if (t) return t;
      const w = checkWalkable('tripwire'); if (w) return w;
      if (e.visibilityThreshold !== undefined && typeof e.visibilityThreshold !== 'number') return `${pfx} tripwire visibilityThreshold must be a number`;
      if (e.orientation !== undefined && e.orientation !== 'EW' && e.orientation !== 'NS') return `${pfx} tripwire orientation must be "EW" or "NS"`;
      break;
    }
    case 'gate': {
      const t = checkTargets('gate'); if (t) return t;
      if (!validGateTypes.has(e.gateType as string)) return `${pfx} gate must have a valid gateType (${[...validGateTypes].join(', ')})`;
      if (e.delay !== undefined && typeof e.delay !== 'number') return `${pfx} gate delay must be a number`;
      if (e.interval !== undefined && typeof e.interval !== 'number') return `${pfx} gate interval must be a number`;
      break;
    }
    case 'trap_launcher': {
      const w = checkWalkable('trap_launcher'); if (w) return w;
      if (typeof e.facing !== 'string' || !['N', 'S', 'E', 'W'].includes(e.facing as string)) return `${pfx} trap_launcher must have facing "N", "S", "E", or "W"`;
      if (typeof e.projectileType !== 'string' || !['dart', 'arrow', 'fireball'].includes(e.projectileType as string)) return `${pfx} trap_launcher must have projectileType "dart", "arrow", or "fireball"`;
      if (typeof e.reloadTime !== 'number' || (e.reloadTime as number) <= 0) return `${pfx} trap_launcher must have a positive number reloadTime`;
      if (e.maxRange !== undefined && typeof e.maxRange !== 'number') return `${pfx} trap_launcher maxRange must be a number`;
      break;
    }
    case 'enemy': {
      if (typeof e.enemyType !== 'string') return `${pfx} enemy must have a string enemyType`;
      if (!enemyDatabase.getEnemy(e.enemyType as string)) return `${pfx} enemy has unknown enemyType "${e.enemyType}"`;
      const w = checkWalkable('enemy'); if (w) return w;
      break;
    }
    case 'torch_sconce': {
      const w = checkWalkable('torch_sconce'); if (w) return w;
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) return `${pfx} torch_sconce wall must be N, S, E, or W`;
      break;
    }
    case 'equipment': {
      if (typeof e.itemId !== 'string') return `${pfx} equipment must have a string itemId`;
      const w = checkWalkable('equipment'); if (w) return w;
      break;
    }
    case 'consumable': {
      if (typeof e.itemId !== 'string') return `${pfx} consumable must have a string itemId`;
      const w = checkWalkable('consumable'); if (w) return w;
      break;
    }
    case 'stairs': {
      if (e.direction !== 'up' && e.direction !== 'down') return `${pfx} stairs must have direction "up" or "down"`;
      if (typeof e.facing !== 'string' || !VALID_FACINGS.includes(e.facing as Facing)) return `${pfx} stairs must have facing "N", "S", "E", or "W"`;
      const w = checkWalkable('stairs'); if (w) return w;
      if (typeof e.target !== 'string') return `${pfx} stairs must have a string target (paired stair entity ID)`;
      break;
    }
    case 'breakable_wall': {
      if (walkableChars.has(cell)) return `${pfx} breakable_wall must be on a solid cell, found '${cell}'`;
      if (typeof e.hp !== 'number' || (e.hp as number) <= 0) return `${pfx} breakable_wall must have a positive hp`;
      break;
    }
    case 'secret_wall': {
      if (walkableChars.has(cell)) return `${pfx} secret_wall must be on a solid cell, found '${cell}'`;
      break;
    }
    case 'block': {
      const w = checkWalkable('block'); if (w) return w;
      break;
    }
    case 'chest': {
      const w = checkWalkable('chest'); if (w) return w;
      if (e.state !== undefined) {
        const validStates = new Set(['closed', 'open', 'locked']);
        if (!validStates.has(e.state as string)) return `${pfx} chest state must be closed, open, or locked`;
      }
      if (e.facing !== undefined && !['N', 'S', 'E', 'W'].includes(e.facing as string)) return `${pfx} chest facing must be N, S, E, or W`;
      if (e.keyId !== undefined && typeof e.keyId !== 'string') return `${pfx} chest keyId must be a string`;
      if (e.gateMode !== undefined) {
        const validGateModes = ['or', 'and', 'xor'];
        if (!validGateModes.includes(e.gateMode as string)) return `${pfx} chest gateMode must be one of ${validGateModes.join(', ')}`;
      }
      if (e.targets !== undefined) {
        const t = checkTargets('chest'); if (t) return t;
      }
      break;
    }
    case 'sign': {
      const w = checkWalkable('sign'); if (w) return w;
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) return `${pfx} sign wall must be N, S, E, or W`;
      if (typeof e.text !== 'string' || (e.text as string).length === 0) return `${pfx} sign must have non-empty text`;
      break;
    }
    case 'npc': {
      if (typeof e.npcId !== 'string') return `${pfx} npc must have a string npcId`;
      if (npcDatabase.isLoaded() && !npcDatabase.getNpc(e.npcId as string)) return `${pfx} npc has unknown npcId "${e.npcId}"`;
      const w = checkWalkable('npc'); if (w) return w;
      break;
    }
    case 'fountain': {
      const w = checkWalkable('fountain'); if (w) return w;
      if (e.healAmount !== undefined && (typeof e.healAmount !== 'number' || (e.healAmount as number) <= 0)) return `${pfx} fountain healAmount must be a positive number`;
      break;
    }
    case 'bookshelf': {
      const w = checkWalkable('bookshelf'); if (w) return w;
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) return `${pfx} bookshelf wall must be N, S, E, or W`;
      if (e.text !== undefined && typeof e.text !== 'string') return `${pfx} bookshelf text must be a string`;
      break;
    }
    case 'altar': {
      const w = checkWalkable('altar'); if (w) return w;
      const validBuffTypes = ['atk', 'def', 'str', 'dex', 'vit', 'wis'];
      if (e.buffType !== undefined && !validBuffTypes.includes(e.buffType as string)) return `${pfx} altar buffType must be one of ${validBuffTypes.join(', ')}`;
      if (e.buffAmount !== undefined && (typeof e.buffAmount !== 'number' || (e.buffAmount as number) <= 0)) return `${pfx} altar buffAmount must be a positive number`;
      if (e.buffDuration !== undefined && (typeof e.buffDuration !== 'number' || (e.buffDuration as number) <= 0)) return `${pfx} altar buffDuration must be a positive number`;
      break;
    }
    case 'barrel': {
      const w = checkWalkable('barrel'); if (w) return w;
      if (e.hp !== undefined && (typeof e.hp !== 'number' || (e.hp as number) <= 0)) return `${pfx} barrel hp must be a positive number`;
      break;
    }
    case 'thin_wall': {
      const w = checkWalkable('thin_wall'); if (w) return w;
      if (e.wall !== 'S' && e.wall !== 'E') return `${pfx} thin_wall wall must be 'S' or 'E', got '${e.wall}'`;
      if (e.height !== undefined && e.height !== 'full' && e.height !== 'half') return `${pfx} thin_wall height must be 'full' or 'half', got '${e.height}'`;
      if (e.solid !== undefined && typeof e.solid !== 'boolean') return `${pfx} thin_wall solid must be boolean`;
      break;
    }
    case 'ramp': {
      const w = checkWalkable('ramp'); if (w) return w;
      if (e.facing !== undefined && !['N', 'S', 'E', 'W'].includes(e.facing as string)) {
        return `${pfx} ramp facing must be N, S, E, or W`;
      }
      if (e.style !== undefined && e.style !== 'ramp' && e.style !== 'stairs') {
        return `${pfx} ramp style must be 'ramp' or 'stairs'`;
      }
      break;
    }
  }

  return null;
}

/**
 * Validate a single layer definition (grid, entities, areas, defaults).
 * charDefs are level-global and passed in as knownChars/walkableChars.
 * Entity IDs are collected into the provided set for cross-layer uniqueness checking.
 * Returns the validated layer with only valid entities.
 */
function validateLayerDef(
  layer: Record<string, unknown>,
  layerIndex: number,
  source: string,
  globalEntityIds: Set<string>,
  knownChars: Set<string>,
  walkableChars: Set<string>,
): LayerDef {
  const pfx = `Level ${source} layers[${layerIndex}]`;

  // grid
  if (!Array.isArray(layer.grid) || layer.grid.length === 0 || !layer.grid.every((r: unknown) => typeof r === 'string')) {
    throw new Error(`${pfx}: "grid" must be a non-empty array of strings`);
  }
  const grid = layer.grid as string[];
  const rowLen = grid[0].length;
  if (!grid.every((r) => r.length === rowLen)) {
    throw new Error(`${pfx}: all grid rows must be the same length`);
  }

  // grid char validation (uses level-global charDefs)
  for (const row of grid) {
    for (const ch of row) {
      if (!knownChars.has(ch)) throw new Error(`${pfx}: unknown cell character '${ch}'`);
    }
  }

  // entities
  if (!Array.isArray(layer.entities)) {
    throw new Error(`${pfx}: "entities" must be an array`);
  }
  migrateEntities(layer.entities as Entity[]);

  // Collect entity IDs cross-layer
  for (const ent of layer.entities as Array<Record<string, unknown>>) {
    if (ent.id) {
      if (globalEntityIds.has(ent.id as string)) throw new Error(`${pfx}: duplicate entity id "${ent.id}"`);
      globalEntityIds.add(ent.id as string);
    }
  }

  const validEntities: Record<string, unknown>[] = [];
  const VALID_SIGNAL_MODES = new Set(['toggle', 'momentary', 'one_shot', 'timed']);
  const VALID_GATE_TYPES = new Set(['and', 'or', 'not', 'delay', 'pulse_edge', 'pulse_repeat']);

  for (let i = 0; i < layer.entities.length; i++) {
    const e = layer.entities[i] as Record<string, unknown>;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) throw new Error(`${pfx}: entities[${i}] must be an object`);
    if (typeof e.col !== 'number' || typeof e.row !== 'number') throw new Error(`${pfx}: entities[${i}] must have numeric col and row`);
    if (typeof e.type !== 'string') throw new Error(`${pfx}: entities[${i}] must have a string type`);
    const err = validateEntity(e, i, grid, rowLen, walkableChars, globalEntityIds, `${source} layers[${layerIndex}]`, VALID_SIGNAL_MODES, VALID_GATE_TYPES);
    if (err) { console.warn(`${err} — entity skipped`); continue; }
    validEntities.push(e);
  }
  layer.entities = validEntities;

  // defaults
  if (layer.defaults !== undefined) {
    if (typeof layer.defaults !== 'object' || layer.defaults === null || Array.isArray(layer.defaults)) {
      throw new Error(`${pfx}: "defaults" must be an object`);
    }
    validateTextures(layer.defaults as Record<string, unknown>, 'defaults', `${source} layers[${layerIndex}]`);
  }

  // areas
  const validEnvs = ['dungeon', 'mist', 'forest', 'outdoor'];
  if (layer.areas !== undefined) {
    if (!Array.isArray(layer.areas)) throw new Error(`${pfx}: "areas" must be an array`);
    for (let i = 0; i < layer.areas.length; i++) {
      const area = layer.areas[i];
      if (typeof area !== 'object' || area === null || Array.isArray(area)) throw new Error(`${pfx}: areas[${i}] must be an object`);
      const entry = area as Record<string, unknown>;
      if (typeof entry.fromCol !== 'number' || typeof entry.toCol !== 'number' || typeof entry.fromRow !== 'number' || typeof entry.toRow !== 'number') {
        throw new Error(`${pfx}: areas[${i}] must have numeric fromCol, toCol, fromRow, toRow`);
      }
      if (entry.fromCol > entry.toCol || entry.fromRow > entry.toRow) throw new Error(`${pfx}: areas[${i}] has fromCol > toCol or fromRow > toRow`);
      if (entry.fromCol < 0 || (entry.toCol as number) >= rowLen || entry.fromRow < 0 || (entry.toRow as number) >= grid.length) {
        throw new Error(`${pfx}: areas[${i}] is out of grid bounds`);
      }
      if (entry.environment !== undefined && !validEnvs.includes(entry.environment as string)) {
        throw new Error(`${pfx}: areas[${i}].environment must be one of ${validEnvs.join(', ')}`);
      }
      if (entry.openBottom !== undefined && typeof entry.openBottom !== 'boolean') throw new Error(`${pfx}: areas[${i}].openBottom must be a boolean`);
      if (entry.openTop !== undefined && typeof entry.openTop !== 'boolean') throw new Error(`${pfx}: areas[${i}].openTop must be a boolean`);
      if (entry.wallTexture === undefined && entry.floorTexture === undefined && entry.ceilingTexture === undefined && entry.environment === undefined && !entry.openBottom && !entry.openTop) {
        throw new Error(`${pfx}: areas[${i}] must specify at least one texture, an environment, or a hollow flag`);
      }
      validateTextures(entry, `areas[${i}]`, `${source} layers[${layerIndex}]`);
    }
  }

  // ceiling (optional boolean)
  if (layer.ceiling !== undefined && typeof layer.ceiling !== 'boolean') {
    throw new Error(`${pfx}: "ceiling" must be a boolean`);
  }

  // yOffset (optional number)
  if (layer.yOffset !== undefined && typeof layer.yOffset !== 'number') {
    throw new Error(`${pfx}: "yOffset" must be a number`);
  }

  return layer as unknown as LayerDef;
}

export function validateLevel(data: unknown, source: string): DungeonLevel {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Level data from ${source} is not an object`);
  }

  const obj = data as Record<string, unknown>;

  // name
  if (typeof obj.name !== 'string') {
    throw new Error(`Level ${source}: "name" must be a string`);
  }

  // Validate charDefs first (level-global), then layers.

  // charDefs (optional, level-global — validate BEFORE grid/layers so custom chars are known)
  const charDefChars = new Set<string>();
  const walkableChars = new Set(WALKABLE_CELLS);

  if (obj.charDefs !== undefined) {
    if (!Array.isArray(obj.charDefs)) {
      throw new Error(`Level ${source}: "charDefs" must be an array`);
    }

    for (let i = 0; i < obj.charDefs.length; i++) {
      const entry = obj.charDefs[i];
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(`Level ${source}: charDefs[${i}] must be an object`);
      }

      const def = entry as Record<string, unknown>;

      // char
      if (typeof def.char !== 'string' || def.char.length !== 1) {
        throw new Error(`Level ${source}: charDefs[${i}].char must be a single character`);
      }
      if (BUILTIN_CHARS.has(def.char)) {
        throw new Error(`Level ${source}: charDefs[${i}].char '${def.char}' conflicts with built-in character`);
      }
      if (charDefChars.has(def.char)) {
        throw new Error(`Level ${source}: charDefs[${i}].char '${def.char}' is a duplicate`);
      }
      charDefChars.add(def.char);

      // solid
      if (typeof def.solid !== 'boolean') {
        throw new Error(`Level ${source}: charDefs[${i}].solid must be a boolean`);
      }

      if (!def.solid) {
        walkableChars.add(def.char);
      }

      // seeThrough (optional)
      if (def.seeThrough !== undefined) {
        if (typeof def.seeThrough !== 'boolean') {
          throw new Error(`Level ${source}: charDefs[${i}].seeThrough must be a boolean`);
        }
        if (def.seeThrough && !def.solid) {
          throw new Error(`Level ${source}: charDefs[${i}].seeThrough requires solid to be true`);
        }
      }

      // textures
      validateTextures(def, `charDefs[${i}]`, source);
    }
  }

  // Known chars = built-in + charDefs (level-global, shared across all layers)
  const extendedKnown = new Set(BUILTIN_CHARS);
  for (const ch of charDefChars) extendedKnown.add(ch);

  // Layers validation — charDefs are now known, validate each layer
  if (!Array.isArray(obj.layers) || obj.layers.length === 0) {
    throw new Error(`Level ${source}: "layers" must be a non-empty array`);
  }
  const globalEntityIds = new Set<string>();
  const validatedLayers: LayerDef[] = [];
  for (let li = 0; li < obj.layers.length; li++) {
    const rawLayer = obj.layers[li];
    if (typeof rawLayer !== 'object' || rawLayer === null || Array.isArray(rawLayer)) {
      throw new Error(`Level ${source}: layers[${li}] must be an object`);
    }
    validatedLayers.push(validateLayerDef(rawLayer as Record<string, unknown>, li, source, globalEntityIds, extendedKnown, walkableChars));
  }
  obj.layers = validatedLayers;
  // Set top-level grid/entities from layer 0 for convenience access
  obj.grid = validatedLayers[0].grid;
  obj.entities = validatedLayers[0].entities;

  const grid = obj.grid as string[];
  const rowLen = grid[0].length;

  // playerStart (optional — single-level mode only; dungeon mode validates at dungeon level)
  if (obj.playerStart !== undefined) {
    const ps = obj.playerStart;
    if (typeof ps !== 'object' || ps === null) {
      throw new Error(`Level ${source}: "playerStart" must be an object`);
    }
    const start = ps as Record<string, unknown>;
    if (typeof start.col !== 'number' || typeof start.row !== 'number') {
      throw new Error(`Level ${source}: "playerStart" must have numeric col and row`);
    }
    if (!VALID_FACINGS.includes(start.facing as Facing)) {
      throw new Error(`Level ${source}: "playerStart.facing" must be one of ${VALID_FACINGS.join(', ')}`);
    }

    const startCol = start.col as number;
    const startRow = start.row as number;
    if (startRow < 0 || startRow >= grid.length || startCol < 0 || startCol >= rowLen) {
      throw new Error(`Level ${source}: playerStart (${startCol},${startRow}) is out of grid bounds`);
    }
    if (!walkableChars.has(grid[startRow][startCol])) {
      throw new Error(`Level ${source}: playerStart (${startCol},${startRow}) is not a walkable tile`);
    }
  }

  // entities
  if (!Array.isArray(obj.entities)) {
    throw new Error(`Level ${source}: "entities" must be an array`);
  }

  // Run backward-compat migration before validation
  migrateEntities(obj.entities as Entity[]);

  const VALID_DOOR_STATES = new Set(['open', 'closed']);

  // Two-pass: collect entity IDs for target validation, check for duplicates
  const entityIds = new Set<string>();
  for (const ent of obj.entities as Array<Record<string, unknown>>) {
    if (ent.id) {
      if (entityIds.has(ent.id as string)) {
        throw new Error(`Level ${source}: duplicate entity id "${ent.id}"`);
      }
      entityIds.add(ent.id as string);
    }
  }

  const validEntities: Record<string, unknown>[] = [];
  const VALID_SIGNAL_MODES = new Set(['toggle', 'momentary', 'one_shot', 'timed']);
  const VALID_GATE_TYPES = new Set(['and', 'or', 'not', 'delay', 'pulse_edge', 'pulse_repeat']);

  for (let i = 0; i < obj.entities.length; i++) {
    const e = obj.entities[i] as Record<string, unknown>;

    // Structural checks — these are fatal (entity is unsalvageable)
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      throw new Error(`Level ${source}: entities[${i}] must be an object`);
    }
    if (typeof e.col !== 'number' || typeof e.row !== 'number') {
      throw new Error(`Level ${source}: entities[${i}] must have numeric col and row`);
    }
    if (typeof e.type !== 'string') {
      throw new Error(`Level ${source}: entities[${i}] must have a string type`);
    }

    // Entity-level checks — recoverable: warn and skip for game
    const err = validateEntity(e, i, grid, rowLen, walkableChars, entityIds, source, VALID_SIGNAL_MODES, VALID_GATE_TYPES);
    if (err) {
      console.warn(`${err} — entity skipped`);
      continue;
    }

    validEntities.push(e);
  }

  // Replace the entities array with only valid ones
  obj.entities = validEntities as Entity[];

  // environment (optional)
  const validEnvs = ['dungeon', 'mist', 'forest', 'outdoor'];
  if (obj.environment !== undefined) {
    if (!validEnvs.includes(obj.environment as string)) {
      throw new Error(`Level ${source}: "environment" must be one of ${validEnvs.join(', ')}`);
    }
  }

  // skybox (optional)
  if (obj.skybox !== undefined) {
    const validSkyboxes = ['starry-night', 'daylight', 'sunset'];
    if (!validSkyboxes.includes(obj.skybox as string)) {
      throw new Error(`Level ${source}: "skybox" must be one of ${validSkyboxes.join(', ')}`);
    }
    if (obj.ceiling !== false) {
      console.warn(`Level ${source}: "skybox" is set but "ceiling" is not false — skybox won't be visible`);
    }
  }

  // defaults (optional)
  if (obj.defaults !== undefined) {
    if (typeof obj.defaults !== 'object' || obj.defaults === null || Array.isArray(obj.defaults)) {
      throw new Error(`Level ${source}: "defaults" must be an object`);
    }

    validateTextures(obj.defaults as Record<string, unknown>, 'defaults', source);
  }

  // areas (optional)
  if (obj.areas !== undefined) {
    if (!Array.isArray(obj.areas)) {
      throw new Error(`Level ${source}: "areas" must be an array`);
    }

    for (let i = 0; i < obj.areas.length; i++) {
      const area = obj.areas[i];
      if (typeof area !== 'object' || area === null || Array.isArray(area)) {
        throw new Error(`Level ${source}: areas[${i}] must be an object`);
      }

      const entry = area as Record<string, unknown>;

      if (typeof entry.fromCol !== 'number' || typeof entry.toCol !== 'number' ||
          typeof entry.fromRow !== 'number' || typeof entry.toRow !== 'number') {
        throw new Error(`Level ${source}: areas[${i}] must have numeric fromCol, toCol, fromRow, toRow`);
      }

      if (entry.fromCol > entry.toCol || entry.fromRow > entry.toRow) {
        throw new Error(`Level ${source}: areas[${i}] has fromCol > toCol or fromRow > toRow`);
      }

      const rows = grid.length;
      if (entry.fromCol < 0 || (entry.toCol as number) >= rowLen ||
          entry.fromRow < 0 || (entry.toRow as number) >= rows) {
        throw new Error(`Level ${source}: areas[${i}] is out of grid bounds`);
      }

      if (entry.environment !== undefined && !validEnvs.includes(entry.environment as string)) {
        throw new Error(`Level ${source}: areas[${i}].environment must be one of ${validEnvs.join(', ')}`);
      }

      if (entry.openBottom !== undefined && typeof entry.openBottom !== 'boolean') {
        throw new Error(`Level ${source}: areas[${i}].openBottom must be a boolean`);
      }
      if (entry.openTop !== undefined && typeof entry.openTop !== 'boolean') {
        throw new Error(`Level ${source}: areas[${i}].openTop must be a boolean`);
      }

      if (entry.wallTexture === undefined && entry.floorTexture === undefined && entry.ceilingTexture === undefined && entry.environment === undefined && !entry.openBottom && !entry.openTop) {
        throw new Error(`Level ${source}: areas[${i}] must specify at least one texture, an environment, or a hollow flag`);
      }

      validateTextures(entry, `areas[${i}]`, source);
    }
  }

  return data as DungeonLevel;
}

export async function loadLevel(url: string): Promise<DungeonLevel> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load level from ${url}: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  return validateLevel(data, url);
}

export function validateDungeon(data: unknown, source: string): Dungeon {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Dungeon data from ${source} is not an object`);
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.name !== 'string') {
    throw new Error(`Dungeon ${source}: "name" must be a string`);
  }

  if (!Array.isArray(obj.levels) || obj.levels.length === 0) {
    throw new Error(`Dungeon ${source}: "levels" must be a non-empty array`);
  }

  // Validate each level and collect IDs
  const levelIds = new Set<string>();
  const levels: DungeonLevel[] = [];

  for (let i = 0; i < obj.levels.length; i++) {
    const level = validateLevel(obj.levels[i], `${source} levels[${i}]`);

    // Each level must have a unique id
    if (typeof level.id !== 'string' || level.id.length === 0) {
      throw new Error(`Dungeon ${source}: levels[${i}] must have a non-empty string "id"`);
    }
    if (levelIds.has(level.id)) {
      throw new Error(`Dungeon ${source}: duplicate level id "${level.id}"`);
    }
    levelIds.add(level.id);
    levels.push(level);
  }

  // Validate or migrate dungeon-level playerStart
  let dungeonPlayerStart: { levelId: string; col: number; row: number; facing: Facing; layerIndex?: number };

  if (obj.playerStart !== undefined) {
    const dps = obj.playerStart as Record<string, unknown>;
    if (typeof dps !== 'object' || dps === null) {
      throw new Error(`Dungeon ${source}: "playerStart" must be an object`);
    }
    if (typeof dps.levelId !== 'string' || dps.levelId === '') {
      throw new Error(`Dungeon ${source}: "playerStart.levelId" must be a non-empty string`);
    }
    if (!levelIds.has(dps.levelId as string)) {
      throw new Error(`Dungeon ${source}: "playerStart.levelId" "${dps.levelId}" does not match any level id`);
    }
    if (typeof dps.col !== 'number' || typeof dps.row !== 'number') {
      throw new Error(`Dungeon ${source}: "playerStart" must have numeric col and row`);
    }
    if (!VALID_FACINGS.includes(dps.facing as Facing)) {
      throw new Error(`Dungeon ${source}: "playerStart.facing" must be one of ${VALID_FACINGS.join(', ')}`);
    }

    const startLevel = levels.find(l => l.id === dps.levelId)!;
    const startCol = dps.col as number;
    const startRow = dps.row as number;
    const startLayerCoord = typeof dps.layerIndex === 'number' ? dps.layerIndex : 0;
    // Resolve layer coordinate to array index, then use that layer's grid
    const startLayerArrayIdx = resolveLayerCoord(startLevel, startLayerCoord);
    const startGrid = startLevel.layers?.[startLayerArrayIdx]?.grid ?? startLevel.grid;
    const startRowLen = startGrid[0].length;

    if (startRow < 0 || startRow >= startGrid.length || startCol < 0 || startCol >= startRowLen) {
      throw new Error(`Dungeon ${source}: playerStart (${startCol},${startRow}) is out of grid bounds on level "${dps.levelId}" layer ${startLayerCoord}`);
    }

    const startWalkable = new Set(WALKABLE_CELLS);
    if (startLevel.charDefs) {
      for (const def of startLevel.charDefs) {
        if (!def.solid) startWalkable.add(def.char);
      }
    }
    if (!startWalkable.has(startGrid[startRow][startCol])) {
      throw new Error(`Dungeon ${source}: playerStart (${startCol},${startRow}) is on a non-walkable tile on level "${dps.levelId}" layer ${startLayerCoord}`);
    }

    dungeonPlayerStart = {
      levelId: dps.levelId as string,
      col: startCol,
      row: startRow,
      facing: dps.facing as Facing,
      layerIndex: startLayerCoord !== 0 ? startLayerCoord : undefined,
    };
  } else {
    // Migration: promote first level's playerStart to dungeon level
    const migrateLevel = levels.find(l => l.playerStart !== undefined);
    if (!migrateLevel || !migrateLevel.playerStart) {
      throw new Error(`Dungeon ${source}: "playerStart" is required on the dungeon object`);
    }
    dungeonPlayerStart = {
      levelId: migrateLevel.id!,
      col: migrateLevel.playerStart.col,
      row: migrateLevel.playerStart.row,
      facing: migrateLevel.playerStart.facing,
    };
  }

  // Cross-level validation: stairs must reference valid stair entities on other levels
  // and the spawn cell (one step in facing direction from target) must be walkable.
  // Searches all layers' entities for layered levels.
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const allEntities = getAllLevelEntities(level);
    for (let j = 0; j < allEntities.length; j++) {
      const e = allEntities[j];
      if (e.type === 'stairs') {
        const targetId = e.target as string;

        // Find the target stair entity across all OTHER levels (search all layers)
        let targetStair: Entity | undefined;
        let targetLevel: DungeonLevel | undefined;
        let targetLayerIndex = 0;
        for (const otherLevel of levels) {
          if (otherLevel === level) continue; // target must be on a different level
          targetStair = getAllLevelEntities(otherLevel).find(oe => oe.id === targetId);
          if (targetStair) {
            targetLevel = otherLevel;
            targetLayerIndex = findEntityLayerIndex(otherLevel, targetId);
            break;
          }
        }

        if (!targetStair || !targetLevel) {
          console.warn(`Dungeon ${source}: levels[${i}] stairs "${e.id}" target "${targetId}" does not match any stair entity on another level — stair will not function`);
          continue;
        }
        if (targetStair.type !== 'stairs') {
          console.warn(`Dungeon ${source}: levels[${i}] stairs "${e.id}" target "${targetId}" is not a stairs entity — stair will not function`);
          continue;
        }

        // Validate spawn cell using the target stair's layer grid
        const targetGrid = targetLevel.layers?.[targetLayerIndex]?.grid ?? targetLevel.grid;
        const FACING_OFFSETS: Record<string, [number, number]> = {
          N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
        };
        const [dc, dr] = FACING_OFFSETS[targetStair.facing as string] ?? [0, 0];
        const spawnCol = targetStair.col + dc;
        const spawnRow = targetStair.row + dr;

        if (spawnRow < 0 || spawnRow >= targetGrid.length || spawnCol < 0 || spawnCol >= targetGrid[0].length) {
          console.warn(`Dungeon ${source}: levels[${i}] stairs "${e.id}" spawn position (${spawnCol},${spawnRow}) is out of bounds on level "${targetLevel.id}" — stair will not function`);
          continue;
        }

        const walkableChars = new Set(WALKABLE_CELLS);
        if (targetLevel.charDefs) {
          for (const def of targetLevel.charDefs) {
            if (!def.solid) walkableChars.add(def.char);
          }
        }
        if (!walkableChars.has(targetGrid[spawnRow][spawnCol])) {
          console.warn(`Dungeon ${source}: levels[${i}] stairs "${e.id}" spawn position (${spawnCol},${spawnRow}) is not walkable on level "${targetLevel.id}" layer ${targetLayerIndex} — stair will not function`);
        }
      }
    }
  }

  return { name: obj.name as string, levels, playerStart: dungeonPlayerStart };
}

export async function loadDungeon(url: string): Promise<Dungeon> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dungeon from ${url}: ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return validateDungeon(data, url);
}
