import type { DungeonLevel } from './types';
import type { Facing } from './grid';
import { WALKABLE_CELLS } from './grid';
import { WALL_TEXTURE_SET, FLOOR_TEXTURE_SET, CEILING_TEXTURE_SET } from './textureNames';

const VALID_FACINGS: Facing[] = ['N', 'E', 'S', 'W'];
const KNOWN_CELLS = new Set(['.', '#', 'D', 'S', 'U', 'O', ' ']);

export function validateLevel(data: unknown, source: string): DungeonLevel {
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Level data from ${source} is not an object`);
  }

  const obj = data as Record<string, unknown>;

  // name
  if (typeof obj.name !== 'string') {
    throw new Error(`Level ${source}: "name" must be a string`);
  }

  // grid
  if (!Array.isArray(obj.grid) || obj.grid.length === 0 || !obj.grid.every((r: unknown) => typeof r === 'string')) {
    throw new Error(`Level ${source}: "grid" must be a non-empty array of strings`);
  }

  const grid = obj.grid as string[];
  const rowLen = grid[0].length;
  if (!grid.every((r) => r.length === rowLen)) {
    throw new Error(`Level ${source}: all grid rows must be the same length`);
  }

  for (const row of grid) {
    for (const ch of row) {
      if (!KNOWN_CELLS.has(ch)) {
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
  if (!WALKABLE_CELLS.has(grid[startRow][startCol])) {
    throw new Error(`Level ${source}: playerStart (${startCol},${startRow}) is not a walkable cell`);
  }

  // entities
  if (!Array.isArray(obj.entities)) {
    throw new Error(`Level ${source}: "entities" must be an array`);
  }

  // cellOverrides (optional)
  if (obj.cellOverrides !== undefined) {
    if (!Array.isArray(obj.cellOverrides)) {
      throw new Error(`Level ${source}: "cellOverrides" must be an array`);
    }

    for (let i = 0; i < obj.cellOverrides.length; i++) {
      const ov = obj.cellOverrides[i];
      if (typeof ov !== 'object' || ov === null || Array.isArray(ov)) {
        throw new Error(`Level ${source}: cellOverrides[${i}] must be an object`);
      }

      const entry = ov as Record<string, unknown>;

      if (typeof entry.col !== 'number' || typeof entry.row !== 'number') {
        throw new Error(`Level ${source}: cellOverrides[${i}] must have numeric col and row`);
      }

      if (entry.row < 0 || entry.row >= grid.length || entry.col < 0 || entry.col >= rowLen) {
        throw new Error(`Level ${source}: cellOverrides[${i}] (${entry.col},${entry.row}) is out of grid bounds`);
      }

      if (entry.wallTexture !== undefined && !WALL_TEXTURE_SET.has(entry.wallTexture as string)) {
        throw new Error(`Level ${source}: cellOverrides[${i}] has unknown wallTexture "${entry.wallTexture}"`);
      }

      if (entry.floorTexture !== undefined && !FLOOR_TEXTURE_SET.has(entry.floorTexture as string)) {
        throw new Error(`Level ${source}: cellOverrides[${i}] has unknown floorTexture "${entry.floorTexture}"`);
      }

      if (entry.ceilingTexture !== undefined && !CEILING_TEXTURE_SET.has(entry.ceilingTexture as string)) {
        throw new Error(`Level ${source}: cellOverrides[${i}] has unknown ceilingTexture "${entry.ceilingTexture}"`);
      }

      if (entry.ceilingHeight !== undefined && typeof entry.ceilingHeight !== 'number') {
        throw new Error(`Level ${source}: cellOverrides[${i}] ceilingHeight must be a number`);
      }
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
