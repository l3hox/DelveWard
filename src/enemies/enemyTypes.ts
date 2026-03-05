// Enemy type definitions and registry — pure data, no Three.js

export type EnemyAIState = 'idle' | 'chase' | 'attack';

export interface EnemyDef {
  type: string;
  maxHp: number;
  damage: number;
  aggroRange: number;   // Manhattan distance to notice player
  speed: number;        // moves every N player turns (1 = every turn, 2 = every other)
}

export interface EnemyInstance {
  col: number;
  row: number;
  type: string;
  hp: number;
  maxHp: number;
  damage: number;
  aggroRange: number;
  speed: number;
  aiState: EnemyAIState;
  turnCounter: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  rat: {
    type: 'rat',
    maxHp: 4,
    damage: 2,
    aggroRange: 3,
    speed: 1,
  },
  skeleton: {
    type: 'skeleton',
    maxHp: 8,
    damage: 3,
    aggroRange: 4,
    speed: 2,
  },
  orc: {
    type: 'orc',
    maxHp: 15,
    damage: 5,
    aggroRange: 5,
    speed: 2,
  },
};

export function createEnemyInstance(
  col: number,
  row: number,
  enemyType: string,
): EnemyInstance {
  const def = ENEMY_DEFS[enemyType];
  if (!def) throw new Error(`Unknown enemy type: ${enemyType}`);
  return {
    col,
    row,
    type: def.type,
    hp: def.maxHp,
    maxHp: def.maxHp,
    damage: def.damage,
    aggroRange: def.aggroRange,
    speed: def.speed,
    aiState: 'idle',
    turnCounter: 0,
  };
}
