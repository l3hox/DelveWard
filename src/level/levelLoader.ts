import type { DungeonLevel, Dungeon, Entity } from '../core/types';
import type { Facing } from '../core/grid';
import { WALKABLE_CELLS } from '../core/grid';
import { WALL_TEXTURE_SET, FLOOR_TEXTURE_SET, CEILING_TEXTURE_SET } from '../core/textureNames';
import { enemyDatabase } from '../enemies/enemyDatabase';

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
  }

  return null;
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
  if (obj.environment !== undefined) {
    const validEnvs = ['dungeon', 'mist', 'forest'];
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

  // Cross-level validation: stairs must reference valid stair entities on other levels
  // and the spawn cell (one step in facing direction from target) must be walkable
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    for (let j = 0; j < level.entities.length; j++) {
      const e = level.entities[j];
      if (e.type === 'stairs') {
        const targetId = e.target as string;

        // Find the target stair entity across all OTHER levels
        let targetStair: Entity | undefined;
        let targetLevel: DungeonLevel | undefined;
        for (const otherLevel of levels) {
          if (otherLevel === level) continue; // target must be on a different level
          targetStair = otherLevel.entities.find(oe => oe.id === targetId);
          if (targetStair) {
            targetLevel = otherLevel;
            break;
          }
        }

        if (!targetStair || !targetLevel) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs target "${targetId}" does not match any stair entity on another level`);
        }
        if (targetStair.type !== 'stairs') {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs target "${targetId}" is not a stairs entity`);
        }

        // Validate spawn cell: one step in target stair's facing direction
        const FACING_OFFSETS: Record<string, [number, number]> = {
          N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
        };
        const [dc, dr] = FACING_OFFSETS[targetStair.facing as string] ?? [0, 0];
        const spawnCol = targetStair.col + dc;
        const spawnRow = targetStair.row + dr;

        if (spawnRow < 0 || spawnRow >= targetLevel.grid.length || spawnCol < 0 || spawnCol >= targetLevel.grid[0].length) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs spawn position (${spawnCol},${spawnRow}) is out of bounds on level "${targetLevel.id}"`);
        }

        const walkableChars = new Set(WALKABLE_CELLS);
        if (targetLevel.charDefs) {
          for (const def of targetLevel.charDefs) {
            if (!def.solid) walkableChars.add(def.char);
          }
        }
        if (!walkableChars.has(targetLevel.grid[spawnRow][spawnCol])) {
          throw new Error(`Dungeon ${source}: levels[${i}] entities[${j}] stairs spawn position (${spawnCol},${spawnRow}) is not walkable on level "${targetLevel.id}"`);
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
