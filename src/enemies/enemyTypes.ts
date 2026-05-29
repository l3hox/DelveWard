// Enemy type definitions and registry — pure data, no Three.js

import { enemyDatabase } from './enemyDatabase';
import { registerEnemyRegistry } from '../core/typeRegistries';
import type { EnemyAIState, EnemyInstance } from '../core/entities';

export type { EnemyDef } from './enemyDatabase';
export type { EnemyAIState, EnemyInstance } from '../core/entities';

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

registerEnemyRegistry({
    createEnemy: (col, row, type) => {
        if (!enemyDatabase.getEnemy(type)) return undefined;
        return createEnemyInstance(col, row, type);
    },
    getEnemyBehavior: (type, name) => enemyDatabase.getBehavior(type, name),
    getAllEnemySpritePaths: () => enemyDatabase.getAllEnemies().map(e => e.sprite.path),
});
