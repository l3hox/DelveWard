import type { DungeonLevel, Dungeon, Entity } from '../core/types';
import type { Facing } from '../core/grid';
import { WALKABLE_CELLS } from '../core/grid';
import { WALL_TEXTURE_SET, FLOOR_TEXTURE_SET, CEILING_TEXTURE_SET } from '../core/textureNames';
import { ENEMY_DEFS } from '../enemies/enemyTypes';

const VALID_FACINGS: Facing[] = ['N', 'E', 'S', 'W'];
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

  // Convert targetDoor → target on levers and plates
  for (const e of entities) {
    if ((e.type === 'lever' || e.type === 'pressure_plate') && e.targetDoor && !e.target) {
      const doorId = doorPosToId.get(e.targetDoor as string);
      if (doorId) {
        e.target = doorId;
        delete e.targetDoor;
      }
    }
  }
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

  // grid (basic structure — char validation happens after charDefs)
  if (!Array.isArray(obj.grid) || obj.grid.length === 0 || !obj.grid.every((r: unknown) => typeof r === 'string')) {
    throw new Error(`Level ${source}: "grid" must be a non-empty array of strings`);
  }

  const grid = obj.grid as string[];
  const rowLen = grid[0].length;
  if (!grid.every((r) => r.length === rowLen)) {
    throw new Error(`Level ${source}: all grid rows must be the same length`);
  }

  // charDefs (optional — validate BEFORE grid chars so custom chars are known)
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

      // textures
      validateTextures(def, `charDefs[${i}]`, source);
    }
  }

  // grid char validation (now with extended known chars)
  const extendedKnown = new Set(BUILTIN_CHARS);
  for (const ch of charDefChars) extendedKnown.add(ch);

  for (const row of grid) {
    for (const ch of row) {
      if (!extendedKnown.has(ch)) {
        throw new Error(`Level ${source}: unknown cell character '${ch}'`);
      }
    }
  }

  // playerStart
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
    throw new Error(`Level ${source}: playerStart (${startCol},${startRow}) is not a walkable cell`);
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

  for (let i = 0; i < obj.entities.length; i++) {
    const e = obj.entities[i] as Record<string, unknown>;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      throw new Error(`Level ${source}: entities[${i}] must be an object`);
    }
    if (typeof e.col !== 'number' || typeof e.row !== 'number') {
      throw new Error(`Level ${source}: entities[${i}] must have numeric col and row`);
    }
    if (e.row < 0 || e.row >= grid.length || e.col < 0 || e.col >= rowLen) {
      throw new Error(`Level ${source}: entities[${i}] (${e.col},${e.row}) is out of grid bounds`);
    }
    if (typeof e.type !== 'string') {
      throw new Error(`Level ${source}: entities[${i}] must have a string type`);
    }

    const cellAtEntity = grid[e.row as number][e.col as number];

    if (e.type === 'door') {
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] door must be on a walkable cell, found '${cellAtEntity}'`);
      }
      if (e.state !== undefined && !VALID_DOOR_STATES.has(e.state as string)) {
        throw new Error(`Level ${source}: entities[${i}] door state must be open or closed`);
      }
      if (e.keyId !== undefined && typeof e.keyId !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] door keyId must be a string`);
      }
    }

    if (e.type === 'key') {
      if (typeof e.keyId !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] key must have a string keyId`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] key must be on a walkable cell`);
      }
    }

    if (e.type === 'lever') {
      if (typeof e.target !== 'string' || e.target === '') {
        throw new Error(`Level ${source}: entities[${i}] lever must have a non-empty string target`);
      }
      if (!entityIds.has(e.target as string)) {
        throw new Error(`Level ${source}: entities[${i}] lever target must reference an existing entity id`);
      }
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) {
        throw new Error(`Level ${source}: entities[${i}] lever wall must be N, S, E, or W`);
      }
    }

    if (e.type === 'pressure_plate') {
      if (typeof e.target !== 'string' || e.target === '') {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate must have a non-empty string target`);
      }
      if (!entityIds.has(e.target as string)) {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate target must reference an existing entity id`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate must be on a walkable cell`);
      }
    }

    if (e.type === 'enemy') {
      if (typeof e.enemyType !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] enemy must have a string enemyType`);
      }
      if (!ENEMY_DEFS[e.enemyType as string]) {
        throw new Error(`Level ${source}: entities[${i}] enemy has unknown enemyType "${e.enemyType}"`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] enemy must be on a walkable cell`);
      }
    }

    if (e.type === 'torch_sconce') {
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] torch_sconce must be on a walkable cell`);
      }
      if (e.wall !== undefined && !['N', 'S', 'E', 'W'].includes(e.wall as string)) {
        throw new Error(`Level ${source}: entities[${i}] torch_sconce wall must be N, S, E, or W`);
      }
    }

    if (e.type === 'equipment') {
      if (typeof e.itemId !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] equipment must have a string itemId`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] equipment must be on a walkable cell`);
      }
    }

    if (e.type === 'consumable') {
      if (typeof e.itemId !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] consumable must have a string itemId`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] consumable must be on a walkable cell`);
      }
    }

    if (e.type === 'stairs') {
      if (e.direction !== 'up' && e.direction !== 'down') {
        throw new Error(`Level ${source}: entities[${i}] stairs must have direction "up" or "down"`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] stairs must be on a walkable cell, found '${cellAtEntity}'`);
      }
      if (typeof e.targetLevel !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] stairs must have a string targetLevel`);
      }
      if (typeof e.targetCol !== 'number' || typeof e.targetRow !== 'number') {
        throw new Error(`Level ${source}: entities[${i}] stairs must have numeric targetCol and targetRow`);
      }
    }
  }

  // environment (optional)
  if (obj.environment !== undefined) {
    const validEnvs = ['dungeon', 'mist'];
    if (!validEnvs.includes(obj.environment as string)) {
      throw new Error(`Level ${source}: "environment" must be one of ${validEnvs.join(', ')}`);
    }
  }

  // skybox (optional)
  if (obj.skybox !== undefined) {
    const validSkyboxes = ['starry-night'];
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

      if (entry.wallTexture === undefined && entry.floorTexture === undefined && entry.ceilingTexture === undefined) {
        throw new Error(`Level ${source}: areas[${i}] must specify at least one texture`);
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

  // Cross-level validation: stairs entities must reference valid levels and walkable positions
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    for (let j = 0; j < level.entities.length; j++) {
      const e = level.entities[j];
      if (e.type === 'stairs') {
        const targetId = e.targetLevel as string;
        if (!levelIds.has(targetId)) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs targetLevel "${targetId}" does not match any level id`);
        }
        // Find target level and check if target position is walkable
        const targetLevel = levels.find(l => l.id === targetId)!;
        const tc = e.targetCol as number;
        const tr = e.targetRow as number;
        if (tr < 0 || tr >= targetLevel.grid.length || tc < 0 || tc >= targetLevel.grid[0].length) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs target position (${tc},${tr}) is out of bounds on level "${targetId}"`);
        }
        // Build walkable set for target level
        const walkableChars = new Set(WALKABLE_CELLS);
        if (targetLevel.charDefs) {
          for (const def of targetLevel.charDefs) {
            if (!def.solid) walkableChars.add(def.char);
          }
        }
        if (!walkableChars.has(targetLevel.grid[tr][tc])) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs target position (${tc},${tr}) is not walkable on level "${targetId}"`);
        }
      }
    }
  }

  return { name: obj.name as string, levels };
}

export async function loadDungeon(url: string): Promise<Dungeon> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dungeon from ${url}: ${res.status} ${res.statusText}`);
  }
  const data: unknown = await res.json();
  return validateDungeon(data, url);
}
