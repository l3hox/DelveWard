import type { Facing } from './grid';

export interface TextureSet {
  wallTexture?: string;
  floorTexture?: string;
  ceilingTexture?: string;
}

export interface CharDef extends TextureSet {
  char: string;      // single ASCII character, not a built-in char
  solid: boolean;    // true = wall-like, false = walkable
}

export interface TextureArea extends TextureSet {
  fromCol: number;
  toCol: number;
  fromRow: number;
  toRow: number;
}

export interface DungeonLevel {
  id?: string;               // optional stable identifier for save/load keying
  name: string;
  grid: string[];            // each string = one row of chars
  playerStart: { col: number; row: number; facing: Facing };
  entities: Entity[];
  defaults?: TextureSet;
  charDefs?: CharDef[];
  areas?: TextureArea[];
}

export interface Dungeon {
  name: string;
  levels: DungeonLevel[];
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
