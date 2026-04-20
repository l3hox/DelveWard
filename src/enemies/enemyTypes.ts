// Enemy type definitions and registry — pure data, no Three.js

import type { DropsOverride } from '../core/lootTable';
import { enemyDatabase } from './enemyDatabase';
import type { StatusEffect } from '../core/statusEffects';

export type { EnemyDef } from './enemyDatabase';

export type EnemyAIState = 'idle' | 'chase' | 'attack' | 'flee';

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
  regenTimer?: number;       // accumulates time for HP regen
  regenPauseTimer?: number;  // remaining seconds of regen pause after taking damage
  drops?: DropsOverride;  // per-entity override from dungeon JSON
  statusEffects: StatusEffect[];
  spawnerId?: string;
}

export function createEnemyInstance(
  col: number,
  row: number,
  enemyType: string,
): EnemyInstance {
  const def = enemyDatabase.getEnemy(enemyType);
  if (!def) throw new Error(`Unknown enemy type: ${enemyType}`);
  const instance: EnemyInstance = {
    col,
    row,
    type: def.id,
    hp: def.maxHp,
    maxHp: def.maxHp,
    atk: def.atk,
    def: def.def,
    aggroRange: def.aggroRange,
    moveInterval: def.moveInterval,
    blocksMovement: def.blocksMovement,
    aiState: 'idle',
    moveTimer: 0,
    statusEffects: [],
  };
  if (enemyDatabase.hasBehavior(enemyType, 'regen')) {
    instance.regenTimer = 0;
    instance.regenPauseTimer = 0;
  }
  return instance;
}
