// Real-time enemy AI — pure logic, no Three.js

import type { GameState } from '../core/gameState';
import { doorKey } from '../core/gameState';
import { findPath, manhattanDistance } from './pathfinding';
import { isWalkable } from '../core/grid';

export type EnemyActionType = 'idle' | 'move' | 'attack';

export interface EnemyAction {
  enemyKey: string;
  type: EnemyActionType;
  fromCol: number;
  fromRow: number;
  toCol?: number;
  toRow?: number;
}

const DEAGGRO_BUFFER = 2;

/**
 * Tick all enemies by delta seconds. Each enemy accumulates time
 * and acts when its moveTimer reaches moveInterval.
 */
export function updateEnemies(
  gameState: GameState,
  playerCol: number,
  playerRow: number,
  grid: string[],
  walkable: Set<string>,
  isDoorOpen: (col: number, row: number) => boolean,
  delta: number,
): EnemyAction[] {
  const actions: EnemyAction[] = [];

  // Track occupied cells (prevent stacking)
  const occupied = new Set<string>();
  for (const enemy of gameState.enemies.values()) {
    occupied.add(doorKey(enemy.col, enemy.row));
  }

  // Process in deterministic order
  const sortedKeys = [...gameState.enemies.keys()].sort();

  for (const key of sortedKeys) {
    const enemy = gameState.enemies.get(key)!;

    const dist = manhattanDistance(enemy.col, enemy.row, playerCol, playerRow);

    // State transitions (always evaluated, not gated by timer)
    if (enemy.aiState === 'idle' && dist <= enemy.aggroRange) {
      enemy.aiState = 'chase';
    } else if (enemy.aiState === 'chase' && dist > enemy.aggroRange + DEAGGRO_BUFFER) {
      enemy.aiState = 'idle';
    }

    if (enemy.aiState === 'chase' && dist <= 1) {
      enemy.aiState = 'attack';
    } else if (enemy.aiState === 'attack' && dist > 1) {
      enemy.aiState = 'chase';
    }

    // Accumulate timer
    enemy.moveTimer += delta;
    if (enemy.moveTimer < enemy.moveInterval) continue;
    enemy.moveTimer = 0;

    if (enemy.aiState === 'attack') {
      actions.push({
        enemyKey: key,
        type: 'attack',
        fromCol: enemy.col,
        fromRow: enemy.row,
      });
      continue;
    }

    if (enemy.aiState === 'chase') {
      const isPassable = (col: number, row: number) => {
        if (occupied.has(doorKey(col, row)) && !(col === enemy.col && row === enemy.row)) {
          return false;
        }
        return isWalkable(grid, col, row, walkable, isDoorOpen);
      };

      const path = findPath(
        grid,
        enemy.col, enemy.row,
        playerCol, playerRow,
        isPassable,
      );

      if (path && path.length > 1) {
        const step = path[0];
        const stepKey = doorKey(step.col, step.row);
        if (stepKey !== doorKey(playerCol, playerRow) && !occupied.has(stepKey)) {
          occupied.delete(doorKey(enemy.col, enemy.row));
          occupied.add(stepKey);

          actions.push({
            enemyKey: key,
            type: 'move',
            fromCol: enemy.col,
            fromRow: enemy.row,
            toCol: step.col,
            toRow: step.row,
          });

          gameState.moveEnemy(enemy.col, enemy.row, step.col, step.row);
          continue;
        }
      }
    }

    // Idle or couldn't move — no action emitted
  }

  return actions;
}
