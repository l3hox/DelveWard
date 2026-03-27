import type { Facing } from './grid';

export interface TextureSet {
  wallTexture?: string;
  floorTexture?: string;
  ceilingTexture?: string;
}

export interface CharDef extends TextureSet {
  char: string;      // single ASCII character, not a built-in char
  solid: boolean;    // true = wall-like, false = walkable
  seeThrough?: boolean; // solid but renders floor/ceiling, no wall faces toward renderable neighbors
}

export interface TextureArea extends TextureSet {
  fromCol: number;
  toCol: number;
  fromRow: number;
  toRow: number;
  environment?: Environment;  // override environment in this region
}

export type Environment = 'dungeon' | 'mist' | 'forest' | 'outdoor';
export type Skybox = 'starry-night' | 'daylight' | 'sunset';

export interface DungeonLevel {
  id?: string;               // optional stable identifier for save/load keying
  name: string;
  grid: string[];            // each string = one row of chars
  playerStart?: { col: number; row: number; facing: Facing };  // optional — single-level mode only
  entities: Entity[];
  environment?: Environment;     // visual environment preset (default: 'dungeon')
  ceiling?: boolean;             // render ceiling geometry (default: true)
  skybox?: Skybox;               // procedural skybox visible through ceiling openings
  dustMotes?: boolean;           // enable floating dust particles (default: true)
  waterDrips?: boolean;          // enable ceiling water drip effect (default: false)
  fireflies?: boolean;           // enable ground-level firefly particles (default: false)
  defaults?: TextureSet;
  charDefs?: CharDef[];
  areas?: TextureArea[];
}

export interface Dungeon {
  name: string;
  levels: DungeonLevel[];
  playerStart: { levelId: string; col: number; row: number; facing: Facing };
}

// Grid char legend:
// '#' = wall, '.' = floor, ' ' = void
// All interactive features (doors, stairs, levers, etc.) are entity-only on walkable cells.

export interface Entity {
  id?: string;               // stable identifier for cross-entity references
  col: number;
  row: number;
  type: string;              // "door", "object", "key", "enemy", etc.
  [key: string]: unknown;    // type-specific props (keyId, objectId, locked...)
}
