// Enemy type definitions and registry — pure data, no Three.js

export type EnemyAIState = 'idle' | 'chase' | 'attack';

export interface EnemyDef {
  type: string;
  maxHp: number;
  atk: number;
  def: number;
  aggroRange: number;     // Manhattan distance to notice player
  moveInterval: number;   // seconds between actions
}

export interface EnemyInstance {
  col: number;
  row: number;
  type: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  aggroRange: number;
  moveInterval: number;
  aiState: EnemyAIState;
  moveTimer: number;      // accumulates delta, resets on action
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  rat: {
    type: 'rat',
    maxHp: 4,
    atk: 2,
    def: 0,
    aggroRange: 3,
    moveInterval: 0.8,
  },
  skeleton: {
    type: 'skeleton',
    maxHp: 8,
    atk: 3,
    def: 1,
    aggroRange: 4,
    moveInterval: 1.5,
  },
  orc: {
    type: 'orc',
    maxHp: 15,
    atk: 5,
    def: 2,
    aggroRange: 5,
    moveInterval: 2.0,
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
    atk: def.atk,
    def: def.def,
    aggroRange: def.aggroRange,
    moveInterval: def.moveInterval,
    aiState: 'idle',
    moveTimer: 0,
  };
}
