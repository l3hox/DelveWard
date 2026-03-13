// Enemy type definitions and registry — pure data, no Three.js

import type { DropsOverride } from '../core/lootTable';

export type EnemyAIState = 'idle' | 'chase' | 'attack' | 'flee';

export interface EnemyDef {
  type: string;
  maxHp: number;
  atk: number;
  def: number;
  aggroRange: number;     // Manhattan distance to notice player
  moveInterval: number;   // seconds between actions
  blocksMovement: boolean;
  xp: number;             // XP awarded to player on kill
  size?: number;          // sprite size for rendering (world units; defaults vary per type)
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
  blocksMovement: boolean;
  aiState: EnemyAIState;
  moveTimer: number;      // accumulates delta, resets on action
  regenTimer?: number;       // accumulates time for troll HP regen
  regenPauseTimer?: number;  // remaining seconds of regen pause after taking damage
  drops?: DropsOverride;  // per-entity override from dungeon JSON
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  rat: {
    type: 'rat',
    maxHp: 8,
    atk: 2,
    def: 0,
    aggroRange: 3,
    moveInterval: 0.6,
    blocksMovement: true,
    xp: 10,
  },
  skeleton: {
    type: 'skeleton',
    maxHp: 20,
    atk: 3,
    def: 1,
    aggroRange: 4,
    moveInterval: 1.0,
    blocksMovement: true,
    xp: 25,
  },
  orc: {
    type: 'orc',
    maxHp: 40,
    atk: 5,
    def: 2,
    aggroRange: 5,
    moveInterval: 1.4,
    blocksMovement: true,
    xp: 50,
  },
  goblin: {
    type: 'goblin',
    maxHp: 10,
    atk: 2,
    def: 0,
    aggroRange: 4,
    moveInterval: 0.5,
    blocksMovement: true,
    xp: 12,
    size: 0.8,
  },
  giant_bat: {
    type: 'giant_bat',
    maxHp: 6,
    atk: 1,
    def: 0,
    aggroRange: 5,
    moveInterval: 0.4,
    blocksMovement: true,
    xp: 8,
    size: 0.7,
  },
  spider: {
    type: 'spider',
    maxHp: 14,
    atk: 3,
    def: 0,
    aggroRange: 4,
    moveInterval: 0.6,
    blocksMovement: true,
    xp: 18,
    size: 0.9,
  },
  kobold: {
    type: 'kobold',
    maxHp: 12,
    atk: 2,
    def: 1,
    aggroRange: 4,
    moveInterval: 0.7,
    blocksMovement: true,
    xp: 20,
    size: 0.8,
  },
  zombie: {
    type: 'zombie',
    maxHp: 50,
    atk: 3,
    def: 1,
    aggroRange: 3,
    moveInterval: 1.6,
    blocksMovement: true,
    xp: 30,
    size: 1.3,
  },
  troll: {
    type: 'troll',
    maxHp: 80,
    atk: 5,
    def: 2,
    aggroRange: 5,
    moveInterval: 1.2,
    blocksMovement: true,
    xp: 120,
    size: 2.2,
  },
};

export function createEnemyInstance(
  col: number,
  row: number,
  enemyType: string,
): EnemyInstance {
  const def = ENEMY_DEFS[enemyType];
  if (!def) throw new Error(`Unknown enemy type: ${enemyType}`);
  const instance: EnemyInstance = {
    col,
    row,
    type: def.type,
    hp: def.maxHp,
    maxHp: def.maxHp,
    atk: def.atk,
    def: def.def,
    aggroRange: def.aggroRange,
    moveInterval: def.moveInterval,
    blocksMovement: def.blocksMovement,
    aiState: 'idle',
    moveTimer: 0,
  };
  if (def.type === 'troll') {
    instance.regenTimer = 0;
    instance.regenPauseTimer = 0;
  }
  return instance;
}
