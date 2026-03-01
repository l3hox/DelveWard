import type { DungeonLevel } from './types';
import type { Facing } from './grid';

const VALID_FACINGS: Facing[] = ['N', 'E', 'S', 'W'];

export async function loadLevel(url: string): Promise<DungeonLevel> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load level from ${url}: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();

  if (typeof data !== 'object' || data === null) {
    throw new Error(`Level data from ${url} is not an object`);
  }

  const obj = data as Record<string, unknown>;

  // name
  if (typeof obj.name !== 'string') {
    throw new Error(`Level ${url}: "name" must be a string`);
  }

  // grid
  if (!Array.isArray(obj.grid) || obj.grid.length === 0 || !obj.grid.every((r: unknown) => typeof r === 'string')) {
    throw new Error(`Level ${url}: "grid" must be a non-empty array of strings`);
  }

  // playerStart
  const ps = obj.playerStart;
  if (typeof ps !== 'object' || ps === null) {
    throw new Error(`Level ${url}: "playerStart" must be an object`);
  }
  const start = ps as Record<string, unknown>;
  if (typeof start.col !== 'number' || typeof start.row !== 'number') {
    throw new Error(`Level ${url}: "playerStart" must have numeric col and row`);
  }
  if (!VALID_FACINGS.includes(start.facing as Facing)) {
    throw new Error(`Level ${url}: "playerStart.facing" must be one of ${VALID_FACINGS.join(', ')}`);
  }

  // entities
  if (!Array.isArray(obj.entities)) {
    throw new Error(`Level ${url}: "entities" must be an array`);
  }

  return data as DungeonLevel;
}
