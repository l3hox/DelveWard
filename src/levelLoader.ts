import type { DungeonLevel } from './types';
import type { Facing } from './grid';
import { WALKABLE_CELLS } from './grid';
import { WALL_TEXTURE_SET, FLOOR_TEXTURE_SET, CEILING_TEXTURE_SET } from './textureNames';

const VALID_FACINGS: Facing[] = ['N', 'E', 'S', 'W'];
const KNOWN_CELLS = new Set(['.', '#', 'D', 'S', 'U', 'O', ' ']);
const BUILTIN_CHARS = new Set(['.', '#', 'D', 'S', 'U', 'O', ' ']);

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
  const extendedKnown = new Set(KNOWN_CELLS);
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

  const VALID_DOOR_STATES = new Set(['open', 'closed', 'locked']);

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
      if (cellAtEntity !== 'D') {
        throw new Error(`Level ${source}: entities[${i}] door must be on a 'D' cell, found '${cellAtEntity}'`);
      }
      if (e.state !== undefined && !VALID_DOOR_STATES.has(e.state as string)) {
        throw new Error(`Level ${source}: entities[${i}] door state must be open, closed, or locked`);
      }
      if (e.state === 'locked' && typeof e.keyId !== 'string') {
        throw new Error(`Level ${source}: entities[${i}] locked door must have a string keyId`);
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
      if (typeof e.targetDoor !== 'string' || !/^\d+,\d+$/.test(e.targetDoor as string)) {
        throw new Error(`Level ${source}: entities[${i}] lever must have targetDoor in "col,row" format`);
      }
      const [tc, tr] = (e.targetDoor as string).split(',').map(Number);
      if (tr < 0 || tr >= grid.length || tc < 0 || tc >= rowLen || grid[tr][tc] !== 'D') {
        throw new Error(`Level ${source}: entities[${i}] lever targetDoor must reference a 'D' cell`);
      }
    }

    if (e.type === 'pressure_plate') {
      if (typeof e.targetDoor !== 'string' || !/^\d+,\d+$/.test(e.targetDoor as string)) {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate must have targetDoor in "col,row" format`);
      }
      const [tc, tr] = (e.targetDoor as string).split(',').map(Number);
      if (tr < 0 || tr >= grid.length || tc < 0 || tc >= rowLen || grid[tr][tc] !== 'D') {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate targetDoor must reference a 'D' cell`);
      }
      if (!walkableChars.has(cellAtEntity)) {
        throw new Error(`Level ${source}: entities[${i}] pressure_plate must be on a walkable cell`);
      }
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
