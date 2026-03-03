import type { Facing } from './grid';

export interface DungeonLevel {
  name: string;
  grid: string[];            // each string = one row of chars
  playerStart: { col: number; row: number; facing: Facing };
  entities: Entity[];
  cellOverrides?: CellOverride[];
}

// Grid char legend:
// '#' = wall, '.' = floor, 'D' = door, 'S' = stairs down,
// 'U' = stairs up, 'O' = object (details in entities), ' ' = void

export interface Entity {
  col: number;
  row: number;
  type: string;              // "door", "object", "key", "enemy", etc.
  [key: string]: unknown;    // type-specific props (keyId, objectId, locked...)
}

export interface CellOverride {
  col: number;
  row: number;
  ceilingHeight?: number;
  wallTexture?: string;
  floorTexture?: string;
  ceilingTexture?: string;
}
